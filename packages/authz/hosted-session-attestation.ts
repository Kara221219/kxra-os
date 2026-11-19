import type { Principal } from "../db";
import { hostedTotpTimestamp } from "./supabase-mfa";
import { customAppsProviderSessionVersion } from "../custom-apps/access";
/** Input must be the verified top-level getClaims payload, never metadata or HTTP input. */
export function verifiedHostedSessionAttestation(
  claims: Record<string, unknown>,
) {
  const version = customAppsProviderSessionVersion(claims),
    session = claims.session_id;
  if (
    version === undefined ||
    typeof session !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      session,
    )
  )
    return {};
  return { provider_session_version: version, provider_session_id: session };
}

type VerifiedClient = {
  auth: {
    getUser(): Promise<{
      data: {
        user: {
          id: string;
          email?: string;
          email_confirmed_at?: string;
        } | null;
      };
      error: unknown;
    }>;
    getClaims(): Promise<{
      data: { claims: Record<string, unknown> } | null;
      error: unknown;
    }>;
  };
};
/** Both checks are required, matching the existing server authentication boundary. */
export async function resolveVerifiedSupabasePrincipal(
  client: VerifiedClient,
): Promise<Principal | null> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  const { data: verified, error: claimsError } = await client.auth.getClaims();
  if (claimsError || verified?.claims.sub !== data.user.id) return null;
  return {
    id: data.user.id,
    aal: verified.claims.aal === "aal2" ? "aal2" : "aal1",
    auth_time: hostedTotpTimestamp(verified.claims),
    email: data.user.email,
    email_verified: Boolean(data.user.email_confirmed_at),
    source: "supabase",
    ...verifiedHostedSessionAttestation(verified.claims),
  };
}
