import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { stagingDatabaseConfig } from "./staging-database.mjs";
import {
  applyReleaseFinalization,
  inspectReleaseFinalization,
  recoveryEvidenceSha256,
  releaseFinalizationStatus,
  validateReleaseFinalizationOperator,
} from "./staging-release-finalization-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "plan";
const validation = validateReleaseFinalizationOperator(process.env, command);
if (!validation.ok)
  throw Error(
    `Staging release-finalization guard rejected:\n- ${validation.findings.join("\n- ")}`,
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
  throw Error("STAGING_FINALIZATION_REQUIRE_PHASE_BRANCH");
if (dirty) throw Error("STAGING_FINALIZATION_REQUIRE_CLEAN_TREE");
if (head !== remote) throw Error("STAGING_FINALIZATION_REQUIRE_PUSHED_HEAD");

const database = new pg.Client(
  stagingDatabaseConfig(
    process.env.KXRA_STAGING_MIGRATOR_DATABASE_URL,
    `kxra-staging-release-finalization-${command}`,
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
    throw Error("STAGING_FINALIZATION_OPERATOR_IDENTITY_INVALID");
  const initial = await inspectReleaseFinalization(database);
  const initialStatus = releaseFinalizationStatus(initial);
  if (initialStatus.unsafe.length)
    throw Error(
      `STAGING_FINALIZATION_TAKEOVER_REJECTED:${initialStatus.unsafe.join(";")}`,
    );
  if (command === "plan") {
    console.log(
      initialStatus.pending.length
        ? `Staging release-finalization plan: ${initialStatus.pending.length} bounded item pending; recovery evidence ${recoveryEvidenceSha256}.`
        : "Staging release-finalization plan: exact READY evidence already present.",
    );
  } else if (command === "apply") {
    await database.query(
      "select pg_advisory_lock(hashtext('kxra-staging-release-finalization'))",
    );
    try {
      await database.query("begin");
      try {
        await applyReleaseFinalization(database);
        await database.query("commit");
      } catch (error) {
        await database.query("rollback");
        throw error;
      }
    } finally {
      await database.query(
        "select pg_advisory_unlock(hashtext('kxra-staging-release-finalization'))",
      );
    }
  }
  if (command !== "plan") {
    await database.query("begin");
    try {
      const finalState = await inspectReleaseFinalization(database);
      const finalStatus = releaseFinalizationStatus(finalState);
      if (finalStatus.unsafe.length || finalStatus.pending.length)
        throw Error(
          `STAGING_FINALIZATION_MISMATCH:${JSON.stringify(finalStatus)}`,
        );
      console.log(
        `Staging release-finalization verification PASS (READY evidence only; no deployment or publication authority), recovery evidence ${recoveryEvidenceSha256}.`,
      );
    } finally {
      await database.query("rollback");
    }
  }
} finally {
  await database.end();
}
