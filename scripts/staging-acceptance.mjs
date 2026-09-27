import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  executeStagingProbes,
  stagingEvidence,
  stagingProbePlan,
  validateStagingAcceptanceConfiguration,
} from "./staging-acceptance-core.mjs";

const root = path.resolve(import.meta.dirname, "..");
const action = process.argv[2];
if (!["plan", "run"].includes(action)) {
  console.error("Usage: node scripts/staging-acceptance.mjs <plan|run>");
  process.exit(1);
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

const branch = git("branch", "--show-current");
const repository = {
  branch,
  head: git("rev-parse", "HEAD"),
  remoteHead: git("rev-parse", `origin/${branch}`),
  dirty: Boolean(git("status", "--porcelain")),
};
const checked = validateStagingAcceptanceConfiguration(
  process.env,
  repository,
  action === "run",
);
if (!checked.ok || !checked.config) {
  console.error(`Staging acceptance ${action} FAILED:`);
  for (const finding of checked.findings) console.error(`- ${finding}`);
  process.exit(1);
}

const plan = stagingProbePlan(checked.config);
if (action === "plan") {
  console.log(
    `Staging acceptance plan PASS (${plan.length} probes; ${checked.config.commit}; credentials and response bodies are not printed).`,
  );
  for (const probe of plan)
    console.log(`- ${probe.id}: ${probe.method} ${probe.surface}${probe.path}`);
  process.exit(0);
}

const startedAt = new Date().toISOString();
const results = await executeStagingProbes(checked.config);
const completedAt = new Date().toISOString();
const evidence = stagingEvidence(
  checked.config,
  results,
  startedAt,
  completedAt,
);
const directory = path.join(root, "docs", "operations", "evidence", "staging");
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
const filename = `${startedAt.replaceAll(":", "-")}-${checked.config.commit.slice(0, 12)}.json`;
const target = path.join(directory, filename);
fs.writeFileSync(target, `${JSON.stringify(evidence, null, 2)}\n`, {
  mode: 0o600,
});
console.log(
  `Staging acceptance ${evidence.outcome} (${results.filter((result) => result.outcome === "PASS").length}/${results.length} probes; review and commit ${path.relative(root, target)}; no response bodies or credentials retained).`,
);
for (const result of results)
  if (result.outcome === "FAIL")
    console.error(`- ${result.id}: ${result.findings.join("; ")}`);
if (evidence.outcome !== "PASS") process.exitCode = 1;
