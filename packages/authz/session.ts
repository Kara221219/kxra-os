import crypto from "node:crypto";
export const fixtureUsers = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};
export function signSession(id: string, secret: string, now = Date.now()) {
  if (secret.length < 48) throw Error("Session secret too short");
  const payload = Buffer.from(
    JSON.stringify({ id, exp: now + 8 * 3600000 }),
  ).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifySession(
  token: string,
  secret: string,
  now = Date.now(),
): string | null {
  try {
    if (secret.length < 48) return null;
    const [p, s, ...extra] = token.split(".");
    if (extra.length) return null;
    const h = crypto.createHmac("sha256", secret).update(p).digest();
    const b = Buffer.from(s, "base64url");
    if (h.length !== b.length || !crypto.timingSafeEqual(h, b)) return null;
    const v = JSON.parse(Buffer.from(p, "base64url").toString());
    if (
      typeof v.exp !== "number" ||
      v.exp <= now ||
      !Object.values(fixtureUsers).includes(v.id)
    )
      return null;
    return v.id;
  } catch {
    return null;
  }
}
