import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { productionDatabaseConfig } from "./production-database.mjs";
import {
  expectedProductionDatabase,
  migrationManifest,
  productionProjectRef,
  reconcileMigrationState,
} from "./production-migrations-core.mjs";
import {
  productionBootstrapFindings,
  productionBootstrapPasswords,
  productionBootstrapProfile,
  productionBootstrapRoles,
  validateProductionBootstrap,
} from "./production-bootstrap-core.mjs";
import {
  canonicalSeedManifest,
  reconcileSeedState,
} from "./staging-seeds-core.mjs";
import { ids, importSeeds, org, projectId } from "./seed.mjs";
import {
  applyRuntimeRoles,
  inspectRuntimeRoles,
  runtimeRoleFindings,
} from "./staging-runtime-roles-core.mjs";
import {
  applyEmailWorkerRole,
  emailWorkerRoleFindings,
  inspectEmailWorkerRole,
  unsafeEmailWorkerRoleState,
} from "./staging-email-worker-role-core.mjs";
import {
  applyBillingWorkerRole,
  billingWorkerRoleFindings,
  inspectBillingWorkerRole,
  unsafeBillingWorkerRoleState,
} from "./staging-billing-worker-role-core.mjs";
import {
  applyLegalDocuments,
  inspectLegalDocuments,
  legalDocumentFindings,
  unsafeLegalDocumentState,
} from "./staging-legal-documents-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "plan";
const validation = validateProductionBootstrap(process.env, command);
if (!validation.ok)
  throw Error(
    `Production bootstrap guard rejected:\n- ${validation.findings.join("\n- ")}`,
  );

function repositoryState() {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const remote = execFileSync(
    "git",
    ["rev-parse", "origin/codex/phase-2-completion"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  if (branch !== "codex/phase-2-completion")
    throw Error("PRODUCTION_BOOTSTRAP_REQUIRE_PHASE_BRANCH");
  if (dirty) throw Error("PRODUCTION_BOOTSTRAP_REQUIRE_CLEAN_TREE");
  if (head !== remote) throw Error("PRODUCTION_BOOTSTRAP_REQUIRE_PUSHED_HEAD");
  if (head !== process.env.KXRA_PRODUCTION_SOURCE_COMMIT)
    throw Error("PRODUCTION_BOOTSTRAP_REQUIRE_EXACT_SOURCE_COMMIT");
  return head;
}

const seedManifest = canonicalSeedManifest(root);
const migrations = migrationManifest(root);

async function migrationState(database) {
  const table = (
    await database.query(
      "select to_regclass('public.kxra_schema_migrations') is not null tracked,to_regnamespace('kxra') is not null managed",
    )
  ).rows[0];
  const rows = table.tracked
    ? (
        await database.query(
          "select name,sha256 from public.kxra_schema_migrations order by name",
        )
      ).rows
    : [];
  const state = reconcileMigrationState(migrations, rows, table.managed);
  return {
    complete:
      migrations.length === expectedProductionDatabase.migrations &&
      state.pending.length === 0,
    state,
  };
}

async function seedState(database) {
  const tracked = (
    await database.query(
      "select to_regclass('public.kxra_seed_imports') is not null tracked",
    )
  ).rows[0].tracked;
  const rows = tracked
    ? (
        await database.query(
          "select profile,sha256,source_commit from public.kxra_seed_imports order by profile",
        )
      ).rows
    : [];
  const unmanaged = (
    await database.query(
      `select exists(
        select 1 from kxra.organisations where id=$1
        union all select 1 from kxra.projects where source_code like 'PROJECT-%'
        union all select 1 from kxra.records where source_code=any($2::text[])
      ) exists`,
      [org, seedManifest.recordCodes],
    )
  ).rows[0].exists;
  return reconcileSeedState(seedManifest, rows, unmanaged);
}

async function bootstrapEvent(database) {
  const exists = (
    await database.query(
      "select to_regclass('public.kxra_production_bootstrap_events') is not null tracked",
    )
  ).rows[0].tracked;
  if (!exists) return null;
  return (
    await database.query(
      "select profile,source_commit,roles from public.kxra_production_bootstrap_events order by applied_at desc limit 1",
    )
  ).rows[0];
}

async function inspect(database, sourceCommit) {
  const migration = await migrationState(database);
  if (!migration.complete)
    return {
      migrationsComplete: false,
      seedApplied: false,
      runtimeRoleFindings: [
        "kxra_app: missing",
        "kxra_public_ingress: missing",
      ],
      emailRoleFindings: ["kxra_email_runner: unsafe or missing"],
      billingRoleFindings: ["kxra_billing_runner: unsafe or missing"],
      legalFindings: ["approved legal pack is missing"],
      event: null,
      sourceCommit,
    };
  const seed = await seedState(database);
  return {
    migrationsComplete: true,
    seedApplied: seed.applied,
    runtimeRoleFindings: runtimeRoleFindings(
      await inspectRuntimeRoles(database),
    ),
    emailRoleFindings: emailWorkerRoleFindings(
      await inspectEmailWorkerRole(database),
    ),
    billingRoleFindings: billingWorkerRoleFindings(
      await inspectBillingWorkerRole(database),
    ),
    legalFindings: legalDocumentFindings(await inspectLegalDocuments(database)),
    event: await bootstrapEvent(database),
    sourceCommit,
  };
}

async function verifyCanonicalSeed(database) {
  const projects = (
    await database.query(
      "select id,code,source_hash,source_data from kxra.projects where org_id=$1 and source_code=any($2::text[]) order by code",
      [org, seedManifest.bundle.projects.map((project) => project.id)],
    )
  ).rows;
  if (projects.length !== seedManifest.bundle.projects.length)
    throw Error(`PRODUCTION_PROJECT_COUNT_MISMATCH:${projects.length}`);
  for (const source of seedManifest.bundle.projects) {
    const saved = projects.find((project) => project.code === source.id);
    if (!saved || saved.id !== projectId(source.id))
      throw Error(`PRODUCTION_PROJECT_MISSING:${source.id}`);
    const hash = (
      await database.query(
        "select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') hash",
        [source],
      )
    ).rows[0].hash;
    if (saved.source_hash !== hash)
      throw Error(`PRODUCTION_PROJECT_HASH_MISMATCH:${source.id}`);
  }
  const forbidden = (
    await database.query(
      `select
        (select count(*)::int from kxra.members where id=any($1::uuid[])) fixture_members,
        (select count(*)::int from kxra.model_policies where code='LOCAL-FAKE-SOL') fixture_models,
        (select count(*)::int from kxra.budget_policies where code='LOCAL-FAKE-ZERO-COST') fixture_budgets,
        (select count(*)::int from kxra.routine_service_identities where code='SVC-ROUTINE-LOCAL') fixture_services`,
      [Object.values(ids)],
    )
  ).rows[0];
  if (Object.values(forbidden).some((count) => count !== 0))
    throw Error("PRODUCTION_FIXTURE_SEED_DETECTED");
}

const sourceCommit = repositoryState();
const database = new pg.Client(
  productionDatabaseConfig(
    process.env.KXRA_PRODUCTION_MIGRATOR_DATABASE_URL,
    `kxra-production-bootstrap-${command}`,
  ),
);
await database.connect();
try {
  await database.query("set statement_timeout='30s'");
  const target = (
    await database.query(
      "select current_database() database,current_user username,current_setting('app.settings.project_ref',true) project_ref",
    )
  ).rows[0];
  if (
    target.database !== "postgres" ||
    !String(target.username).startsWith("postgres")
  )
    throw Error("PRODUCTION_BOOTSTRAP_OPERATOR_IDENTITY_INVALID");
  if (target.project_ref && target.project_ref !== productionProjectRef)
    throw Error("PRODUCTION_DATABASE_PROJECT_REF_MISMATCH");

  const migration = await migrationState(database);
  if (!migration.complete) throw Error("PRODUCTION_MIGRATIONS_INCOMPLETE");
  const initialSeed = await seedState(database);
  const initialRoles = await inspectRuntimeRoles(database);
  const initialEmail = await inspectEmailWorkerRole(database);
  const initialBilling = await inspectBillingWorkerRole(database);
  const initialLegal = await inspectLegalDocuments(database);
  const takeover = [
    ...unsafeEmailWorkerRoleState(initialEmail),
    ...unsafeBillingWorkerRoleState(initialBilling),
    ...unsafeLegalDocumentState(initialLegal),
  ];
  for (const row of initialRoles.memberships)
    if (!(
      (row.member === "kxra_app" &&
        ["anon", "authenticated"].includes(row.granted)) ||
      (row.member === "kxra_public_ingress" && row.granted === "anon")
    ))
      takeover.push(`${row.member}: unknown membership ${row.granted}`);
  if (takeover.length)
    throw Error(`PRODUCTION_BOOTSTRAP_TAKEOVER_REJECTED:${takeover.join(";")}`);

  if (command === "plan") {
    const findings = productionBootstrapFindings(
      await inspect(database, sourceCommit),
    );
    console.log(
      findings.length
        ? `Production bootstrap plan: ${findings.length} bounded item(s) pending.`
        : "Production bootstrap plan: exact production foundation already present.",
    );
  } else if (command === "apply") {
    const passwords = productionBootstrapPasswords(process.env);
    await database.query(
      "select pg_advisory_lock(hashtext('kxra-production-bootstrap'))",
    );
    try {
      await database.query("begin");
      try {
        const lockedSeed = await seedState(database);
        if (!lockedSeed.applied) {
          await importSeeds(database, seedManifest.bundle, {
            canonicalOnly: true,
          });
          await database.query(`create table if not exists public.kxra_seed_imports(
            profile text primary key,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
            source_commit text not null check(source_commit~'^[a-f0-9]{40}$'),
            applied_at timestamptz not null default now()
          )`);
          await database.query(
            "revoke all on table public.kxra_seed_imports from public,anon,authenticated",
          );
          await database.query(
            "insert into public.kxra_seed_imports(profile,sha256,source_commit) values($1,$2,$3)",
            [seedManifest.profile, seedManifest.sha256, sourceCommit],
          );
        }
        await applyRuntimeRoles(
          database,
          passwords.app,
          passwords.publicIngress,
        );
        await applyEmailWorkerRole(database, passwords.emailWorker);
        await applyBillingWorkerRole(database, passwords.billingWorker);
        await applyLegalDocuments(database);
        await database.query(`create table if not exists public.kxra_production_bootstrap_events(
          id bigint generated always as identity primary key,
          profile text not null,source_commit text not null check(source_commit~'^[a-f0-9]{40}$'),
          roles text[] not null,applied_at timestamptz not null default now()
        )`);
        await database.query(
          "revoke all on table public.kxra_production_bootstrap_events from public,anon,authenticated,kxra_app,kxra_public_ingress,kxra_email_runner,kxra_billing_runner",
        );
        await database.query(
          "insert into public.kxra_production_bootstrap_events(profile,source_commit,roles) values($1,$2,$3)",
          [productionBootstrapProfile, sourceCommit, productionBootstrapRoles],
        );
        await database.query("commit");
      } catch (error) {
        await database.query("rollback");
        throw error;
      }
    } finally {
      await database.query(
        "select pg_advisory_unlock(hashtext('kxra-production-bootstrap'))",
      );
    }
  }

  if (command !== "plan") {
    await verifyCanonicalSeed(database);
    const findings = productionBootstrapFindings(
      await inspect(database, sourceCommit),
    );
    if (findings.length)
      throw Error(`PRODUCTION_BOOTSTRAP_MISMATCH:${findings.join(";")}`);
    console.log(
      `Production bootstrap verification PASS (${seedManifest.bundle.projects.length} projects, approved legal pack, ${productionBootstrapRoles.length} restricted logins).`,
    );
  }
} finally {
  await database.end();
}
