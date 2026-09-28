import assert from "node:assert/strict";
import { test } from "node:test";
import { databaseSsl } from "../packages/db/ssl";

const certificate = `-----BEGIN CERTIFICATE-----\n${"A".repeat(64)}\n-----END CERTIFICATE-----\n`;

test("hosted database TLS requires an explicit CA and full verification", () => {
  assert.deepEqual(
    databaseSsl({
      KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(certificate).toString("base64"),
    }),
    { ca: certificate, rejectUnauthorized: true },
  );
  assert.throws(() => databaseSsl({}), /CA certificate not configured/);
  assert.throws(
    () => databaseSsl({ KXRA_DATABASE_CA_CERT_BASE64: "not-a-certificate" }),
    /CA certificate not configured/,
  );
});
