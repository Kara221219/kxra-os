import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import pg from "pg";

export type PublicEnquiry = {
  kind: "ENQUIRY" | "CUSTOM_PROJECT" | "CONTACT";
  name: string;
  email: string;
  company: string;
  message: string;
  sourcePath: "/partner" | "/submit-opportunity" | "/contact";
  consent: boolean;
  requestDigest: string;
  fingerprint: string;
  idempotencyKey: string;
  botField: string;
};

export function trustedClientAddress(
  headers: Headers,
  environment: Record<string, string | undefined> = process.env,
) {
  let value: string | null = null;
  let allowForwardedChain = false;
  if (environment.VERCEL === "1") {
    value = headers.get("x-vercel-forwarded-for");
  } else if (environment.KXRA_RUNTIME && environment.KXRA_MARKETING_ORIGIN) {
    try {
      const origin = new URL(environment.KXRA_MARKETING_ORIGIN);
      if (
        origin.protocol === "http:" &&
        (origin.hostname === "127.0.0.1" || origin.hostname === "localhost")
      )
        value = headers.get("x-forwarded-for");
      allowForwardedChain = true;
    } catch {
      return null;
    }
  }
  const address = allowForwardedChain
    ? value?.split(",")[0]?.trim() || ""
    : value?.trim() || "";
  if (
    (!allowForwardedChain && address.includes(",")) ||
    net.isIP(address) === 0
  )
    return null;
  return address;
}

function localConfiguration() {
  const runtime = process.env.KXRA_RUNTIME;
  if (!runtime) return null;
  const target = path.join(runtime, "database.json");
  if (!fs.existsSync(target)) return null;
  return JSON.parse(fs.readFileSync(target, "utf8")) as pg.ClientConfig;
}

export async function storePublicEnquiry(input: PublicEnquiry) {
  const local = localConfiguration();
  const connectionString = process.env.KXRA_PUBLIC_DATABASE_URL;
  if (!local && !connectionString)
    throw new Error("Public ingress storage unavailable");
  const client = new pg.Client(
    local || { connectionString, ssl: { rejectUnauthorized: true } },
  );
  await client.connect();
  try {
    await client.query("begin");
    if (local) await client.query("set local role anon");
    const result = await client.query(
      `select * from kxra.submit_public_enquiry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        input.kind,
        input.name,
        input.email,
        input.company,
        input.message,
        input.sourcePath,
        input.consent,
        input.requestDigest,
        input.fingerprint,
        input.idempotencyKey,
        input.botField,
      ],
    );
    await client.query("commit");
    return result.rows[0] as {
      receipt_id: string;
      accepted: boolean;
      outcome: string;
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

export function digest(secret: string, value: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}
