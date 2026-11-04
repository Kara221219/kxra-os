// Offline only: no environment, database, network or credential loading.
import path from "node:path";
import {
  hostedMigrationManifest,
  expectedHostedDatabase,
} from "./hosted-release-guard.mjs";
if (process.argv.length !== 2)
  throw Error("Usage: node scripts/verify-hosted-release-source.mjs");
try {
  const migrations = hostedMigrationManifest(
    path.resolve(import.meta.dirname, ".."),
  );
  console.log(
    JSON.stringify(
      {
        status: "SOURCE_ELIGIBLE_FOR_REVIEW",
        authorization: false,
        expectedDatabase: expectedHostedDatabase,
        migrations: migrations.map(({ name, sha256 }) => ({ name, sha256 })),
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.log(
    JSON.stringify(
      { status: "BLOCKED", authorization: false, reason: e.message },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}
