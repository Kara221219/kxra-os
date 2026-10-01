import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { stagingDatabaseConfig } from "./staging-database.mjs";
import {
  applyFoundingPlan,
  foundingPlanFindings,
  foundingPlanPrices,
  inspectFoundingPlan,
  unsafeFoundingPlanState,
  validateFoundingPlanOperator,
} from "./staging-founding-plan-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "plan";
const validation = validateFoundingPlanOperator(process.env, command);
if (!validation.ok)
  throw Error(
    `Staging founding-plan guard rejected:\n- ${validation.findings.join("\n- ")}`,
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
    throw Error("STAGING_FOUNDING_PLAN_REQUIRE_PHASE_BRANCH");
  if (dirty) throw Error("STAGING_FOUNDING_PLAN_REQUIRE_CLEAN_TREE");
  if (head !== remote) throw Error("STAGING_FOUNDING_PLAN_REQUIRE_PUSHED_HEAD");
}

repositoryState();
const prices = foundingPlanPrices(process.env);
const database = new pg.Client(
  stagingDatabaseConfig(
    process.env.KXRA_STAGING_MIGRATOR_DATABASE_URL,
    `kxra-staging-founding-plan-${command}`,
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
    throw Error("STAGING_FOUNDING_PLAN_OPERATOR_IDENTITY_INVALID");
  const initial = await inspectFoundingPlan(database);
  const blockers = unsafeFoundingPlanState(initial, prices);
  if (blockers.length)
    throw Error(
      `STAGING_FOUNDING_PLAN_TAKEOVER_REJECTED:${blockers.join(";")}`,
    );
  if (command === "plan") {
    const findings = foundingPlanFindings(initial, prices);
    console.log(
      findings.length
        ? `Staging founding-plan plan: ${findings.length} bounded item(s) pending.`
        : "Staging founding-plan plan: exact TEST plan already present.",
    );
  } else if (command === "apply") {
    await database.query(
      "select pg_advisory_lock(hashtext('kxra-staging-founding-plan'))",
    );
    try {
      await database.query("begin");
      try {
        await applyFoundingPlan(database, prices);
        await database.query("commit");
      } catch (error) {
        await database.query("rollback");
        throw error;
      }
    } finally {
      await database.query(
        "select pg_advisory_unlock(hashtext('kxra-staging-founding-plan'))",
      );
    }
  }
  const findings = foundingPlanFindings(
    await inspectFoundingPlan(database),
    prices,
  );
  if (command !== "plan" && findings.length)
    throw Error(`STAGING_FOUNDING_PLAN_MISMATCH:${findings.join(";")}`);
  if (command !== "plan")
    console.log(
      "Staging founding-plan verification PASS (£29 monthly, £290 annual, 120 monthly generation and export units).",
    );
} finally {
  await database.end();
}
