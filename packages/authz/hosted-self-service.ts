import { hostedSupabaseConfiguration } from "./hosted-supabase";
import { z } from "zod";

/** Server configuration only. No request/JWT metadata can enable admission.
 * Production-only gating keeps this module outside development fixtures. The
 * compiled local-runtime/guard boundary removes fixture selectors from shipping
 * artifacts; do not import development selector checks into this module.
 */
export function hostedSelfServiceConfiguration(
  environment: Record<string, string | undefined> = process.env,
) {
  if (environment.KXRA_HOSTED_SELF_SERVICE_ENABLED !== "true") return null;
  return hostedSupabaseConfiguration(environment);
}

export const hostedRegistration = z
  .object({
    action: z.literal("register"),
    email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
    password: z
      .string()
      .min(12)
      .max(256)
      .refine(
        (value) =>
          /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value),
      ),
    confirmation: z.string().max(256),
  })
  .strict()
  .refine((value) => value.password === value.confirmation);

export const hostedProvision = z
  .object({
    action: z.literal("provision"),
    request_id: z.uuid(),
    workspace_name: z.string().trim().min(2).max(120),
  })
  .strict();

export type HostedSignupStatus = {
  state:
    | "UNAVAILABLE"
    | "READY"
    | "EXISTING"
    | "EXISTING_ACCOUNT"
    | "REVIEW_REQUIRED";
  workspace_name?: string;
};
