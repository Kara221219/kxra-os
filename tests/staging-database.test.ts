import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import { test } from "node:test";
import pg from "pg";
import { stagingDatabaseConfig } from "../scripts/staging-database.mjs";

const certificate = `-----BEGIN CERTIFICATE-----\n${"A".repeat(64)}\n-----END CERTIFICATE-----\n`;

test("staging operators preserve explicit verified TLS configuration", () => {
  const config = stagingDatabaseConfig(
    "postgresql://operator:password@db.example.test:5432/postgres?sslmode=verify-full&application_name=discarded",
    "kxra-staging-test",
    {
      KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(certificate).toString("base64"),
    },
  );
  const client = new pg.Client(config);

  assert.equal(
    new URL(config.connectionString).searchParams.get("sslmode"),
    null,
  );
  assert.equal(
    new URL(config.connectionString).searchParams.get("application_name"),
    "discarded",
  );
  assert.equal(config.application_name, "kxra-staging-test");
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

test("staging operators reject a missing or malformed database CA", () => {
  assert.throws(
    () =>
      stagingDatabaseConfig(
        "postgresql://operator:password@db.example.test/postgres?sslmode=verify-full",
        "kxra-staging-test",
        {},
      ),
    /STAGING_DATABASE_CA_CERTIFICATE_INVALID/,
  );
});
