import { localMode, query } from "../../../packages/db";
import {
  hostedSelfServiceConfiguration,
  hostedProvision,
  type HostedSignupStatus,
} from "../../../packages/authz/hosted-self-service";
import { createSupabaseAuthTransport } from "../../../packages/integrations/supabase-auth-transport";
import { registerHostedSelfService } from "../../../packages/integrations/hosted-signup";
import {
  HttpError,
  principal,
  selectOrganisationContext,
  supabase,
} from "./auth";

export async function hostedSignupAvailable() {
  if (localMode() || !hostedSelfServiceConfiguration()) return false;
  try {
    return Boolean(
      (
        await query<{ open: boolean }>(
          null,
          "select kxra_private.hosted_self_service_open() open",
        )
      )[0]?.open,
    );
  } catch {
    return false;
  }
}

export async function hostedSignupAction(input: unknown, action: string) {
  const config = hostedSelfServiceConfiguration();
  if (localMode() || !config || !(await hostedSignupAvailable()))
    throw new HttpError(
      503,
      "Self-service registration is not enabled in this environment",
    );
  if (action === "register") {
    if (await principal())
      throw new HttpError(409, "Use your existing account to continue");
    return registerHostedSelfService(input, config.origin, {
      prepare: async (email, proof, request) => {
        try {
          await query(
            null,
            "select kxra_private.prepare_hosted_signup($1,$2,$3)",
            [email, proof, request],
          );
        } catch (error) {
          if (
            (error as { code?: string; message?: string }).code === "P0001" &&
            (error as Error).message === "Registration temporarily unavailable"
          )
            throw new HttpError(429, "Registration temporarily unavailable");
          throw error;
        }
      },
      signUp: async (value) =>
        (
          await supabase(
            createSupabaseAuthTransport({
              project: config.project,
              fetch: globalThis.fetch,
            }),
          )
        ).auth.signUp(value),
    });
  }
  const value = hostedProvision.parse(input);
  const identity = await principal();
  if (!identity || identity.source !== "supabase")
    throw new HttpError(401, "Sign in required");
  if (!identity.email_verified)
    throw new HttpError(403, "Verify your email before creating a workspace");
  const status = await hostedSignupStatus(identity);
  if (status.state === "REVIEW_REQUIRED" || status.state === "EXISTING_ACCOUNT")
    throw new HttpError(
      409,
      "Your account needs a workspace access review. Contact KXRA to continue.",
      "SELF_SERVICE_REVIEW_REQUIRED",
    );
  const result = (
    await query<{
      receipt: {
        organisation_id: string;
        project_id: string;
        request_id: string;
      };
    }>(
      identity,
      "select kxra_private.provision_hosted_self_service($1,$2) receipt",
      [value.request_id, value.workspace_name],
    )
  )[0]?.receipt;
  if (!result) throw new HttpError(503, "Workspace preparation unavailable");
  await selectOrganisationContext(
    identity,
    result.organisation_id,
    "USER_SELECTION",
  );
  return { ...result, next: "/onboarding", paid_access: false };
}

export async function hostedSignupStatus(
  identity?: Awaited<ReturnType<typeof principal>>,
): Promise<HostedSignupStatus> {
  if (localMode() || !hostedSelfServiceConfiguration())
    return { state: "UNAVAILABLE" };
  const actor = identity === undefined ? await principal() : identity;
  if (!actor?.email_verified || actor.source !== "supabase")
    return { state: "UNAVAILABLE" };
  return (
    (
      await query<{ status: HostedSignupStatus }>(
        actor,
        "select kxra_private.hosted_self_service_status() status",
      )
    )[0]?.status || { state: "UNAVAILABLE" }
  );
}

export async function pendingHostedSignup() {
  const status = await hostedSignupStatus();
  return status.state === "READY" || status.state === "REVIEW_REQUIRED";
}
