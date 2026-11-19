// Local source builder only. No database, environment file, credentials, push or deployment.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { integrationReleaseSource } from "./production-release-strategy.mjs";
import {
  productionOperationsPayload,
  productionOperationsSource,
} from "./production-operations-review.mjs";
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
if (process.argv.length !== 2) throw Error("NO_ARGUMENTS_ACCEPTED");
const git = (a, cwd = root) =>
  execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
if (git(["status", "--porcelain"]))
  throw Error("CLEAN_COMMITTED_SOURCE_REQUIRED");
const source = git(["rev-parse", "HEAD"]),
  { exclusions } = integrationReleaseSource(root),
  { spec, bytes, ai } = productionOperationsPayload(root),
  directory = path.join(
    path.dirname(root),
    "production-operations-review-" + source.slice(0, 12),
  );
fs.mkdirSync(directory, { mode: 0o700 });
execFileSync(
  "git",
  ["clone", "--no-hardlinks", "--no-checkout", root, directory],
  { stdio: "inherit" },
);
execFileSync(
  "git",
  [
    "checkout",
    "-b",
    "codex/production-operations-review-" + source.slice(0, 12),
    source,
  ],
  { cwd: directory, stdio: "inherit" },
);
for (const f of exclusions) fs.unlinkSync(path.join(directory, f.path));
fs.writeFileSync(
  path.join(directory, "supabase/migrations", spec.candidateMigration.name),
  bytes,
  { flag: "wx" },
);
fs.writeFileSync(
  path.join(directory, "supabase/migrations", ai.spec.candidateMigration.name),
  ai.bytes,
  { flag: "wx" },
);
const manifest = productionOperationsSource(directory);
fs.mkdirSync(path.join(directory, ".release"), { mode: 0o700 });
const proof = {
  status: "REVIEW_ONLY_FULL_FEATURE_RELEASE_BLOCKED",
  authorization: false,
  sourceCommit: source,
  fullReleaseEligible: false,
  objective: spec.objective,
  defaultEnabled: false,
  grantsSeeded: false,
  policyDataSeeded: false,
  excludedFixtureMigrations: exclusions,
  migrations: manifest.map(({ name, sha256 }) => ({ name, sha256 })),
  featureDependencies: ai.spec.fullFeatureDependencies,
  termsOrFinancialCommitmentsChanged: false,
  hostedExecutorImplemented: false,
  hostedStateInspected: false,
};
fs.writeFileSync(
  path.join(directory, ".release/production-operations-review.json"),
  JSON.stringify(proof, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(directory, ".release/README.md"),
  "# Production operations migration review only\n\nFull-feature launch remains required. This source excludes only pinned fixture118/119 and contains a genuine AI118 and review119 payloads after117. It is not a complete full-feature production manifest or deployment authorization. Existing hosted operators remain guarded by117 and cannot apply this candidate. No target inspected. Fixture migrations/proposals cannot be promoted to fill the held feature bundles. See production-operations-review.json.\n",
);
git(
  [
    "add",
    "--",
    ...exclusions.map((f) => f.path),
    "supabase/migrations/" + spec.candidateMigration.name,
    "supabase/migrations/" + ai.spec.candidateMigration.name,
    ".release",
  ],
  directory,
);
git(
  [
    "commit",
    "-m",
    "Prepare production AI118 and review119 cohort without promoting fixture history",
  ],
  directory,
);
if (git(["status", "--porcelain"], directory)) throw Error("CANDIDATE_DIRTY");
console.log(
  JSON.stringify(
    {
      directory,
      candidateCommit: git(["rev-parse", "HEAD"], directory),
      ...proof,
    },
    null,
    2,
  ),
);
