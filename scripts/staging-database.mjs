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

/**
 * @param {string} connectionString
 * @param {string} applicationName
 * @param {Record<string, string | undefined>} environment
 */
export function stagingDatabaseConfig(
  connectionString,
  applicationName,
  environment = process.env,
) {
  const url = new URL(connectionString);
  for (const parameter of connectionStringSslParameters)
    url.searchParams.delete(parameter);

  const encoded = environment.KXRA_DATABASE_CA_CERT_BASE64 || "";
  const ca = Buffer.from(encoded, "base64").toString("utf8");
  if (!certificatePattern.test(ca))
    throw Error("STAGING_DATABASE_CA_CERTIFICATE_INVALID");

  return {
    connectionString: url.toString(),
    ssl: { ca: [...rootCertificates, ca], rejectUnauthorized: true },
    application_name: applicationName,
  };
}
