import crypto from "node:crypto";
import { z } from "zod";
import { localMode, query } from "../../../../../packages/db";
import {
  principal,
  sameOrigin,
  selectOrganisationContext,
} from "../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../lib/http";
import {
  fakeAuthProvider,
  fakeEmailTransport,
  issueLocalProviderSession,
} from "#kxra/local-runtime";
import { renderEmail } from "../../../../../packages/integrations/email";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    // Production import conditions make localMode permanently false. No hosted
    // registration, Auth hook, policy or account configuration is activated.
    if (!localMode() || process.env.VERCEL_ENV)
      return privateJson(
        {
          error: "Self-service registration is not enabled in this environment",
        },
        503,
      );
    const raw = await readJson(request);
    const action = z
      .object({ action: z.enum(["register", "provision"]) })
      .passthrough()
      .parse(raw).action;
    if (action === "register") {
      const v = z
        .object({
          action: z.literal("register"),
          email: z.email().max(320),
          password: z.string().min(12).max(256),
          confirmation: z.string(),
        })
        .strict()
        .refine((v) => v.password === v.confirmation)
        .parse(raw);
      const email = v.email.trim().toLowerCase();
      const digest = crypto
        .createHash("sha256")
        .update("self-signup:" + email)
        .digest("hex");
      const allowed = await query<{ allowed: boolean }>(
        null,
        "select kxra.consume_rate_limit('self-signup',$1,8,900) allowed",
        [digest],
      );
      if (!allowed[0]?.allowed)
        return privateJson(
          { error: "Registration temporarily unavailable" },
          429,
        );
      const created = await fakeAuthProvider().registerInvited(
        email,
        v.password,
      );
      await issueLocalProviderSession(created.identity, 1);
      if (created.verification)
        await fakeEmailTransport().deliver({
          operationKey:
            "self-verify:" +
            created.identity.id +
            ":" +
            crypto
              .createHash("sha256")
              .update(created.verification.token)
              .digest("hex"),
          recipient: email,
          rendered: renderEmail({
            template: "EMAIL_VERIFICATION",
            recipientHint: "Your local account",
            expiresAt: created.verification.expiresAt,
            actionUrl: `${process.env.KXRA_ORIGIN}/signup/verify?token=${encodeURIComponent(created.verification.token)}`,
          }),
        });
      return privateJson({ next: "/signup?verify=1" }, 201);
    }
    const v = z
      .object({
        action: z.literal("provision"),
        request_id: z.uuid(),
        workspace_name: z.string().trim().min(2).max(120),
      })
      .strict()
      .parse(raw);
    const identity = await principal();
    if (!identity) return privateJson({ error: "Sign in required" }, 401);
    if (!identity.email_verified)
      return privateJson(
        { error: "Verify your email before creating a workspace" },
        403,
      );
    const rows = await query<{
      receipt: {
        organisation_id: string;
        project_id: string;
        request_id: string;
      };
    }>(identity, "select kxra_private.provision_self_service($1,$2) receipt", [
      v.request_id,
      v.workspace_name,
    ]);
    const receipt = rows[0].receipt;
    await selectOrganisationContext(
      identity,
      receipt.organisation_id,
      "USER_SELECTION",
    );
    return privateJson(
      { ...receipt, next: "/onboarding", paid_access: false },
      201,
    );
  } catch (e) {
    if (e instanceof z.ZodError)
      return privateJson(
        { error: "Check the registration fields and matching passwords" },
        400,
      );
    if (["ACCOUNT_EXISTS", "PASSWORD_POLICY"].includes((e as Error).message))
      return privateJson(
        {
          error:
            "Registration unavailable; check the password requirements or sign in to recover your account",
        },
        409,
      );
    return safeHttpError(e);
  }
}
