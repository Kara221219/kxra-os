import crypto from "node:crypto";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { localMode, query, type Principal } from "../../../packages/db";
import { localPrincipal } from "#kxra/local-runtime";

export const organisationContextCookie = "kxra_organisation";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export type SecurityRole =
  "KXRA_OWNER" | "KXRA_STAFF" | "ORG_ADMIN" | "ORG_MEMBER";

export type OrganisationContext = {
  membership_id: string;
  org_id: string;
  organisation_name: string;
  organisation_slug: string;
  organisation_kind: "KXRA" | "CUSTOMER";
  security_role: SecurityRole;
  relationship_type: "INTERNAL" | "PARTNER" | "CUSTOMER" | "CLIENT";
  display_name: string;
  membership_version: number;
};

export type Actor = Principal & {
  organisation_id: string;
  membership_id: string;
  org_id: string;
  organisation_name: string;
  organisation_slug: string;
  organisation_kind: "KXRA" | "CUSTOMER";
  security_role: SecurityRole;
  relationship_type: OrganisationContext["relationship_type"];
  role: "owner" | "partner";
  display_name: string;
  access_version: number;
  account_state: "ACTIVE";
  session_version: number;
};

type AccountState =
  | "INVITED"
  | "REGISTERED"
  | "EMAIL_VERIFIED"
  | "ONBOARDING"
  | "ACTIVE"
  | "SUSPENDED"
  | "REVOKED";

type AccountRow = {
  account_state: AccountState;
  session_version: number;
  onboarding_completed_at: string | null;
  current_step: number | null;
  first_name: string | null;
  last_name: string | null;
  mfa_state: string;
};

export type AccountContext = Principal &
  AccountRow &
  OrganisationContext & {
    organisation_id: string;
  };

export async function supabase() {
  const store = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
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
  const { data: claims, error: claimsError } = await client.auth.getClaims();
  if (claimsError || claims?.claims.sub !== data.user.id) return null;
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

export async function availableOrganisations(
  identity?: Principal,
): Promise<OrganisationContext[]> {
  const p = identity || (await principal());
  if (!p) throw new HttpError(401, "Sign in required", "AUTH_REQUIRED");
  return query<OrganisationContext>(
    { ...p, organisation_id: undefined },
    `select membership.id as membership_id,membership.org_id,
      organisation.name as organisation_name,organisation.slug as organisation_slug,
      organisation.organisation_kind,membership.security_role,
      membership.relationship_type,membership.display_name,
      membership.version as membership_version
     from kxra.organisation_memberships membership
     join kxra.organisations organisation on organisation.id=membership.org_id
     join kxra.account_identities account on account.account_id=membership.account_id
     where membership.account_id=$1 and membership.state='ACTIVE'
      and membership.starts_at<=now()
      and (membership.expires_at is null or membership.expires_at>now())
      and membership.revoked_at is null and organisation.state='ACTIVE'
      and account.state not in ('SUSPENDED','REVOKED')
     order by organisation.name,organisation.id`,
    [p.id],
  );
}

async function selectedOrganisation(memberships: OrganisationContext[]) {
  const requested = (await cookies()).get(organisationContextCookie)?.value;
  if (requested) {
    const selected = memberships.find(
      (membership) => membership.org_id === requested,
    );
    if (!selected)
      throw new HttpError(
        403,
        "Organisation access unavailable",
        "TENANT_ACCESS_DENIED",
      );
    return selected;
  }
  if (memberships.length === 1) return memberships[0];
  if (!memberships.length)
    throw new HttpError(403, "Access unavailable", "ACCESS_UNAVAILABLE");
  throw new HttpError(
    428,
    "Organisation selection required",
    "TENANT_SELECTION_REQUIRED",
  );
}

export async function selectOrganisationContext(
  p: Principal,
  organisationId: string,
  source: "LOGIN" | "USER_SELECTION" | "INVITATION" | "SESSION_RESTORE",
) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      organisationId,
    )
  )
    throw new HttpError(400, "Invalid organisation", "INVALID_TENANT");
  const requestId = crypto.randomUUID();
  let selected: OrganisationContext[];
  try {
    selected = await query<OrganisationContext>(
      { ...p, organisation_id: undefined },
      `select selected.membership_id,selected.org_id,
        organisation.name as organisation_name,organisation.slug as organisation_slug,
        organisation.organisation_kind,selected.security_role,selected.relationship_type,
        membership.display_name,membership.version as membership_version
       from kxra.select_organisation_context($1,$2,$3) selected
       join kxra.organisations organisation on organisation.id=selected.org_id
       join kxra.organisation_memberships membership on membership.id=selected.membership_id`,
      [organisationId, requestId, source],
    );
  } catch (error) {
    if (["42501", "P0001"].includes((error as { code?: string }).code || ""))
      throw new HttpError(
        403,
        "Organisation access unavailable",
        "TENANT_ACCESS_DENIED",
      );
    throw error;
  }
  if (!selected[0])
    throw new HttpError(
      403,
      "Organisation access unavailable",
      "TENANT_ACCESS_DENIED",
    );
  (await cookies()).set(organisationContextCookie, selected[0].org_id, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 60 * 60,
  });
  return selected[0];
}

export async function clearOrganisationContext() {
  (await cookies()).delete(organisationContextCookie);
}

export async function account(): Promise<AccountContext> {
  const p = await principal();
  if (!p) throw new HttpError(401, "Sign in required", "AUTH_REQUIRED");
  const memberships = await availableOrganisations(p);
  const selected = await selectedOrganisation(memberships);
  const contextual: Principal = { ...p, organisation_id: selected.org_id };
  const rows = await query<AccountRow>(
    contextual,
    `select account.state as account_state,account.session_version,
      profile.onboarding_completed_at,progress.current_step,profile.first_name,
      profile.last_name,coalesce(profile.mfa_state,'NOT_ENROLLED') as mfa_state
     from kxra.account_identities account
     left join kxra.profiles profile on profile.user_id=account.account_id
     left join kxra.onboarding_progress progress on progress.user_id=account.account_id
     where account.account_id=$1`,
    [p.id],
  );
  if (!rows[0])
    throw new HttpError(403, "Access unavailable", "ACCESS_UNAVAILABLE");
  if (
    p.source === "fake-provider" &&
    p.session_version !== rows[0].session_version
  )
    throw new HttpError(401, "Session expired", "SESSION_EXPIRED");
  return {
    ...contextual,
    ...rows[0],
    ...selected,
    organisation_id: selected.org_id,
  };
}

export async function actor(): Promise<Actor> {
  const p = await account();
  if (
    ["INVITED", "REGISTERED", "EMAIL_VERIFIED", "ONBOARDING"].includes(
      p.account_state,
    )
  )
    throw new HttpError(428, "Onboarding required", "ONBOARDING_REQUIRED");
  if (p.account_state !== "ACTIVE")
    throw new HttpError(403, "Access unavailable", "ACCESS_UNAVAILABLE");
  const gate = await query<{
    allowed: boolean;
    code: string;
    missing_count: number;
  }>(p, "select * from kxra.legal_gate_status()", []);
  if (!gate[0]?.allowed) {
    if (gate[0]?.code === "AGREEMENT_REQUIRED")
      throw new HttpError(428, "Agreement required", "AGREEMENT_REQUIRED");
    throw new HttpError(403, "Access unavailable", gate[0]?.code);
  }
  const legacyRole = p.security_role === "KXRA_OWNER" ? "owner" : "partner";
  return {
    ...p,
    role: legacyRole,
    access_version: p.membership_version,
    account_state: "ACTIVE",
  };
}

export function owner(a: Actor) {
  if (a.security_role !== "KXRA_OWNER")
    throw new HttpError(403, "Access unavailable", "OWNER_REQUIRED");
}

export function recentOwnerMfa(a: Actor, now = Date.now()) {
  owner(a);
  const authenticatedAt = (a.auth_time || 0) * 1000;
  if (
    a.aal !== "aal2" ||
    authenticatedAt < now - 15 * 60_000 ||
    authenticatedAt > now + 60_000
  )
    throw new HttpError(
      403,
      "Recent owner MFA required",
      "RECENT_MFA_REQUIRED",
    );
}

export function sameOrigin(request: Request) {
  const expected = process.env.KXRA_ORIGIN;
  if (!expected || request.headers.get("origin") !== expected)
    throw new HttpError(403, "Request origin rejected", "ORIGIN_REJECTED");
}
