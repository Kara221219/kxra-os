import { NextResponse } from "next/server";
import { supabase } from "../../../lib/auth";
import { authCallbackDestination } from "../../../../../packages/authz/recovery-intent";

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
      return NextResponse.redirect(new URL(next, origin), 303);
    }
  }
  return NextResponse.redirect(
    new URL(
      next === "/join/finish" ? "/login?error=callback" : "/login?error=1",
      origin,
    ),
    303,
  );
}
