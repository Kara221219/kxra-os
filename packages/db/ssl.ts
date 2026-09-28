import { rootCertificates } from "node:tls";

const certificatePattern =
  /^-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+/=]+\n)+-----END CERTIFICATE-----\n?$/;

export function databaseSsl(
  environment: Record<string, string | undefined> = process.env,
) {
  const encoded = environment.KXRA_DATABASE_CA_CERT_BASE64;
  const ca = encoded ? Buffer.from(encoded, "base64").toString("utf8") : "";
  if (!ca || !certificatePattern.test(ca))
    throw Error("Database CA certificate not configured");
  return {
    ca: [...rootCertificates, ca],
    rejectUnauthorized: true,
  };
}
