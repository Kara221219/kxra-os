import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  joinIntentCookie,
  openJoinIntent,
} from "../../../../../packages/authz/join-intent";
import { query, type Principal } from "../../../../../packages/db";
import {
  fakeAuthProvider,
  issueLocalProviderSession,
  joinSecret,
} from "#kxra/local-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = process.env.KXRA_ORIGIN || request.url;
  const failure = new URL("/join/account?error=verification", origin);
  try {
    const rawToken = new URL(request.url).searchParams.get("token") || "";
    if (!/^[A-Za-z0-9_-]{32,100}$/.test(rawToken)) throw new Error();
    const intent = openJoinIntent(
      (await cookies()).get(joinIntentCookie)?.value,
      joinSecret(),
    );
    if (!intent) throw new Error();
    const identity = await fakeAuthProvider().verifyEmail(rawToken);
    if (identity.email !== intent.email) throw new Error();
    const principal: Principal = {
      id: identity.id,
      email: identity.email,
      email_verified: true,
      aal: identity.aal,
      auth_time: Math.floor(Date.now() / 1000),
      session_version: 1,
      provider_session_version: identity.providerSessionVersion,
      source: "fake-provider",
    };
    const profile = await query<{ session_version: number }>(
      principal,
      "select session_version from kxra.profiles where user_id=$1",
      [principal.id],
    );
    if (!profile[0]) throw new Error();
    await issueLocalProviderSession(identity, profile[0].session_version);
    const response = NextResponse.redirect(
      new URL("/join/finish", origin),
      303,
    );
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return NextResponse.redirect(failure, 303);
  }
}
