import crypto from "node:crypto";

export const joinIntentCookie = "kxra_join_intent";

export type JoinIntent = {
  invitationId: string;
  invitationVersion: number;
  tokenDigest: string;
  email: string;
  recipientHint: string;
  invitationExpiresAt: string;
  issuedAt: number;
  expiresAt: number;
};

function key(secret: string) {
  if (secret.length < 48) throw new Error("Join secret too short");
  return crypto
    .createHash("sha256")
    .update(`kxra-join-intent:${secret}`)
    .digest();
}

export function sealJoinIntent(
  input: Omit<JoinIntent, "issuedAt" | "expiresAt">,
  secret: string,
  now = Date.now(),
) {
  const invitationExpiry = new Date(input.invitationExpiresAt).getTime();
  if (!Number.isFinite(invitationExpiry) || invitationExpiry <= now)
    throw new Error("Invitation unavailable");
  const value: JoinIntent = {
    ...input,
    issuedAt: now,
    expiresAt: Math.min(now + 30 * 60_000, invitationExpiry),
  };
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from("kxra-join-intent-v1"));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function openJoinIntent(
  sealed: string | undefined,
  secret: string,
  now = Date.now(),
): JoinIntent | null {
  try {
    if (!sealed || sealed.length > 4096) return null;
    const [version, ivValue, bodyValue, tagValue, ...extra] = sealed.split(".");
    if (version !== "v1" || extra.length) return null;
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      key(secret),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAAD(Buffer.from("kxra-join-intent-v1"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const parsed = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(bodyValue, "base64url")),
        decipher.final(),
      ]).toString("utf8"),
    ) as JoinIntent;
    if (
      typeof parsed.invitationId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(parsed.invitationId) ||
      !Number.isInteger(parsed.invitationVersion) ||
      parsed.invitationVersion < 1 ||
      !/^[a-f0-9]{64}$/.test(parsed.tokenDigest) ||
      typeof parsed.email !== "string" ||
      parsed.email !== parsed.email.trim().toLowerCase() ||
      typeof parsed.recipientHint !== "string" ||
      typeof parsed.issuedAt !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.issuedAt > now + 60_000 ||
      parsed.expiresAt <= now ||
      parsed.expiresAt - parsed.issuedAt > 30 * 60_000 ||
      new Date(parsed.invitationExpiresAt).getTime() <= now
    )
      return null;
    return parsed;
  } catch {
    return null;
  }
}
