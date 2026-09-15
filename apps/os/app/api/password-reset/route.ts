import crypto from "node:crypto";
import { z } from "zod";
import { localMode, query, type Principal } from "../../../../../packages/db";
import { renderEmail } from "../../../../../packages/integrations/email";
import { sameOrigin, supabase } from "../../../lib/auth";
import { privateJson, readJson } from "../../../lib/http";
import {
  fakeAuthProvider,
  fakeEmailTransport,
  issueLocalProviderSession,
} from "#kxra/local-runtime";

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
        await (
          await supabase()
        ).auth.resetPasswordForEmail(normalized, {
          redirectTo: `${process.env.KXRA_ORIGIN}/auth/callback?next=/reset-password`,
        });
      }
      return privateJson({ accepted: true }, 202);
    }

    const input = z
      .object({
        action: z.literal("confirm"),
        token: z.string().regex(/^[A-Za-z0-9_-]{32,100}$/),
        password: z.string().min(12).max(256),
        confirmation: z.string().min(12).max(256),
      })
      .strict()
      .refine((value) => value.password === value.confirmation)
      .parse(raw);
    if (!localMode())
      return privateJson(
        {
          error:
            "Hosted reset confirmation requires the provider return session",
        },
        503,
      );
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
