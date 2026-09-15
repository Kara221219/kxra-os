import crypto from "node:crypto";
import { z } from "zod";
import {
  localMode,
  query,
  type Principal,
} from "../../../../../../packages/db";
import { renderEmail } from "../../../../../../packages/integrations/email";
import {
  joinIntentCookie,
  openJoinIntent,
} from "../../../../../../packages/authz/join-intent";
import { cookies } from "next/headers";
import { principal, sameOrigin, supabase } from "../../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../../lib/http";
import {
  fakeAuthProvider,
  fakeEmailTransport,
  joinSecret,
  issueLocalProviderSession,
} from "#kxra/local-runtime";

export const runtime = "nodejs";

const registration = z
  .object({
    password: z.string().min(12).max(256),
    confirmation: z.string().min(12).max(256),
  })
  .strict()
  .refine((value) => value.password === value.confirmation, {
    message: "Passwords do not match",
  });

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = registration.parse(await readJson(request));
    const intent = openJoinIntent(
      (await cookies()).get(joinIntentCookie)?.value,
      joinSecret(),
    );
    if (!intent) return privateJson({ error: "Invitation unavailable" }, 409);
    const signedIn = await principal();
    if (signedIn && signedIn.email !== intent.email)
      return privateJson({ error: "Invitation unavailable" }, 409);
    const current = await query<{ invitation_id: string }>(
      null,
      "select invitation_id from kxra.preview_invitation($1)",
      [intent.tokenDigest],
    );
    if (!current[0] || current[0].invitation_id !== intent.invitationId)
      return privateJson({ error: "Invitation unavailable" }, 409);
    const rateSubject = crypto
      .createHash("sha256")
      .update(`join-register:${intent.invitationId}`)
      .digest("hex");
    const allowed = await query<{ allowed: boolean }>(
      null,
      "select kxra.consume_rate_limit('join-register',$1,8,900) as allowed",
      [rateSubject],
    );
    if (!allowed[0]?.allowed)
      return privateJson(
        { error: "Registration temporarily unavailable" },
        429,
      );

    if (!localMode()) {
      const client = await supabase();
      const { error } = await client.auth.signUp({
        email: intent.email,
        password: input.password,
        options: {
          emailRedirectTo: `${process.env.KXRA_ORIGIN}/auth/callback?next=/join/finish`,
        },
      });
      if (error) return privateJson({ error: "Registration unavailable" }, 409);
      return privateJson({ next: "/join/account?registered=1" }, 201);
    }

    const created = await fakeAuthProvider().registerInvited(
      intent.email,
      input.password,
    );
    const identity: Principal = {
      id: created.identity.id,
      email: created.identity.email,
      email_verified: created.identity.emailVerified,
      aal: created.identity.aal,
      auth_time: Math.floor(Date.now() / 1000),
      session_version: 1,
      provider_session_version: created.identity.providerSessionVersion,
      source: "fake-provider",
    };
    await query(identity, "select kxra.register_invited_profile($1,$2,$3)", [
      intent.invitationId,
      intent.invitationVersion,
      intent.tokenDigest,
    ]);
    const profile = await query<{ session_version: number }>(
      identity,
      "select session_version from kxra.profiles where user_id=$1",
      [identity.id],
    );
    if (!profile[0]) throw new Error("PROFILE_REGISTRATION_FAILED");
    await issueLocalProviderSession(
      created.identity,
      profile[0].session_version,
    );

    if (created.verification) {
      const actionUrl = `${process.env.KXRA_ORIGIN}/join/verify?token=${encodeURIComponent(created.verification.token)}`;
      const operationKey = `auth-verify:${created.identity.id}:${crypto
        .createHash("sha256")
        .update(created.verification.token)
        .digest("hex")
        .slice(0, 16)}`;
      await fakeEmailTransport().deliver({
        operationKey,
        recipient: created.identity.email,
        rendered: renderEmail({
          template: "EMAIL_VERIFICATION",
          recipientHint: intent.recipientHint,
          expiresAt: created.verification.expiresAt,
          actionUrl,
        }),
      });
    }
    return privateJson({ next: "/join/account?registered=1" }, 201);
  } catch (error) {
    if (error instanceof z.ZodError)
      return privateJson(
        { error: "Use matching passwords that meet the stated requirements" },
        400,
      );
    if ((error as Error).message === "PASSWORD_POLICY")
      return privateJson(
        { error: "Password does not meet the stated requirements" },
        400,
      );
    if ((error as Error).message === "ACCOUNT_EXISTS")
      return privateJson(
        { error: "Use sign in to continue this invitation" },
        409,
      );
    return safeHttpError(error);
  }
}
