import crypto from "node:crypto";
export type LocalSessionClaims = {
  id: string;
  auth_time: number;
  email: string;
  email_verified: boolean;
  aal: "aal1" | "aal2";
  session_version: number;
  provider_session_version: number;
  source: "fixture" | "fake-provider";
};
export const fixtureUsers = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
  invitee: "20000000-0000-4000-8000-000000000005",
};
export const fixtureEmails: Record<
  (typeof fixtureUsers)[keyof typeof fixtureUsers],
  string
> = {
  [fixtureUsers.owner]: "owner@fixture.invalid",
  [fixtureUsers.partner]: "partner@fixture.invalid",
  [fixtureUsers.viewer]: "viewer@fixture.invalid",
  [fixtureUsers.revoked]: "revoked@fixture.invalid",
  [fixtureUsers.invitee]: "invitee@fixture.invalid",
};
export function signSession(id: string, secret: string, now = Date.now()) {
  if (secret.length < 48) throw Error("Session secret too short");
  const payload = Buffer.from(
    JSON.stringify({ id, iat: now, exp: now + 8 * 3600000 }),
  ).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function signProviderSession(
  identity: {
    id: string;
    email: string;
    email_verified: boolean;
    aal: "aal1" | "aal2";
    session_version: number;
    provider_session_version: number;
  },
  secret: string,
  now = Date.now(),
) {
  if (secret.length < 48) throw Error("Session secret too short");
  const payload = Buffer.from(
    JSON.stringify({
      v: 2,
      iss: "kxra-local-auth",
      ...identity,
      iat: now,
      exp: now + 8 * 3600000,
    }),
  ).toString("base64url");
  return `${payload}.${crypto.createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifySessionClaims(
  token: string,
  secret: string,
  now = Date.now(),
): LocalSessionClaims | null {
  try {
    if (secret.length < 48) return null;
    const [p, s, ...extra] = token.split(".");
    if (extra.length) return null;
    const h = crypto.createHmac("sha256", secret).update(p).digest();
    const b = Buffer.from(s, "base64url");
    if (h.length !== b.length || !crypto.timingSafeEqual(h, b)) return null;
    const v = JSON.parse(Buffer.from(p, "base64url").toString());
    const commonInvalid =
      typeof v.iat !== "number" ||
      typeof v.exp !== "number" ||
      v.iat > now + 60_000 ||
      v.exp <= now ||
      v.exp - v.iat !== 8 * 3600000;
    if (commonInvalid) return null;
    if (v.v === 2) {
      if (
        v.iss !== "kxra-local-auth" ||
        typeof v.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          v.id,
        ) ||
        typeof v.email !== "string" ||
        v.email !== v.email.trim().toLowerCase() ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email) ||
        typeof v.email_verified !== "boolean" ||
        !["aal1", "aal2"].includes(v.aal) ||
        !Number.isInteger(v.session_version) ||
        v.session_version < 1 ||
        !Number.isInteger(v.provider_session_version) ||
        v.provider_session_version < 1
      )
        return null;
      return {
        id: v.id,
        auth_time: Math.floor(v.iat / 1000),
        email: v.email,
        email_verified: v.email_verified,
        aal: v.aal,
        session_version: v.session_version,
        provider_session_version: v.provider_session_version,
        source: "fake-provider",
      };
    }
    if (!Object.values(fixtureUsers).includes(v.id)) return null;
    return {
      id: v.id,
      auth_time: Math.floor(v.iat / 1000),
      email: fixtureEmails[v.id],
      email_verified: true,
      aal: "aal2",
      session_version: 1,
      provider_session_version: 1,
      source: "fixture",
    };
  } catch {
    return null;
  }
}
export function verifySession(token: string, secret: string, now = Date.now()) {
  return verifySessionClaims(token, secret, now)?.id || null;
}
