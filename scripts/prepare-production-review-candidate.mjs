// Local clone/commit only. Never runs a database, provider, deploy or push command.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { integrationReleaseSource } from "./production-release-strategy.mjs";
import {
  hostedMigrationManifest,
  expectedHostedDatabase,
} from "./hosted-release-guard.mjs";
if (process.argv.length !== 2)
  throw Error("Usage: node scripts/prepare-production-review-candidate.mjs");
const root = fs.realpathSync(path.resolve(import.meta.dirname, "..")),
  workspace = path.dirname(root);
const git = (args, cwd = root) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
if (git(["status", "--porcelain"]))
  throw Error("RELEASE_REVIEW_REQUIRES_CLEAN_SOURCE");
const source = git(["rev-parse", "HEAD"]),
  { exclusions } = integrationReleaseSource(root),
  directory = path.join(workspace, "production-review-" + source.slice(0, 12));
try {
  fs.mkdirSync(directory, { mode: 0o700 });
} catch (e) {
  if (e.code === "EEXIST") throw Error("RELEASE_REVIEW_DESTINATION_EXISTS");
  throw e;
}
const branch = "codex/production-review-" + source.slice(0, 12);
execFileSync(
  "git",
  ["clone", "--no-hardlinks", "--no-checkout", root, directory],
  { stdio: "inherit" },
);
execFileSync("git", ["checkout", "-b", branch, source], {
  cwd: directory,
  stdio: "inherit",
});
for (const file of exclusions) {
  const name = path.join(directory, file.path);
  if (
    crypto.createHash("sha256").update(fs.readFileSync(name)).digest("hex") !==
    file.sha256
  )
    throw Error("RELEASE_REVIEW_EXCLUSION_HASH_CHANGED");
  fs.unlinkSync(name);
}
const manifest = hostedMigrationManifest(directory);
const strategy = {
  status: "REVIEW_CANDIDATE_NOT_DEPLOYMENT_AUTHORIZATION",
  authorization: false,
  sourceCommit: source,
  sourcePolicySha256: crypto
    .createHash("sha256")
    .update(
      fs.readFileSync(
        path.join(root, "packages/release/hosted-schema-policy-v1.json"),
      ),
    )
    .digest("hex"),
  schema: expectedHostedDatabase,
  excludedFixtureMigrations: exclusions,
  migrations: manifest.map(({ name, sha256 }) => ({ name, sha256 })),
  new_sql: false,
  automatic_down_migration: false,
  hosted_target_inspected: false,
  production_upgrade_executor_implemented: false,
  fixture_validation:
    "Use pinned integration source119 or a separate owned fixture clone; never restore fixtures into this production candidate.",
};
fs.mkdirSync(path.join(directory, ".release"));
fs.writeFileSync(
  path.join(directory, ".release/source-strategy.json"),
  JSON.stringify(strategy, null, 2) + "\n",
);
fs.writeFileSync(
  path.join(directory, ".release/README.md"),
  `# Review-only production117 candidate

This checkout omits only the two pinned fixture migrations, with provenance in source-strategy.json and its parent commit. No target was inspected or changed. No apply/deployment authority is granted.

Run release:check, lint, production build/artifact checks and the explicit production117 validation profile here. The broad local fixture suite expects119 migrations: run it on the pinned integration source or a separate owned fixture clone, never by adding fixture DDL back to this production candidate. CI cohort reconciliation and any native upgrade rehearsal remain gates before promotion. The production migration operator is still initialization-only; do not use it to upgrade an existing target.
`,
);
execFileSync(
  "git",
  [
    "add",
    "--",
    ...exclusions.map((f) => f.path),
    ".release/source-strategy.json",
    ".release/README.md",
  ],
  { cwd: directory, stdio: "inherit" },
);
execFileSync(
  "git",
  [
    "commit",
    "-m",
    "Prepare review-only production117 schema cohort with explicit fixture exclusions",
  ],
  { cwd: directory, stdio: "inherit" },
);
if (git(["status", "--porcelain"], directory))
  throw Error("RELEASE_REVIEW_CANDIDATE_DIRTY");
const runtimeDiff = git(
  [
    "diff",
    source,
    "HEAD",
    "--",
    "apps",
    "packages",
    "scripts",
    "package.json",
    "package-lock.json",
  ],
  directory,
);
if (runtimeDiff) throw Error("RELEASE_REVIEW_RUNTIME_CHANGED");
console.log(
  JSON.stringify(
    {
      status: "REVIEW_CANDIDATE_PREPARED",
      authorization: false,
      directory,
      branch,
      sourceCommit: source,
      candidateCommit: git(["rev-parse", "HEAD"], directory),
      schema: expectedHostedDatabase,
      exclusions,
      application_and_guard_diff_empty: true,
      sourceLocalMigrations: 119,
      candidateHostedMigrations: 117,
    },
    null,
    2,
  ),
);
