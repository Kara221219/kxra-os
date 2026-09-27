import crypto from "node:crypto";

export const recoveryIntentCookie = "kxra_recovery_intent";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function authCallbackDestination(requested: string | null) {
  return requested === "/join/finish" || requested === "/reset-password"
    ? requested
    : "/os";
}

function key(secret: string) {
  if (secret.length < 48) throw Error("Recovery secret too short");
  return crypto
    .createHash("sha256")
    .update(`kxra-recovery-intent:${secret}`)
    .digest();
}

export function sealRecoveryIntent(
  userId: string,
  secret: string,
  now = Date.now(),
) {
  if (!uuid.test(userId)) throw Error("Recovery identity invalid");
  const payload = Buffer.from(
    JSON.stringify({
      v: 1,
      userId,
      issuedAt: now,
      expiresAt: now + 10 * 60_000,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", key(secret))
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function openRecoveryIntent(
  value: string | undefined,
  secret: string,
  now = Date.now(),
) {
  try {
    if (!value || value.length > 1024) return null;
    const [payload, signature, ...extra] = value.split(".");
    if (extra.length) return null;
    const expected = crypto
      .createHmac("sha256", key(secret))
      .update(payload)
      .digest();
    const supplied = Buffer.from(signature, "base64url");
    if (
      expected.length !== supplied.length ||
      !crypto.timingSafeEqual(expected, supplied)
    )
      return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      parsed.v !== 1 ||
      !uuid.test(parsed.userId) ||
      !Number.isInteger(parsed.issuedAt) ||
      !Number.isInteger(parsed.expiresAt) ||
      parsed.issuedAt > now + 60_000 ||
      parsed.expiresAt <= now ||
      parsed.expiresAt - parsed.issuedAt !== 10 * 60_000
    )
      return null;
    return {
      userId: parsed.userId as string,
      expiresAt: parsed.expiresAt as number,
    };
  } catch {
    return null;
  }
}
