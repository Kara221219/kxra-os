import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import pg from "pg";
import {
  databaseConnectionString,
  databaseSsl,
} from "../../../packages/db/ssl";

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

export function classifyDatabaseConnectionFailure(error: unknown) {
  const rawCode =
    typeof error === "object" && error && "code" in error
      ? String(error.code).toUpperCase()
      : "";
  const classifications: Record<string, string> = {
    "28P01": "AUTH_FAILED",
    "28000": "AUTHORIZATION_FAILED",
    "3D000": "DATABASE_NOT_FOUND",
    "53300": "CAPACITY_REACHED",
    ENOTFOUND: "DNS_FAILED",
    EAI_AGAIN: "DNS_TEMPORARY_FAILURE",
    ECONNREFUSED: "NETWORK_REFUSED",
    ETIMEDOUT: "NETWORK_TIMEOUT",
    ECONNRESET: "NETWORK_RESET",
    ERR_TLS_CERT_ALTNAME_INVALID: "TLS_IDENTITY_FAILED",
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: "TLS_CHAIN_FAILED",
    SELF_SIGNED_CERT_IN_CHAIN: "TLS_CHAIN_FAILED",
    DEPTH_ZERO_SELF_SIGNED_CERT: "TLS_CHAIN_FAILED",
    CERT_HAS_EXPIRED: "TLS_CERTIFICATE_EXPIRED",
  };
  return `PUBLIC_INGRESS_DATABASE_CONNECT_${classifications[rawCode] || "UNKNOWN"}`;
}

export function publicIngressConnectionDiagnostics(
  environment: Record<string, string | undefined> = process.env,
) {
  const encoded = environment.KXRA_DATABASE_CA_CERT_BASE64 || "";
  const decoded = Buffer.from(encoded, "base64");
  let certificateFingerprint: string | null = null;
  try {
    certificateFingerprint = new crypto.X509Certificate(decoded).fingerprint256;
  } catch {
    // Invalid certificate input is represented without disclosing its contents.
  }
  let endpointMode = "INVALID";
  let usernameMode = "INVALID";
  let sslMode: string | null = null;
  try {
    const url = new URL(environment.KXRA_PUBLIC_DATABASE_URL || "");
    sslMode = url.searchParams.get("sslmode");
    if (url.hostname.endsWith(".pooler.supabase.com"))
      endpointMode =
        url.port === "6543" ? "TRANSACTION_POOLER" : "SESSION_POOLER";
    else if (
      url.hostname.startsWith("db.") &&
      url.hostname.endsWith(".supabase.co")
    )
      endpointMode = "DIRECT";
    usernameMode = url.username.startsWith("kxra_public_ingress.")
      ? "CUSTOM_POOLER"
      : url.username === "kxra_public_ingress"
        ? "CUSTOM_DIRECT"
        : "UNEXPECTED";
  } catch {
    // Invalid connection input is represented without disclosing its contents.
  }
  return {
    certificateBytes: decoded.byteLength,
    certificateFingerprint,
    endpointMode,
    usernameMode,
    sslMode,
  };
}

export async function storePublicEnquiry(input: PublicEnquiry) {
  const local = localConfiguration();
  const connectionString = process.env.KXRA_PUBLIC_DATABASE_URL;
  if (!local && !connectionString)
    throw new Error("Public ingress storage unavailable");
  let client: pg.Client;
  try {
    client = new pg.Client(
      local || {
        connectionString: databaseConnectionString(connectionString as string),
        ssl: databaseSsl(),
      },
    );
  } catch (error) {
    throw new Error("PUBLIC_INGRESS_DATABASE_CONFIG_FAILED", { cause: error });
  }
  try {
    await client.connect();
  } catch (error) {
    throw new Error(classifyDatabaseConnectionFailure(error), { cause: error });
  }
  let transactionStarted = false;
  try {
    await client.query("begin");
    transactionStarted = true;
    await client.query("set local role anon");
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
    transactionStarted = false;
    return result.rows[0] as {
      receipt_id: string;
      accepted: boolean;
      outcome: string;
    };
  } catch (error) {
    if (transactionStarted)
      try {
        await client.query("rollback");
      } catch {
        // Preserve the bounded original failure classification.
      }
    if (
      typeof error === "object" &&
      error &&
      "code" in error &&
      String(error.code) === "P0001"
    )
      throw error;
    throw new Error("PUBLIC_INGRESS_DATABASE_TRANSACTION_FAILED", {
      cause: error,
    });
  } finally {
    await client.end();
  }
}

export function digest(secret: string, value: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}
