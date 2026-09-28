import { createHash, X509Certificate } from "node:crypto";
import { rootCertificates } from "node:tls";

const certificatePattern =
  /^-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+/=]+\n)+-----END CERTIFICATE-----\n?$/;

const connectionStringSslParameters = [
  "ssl",
  "sslmode",
  "sslcert",
  "sslkey",
  "sslrootcert",
  "sslcrl",
  "sslnegotiation",
  "uselibpqcompat",
];

export function databaseConnectionString(value: string) {
  const url = new URL(value);
  for (const parameter of connectionStringSslParameters)
    url.searchParams.delete(parameter);
  return url.toString();
}

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

export function databaseConnectionDiagnostics(
  environment: Record<string, string | undefined> = process.env,
) {
  const encoded = environment.KXRA_DATABASE_CA_CERT_BASE64 || "";
  const decoded = Buffer.from(encoded, "base64");
  let certificateSubject: string | null = null;
  let certificateFingerprint: string | null = null;
  try {
    const certificate = new X509Certificate(decoded);
    certificateSubject = certificate.subject;
    certificateFingerprint = certificate.fingerprint256;
  } catch {
    // Invalid certificate input is represented by null metadata below.
  }

  let databaseHost: string | null = null;
  let databasePort: string | null = null;
  try {
    const databaseUrl = new URL(environment.DATABASE_URL || "");
    databaseHost = databaseUrl.hostname || null;
    databasePort = databaseUrl.port || null;
  } catch {
    // Invalid URL input is represented by null metadata below.
  }

  return {
    databaseHost,
    databasePort,
    certificateBytes: decoded.byteLength,
    certificateSha256: decoded.byteLength
      ? createHash("sha256").update(decoded).digest("hex")
      : null,
    certificateSubject,
    certificateFingerprint,
  };
}
