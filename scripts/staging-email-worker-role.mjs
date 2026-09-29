import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { stagingDatabaseConfig } from "./staging-database.mjs";
import {
  emailWorkerLoginRole,
  emailWorkerRoleFindings,
  emailWorkerRoleProfile,
  inspectEmailWorkerRole,
  unsafeEmailWorkerRoleState,
  applyEmailWorkerRole,
  validateEmailWorkerRoleOperator,
} from "./staging-email-worker-role-core.mjs";
import {
  canonicalSeedManifest,
  canonicalSeedProfile,
} from "./staging-seeds-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "plan";
const validation = validateEmailWorkerRoleOperator(process.env, command);
if (!validation.ok)
  throw Error(
    `Staging email-worker role guard rejected:\n- ${validation.findings.join("\n- ")}`,
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
    throw Error("STAGING_EMAIL_ROLE_REQUIRE_PHASE_BRANCH");
  if (dirty) throw Error("STAGING_EMAIL_ROLE_REQUIRE_CLEAN_TREE");
  if (head !== remote) throw Error("STAGING_EMAIL_ROLE_REQUIRE_PUSHED_HEAD");
  return head;
}

async function requireCanonicalSeed(database) {
  const row = (
    await database.query(
      "select profile,sha256 from public.kxra_seed_imports where profile=$1",
      [canonicalSeedProfile],
    )
  ).rows[0];
  if (!row || row.sha256 !== canonicalSeedManifest(root).sha256)
    throw Error("STAGING_CANONICAL_SEED_HASH_MISMATCH");
}

async function verify(database) {
  await requireCanonicalSeed(database);
  const findings = emailWorkerRoleFindings(
    await inspectEmailWorkerRole(database),
  );
  if (findings.length)
    throw Error(`STAGING_EMAIL_WORKER_ROLE_MISMATCH:${findings.join(";")}`);
  console.log(
    `Staging email-worker role verification PASS (${emailWorkerLoginRole}; no ownership or direct grants).`,
  );
}

const sourceCommit = repositoryState();
const database = new pg.Client(
  stagingDatabaseConfig(
    process.env.KXRA_STAGING_MIGRATOR_DATABASE_URL,
    `kxra-staging-email-worker-role-${command}`,
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
    throw Error("STAGING_EMAIL_ROLE_OPERATOR_IDENTITY_INVALID");
  await requireCanonicalSeed(database);
  const initial = await inspectEmailWorkerRole(database);
  const blockers = unsafeEmailWorkerRoleState(initial);
  if (blockers.length)
    throw Error(`STAGING_EMAIL_ROLE_TAKEOVER_REJECTED:${blockers.join(";")}`);
  if (command === "plan") {
    const findings = emailWorkerRoleFindings(initial);
    console.log(
      findings.length
        ? `Staging email-worker role plan: ${findings.length} bounded correction(s) pending.`
        : "Staging email-worker role plan: exact role state already present.",
    );
  } else if (command === "apply") {
    await database.query(
      "select pg_advisory_lock(hashtext('kxra-staging-email-worker-role'))",
    );
    try {
      const locked = await inspectEmailWorkerRole(database);
      const lockedBlockers = unsafeEmailWorkerRoleState(locked);
      if (lockedBlockers.length)
        throw Error(
          `STAGING_EMAIL_ROLE_TAKEOVER_REJECTED:${lockedBlockers.join(";")}`,
        );
      await database.query("begin");
      try {
        await applyEmailWorkerRole(
          database,
          process.env.KXRA_STAGING_EMAIL_WORKER_PASSWORD,
        );
        await database.query(`create table if not exists public.kxra_worker_role_events(
          id bigint generated always as identity primary key,
          profile text not null,source_commit text not null check(source_commit~'^[a-f0-9]{40}$'),
          role_name text not null,applied_at timestamptz not null default now()
        )`);
        await database.query(
          "revoke all on table public.kxra_worker_role_events from public,anon,authenticated,kxra_app,kxra_public_ingress,kxra_email_runner",
        );
        await database.query(
          "insert into public.kxra_worker_role_events(profile,source_commit,role_name) values($1,$2,$3)",
          [emailWorkerRoleProfile, sourceCommit, emailWorkerLoginRole],
        );
        await database.query("commit");
      } catch (error) {
        await database.query("rollback");
        throw error;
      }
    } finally {
      await database.query(
        "select pg_advisory_unlock(hashtext('kxra-staging-email-worker-role'))",
      );
    }
    await verify(database);
  } else await verify(database);
} finally {
  await database.end();
}
