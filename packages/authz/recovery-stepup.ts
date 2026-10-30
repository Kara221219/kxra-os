import type { SupabaseClient } from "@supabase/supabase-js";
import { hostedMfaGate, type HostedMfaApi } from "./supabase-mfa";

export type RecoveryProviderRequirement = "NONCE" | "TOTP" | "OTHER";
export function recoveryProviderRequirement(
  error: unknown,
): RecoveryProviderRequirement {
  try {
    const code = (error as { code?: unknown } | null)?.code;
    if (
      code === "reauthentication_needed" ||
      code === "reauthentication_not_valid"
    )
      return "NONCE";
    if (code === "insufficient_aal" || code === "mfa_verification_failed")
      return "TOTP";
  } catch {
    /* Arbitrary provider objects never become public messages. */
  }
  return "OTHER";
}

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function validateRecoveryClientSession(
  client: SupabaseClient,
  original: { sub: string; session_id?: unknown },
  email: string,
) {
  try {
    if (
      typeof original.session_id !== "string" ||
      !uuid.test(original.session_id)
    )
      return null;
    const session = await client.auth.getSession();
    if (
      session.error ||
      !session.data.session?.access_token ||
      session.data.session.user.id !== original.sub
    )
      return null;
    const token = session.data.session.access_token;
    const user = await client.auth.getUser(token);
    const claims = await client.auth.getClaims(token);
    const c = claims.data?.claims;
    if (
      user.error ||
      user.data.user?.id !== original.sub ||
      user.data.user.email !== email ||
      claims.error ||
      c?.sub !== original.sub ||
      c.session_id !== original.session_id ||
      !["aal1", "aal2"].includes(c.aal as string)
    )
      return null;
    return c;
  } catch {
    return null;
  }
}

export type RecoveryStepUpResult =
  | { state: "READY"; aal: "aal1" | "aal2" }
  | { state: "TOTP_REQUIRED" | "TOTP_REJECTED" | "UNAVAILABLE" };

// Called only AFTER the unchanged original recovery and eligibility guards.
// The original proof remains required on every request. Upgraded tokens never
// leave this request/client and never replace the original recovery proof.
export async function recoveryStepUp(
  client: SupabaseClient,
  original: { sub: string; session_id?: unknown; aal?: unknown },
  code?: string,
  now = Math.floor(Date.now() / 1000),
): Promise<RecoveryStepUpResult> {
  try {
    const gate = await hostedMfaGate(
      client.auth.mfa as unknown as HostedMfaApi,
    );
    if (!gate.challengeRequired) {
      // Provider assurance alone cannot upgrade the verified original claims.
      return { state: "READY", aal: original.aal === "aal2" ? "aal2" : "aal1" };
    }
    if (
      typeof original.session_id !== "string" ||
      !uuid.test(original.session_id)
    )
      return { state: "UNAVAILABLE" };
    const established = await client.auth.getSession();
    if (established.error || !established.data.session?.access_token)
      return { state: "UNAVAILABLE" };
    const establishedClaims = await client.auth.getClaims(
      established.data.session.access_token,
    );
    if (
      establishedClaims.error ||
      establishedClaims.data?.claims.sub !== original.sub ||
      establishedClaims.data.claims.session_id !== original.session_id
    )
      return { state: "UNAVAILABLE" };
    if (!code) return { state: "TOTP_REQUIRED" };
    if (!/^\d{6}$/.test(code)) return { state: "TOTP_REJECTED" };
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: gate.factorId,
      code,
    });
    if (
      verified.error ||
      !verified.data?.access_token ||
      verified.data.user?.id !== original.sub
    )
      return { state: "TOTP_REJECTED" };
    const token = verified.data.access_token;
    const user = await client.auth.getUser(token);
    const claims = await client.auth.getClaims(token);
    const c = claims.data?.claims;
    if (
      user.error ||
      user.data.user?.id !== original.sub ||
      claims.error ||
      c?.sub !== original.sub ||
      c?.session_id !== original.session_id ||
      c?.aal !== "aal2"
    )
      return { state: "UNAVAILABLE" };
    const amr = c.amr;
    if (
      !Array.isArray(amr) ||
      !amr.some(
        (entry: { method?: unknown; timestamp?: unknown }) =>
          entry?.method === "totp" &&
          typeof entry.timestamp === "number" &&
          Number.isInteger(entry.timestamp) &&
          entry.timestamp >= now - 60 &&
          entry.timestamp <= now + 60,
      )
    )
      return { state: "UNAVAILABLE" };
    // SDK challengeAndVerify saves the session, but verify that the client that
    // will perform the update actually holds exactly the verified token.
    const current = await client.auth.getSession();
    if (
      current.error ||
      current.data.session?.access_token !== token ||
      current.data.session.user.id !== original.sub
    )
      return { state: "UNAVAILABLE" };
    return { state: "READY", aal: "aal2" };
  } catch {
    return { state: "UNAVAILABLE" };
  }
}
