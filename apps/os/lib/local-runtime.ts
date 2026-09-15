import path from "node:path";
import { cookies } from "next/headers";
import { localMode, type Principal } from "../../../packages/db";
import { FakeAuthProvider } from "../../../packages/authz/fake-provider";
import {
  fixtureUsers,
  signProviderSession,
  signSession,
  verifySessionClaims,
} from "../../../packages/authz/session";
import type { AuthIdentity } from "../../../packages/authz/provider";
import { FakeEmailTransport } from "../../../packages/integrations/email";

function localRuntime() {
  if (!localMode() || !process.env.KXRA_RUNTIME)
    throw new Error("Local provider unavailable");
  return process.env.KXRA_RUNTIME;
}

export function fakeAuthProvider() {
  return new FakeAuthProvider(path.join(localRuntime(), "fake-auth.json"));
}

export function fakeEmailTransport() {
  return new FakeEmailTransport(path.join(localRuntime(), "fake-email.json"));
}

export function joinSecret() {
  const value = localMode()
    ? process.env.KXRA_LOCAL_SECRET
    : process.env.KXRA_JOIN_SECRET;
  if (!value || value.length < 48)
    throw new Error("Join configuration unavailable");
  return value;
}

export async function localPrincipal(): Promise<Principal | null> {
  const token = (await cookies()).get("kxra_local_session")?.value;
  const session = token
    ? verifySessionClaims(token, process.env.KXRA_LOCAL_SECRET || "")
    : null;
  if (!session) return null;
  if (session.source === "fake-provider") {
    const identity = await fakeAuthProvider().getIdentity(session.id);
    if (
      !identity ||
      identity.email !== session.email ||
      identity.emailVerified !== session.email_verified ||
      identity.providerSessionVersion !== session.provider_session_version
    )
      return null;
  }
  return {
    id: session.id,
    aal: session.aal,
    auth_time: session.auth_time,
    email: session.email,
    email_verified: session.email_verified,
    session_version: session.session_version,
    provider_session_version: session.provider_session_version,
    source: session.source,
  };
}

export async function issueFixtureSession(fixture: string) {
  const id = fixtureUsers[fixture as keyof typeof fixtureUsers];
  if (!id) throw new Error("Fixture unavailable");
  (await cookies()).set(
    "kxra_local_session",
    signSession(id, process.env.KXRA_LOCAL_SECRET || ""),
    {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 60 * 60,
      secure: false,
    },
  );
}

export async function issueLocalProviderSession(
  identity: AuthIdentity,
  accountSessionVersion: number,
) {
  const value = signProviderSession(
    {
      id: identity.id,
      email: identity.email,
      email_verified: identity.emailVerified,
      aal: identity.aal,
      session_version: accountSessionVersion,
      provider_session_version: identity.providerSessionVersion,
    },
    process.env.KXRA_LOCAL_SECRET || "",
  );
  (await cookies()).set("kxra_local_session", value, {
    httpOnly: true,
    sameSite: "strict",
    secure: false,
    path: "/",
    maxAge: 8 * 60 * 60,
  });
}

export async function clearAuthCookies() {
  (await cookies()).delete("kxra_local_session");
}
