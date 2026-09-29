import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { stagingDatabaseConfig } from "./staging-database.mjs";
import { ids, importSeeds, org, projectId } from "./seed.mjs";
import {
  expectedStagingDatabase,
  migrationManifest,
  reconcileMigrationState,
} from "./staging-migrations-core.mjs";
import {
  canonicalSeedManifest,
  reconcileSeedState,
  validateStagingSeeder,
} from "./staging-seeds-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "plan";
const validation = validateStagingSeeder(process.env, command);
if (!validation.ok)
  throw Error(
    `Staging seed guard rejected:\n- ${validation.findings.join("\n- ")}`,
  );
const manifest = canonicalSeedManifest(root);

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
    throw Error("STAGING_SEEDS_REQUIRE_PHASE_BRANCH");
  if (dirty) throw Error("STAGING_SEEDS_REQUIRE_CLEAN_TREE");
  if (head !== remote) throw Error("STAGING_SEEDS_REQUIRE_PUSHED_HEAD");
  return head;
}

async function requireMigrations(database) {
  const tracked = await database.query(
    "select to_regclass('public.kxra_schema_migrations') is not null as tracked",
  );
  if (!tracked.rows[0].tracked) throw Error("STAGING_SCHEMA_NOT_MANAGED");
  const rows = (
    await database.query(
      "select name,sha256 from public.kxra_schema_migrations order by name",
    )
  ).rows;
  const migrations = migrationManifest(root);
  if (migrations.length !== expectedStagingDatabase.migrations)
    throw Error("STAGING_EXPECTED_MIGRATION_COUNT_CHANGED");
  const state = reconcileMigrationState(migrations, rows, true);
  if (state.pending.length) throw Error("STAGING_MIGRATIONS_INCOMPLETE");
}

async function seedState(database) {
  const tracked = (
    await database.query(
      "select to_regclass('public.kxra_seed_imports') is not null as tracked",
    )
  ).rows[0].tracked;
  const rows = tracked
    ? (
        await database.query(
          "select profile,sha256,source_commit from public.kxra_seed_imports order by profile",
        )
      ).rows
    : [];
  if (rows.length > 1) throw Error("STAGING_UNKNOWN_SEED_PROFILE");
  const row = rows[0] || null;
  const unmanaged = (
    await database.query(
      `select exists(
        select 1 from kxra.organisations where id=$1
        union all select 1 from kxra.projects where source_code like 'PROJECT-%'
        union all select 1 from kxra.records where source_code=any($2::text[])
      ) as exists`,
      [org, manifest.recordCodes],
    )
  ).rows[0].exists;
  return { row, unmanaged };
}

async function verify(database) {
  await requireMigrations(database);
  const tracked = await seedState(database);
  const state = reconcileSeedState(manifest, tracked.row, tracked.unmanaged);
  if (!state.applied) throw Error("STAGING_CANONICAL_SEEDS_INCOMPLETE");
  const projects = (
    await database.query(
      "select id,code,source_hash,source_data from kxra.projects where org_id=$1 and source_code=any($2::text[]) order by code",
      [org, manifest.bundle.projects.map((project) => project.id)],
    )
  ).rows;
  if (projects.length !== manifest.bundle.projects.length)
    throw Error(`STAGING_PROJECT_COUNT_MISMATCH:${projects.length}`);
  for (const source of manifest.bundle.projects) {
    const saved = projects.find((project) => project.code === source.id);
    if (!saved || saved.id !== projectId(source.id))
      throw Error(`STAGING_PROJECT_MISSING:${source.id}`);
    const expectedHash = (
      await database.query(
        "select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') hash",
        [source],
      )
    ).rows[0].hash;
    if (saved.source_hash !== expectedHash)
      throw Error(`STAGING_PROJECT_HASH_MISMATCH:${source.id}`);
    const storedHash = (
      await database.query(
        "select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') hash",
        [saved.source_data],
      )
    ).rows[0].hash;
    if (storedHash !== expectedHash)
      throw Error(`STAGING_PROJECT_DATA_MISMATCH:${source.id}`);
  }
  const recordCodes = (
    await database.query(
      "select source_code from kxra.records where source_code=any($1::text[]) order by source_code",
      [manifest.recordCodes],
    )
  ).rows.map((row) => row.source_code);
  if (JSON.stringify(recordCodes) !== JSON.stringify(manifest.recordCodes))
    throw Error("STAGING_CANONICAL_RECORD_SET_MISMATCH");
  await database.query("begin");
  try {
    await importSeeds(database, manifest.bundle, { canonicalOnly: true });
    await database.query("rollback");
  } catch (error) {
    await database.query("rollback");
    throw error;
  }
  const forbidden = (
    await database.query(
      `select
        (select count(*)::int from kxra.members where id=any($1::uuid[])) fixture_members,
        (select count(*)::int from kxra.model_policies where code='LOCAL-FAKE-SOL') fixture_models,
        (select count(*)::int from kxra.budget_policies where code='LOCAL-FAKE-ZERO-COST') fixture_budgets,
        (select count(*)::int from kxra.routine_service_identities where code='SVC-ROUTINE-LOCAL') fixture_services,
        (select count(*)::int from kxra.agreement_documents where id in(
          '80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002'
        )) fixture_legal`,
      [Object.values(ids)],
    )
  ).rows[0];
  if (Object.values(forbidden).some((count) => count !== 0))
    throw Error("STAGING_FIXTURE_SEED_DETECTED");
  console.log(
    `Staging canonical seed verification PASS (${projects.length} projects, ${recordCodes.length} source records, no local fixture state).`,
  );
}

const sourceCommit = repositoryState();
const database = new pg.Client(
  stagingDatabaseConfig(
    process.env.KXRA_STAGING_MIGRATOR_DATABASE_URL,
    `kxra-staging-seeds-${command}`,
  ),
);
await database.connect();
try {
  await database.query("set statement_timeout='30s'");
  const target = (
    await database.query(
      "select current_database() database,current_user username",
    )
  ).rows[0];
  if (
    target.database !== "postgres" ||
    !String(target.username).startsWith("postgres")
  )
    throw Error("STAGING_SEED_OPERATOR_IDENTITY_INVALID");
  await requireMigrations(database);
  const initial = await seedState(database);
  const initialState = reconcileSeedState(
    manifest,
    initial.row,
    initial.unmanaged,
  );
  if (command === "plan") {
    console.log(
      `Staging canonical seed plan: ${initialState.applied ? "already applied" : "one pending import"}; ${manifest.bundle.projects.length} projects and ${manifest.recordCodes.length} source records.`,
    );
  } else if (command === "apply") {
    await database.query(
      "select pg_advisory_lock(hashtext('kxra-staging-canonical-seeds'))",
    );
    try {
      await database.query(`create table if not exists public.kxra_seed_imports(
        profile text primary key,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
        source_commit text not null check(source_commit~'^[a-f0-9]{40}$'),
        applied_at timestamptz not null default now()
      )`);
      await database.query(
        "revoke all on table public.kxra_seed_imports from public,anon,authenticated",
      );
      const locked = await seedState(database);
      const lockedState = reconcileSeedState(
        manifest,
        locked.row,
        locked.unmanaged,
      );
      if (!lockedState.applied) {
        await database.query("begin");
        try {
          await importSeeds(database, manifest.bundle, { canonicalOnly: true });
          await database.query(
            "insert into public.kxra_seed_imports(profile,sha256,source_commit) values($1,$2,$3)",
            [manifest.profile, manifest.sha256, sourceCommit],
          );
          await database.query("commit");
        } catch (error) {
          await database.query("rollback");
          throw error;
        }
      }
    } finally {
      await database.query(
        "select pg_advisory_unlock(hashtext('kxra-staging-canonical-seeds'))",
      );
    }
    await verify(database);
  } else await verify(database);
} finally {
  await database.end();
}
