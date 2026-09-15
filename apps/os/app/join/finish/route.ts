import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  joinIntentCookie,
  openJoinIntent,
} from "../../../../../packages/authz/join-intent";
import { query } from "../../../../../packages/db";
import { principal } from "../../../lib/auth";
import { joinSecret } from "#kxra/local-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = process.env.KXRA_ORIGIN || request.url;
  const failure = new URL("/join/account?error=finish", origin);
  try {
    const intent = openJoinIntent(
      (await cookies()).get(joinIntentCookie)?.value,
      joinSecret(),
    );
    const identity = await principal();
    if (
      !intent ||
      !identity ||
      !identity.email_verified ||
      identity.email !== intent.email
    )
      throw new Error();
    await query(identity, "select kxra.register_invited_profile($1,$2,$3)", [
      intent.invitationId,
      intent.invitationVersion,
      intent.tokenDigest,
    ]);
    await query(identity, "select kxra.mark_current_email_verified()", []);
    await query(identity, "select kxra.redeem_invitation_version($1,$2,$3)", [
      intent.invitationId,
      intent.invitationVersion,
      intent.tokenDigest,
    ]);
    const response = NextResponse.redirect(new URL("/onboarding", origin), 303);
    response.cookies.delete(joinIntentCookie);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch {
    return NextResponse.redirect(failure, 303);
  }
}
