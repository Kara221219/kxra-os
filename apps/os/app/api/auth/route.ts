import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { localMode, query, type Principal } from "../../../../../packages/db";
import {
  fakeAuthProvider,
  issueFixtureSession,
  issueLocalProviderSession,
} from "#kxra/local-runtime";
import {
  clearOrganisationContext,
  sameOrigin,
  supabase,
} from "../../../lib/auth";
import crypto from "node:crypto";
import {
  hostedMfaGate,
  verifyHostedTotp,
  type HostedMfaApi,
} from "../../../../../packages/authz/supabase-mfa";

function redirect(req: Request, path: string) {
  return NextResponse.redirect(
    new URL(path, process.env.KXRA_ORIGIN || req.url),
    303,
  );
}

async function rateLimit(operation: string, subject: string) {
  const digest = crypto
    .createHash("sha256")
    .update(`${operation}:${subject}`)
    .digest("hex");
  const allowed = await query<{ allowed: boolean }>(
    null,
    "select kxra.consume_rate_limit($1,$2,10,900) as allowed",
    [operation, digest],
  );
  if (!allowed[0]?.allowed) throw Error("RATE_LIMITED");
}

export async function POST(req: Request) {
  let mfaAttempt = false;
  try {
    sameOrigin(req);
    const f = await req.formData();
    if (f.get("logout")) {
      (await cookies()).delete("kxra_local_session");
      await clearOrganisationContext();
      if (!localMode()) await (await supabase()).auth.signOut();
      return redirect(req, "/login");
    }
    if (f.get("mfa")) {
      mfaAttempt = true;
      if (localMode()) throw Error("MFA_CHALLENGE_HOSTED_ONLY");
      const code = String(f.get("code") || "").trim();
      const client = await supabase();
      const user = await client.auth.getUser();
      if (user.error || !user.data.user) throw Error("AUTH_REQUIRED");
      await rateLimit("mfa-challenge", user.data.user.id);
      const api = client.auth.mfa as unknown as HostedMfaApi;
      const gate = await hostedMfaGate(api);
      if (gate.challengeRequired)
        await verifyHostedTotp(api, gate.factorId, code);
      return redirect(req, "/os");
    }
    const fixture = localMode() ? f.get("fixture") : null;
    if (fixture) {
      await issueFixtureSession(String(fixture));
      return redirect(req, "/os");
    }
    const normalizedEmail = String(f.get("email") || "")
      .trim()
      .toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail) || normalizedEmail.length > 320)
      throw Error("SIGN_IN_INVALID");
    await rateLimit("sign-in", normalizedEmail);
    if (localMode()) {
      const identity = await fakeAuthProvider().signIn(
        normalizedEmail,
        String(f.get("password") || ""),
      );
      const principal: Principal = {
        id: identity.id,
        email: identity.email,
        email_verified: identity.emailVerified,
        aal: identity.aal,
        auth_time: Math.floor(Date.now() / 1000),
        session_version: 1,
        provider_session_version: identity.providerSessionVersion,
        source: "fake-provider",
      };
      const profile = await query<{
        account_state: string;
        session_version: number;
      }>(
        principal,
        "select account_state,session_version from kxra.profiles where user_id=$1",
        [identity.id],
      );
      if (
        !profile[0] ||
        ["SUSPENDED", "REVOKED"].includes(profile[0].account_state)
      )
        throw Error();
      await issueLocalProviderSession(identity, profile[0].session_version);
      const hasJoin = Boolean((await cookies()).get("kxra_join_intent"));
      const next = !identity.emailVerified
        ? hasJoin
          ? "/join/account"
          : "/login?verify=1"
        : hasJoin
          ? "/join/finish"
          : profile[0].account_state === "ONBOARDING"
            ? "/onboarding"
            : "/os";
      return redirect(req, next);
    } else {
      const client = await supabase();
      const { error } = await client.auth.signInWithPassword({
        email: normalizedEmail,
        password: String(f.get("password")),
      });
      if (error) throw Error();
      await clearOrganisationContext();
      const gate = await hostedMfaGate(
        client.auth.mfa as unknown as HostedMfaApi,
      );
      if (gate.challengeRequired) return redirect(req, "/login/mfa");
    }
    return redirect(req, "/os");
  } catch {
    return redirect(req, mfaAttempt ? "/login/mfa?error=1" : "/login?error=1");
  }
}
