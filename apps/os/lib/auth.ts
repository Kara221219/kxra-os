import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { localMode, query, type Principal } from "../../../packages/db";
import { verifySession } from "../../../packages/authz/session";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Actor = Principal & {
  org_id: string;
  role: "owner" | "partner";
  display_name: string;
  access_version: number;
};
export async function supabase() {
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new HttpError(503, "Authentication is not configured");
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          /* Cookie refresh requires a route handler. */
        }
      },
    },
  });
}
export async function principal(): Promise<Principal | null> {
  if (localMode()) {
    const token = (await cookies()).get("kxra_local_session")?.value;
    const id = token
      ? verifySession(token, process.env.KXRA_LOCAL_SECRET || "")
      : null;
    return id ? { id, aal: "aal2" } : null;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const client = await supabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const { data: claims, error: ce } = await client.auth.getClaims();
  if (ce || claims?.claims.sub !== data.user.id) return null;
  return {
    id: data.user.id,
    aal: claims.claims.aal === "aal2" ? "aal2" : "aal1",
  };
}
export async function actor(): Promise<Actor> {
  const p = await principal();
  if (!p) throw new HttpError(401, "Sign in required");
  const rows = await query<Actor>(
    p,
    "select id,org_id,role,display_name,access_version from kxra.members where id=$1 and active",
    [p.id],
  );
  if (!rows[0]) throw new HttpError(403, "Access unavailable");
  return { ...rows[0], aal: p.aal };
}
export function owner(a: Actor) {
  if (a.role !== "owner") throw new HttpError(403, "Access unavailable");
}
export function sameOrigin(request: Request) {
  const expected = process.env.KXRA_ORIGIN;
  if (!expected || request.headers.get("origin") !== expected)
    throw new HttpError(403, "Request origin rejected");
}
