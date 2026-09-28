const certificatePattern =
  /^-----BEGIN CERTIFICATE-----\n(?:[A-Za-z0-9+/=]+\n)+-----END CERTIFICATE-----\n?$/;

export function databaseSsl(
  environment: Record<string, string | undefined> = process.env,
) {
  const ca = environment.KXRA_DATABASE_CA_CERT;
  if (!ca || !certificatePattern.test(ca))
    throw Error("Database CA certificate not configured");
  return { ca, rejectUnauthorized: true } as const;
}
