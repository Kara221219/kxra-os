import crypto from "node:crypto";
export function verifyWebhook(
  body: Buffer,
  signature: string | null,
  secret: string,
) {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const actual = Buffer.from(signature.slice(7), "hex"),
    expected = crypto.createHmac("sha256", secret).update(body).digest();
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}
export function pairingChallenge() {
  const token = crypto.randomBytes(24).toString("base64url");
  return {
    token,
    hash: crypto.createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + 600000).toISOString(),
  };
}

export function normalizeWhatsAppPhone(value: string) {
  const phone = value.trim();
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone))
    throw Error("WHATSAPP_PHONE_INVALID");
  return phone;
}

export function whatsappPhoneDigest(value: string) {
  return crypto
    .createHash("sha256")
    .update(normalizeWhatsAppPhone(value))
    .digest("hex");
}
