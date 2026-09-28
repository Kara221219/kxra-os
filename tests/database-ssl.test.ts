import assert from "node:assert/strict";
import { test } from "node:test";
import { rootCertificates } from "node:tls";
import { databaseConnectionDiagnostics, databaseSsl } from "../packages/db/ssl";

const certificate = `-----BEGIN CERTIFICATE-----\n${"A".repeat(64)}\n-----END CERTIFICATE-----\n`;

test("hosted database TLS requires an explicit CA and full verification", () => {
  assert.deepEqual(
    databaseSsl({
      KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(certificate).toString("base64"),
    }),
    { ca: [...rootCertificates, certificate], rejectUnauthorized: true },
  );
  assert.throws(() => databaseSsl({}), /CA certificate not configured/);
  assert.throws(
    () => databaseSsl({ KXRA_DATABASE_CA_CERT_BASE64: "not-a-certificate" }),
    /CA certificate not configured/,
  );
});

test("database diagnostics omit connection credentials and certificate contents", () => {
  const trustedCertificate = rootCertificates[0];
  const diagnostics = databaseConnectionDiagnostics({
    DATABASE_URL:
      "postgresql://secret-user:secret-password@db.example.test:6543/postgres?sslmode=require",
    KXRA_DATABASE_CA_CERT_BASE64:
      Buffer.from(trustedCertificate).toString("base64"),
  });

  assert.equal(diagnostics.databaseHost, "db.example.test");
  assert.equal(diagnostics.databasePort, "6543");
  assert.ok(diagnostics.certificateBytes > 0);
  assert.match(diagnostics.certificateSha256 || "", /^[a-f0-9]{64}$/);
  assert.ok(diagnostics.certificateSubject);
  assert.ok(diagnostics.certificateFingerprint);
  assert.doesNotMatch(
    JSON.stringify(diagnostics),
    /secret-user|secret-password/,
  );
});
