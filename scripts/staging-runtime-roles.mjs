import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { stagingDatabaseConfig } from "./staging-database.mjs";
import {
  canonicalSeedManifest,
  canonicalSeedProfile,
} from "./staging-seeds-core.mjs";
import {
  applyRuntimeRoles,
  inspectRuntimeRoles,
  runtimeRoleFindings,
  runtimeRoleNames,
  runtimeRoleProfile,
  validateRuntimeRoleOperator,
} from "./staging-runtime-roles-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "plan";
const validation = validateRuntimeRoleOperator(process.env, command);
if (!validation.ok)
  throw Error(
    `Staging runtime-role guard rejected:\n- ${validation.findings.join("\n- ")}`,
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
    throw Error("STAGING_ROLES_REQUIRE_PHASE_BRANCH");
  if (dirty) throw Error("STAGING_ROLES_REQUIRE_CLEAN_TREE");
  if (head !== remote) throw Error("STAGING_ROLES_REQUIRE_PUSHED_HEAD");
  return head;
}

async function requireCanonicalSeed(database) {
  const table = (
    await database.query(
      "select to_regclass('public.kxra_seed_imports') is not null tracked",
    )
  ).rows[0].tracked;
  if (!table) throw Error("STAGING_CANONICAL_SEEDS_INCOMPLETE");
  const row = (
    await database.query(
      "select profile,sha256 from public.kxra_seed_imports where profile=$1",
      [canonicalSeedProfile],
    )
  ).rows[0];
  const manifest = canonicalSeedManifest(root);
  if (!row || row.sha256 !== manifest.sha256)
    throw Error("STAGING_CANONICAL_SEED_HASH_MISMATCH");
}

function unsafeExistingState(state) {
  const allowed = {
    kxra_app: new Set(["anon", "authenticated"]),
    kxra_public_ingress: new Set(["anon"]),
  };
  const findings = [];
  for (const row of state.memberships)
    if (!allowed[row.member]?.has(row.granted))
      findings.push(`${row.member}: unknown membership ${row.granted}`);
  for (const row of state.ownership)
    if (row.owned !== 0) findings.push(`${row.rolname}: owns database objects`);
  for (const row of state.directGrants)
    if (row.grants !== 0)
      findings.push(`${row.grantee}: has direct object grants`);
  return findings;
}

async function verify(database) {
  await requireCanonicalSeed(database);
  const state = await inspectRuntimeRoles(database);
  const findings = runtimeRoleFindings(state);
  if (findings.length)
    throw Error(`STAGING_RUNTIME_ROLE_MISMATCH:${findings.join(";")}`);
  console.log(
    `Staging runtime role verification PASS (${runtimeRoleNames.join(", ")}; no ownership or direct grants).`,
  );
}

const sourceCommit = repositoryState();
const database = new pg.Client(
  stagingDatabaseConfig(
    process.env.KXRA_STAGING_MIGRATOR_DATABASE_URL,
    `kxra-staging-runtime-roles-${command}`,
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
  if (target.database !== "postgres" || target.username !== "postgres")
    throw Error("STAGING_ROLE_OPERATOR_IDENTITY_INVALID");
  await requireCanonicalSeed(database);
  const initial = await inspectRuntimeRoles(database);
  const blockers = unsafeExistingState(initial);
  if (blockers.length)
    throw Error(`STAGING_RUNTIME_ROLE_TAKEOVER_REJECTED:${blockers.join(";")}`);
  if (command === "plan") {
    const findings = runtimeRoleFindings(initial);
    console.log(
      findings.length
        ? `Staging runtime role plan: ${findings.length} bounded correction(s) pending.`
        : "Staging runtime role plan: exact role state already present.",
    );
  } else if (command === "apply") {
    await database.query(
      "select pg_advisory_lock(hashtext('kxra-staging-runtime-roles'))",
    );
    try {
      const locked = await inspectRuntimeRoles(database);
      const lockedBlockers = unsafeExistingState(locked);
      if (lockedBlockers.length)
        throw Error(
          `STAGING_RUNTIME_ROLE_TAKEOVER_REJECTED:${lockedBlockers.join(";")}`,
        );
      await database.query("begin");
      try {
        await applyRuntimeRoles(
          database,
          process.env.KXRA_STAGING_APP_PASSWORD,
          process.env.KXRA_STAGING_PUBLIC_INGRESS_PASSWORD,
        );
        await database.query(`create table if not exists public.kxra_runtime_role_events(
          id bigint generated always as identity primary key,
          profile text not null,source_commit text not null check(source_commit~'^[a-f0-9]{40}$'),
          roles text[] not null,applied_at timestamptz not null default now()
        )`);
        await database.query(
          "revoke all on table public.kxra_runtime_role_events from public,anon,authenticated,kxra_app,kxra_public_ingress",
        );
        await database.query(
          "insert into public.kxra_runtime_role_events(profile,source_commit,roles) values($1,$2,$3)",
          [runtimeRoleProfile, sourceCommit, runtimeRoleNames],
        );
        await database.query("commit");
      } catch (error) {
        await database.query("rollback");
        throw error;
      }
    } finally {
      await database.query(
        "select pg_advisory_unlock(hashtext('kxra-staging-runtime-roles'))",
      );
    }
    await verify(database);
  } else await verify(database);
} finally {
  await database.end();
}
