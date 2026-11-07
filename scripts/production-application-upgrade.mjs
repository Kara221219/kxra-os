// Additive 82→126 direct-TLS entry point. Existing operators remain unchanged.
import fs from "node:fs";
import path from "node:path";
import { checkServerIdentity } from "node:tls";
import pg from "pg";
import { applicationSource as reviewedApplicationSource } from "./production-application.mjs";
import { productionDatabaseConfig } from "./production-database.mjs";
import { productionProjectRef } from "./production-migrations-core.mjs";
import {
  validateUpgradeEnvironment,
  validateUpgradeProfiles,
  operateApplicationUpgrade,
} from "./production-application-upgrade-core.mjs";

const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
export function applicationUpgradeSource(environment = process.env) {
  const source = reviewedApplicationSource(environment);
  const file = path.join(
    root,
    "packages/release/production-application-upgrade-targets-v1.json",
  );
  if (fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile())
    throw Error("APPLICATION_UPGRADE_PROFILE_REGULAR_FILE_REQUIRED");
  const profiles = validateUpgradeProfiles(
    JSON.parse(fs.readFileSync(file, "utf8")),
  );
  return { ...source, profiles };
}

async function main() {
  const command = process.argv[2] || "plan";
  if (process.argv.length > 3) throw Error("APPLICATION_UNEXPECTED_ARGUMENTS");
  if (!validateUpgradeEnvironment(process.env, command).ok)
    throw Error("APPLICATION_ENVIRONMENT_REJECTED");
  const source = applicationUpgradeSource();
  const config = productionDatabaseConfig(
    process.env.KXRA_PRODUCTION_MIGRATOR_DATABASE_URL,
    `kxra-production-application-upgrade-${command}`,
  );
  config.ssl.servername = `db.${productionProjectRef}.supabase.co`;
  config.connectionTimeoutMillis = 10000;
  const db = new pg.Client(config);
  // Suppress unsolicited driver error events; subsequent operations fail through the
  // sanitized error path instead of exposing raw connection diagnostics on stderr.
  db.on("error", () => {});
  let primaryError;
  try {
    await db.connect();
    const stream = db.connection.stream;
    if (
      !stream.encrypted ||
      !stream.authorized ||
      checkServerIdentity(config.ssl.servername, stream.getPeerCertificate())
    )
      throw Error("APPLICATION_VERIFIED_DIRECT_TLS_REQUIRED");
    await db.query(
      "set statement_timeout='30s'; set lock_timeout='5s'; set idle_in_transaction_session_timeout='60s'; set search_path=pg_catalog",
    );
    const report = await operateApplicationUpgrade(db, {
      ...source,
      command,
      planSha256: process.env.KXRA_PRODUCTION_APPLICATION_UPGRADE_PLAN_SHA256,
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    primaryError = e;
    throw e;
  } finally {
    try {
      await db.end();
    } catch (e) {
      if (!primaryError) throw e;
    }
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.join(root, "scripts/production-application-upgrade.mjs")
) {
  main().catch((error) => {
    // Raw PostgreSQL/driver errors can contain query text, URLs or data. Never echo them.
    const firstLine =
      typeof error.message === "string" ? error.message.split("\n")[0] : "";
    const code = /^(APPLICATION|COHORT)_[A-Z_]+$/.test(firstLine)
      ? firstLine
      : /^[0-9A-Z]{5}$/.test(error.code || "")
        ? `APPLICATION_DATABASE_REJECTED:${error.code}`
        : "APPLICATION_REJECTED_SEE_REVIEWED_PRECONDITIONS";
    console.error(code);
    process.exitCode = 1;
  });
}
