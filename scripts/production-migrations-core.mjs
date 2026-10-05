import {
  expectedStagingDatabase,
  migrationManifest,
  reconcileMigrationState,
} from "./staging-migrations-core.mjs";

export const productionProjectRef = "lhbgeucifxxcdoyrnesf";
export const expectedProductionDatabase = expectedStagingDatabase;
export { migrationManifest, reconcileMigrationState };

export function validateProductionTarget(environment) {
  const findings = [];
  if (environment.KXRA_ENVIRONMENT !== "production")
    findings.push("KXRA_ENVIRONMENT must be production");
  if (environment.VERCEL || environment.VERCEL_ENV)
    findings.push("production operator commands cannot run inside Vercel");
  if (environment.KXRA_PRODUCTION_PROJECT_REF !== productionProjectRef)
    findings.push(
      `KXRA_PRODUCTION_PROJECT_REF must equal ${productionProjectRef}`,
    );

  const sourceCommit = environment.KXRA_PRODUCTION_SOURCE_COMMIT || "";
  if (!/^[a-f0-9]{40}$/.test(sourceCommit))
    findings.push("KXRA_PRODUCTION_SOURCE_COMMIT must be an exact Git SHA");

  const value = environment.KXRA_PRODUCTION_MIGRATOR_DATABASE_URL || "";
  let databaseUrl;
  try {
    databaseUrl = new URL(value);
  } catch {
    findings.push(
      "KXRA_PRODUCTION_MIGRATOR_DATABASE_URL must be a PostgreSQL URL",
    );
  }
  if (databaseUrl) {
    const username = decodeURIComponent(databaseUrl.username);
    const direct =
      databaseUrl.hostname === `db.${productionProjectRef}.supabase.co`;
    const pooler = databaseUrl.hostname.endsWith(".pooler.supabase.com");
    if (!["postgres:", "postgresql:"].includes(databaseUrl.protocol))
      findings.push("production migrator URL must use PostgreSQL");
    if (!databaseUrl.password)
      findings.push(
        "production migrator URL must contain the operator password",
      );
    if (databaseUrl.pathname !== "/postgres")
      findings.push(
        "production migrator URL must target the postgres database",
      );
    if (
      databaseUrl.searchParams.getAll("sslmode").length !== 1 ||
      databaseUrl.searchParams.get("sslmode") !== "verify-full"
    )
      findings.push("production migrator URL must use sslmode=verify-full");
    if ([...databaseUrl.searchParams.keys()].some((name) => name !== "sslmode"))
      findings.push(
        "production migrator URL may contain only the sslmode parameter",
      );
    if (databaseUrl.port && databaseUrl.port !== "5432")
      findings.push(
        "production migrator URL must use direct or session-pooler port 5432",
      );
    if (!direct && !pooler)
      findings.push(
        "production migrator URL must target the fixed production project",
      );
    if (databaseUrl.hash)
      findings.push("production migrator URL must not contain a fragment");
    if (direct && username !== "postgres")
      findings.push("direct production migrator username must be postgres");
    if (pooler && username !== `postgres.${productionProjectRef}`)
      findings.push(
        `session-pooler production migrator username must be postgres.${productionProjectRef}`,
      );
  }
  return findings;
}

export function validateProductionMigrator(environment, command) {
  const findings = validateProductionTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  if (command === "apply") {
    const expected = `INITIALIZE:${productionProjectRef}:${environment.KXRA_PRODUCTION_SOURCE_COMMIT || ""}`;
    if (environment.KXRA_PRODUCTION_MIGRATION_CONFIRMATION !== expected)
      findings.push(
        `KXRA_PRODUCTION_MIGRATION_CONFIRMATION must equal ${expected}`,
      );
  }
  return { ok: findings.length === 0, findings };
}
