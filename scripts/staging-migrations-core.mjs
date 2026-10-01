import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const expectedStagingDatabase = {
  migrations: 76,
  protectedTables: 172,
  exposedFunctions: 146,
};

export function validateStagingTarget(environment) {
  const findings = [];
  if (environment.KXRA_ENVIRONMENT !== "staging")
    findings.push("KXRA_ENVIRONMENT must be staging");
  if (environment.VERCEL || environment.VERCEL_ENV)
    findings.push("staging operator commands cannot run inside Vercel");
  const projectRef = environment.KXRA_STAGING_PROJECT_REF || "";
  if (!/^[a-z0-9]{20}$/.test(projectRef))
    findings.push(
      "KXRA_STAGING_PROJECT_REF must be the 20-character project reference",
    );
  const value = environment.KXRA_STAGING_MIGRATOR_DATABASE_URL || "";
  let databaseUrl;
  try {
    databaseUrl = new URL(value);
  } catch {
    findings.push(
      "KXRA_STAGING_MIGRATOR_DATABASE_URL must be a PostgreSQL URL",
    );
  }
  if (databaseUrl) {
    const username = decodeURIComponent(databaseUrl.username);
    const direct = databaseUrl.hostname === `db.${projectRef}.supabase.co`;
    const pooler = databaseUrl.hostname.endsWith(".pooler.supabase.com");
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol))
      findings.push("migrator URL must use PostgreSQL");
    if (!databaseUrl.password)
      findings.push("migrator URL must contain the operator password");
    if (databaseUrl.pathname !== "/postgres")
      findings.push("migrator URL must target the postgres database");
    if (
      databaseUrl.searchParams.getAll("sslmode").length !== 1 ||
      databaseUrl.searchParams.get("sslmode") !== "verify-full"
    )
      findings.push("migrator URL must use sslmode=verify-full");
    if ([...databaseUrl.searchParams.keys()].some((name) => name !== "sslmode"))
      findings.push("migrator URL may contain only the sslmode parameter");
    if (databaseUrl.port && databaseUrl.port !== "5432")
      findings.push("migrator URL must use direct or session-pooler port 5432");
    if (!direct && !pooler)
      findings.push("migrator URL must target the declared Supabase project");
    if (databaseUrl.hash)
      findings.push("migrator URL must not contain a fragment");
    if (direct && username !== "postgres")
      findings.push("direct migrator username must be postgres");
    if (pooler && username !== `postgres.${projectRef}`)
      findings.push(
        "session-pooler migrator username must be postgres.PROJECT_REF",
      );
  }
  return findings;
}

export function migrationManifest(root) {
  const directory = path.join(root, "supabase", "migrations");
  const names = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (let index = 0; index < names.length; index += 1) {
    const prefix = `${String(index + 1).padStart(4, "0")}_`;
    if (!names[index].startsWith(prefix))
      throw Error(`STAGING_MIGRATION_SEQUENCE_INVALID:${names[index]}`);
  }
  return names.map((name) => {
    const sql = fs.readFileSync(path.join(directory, name), "utf8");
    return {
      name,
      sha256: crypto.createHash("sha256").update(sql).digest("hex"),
      sql: sql
        .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
        .replace(/commit;\s*$/i, ""),
    };
  });
}

export function validateStagingMigrator(environment, command) {
  const findings = validateStagingTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  const projectRef = environment.KXRA_STAGING_PROJECT_REF || "";
  if (command === "apply") {
    const expected = `APPLY:${projectRef}:codex/phase-2-completion`;
    if (environment.KXRA_STAGING_MIGRATION_CONFIRMATION !== expected)
      findings.push(
        `KXRA_STAGING_MIGRATION_CONFIRMATION must equal ${expected}`,
      );
  }
  return { ok: findings.length === 0, findings };
}

export function reconcileMigrationState(
  manifest,
  applied,
  managedSchemaExists,
) {
  const source = new Map(manifest.map((item) => [item.name, item]));
  const recorded = new Map(applied.map((item) => [item.name, item]));
  const unknown = applied.filter((item) => !source.has(item.name));
  const changed = applied.filter(
    (item) => source.get(item.name)?.sha256 !== item.sha256,
  );
  if (unknown.length)
    throw Error(`STAGING_UNKNOWN_MIGRATION:${unknown[0].name}`);
  if (changed.length)
    throw Error(`STAGING_MIGRATION_HASH_MISMATCH:${changed[0].name}`);
  if (managedSchemaExists && applied.length === 0)
    throw Error("STAGING_UNMANAGED_KXRA_SCHEMA");
  return {
    applied: applied.length,
    pending: manifest.filter((item) => !recorded.has(item.name)),
  };
}
