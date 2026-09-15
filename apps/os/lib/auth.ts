import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { localMode, query, type Principal } from "../../../packages/db";
import { localPrincipal } from "#kxra/local-runtime";
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
  account_state: "ACTIVE";
  session_version: number;
};
type AccountRow = {
  org_id: string;
  account_state:
    | "INVITED"
    | "REGISTERED"
    | "EMAIL_VERIFIED"
    | "ONBOARDING"
    | "ACTIVE"
    | "SUSPENDED"
    | "REVOKED";
  session_version: number;
  onboarding_completed_at: string | null;
  current_step: number | null;
  first_name: string | null;
  last_name: string | null;
  mfa_state: string;
};
export type AccountContext = Principal & AccountRow;
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
  if (localMode()) return localPrincipal();
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const client = await supabase();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const { data: claims, error: ce } = await client.auth.getClaims();
  if (ce || claims?.claims.sub !== data.user.id) return null;
  return {
    id: data.user.id,
    aal: claims.claims.aal === "aal2" ? "aal2" : "aal1",
    auth_time:
      typeof claims.claims.auth_time === "number"
        ? claims.claims.auth_time
        : undefined,
    email: data.user.email,
    email_verified: Boolean(data.user.email_confirmed_at),
    source: "supabase",
  };
}
export async function account(): Promise<AccountContext> {
  const p = await principal();
  if (!p) throw new HttpError(401, "Sign in required");
  let rows = await query<AccountRow>(
    p,
    `select profile.org_id,profile.account_state,profile.session_version,
      profile.onboarding_completed_at,progress.current_step,profile.first_name,
      profile.last_name,profile.mfa_state
     from kxra.profiles profile
     left join kxra.onboarding_progress progress on progress.user_id=profile.user_id
     where profile.user_id=$1`,
    [p.id],
  );
  if (!rows[0]) throw new HttpError(403, "Access unavailable");
  if (
    p.source === "fake-provider" &&
    p.session_version !== rows[0].session_version
  )
    throw new HttpError(401, "Session expired");
  if (rows[0].account_state === "ACTIVE") {
    const readiness = await query<{
      role: "owner" | "partner";
      ready: boolean;
    }>(
      p,
      `select m.role,kxra_private.member_org()=m.org_id as ready
       from kxra.members m where m.id=$1 and m.active`,
      [p.id],
    );
    if (readiness[0]?.role === "partner" && !readiness[0].ready) {
      await query(p, "select kxra.resume_required_onboarding()", []);
      rows = await query<AccountRow>(
        p,
        `select profile.org_id,profile.account_state,profile.session_version,
          profile.onboarding_completed_at,progress.current_step,profile.first_name,
          profile.last_name,profile.mfa_state
         from kxra.profiles profile
         left join kxra.onboarding_progress progress on progress.user_id=profile.user_id
         where profile.user_id=$1`,
        [p.id],
      );
    }
  }
  return { ...p, ...rows[0] };
}
export async function actor(): Promise<Actor> {
  const p = await account();
  if (p.account_state === "ONBOARDING")
    throw new HttpError(428, "Onboarding required");
  if (p.account_state !== "ACTIVE")
    throw new HttpError(403, "Access unavailable");
  const rows = await query<Actor>(
    p,
    `select m.id,m.org_id,m.role,m.display_name,m.access_version,
      profile.account_state,profile.session_version
     from kxra.members m join kxra.profiles profile
      on profile.user_id=m.id and profile.org_id=m.org_id
     where m.id=$1 and m.active and profile.account_state='ACTIVE'
      and kxra_private.member_org()=m.org_id`,
    [p.id],
  );
  if (!rows[0]) throw new HttpError(403, "Access unavailable");
  return { ...p, ...rows[0], account_state: "ACTIVE" };
}
export function owner(a: Actor) {
  if (a.role !== "owner") throw new HttpError(403, "Access unavailable");
}
export function recentOwnerMfa(a: Actor, now = Date.now()) {
  owner(a);
  const authenticatedAt = (a.auth_time || 0) * 1000;
  if (
    a.aal !== "aal2" ||
    authenticatedAt < now - 15 * 60_000 ||
    authenticatedAt > now + 60_000
  )
    throw new HttpError(403, "Recent owner MFA required");
}
export function sameOrigin(request: Request) {
  const expected = process.env.KXRA_ORIGIN;
  if (!expected || request.headers.get("origin") !== expected)
    throw new HttpError(403, "Request origin rejected");
}
