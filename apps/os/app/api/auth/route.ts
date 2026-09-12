import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { localMode } from "../../../../../packages/db";
import {
  fixtureUsers,
  signSession,
} from "../../../../../packages/authz/session";
import { sameOrigin, supabase } from "../../../lib/auth";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const f = await req.formData();
    if (f.get("logout")) {
      (await cookies()).delete("kxra_local_session");
      if (!localMode()) await (await supabase()).auth.signOut();
      return NextResponse.redirect(
        new URL("/login", process.env.KXRA_ORIGIN || req.url),
        303,
      );
    }
    if (localMode()) {
      const key = String(f.get("fixture")) as keyof typeof fixtureUsers;
      const id = fixtureUsers[key];
      if (!id) throw Error();
      (await cookies()).set(
        "kxra_local_session",
        signSession(id, process.env.KXRA_LOCAL_SECRET || ""),
        {
          httpOnly: true,
          sameSite: "strict",
          path: "/",
          maxAge: 28800,
          secure: false,
        },
      );
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
