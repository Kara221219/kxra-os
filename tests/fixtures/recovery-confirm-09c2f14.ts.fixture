import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { localMode, query, type Principal } from "../../../../../packages/db";
import { renderEmail } from "../../../../../packages/integrations/email";
import { sameOrigin } from "../../../lib/auth";
import { privateJson, readJson } from "../../../lib/http";
import {
  fakeAuthProvider,
  fakeEmailTransport,
  issueLocalProviderSession,
} from "#kxra/local-runtime";
import {
  classifyHostedRecoveryRequestFailure,
  hostedRecoveryIntentMatches,
  openHostedRecoveryIntent,
  recoveryAuthenticationMatchesIntent,
  sealHostedRecoveryIntent,
  validSupabaseRefreshTokenShape,
} from "../../../../../packages/authz/recovery-intent";

function hostedAuthClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Hosted authentication unavailable");
  return createClient(url, key, {
    auth: {
      flowType: "implicit",
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const raw = await readJson(request);
    const action = z
      .object({ action: z.enum(["request", "confirm"]) })
      .passthrough()
      .parse(raw).action;
    if (action === "request") {
      const input = z
        .object({
          action: z.literal("request"),
          email: z.string().trim().email().max(320),
        })
        .strict()
        .parse(raw);
      const normalized = input.email.toLowerCase();
      const subject = crypto
        .createHash("sha256")
        .update(`password-reset:${normalized}`)
        .digest("hex");
      const allowed = await query<{ allowed: boolean }>(
        null,
        "select kxra.consume_rate_limit('password-reset',$1,5,900) as allowed",
        [subject],
      );
      if (!allowed[0]?.allowed) return privateJson({ accepted: true }, 202);
      if (localMode()) {
        const provider = fakeAuthProvider();
        const issued = await provider.requestPasswordReset(normalized);
        const identity = await provider.getIdentityByEmail(normalized);
        if (issued && identity) {
          await fakeEmailTransport().deliver({
            operationKey: `password-reset:${identity.id}:${crypto.createHash("sha256").update(issued.token).digest("hex").slice(0, 16)}`,
            recipient: identity.email,
            rendered: renderEmail({
              template: "PASSWORD_RESET",
              recipientHint: identity.email.replace(/^(.).*(@.*)$/, "$1***$2"),
              expiresAt: issued.expiresAt,
              actionUrl: `${process.env.KXRA_ORIGIN}/reset-password?token=${encodeURIComponent(issued.token)}`,
            }),
          });
          const principal: Principal = {
            id: identity.id,
            email: identity.email,
            email_verified: identity.emailVerified,
            aal: "aal1",
            auth_time: Math.floor(Date.now() / 1000),
            provider_session_version: identity.providerSessionVersion,
            source: "fake-provider",
          };
          await query(
            principal,
            "select kxra.record_password_event('PASSWORD_RESET_REQUESTED')",
            [],
          ).catch(() => undefined);
        }
      } else {
        const secret = process.env.KXRA_JOIN_SECRET;
        if (!secret) throw new Error("Hosted authentication unavailable");
        const intent = sealHostedRecoveryIntent(normalized, secret);
        const destination = new URL("/reset-password", process.env.KXRA_ORIGIN);
        destination.searchParams.set("intent", intent);
        const requested = await hostedAuthClient().auth.resetPasswordForEmail(
          normalized,
          {
            redirectTo: destination.toString(),
          },
        );
        if (requested.error) {
          const failure = classifyHostedRecoveryRequestFailure(requested.error);
          console.warn("KXRA password-reset request rejected", {
            event: failure.event,
            providerStatus: failure.providerStatus,
          });
          return privateJson(
            { error: failure.publicMessage },
            failure.publicStatus,
          );
        }
      }
      return privateJson({ accepted: true }, 202);
    }

    const input = z
      .object({
        action: z.literal("confirm"),
        token: z
          .string()
          .regex(/^[A-Za-z0-9_-]{32,100}$/)
          .optional(),
        accessToken: z.string().min(100).max(10_000).optional(),
        refreshToken: z
          .string()
          .refine(validSupabaseRefreshTokenShape)
          .optional(),
        intent: z.string().min(100).max(1024).optional(),
        password: z.string().min(12).max(256),
        confirmation: z.string().min(12).max(256),
      })
      .strict()
      .refine((value) => value.password === value.confirmation)
      .parse(raw);
    if (!localMode()) {
      if (input.token) return privateJson({ error: "Reset unavailable" }, 409);
      if (!input.accessToken || !input.refreshToken || !input.intent)
        return privateJson({ error: "Reset unavailable" }, 409);
      const client = hostedAuthClient();
      const verified = await client.auth.getUser(input.accessToken);
      const claims = await client.auth.getClaims(input.accessToken);
      const secret = process.env.KXRA_JOIN_SECRET || "";
      const intent = secret
        ? openHostedRecoveryIntent(input.intent, secret)
        : null;
      if (
        verified.error ||
        !verified.data.user ||
        claims.error ||
        claims.data?.claims.sub !== verified.data.user.id ||
        !verified.data.user.email ||
        !intent ||
        !hostedRecoveryIntentMatches(intent, verified.data.user.email) ||
        !recoveryAuthenticationMatchesIntent(claims.data?.claims, intent)
      )
        return privateJson({ error: "Reset unavailable" }, 409);
      const session = await client.auth.setSession({
        access_token: input.accessToken,
        refresh_token: input.refreshToken,
      });
      if (session.error || session.data.user?.id !== verified.data.user.id)
        return privateJson({ error: "Reset unavailable" }, 409);
      const identity: Principal = {
        id: verified.data.user.id,
        email: verified.data.user.email,
        email_verified: Boolean(verified.data.user.email_confirmed_at),
        aal: "aal1",
        auth_time: Math.floor(Date.now() / 1000),
        source: "supabase",
      };
      const profile = await query<{ account_state: string }>(
        identity,
        "select account_state from kxra.profiles where user_id=$1",
        [identity.id],
      );
      const invitedRecovery = profile[0]
        ? false
        : Boolean(
            (
              await query<{ allowed: boolean }>(
                identity,
                "select kxra_private.active_invited_password_recovery() as allowed",
                [],
              )
            )[0]?.allowed,
          );
      if (
        (!profile[0] && !invitedRecovery) ||
        (profile[0] &&
          ["SUSPENDED", "REVOKED"].includes(profile[0].account_state))
      )
        return privateJson({ error: "Reset unavailable" }, 409);
      const changed = await client.auth.updateUser({
        password: input.password,
      });
      if (changed.error || changed.data.user?.id !== identity.id)
        return privateJson({ error: "Reset unavailable" }, 409);
      // The provider change cannot be rolled back. End provider sessions even
      // if the local audit write subsequently fails.
      let auditRecorded = !profile[0];
      if (profile[0]) {
        try {
          await query(
            identity,
            "select kxra.record_password_event('PASSWORD_CHANGED')",
            [],
          );
        } catch {
          auditRecorded = false;
        }
      }
      const signedOut = await client.auth.signOut({ scope: "global" });
      if (!auditRecorded || signedOut.error)
        return privateJson(
          { error: "Password changed; sign-in is required" },
          409,
        );
      return privateJson({ next: "/login?reset=1" });
    }
    if (!input.token) return privateJson({ error: "Reset unavailable" }, 409);
    const identity = await fakeAuthProvider().resetPassword(
      input.token,
      input.password,
    );
    const principal: Principal = {
      id: identity.id,
      email: identity.email,
      email_verified: identity.emailVerified,
      aal: "aal1",
      auth_time: Math.floor(Date.now() / 1000),
      provider_session_version: identity.providerSessionVersion,
      source: "fake-provider",
    };
    const profile = await query<{
      session_version: number;
      account_state: string;
    }>(
      principal,
      "select session_version,account_state from kxra.profiles where user_id=$1",
      [identity.id],
    );
    if (
      !profile[0] ||
      ["SUSPENDED", "REVOKED"].includes(profile[0].account_state)
    )
      return privateJson({ error: "Reset unavailable" }, 409);
    await query(
      principal,
      "select kxra.record_password_event('PASSWORD_CHANGED')",
      [],
    );
    await issueLocalProviderSession(identity, profile[0].session_version);
    return privateJson({
      next: profile[0].account_state === "ONBOARDING" ? "/onboarding" : "/os",
    });
  } catch (error) {
    if (error instanceof z.ZodError)
      return privateJson({ error: "Invalid reset request" }, 400);
    if ((error as Error).message === "PASSWORD_POLICY")
      return privateJson(
        { error: "Password does not meet the stated requirements" },
        400,
      );
    return privateJson({ error: "Reset unavailable" }, 409);
  }
}
