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
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const f = await req.formData();
    if (f.get("logout")) {
      (await cookies()).delete("kxra_local_session");
      await clearOrganisationContext();
      if (!localMode()) await (await supabase()).auth.signOut();
      return NextResponse.redirect(
        new URL("/login", process.env.KXRA_ORIGIN || req.url),
        303,
      );
    }
    if (localMode()) {
      const fixture = f.get("fixture");
      if (fixture) {
        await issueFixtureSession(String(fixture));
      } else {
        const normalizedEmail = String(f.get("email") || "")
          .trim()
          .toLowerCase();
        const rateSubject = crypto
          .createHash("sha256")
          .update(`sign-in:${normalizedEmail}`)
          .digest("hex");
        const allowed = await query<{ allowed: boolean }>(
          null,
          "select kxra.consume_rate_limit('sign-in',$1,10,900) as allowed",
          [rateSubject],
        );
        if (!allowed[0]?.allowed) throw Error();
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
        return NextResponse.redirect(
          new URL(next, process.env.KXRA_ORIGIN || req.url),
          303,
        );
      }
    } else {
      const { error } = await (
        await supabase()
      ).auth.signInWithPassword({
        email: String(f.get("email")),
        password: String(f.get("password")),
      });
      if (error) throw Error();
    }
    return NextResponse.redirect(
      new URL("/os", process.env.KXRA_ORIGIN || req.url),
      303,
    );
  } catch {
    return NextResponse.redirect(
      new URL("/login?error=1", process.env.KXRA_ORIGIN || req.url),
      303,
    );
  }
}
