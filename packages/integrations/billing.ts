import crypto from "node:crypto";

export type VerifiedBillingWebhook = {
  id: string;
  type: string;
  created: number;
  payload: Record<string, unknown>;
  rawSha256: string;
};

function signatures(header: string) {
  const entries = header.split(",").map((entry) => entry.trim().split("=", 2));
  const timestamp = entries.find(([name]) => name === "t")?.[1];
  const values = entries
    .filter(
      ([name, value]) => name === "v1" && /^[a-f0-9]{64}$/.test(value || ""),
    )
    .map(([, value]) => value);
  if (!timestamp || !/^\d{10}$/.test(timestamp) || !values.length)
    throw new Error("BILLING_SIGNATURE_INVALID");
  return { timestamp: Number(timestamp), values };
}

function constantTimeHex(left: string, right: string) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function verifyBillingWebhook(
  rawBody: Buffer,
  signatureHeader: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): VerifiedBillingWebhook {
  if (secret.length < 32 || rawBody.length < 2 || rawBody.length > 1_000_000)
    throw new Error("BILLING_SIGNATURE_INVALID");
  const parsedSignature = signatures(signatureHeader);
  if (Math.abs(nowSeconds - parsedSignature.timestamp) > toleranceSeconds)
    throw new Error("BILLING_SIGNATURE_EXPIRED");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${parsedSignature.timestamp}.`)
    .update(rawBody)
    .digest("hex");
  if (!parsedSignature.values.some((value) => constantTimeHex(value, expected)))
    throw new Error("BILLING_SIGNATURE_INVALID");
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new Error("BILLING_PAYLOAD_INVALID");
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    typeof (payload as Record<string, unknown>).id !== "string" ||
    typeof (payload as Record<string, unknown>).type !== "string" ||
    !Number.isInteger((payload as Record<string, unknown>).created)
  )
    throw new Error("BILLING_PAYLOAD_INVALID");
  const event = payload as Record<string, unknown>;
  return {
    id: event.id as string,
    type: event.type as string,
    created: event.created as number,
    payload: event,
    rawSha256: crypto.createHash("sha256").update(rawBody).digest("hex"),
  };
}

export function signFakeBillingWebhook(
  rawBody: Buffer,
  secret: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  if (secret.length < 32) throw new Error("BILLING_SIGNATURE_INVALID");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}
