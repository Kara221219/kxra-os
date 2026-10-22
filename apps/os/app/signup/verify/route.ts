import { NextResponse } from "next/server";
import { clearOrganisationContext } from "../../../lib/auth";
import { localMode } from "../../../../../packages/db";
import {
  fakeAuthProvider,
  issueLocalProviderSession,
} from "#kxra/local-runtime";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const origin = process.env.KXRA_ORIGIN || request.url;
  if (!localMode() || process.env.VERCEL_ENV)
    return new NextResponse("Self-service unavailable", { status: 503 });
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    if (!/^[A-Za-z0-9_-]{32,100}$/.test(token)) throw Error();
    const identity = await fakeAuthProvider().verifyEmail(token);
    await clearOrganisationContext();
    await issueLocalProviderSession(identity, 1);
    const r = NextResponse.redirect(new URL("/signup?verified=1", origin), 303);
    r.headers.set("Cache-Control", "private, no-store");
    r.headers.set("Referrer-Policy", "no-referrer");
    return r;
  } catch {
    return NextResponse.redirect(
      new URL("/signup?error=verification", origin),
      303,
    );
  }
}
