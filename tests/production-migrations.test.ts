import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import { test } from "node:test";
import pg from "pg";
import { productionDatabaseConfig } from "../scripts/production-database.mjs";
import {
  productionProjectRef,
  validateProductionMigrator,
} from "../scripts/production-migrations-core.mjs";

const sourceCommit = "a".repeat(40);
const certificate = `-----BEGIN CERTIFICATE-----\n${"A".repeat(64)}\n-----END CERTIFICATE-----\n`;
const base = {
  KXRA_ENVIRONMENT: "production",
  KXRA_PRODUCTION_PROJECT_REF: productionProjectRef,
  KXRA_PRODUCTION_SOURCE_COMMIT: sourceCommit,
  KXRA_PRODUCTION_MIGRATOR_DATABASE_URL: `postgresql://postgres:private-password@db.${productionProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
};

test("production migrator is fixed to the declared project and exact source commit", () => {
  assert.deepEqual(validateProductionMigrator(base, "plan"), {
    ok: true,
    findings: [],
  });
  assert.equal(
    validateProductionMigrator(
      {
        ...base,
        KXRA_PRODUCTION_PROJECT_REF: "abcdefghijklmnopqrst",
        KXRA_PRODUCTION_SOURCE_COMMIT: "main",
        KXRA_PRODUCTION_MIGRATOR_DATABASE_URL:
          "postgresql://postgres:password@attacker.invalid:6543/postgres?sslmode=require&options=unsafe#fragment",
        VERCEL_ENV: "production",
      },
      "plan",
    ).ok,
    false,
  );
});

test("production apply requires an exact project and commit confirmation", () => {
  const expected = `INITIALIZE:${productionProjectRef}:${sourceCommit}`;
  const missing = validateProductionMigrator(base, "apply");
  assert.equal(missing.ok, false);
  assert.ok(
    missing.findings.includes(
      `KXRA_PRODUCTION_MIGRATION_CONFIRMATION must equal ${expected}`,
    ),
  );
  assert.equal(
    validateProductionMigrator(
      { ...base, KXRA_PRODUCTION_MIGRATION_CONFIRMATION: expected },
      "apply",
    ).ok,
    true,
  );
});

test("production migration guard rejects staging and Vercel execution", () => {
  const rejected = validateProductionMigrator(
    { ...base, KXRA_ENVIRONMENT: "staging", VERCEL: "1" },
    "verify",
  );
  assert.equal(rejected.ok, false);
  assert.ok(rejected.findings.includes("KXRA_ENVIRONMENT must be production"));
  assert.ok(
    rejected.findings.includes(
      "production operator commands cannot run inside Vercel",
    ),
  );
});

test("production operator preserves explicit verified TLS configuration", () => {
  const config = productionDatabaseConfig(
    `postgresql://postgres:password@db.${productionProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
    "kxra-production-test",
    {
      KXRA_PRODUCTION_DATABASE_CA_CERT_BASE64:
        Buffer.from(certificate).toString("base64"),
    },
  );
  const client = new pg.Client(config);
  assert.equal(
    new URL(config.connectionString).searchParams.get("sslmode"),
    null,
  );
  assert.equal(config.application_name, "kxra-production-test");
  assert.deepEqual(config.ssl, {
    ca: [...rootCertificates, certificate],
    rejectUnauthorized: true,
  });
  assert.deepEqual(
    (
      client as unknown as {
        connectionParameters: { ssl: unknown };
      }
    ).connectionParameters.ssl,
    config.ssl,
  );
});

test("production operator rejects a missing database CA", () => {
  assert.throws(
    () =>
      productionDatabaseConfig(
        `postgresql://postgres:password@db.${productionProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
        "kxra-production-test",
        {},
      ),
    /PRODUCTION_DATABASE_CA_CERTIFICATE_INVALID/,
  );
});
