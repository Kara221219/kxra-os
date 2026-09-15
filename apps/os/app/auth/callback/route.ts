import { NextResponse } from "next/server";
import { supabase } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = process.env.KXRA_ORIGIN || request.url;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requested = url.searchParams.get("next");
  const next = requested === "/join/finish" ? requested : "/os";
  if (code) {
    const { error } = await (
      await supabase()
    ).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin), 303);
  }
  return NextResponse.redirect(new URL("/login?error=1", origin), 303);
}
