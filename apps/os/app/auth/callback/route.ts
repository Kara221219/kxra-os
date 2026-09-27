import { NextResponse } from "next/server";
import { supabase } from "../../../lib/auth";
import {
  authCallbackDestination,
  recoveryIntentCookie,
  sealRecoveryIntent,
} from "../../../../../packages/authz/recovery-intent";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = process.env.KXRA_ORIGIN || request.url;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = authCallbackDestination(url.searchParams.get("next"));
  if (code) {
    const flowId = url.searchParams.get("sb_flow_id");
    const { data, error } = await (
      await supabase()
    ).auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    if (!error && data.user) {
      const response = NextResponse.redirect(new URL(next, origin), 303);
      if (next === "/reset-password") {
        const secret = process.env.KXRA_JOIN_SECRET;
        if (!secret)
          return NextResponse.redirect(new URL("/login?error=1", origin), 303);
        response.cookies.set(
          recoveryIntentCookie,
          sealRecoveryIntent(data.user.id, secret),
          {
            httpOnly: true,
            sameSite: "strict",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: 10 * 60,
          },
        );
      }
      return response;
    }
  }
  return NextResponse.redirect(new URL("/login?error=1", origin), 303);
}
