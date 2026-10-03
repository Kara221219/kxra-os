import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { stagingDatabaseConfig } from "./staging-database.mjs";
import {
  applyReleaseCandidate,
  expectedReleaseBlockers,
  inspectReleaseCandidate,
  releaseCandidateFindings,
  releaseCandidateReadiness,
  unsafeReleaseCandidateState,
  validateReleaseCandidateOperator,
} from "./staging-release-candidate-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "plan";
const validation = validateReleaseCandidateOperator(process.env, command);
if (!validation.ok)
  throw Error(
    `Staging release-candidate guard rejected:\n- ${validation.findings.join("\n- ")}`,
  );

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
  throw Error("STAGING_RELEASE_REQUIRE_PHASE_BRANCH");
if (dirty) throw Error("STAGING_RELEASE_REQUIRE_CLEAN_TREE");
if (head !== remote) throw Error("STAGING_RELEASE_REQUIRE_PUSHED_HEAD");

const database = new pg.Client(
  stagingDatabaseConfig(
    process.env.KXRA_STAGING_MIGRATOR_DATABASE_URL,
    `kxra-staging-release-${command}`,
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
    throw Error("STAGING_RELEASE_OPERATOR_IDENTITY_INVALID");
  const initial = await inspectReleaseCandidate(database);
  const blockers = unsafeReleaseCandidateState(initial);
  if (blockers.length)
    throw Error(`STAGING_RELEASE_TAKEOVER_REJECTED:${blockers.join(";")}`);
  if (command === "plan") {
    const findings = releaseCandidateFindings(initial);
    console.log(
      findings.length
        ? `Staging release-candidate plan: ${findings.length} bounded item(s) pending.`
        : "Staging release-candidate plan: exact blocked candidate already present.",
    );
  } else if (command === "apply") {
    await database.query(
      "select pg_advisory_lock(hashtext('kxra-staging-release-candidate'))",
    );
    try {
      await database.query("begin");
      try {
        await applyReleaseCandidate(database);
        await database.query("commit");
      } catch (error) {
        await database.query("rollback");
        throw error;
      }
    } finally {
      await database.query(
        "select pg_advisory_unlock(hashtext('kxra-staging-release-candidate'))",
      );
    }
  }
  const findings = releaseCandidateFindings(
    await inspectReleaseCandidate(database),
  );
  if (command !== "plan" && findings.length)
    throw Error(`STAGING_RELEASE_MISMATCH:${findings.join(";")}`);
  if (command !== "plan") {
    await database.query("begin");
    try {
      const readiness = await releaseCandidateReadiness(database);
      if (
        readiness.ready ||
        JSON.stringify(readiness.blockers) !==
          JSON.stringify(expectedReleaseBlockers)
      )
        throw Error(
          `STAGING_RELEASE_BLOCKERS_UNEXPECTED:${JSON.stringify(readiness)}`,
        );
    } finally {
      await database.query("rollback");
    }
    console.log(
      "Staging release-candidate verification PASS (blocked only by hosted backup evidence and explicit accessibility/security reviews).",
    );
  }
} finally {
  await database.end();
}
