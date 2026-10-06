import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { productionDatabaseConfig } from "./production-database.mjs";
import { productionBootstrapProfile } from "./production-bootstrap-core.mjs";
import {
  canonicalSeedManifest,
  canonicalSeedProfile,
} from "./staging-seeds-core.mjs";
import {
  inspectRuntimeRoles,
  runtimeRoleFindings,
} from "./staging-runtime-roles-core.mjs";
import {
  applyOwnerBootstrap,
  emailDigest,
  inspectAuthOwner,
  inspectOwnerState,
  kxraOrganisationId,
  ownerStateFindings,
  ownerTakeoverFindings,
} from "./staging-owner-core.mjs";
import {
  productionOwnerGrantSource,
  productionOwnerProfile,
  validateProductionOwnerOperator,
} from "./production-owner-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "plan";
const validation = validateProductionOwnerOperator(process.env, command);
if (!validation.ok)
  throw Error(
    `Production owner guard rejected:\n- ${validation.findings.join("\n- ")}`,
  );
const input = validation.input;

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
    throw Error("PRODUCTION_OWNER_REQUIRE_PHASE_BRANCH");
  if (dirty) throw Error("PRODUCTION_OWNER_REQUIRE_CLEAN_TREE");
  if (head !== remote) throw Error("PRODUCTION_OWNER_REQUIRE_PUSHED_HEAD");
  if (head !== process.env.KXRA_PRODUCTION_SOURCE_COMMIT)
    throw Error("PRODUCTION_OWNER_REQUIRE_EXACT_SOURCE_COMMIT");
  return head;
}

async function requirePrerequisites(database) {
  const seed = (
    await database.query(
      `select profile,sha256 from public.kxra_seed_imports where profile=$1`,
      [canonicalSeedProfile],
    )
  ).rows[0];
  if (!seed || seed.sha256 !== canonicalSeedManifest(root).sha256)
    throw Error("PRODUCTION_CANONICAL_SEED_HASH_MISMATCH");
  const roleFindings = runtimeRoleFindings(await inspectRuntimeRoles(database));
  if (roleFindings.length)
    throw Error(`PRODUCTION_RUNTIME_ROLE_MISMATCH:${roleFindings.join(";")}`);
  const foundation = (
    await database.query(
      `select profile from public.kxra_production_bootstrap_events
       where profile=$1 order by applied_at desc limit 1`,
      [productionBootstrapProfile],
    )
  ).rows[0];
  if (!foundation) throw Error("PRODUCTION_BOOTSTRAP_EVIDENCE_MISSING");
  const organisation = (
    await database.query(
      `select id,name,slug,organisation_kind,relationship_type,state
       from kxra.organisations where id=$1`,
      [kxraOrganisationId],
    )
  ).rows[0];
  if (
    !organisation ||
    organisation.name !== "KXRA Group" ||
    organisation.slug !== "kxra-group" ||
    organisation.organisation_kind !== "KXRA" ||
    organisation.relationship_type !== "INTERNAL" ||
    organisation.state !== "ACTIVE"
  )
    throw Error("PRODUCTION_KXRA_ORGANISATION_MISMATCH");
}

async function inspect(database) {
  const auth = await inspectAuthOwner(database, input);
  const state = await inspectOwnerState(database, input);
  const options = {
    requireMfa: false,
    grantSource: productionOwnerGrantSource,
  };
  const findings = ownerStateFindings(state, input, auth, options);
  const finalFindings = ownerStateFindings(state, input, auth, {
    ...options,
    requireMfa: true,
  });
  const tracked = (
    await database.query(
      "select to_regclass('public.kxra_owner_bootstrap_events') is not null present",
    )
  ).rows[0].present;
  const event = tracked
    ? (
        await database.query(
          `select owner_id,email_digest from public.kxra_owner_bootstrap_events
           where profile=$1`,
          [productionOwnerProfile],
        )
      ).rows[0]
    : undefined;
  return { auth, state, findings, finalFindings, event };
}

function eventFindings(result) {
  const exact =
    result.event?.owner_id === input.userId &&
    result.event?.email_digest === emailDigest(input.email);
  const statePresent = [
    result.state.account,
    result.state.member,
    result.state.profile,
    result.state.membership,
    result.state.preference,
    result.state.onboarding,
  ].some(Boolean);
  if (result.event && !exact) return ["conflicting owner bootstrap event"];
  if (statePresent && !result.findings.length && !exact)
    return ["exact owner state is not operator-tracked"];
  if (!statePresent && result.event)
    return ["owner bootstrap event exists without owner state"];
  return [];
}

async function verify(database) {
  await requirePrerequisites(database);
  const result = await inspect(database);
  if (result.finalFindings.length)
    throw Error(`PRODUCTION_OWNER_MISMATCH:${result.finalFindings.join(";")}`);
  if (eventFindings(result).length || !result.event)
    throw Error("PRODUCTION_OWNER_EVENT_MISMATCH");
  console.log(
    "Production owner verification PASS (confirmed Auth identity and MFA; exact singleton owner).",
  );
}

const sourceCommit = repositoryState();
const database = new pg.Client(
  productionDatabaseConfig(
    process.env.KXRA_PRODUCTION_MIGRATOR_DATABASE_URL,
    `kxra-production-owner-${command}`,
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
    throw Error("PRODUCTION_OWNER_OPERATOR_IDENTITY_INVALID");
  await requirePrerequisites(database);
  const initial = await inspect(database);
  const blockers = ownerTakeoverFindings(
    initial.state,
    input,
    initial.findings,
  );
  blockers.push(...eventFindings(initial));
  if (blockers.length)
    throw Error(`PRODUCTION_OWNER_TAKEOVER_REJECTED:${blockers.join(";")}`);
  if (command === "plan") {
    console.log(
      initial.findings.length
        ? "Production owner plan: one confirmed Auth owner preparation is pending."
        : initial.finalFindings.length
          ? "Production owner plan: owner is prepared; hosted MFA enrollment and verification remain pending."
          : "Production owner plan: exact confirmed-MFA owner state already present.",
    );
  } else if (command === "apply") {
    await database.query(
      "select pg_advisory_lock(hashtext('kxra-production-owner-bootstrap'))",
    );
    try {
      const locked = await inspect(database);
      const lockedBlockers = ownerTakeoverFindings(
        locked.state,
        input,
        locked.findings,
      );
      lockedBlockers.push(...eventFindings(locked));
      if (lockedBlockers.length)
        throw Error(
          `PRODUCTION_OWNER_TAKEOVER_REJECTED:${lockedBlockers.join(";")}`,
        );
      if (locked.findings.length) {
        await database.query("begin");
        try {
          await applyOwnerBootstrap(database, input, locked.auth, {
            profile: productionOwnerProfile,
            grantSource: productionOwnerGrantSource,
          });
          await database.query(`create table if not exists public.kxra_owner_bootstrap_events(
            profile text primary key,owner_id uuid not null,org_id uuid not null,
            email_digest text not null check(email_digest~'^[a-f0-9]{64}$'),
            source_commit text not null check(source_commit~'^[a-f0-9]{40}$'),
            applied_at timestamptz not null default now()
          )`);
          await database.query(
            "alter table public.kxra_owner_bootstrap_events enable row level security",
          );
          await database.query(
            "alter table public.kxra_owner_bootstrap_events force row level security",
          );
          await database.query(
            "revoke all on table public.kxra_owner_bootstrap_events from public,anon,authenticated,kxra_app,kxra_public_ingress",
          );
          await database.query(
            `insert into public.kxra_owner_bootstrap_events(
              profile,owner_id,org_id,email_digest,source_commit
             ) values($1,$2,$3,$4,$5)`,
            [
              productionOwnerProfile,
              input.userId,
              kxraOrganisationId,
              emailDigest(input.email),
              sourceCommit,
            ],
          );
          await database.query("commit");
        } catch (error) {
          await database.query("rollback");
          throw error;
        }
      }
    } finally {
      await database.query(
        "select pg_advisory_unlock(hashtext('kxra-production-owner-bootstrap'))",
      );
    }
    const applied = await inspect(database);
    if (applied.findings.length || eventFindings(applied).length)
      throw Error("PRODUCTION_OWNER_PREPARATION_MISMATCH");
    if (applied.finalFindings.length)
      console.log(
        "Production owner preparation PASS; sign in, enroll hosted MFA, then run production:owner:verify.",
      );
    else await verify(database);
  } else await verify(database);
} finally {
  await database.end();
}
