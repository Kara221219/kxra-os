// Production-directed, direct-TLS-only entry point. Never invoked by local fixtures.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { checkServerIdentity } from "node:tls";
import pg from "pg";
import { applicationReleaseCohort } from "./application-release-cohort.mjs";
import { readCanonicalRegularFileSync } from "./read-regular-file.mjs";
import { productionDatabaseConfig } from "./production-database.mjs";
import { productionProjectRef } from "./production-migrations-core.mjs";
import {
  validateApplicationEnvironment,
  validateApplicationProfiles,
  operateApplication,
} from "./production-application-core.mjs";

const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
const git = (args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  }).trim();
export function applicationSource(environment = process.env) {
  if (git(["status", "--porcelain", "--untracked-files=all"]))
    throw Error("APPLICATION_CLEAN_SOURCE_REQUIRED");
  if (
    git(["ls-files", "-v"])
      .split("\n")
      .some((l) => /^[a-zS]/.test(l))
  )
    throw Error("APPLICATION_HIDDEN_SOURCE_CHANGES_FORBIDDEN");
  const sourceCommit = git(["rev-parse", "HEAD"]);
  if (sourceCommit !== environment.KXRA_PRODUCTION_SOURCE_COMMIT)
    throw Error("APPLICATION_EXACT_SOURCE_REQUIRED");
  const cohort = applicationReleaseCohort(root);
  const profileFile = path.join(
    root,
    "packages/release/production-application-targets-v1.json",
  );
  let profileBytes;
  try {
    profileBytes = readCanonicalRegularFileSync(profileFile).bytes;
  } catch (error) {
    if (error?.code === "ELOOP" || error?.code === "EISDIR")
      throw Error("APPLICATION_PROFILE_REGULAR_FILE_REQUIRED");
    throw error;
  }
  const profiles = validateApplicationProfiles(
    JSON.parse(profileBytes.toString("utf8")),
  );
  return { sourceCommit, cohort, profiles };
}

async function main() {
  const command = process.argv[2] || "plan";
  if (process.argv.length > 3) throw Error("APPLICATION_UNEXPECTED_ARGUMENTS");
  if (!validateApplicationEnvironment(process.env, command).ok)
    throw Error("APPLICATION_ENVIRONMENT_REJECTED");
  const source = applicationSource();
  const config = productionDatabaseConfig(
    process.env.KXRA_PRODUCTION_MIGRATOR_DATABASE_URL,
    `kxra-production-application-${command}`,
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
    const report = await operateApplication(db, {
      ...source,
      command,
      planSha256: process.env.KXRA_PRODUCTION_APPLICATION_PLAN_SHA256,
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
    path.join(root, "scripts/production-application.mjs")
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
