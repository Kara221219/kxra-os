import { z } from "zod";

/** Server configuration only. No request/JWT metadata can enable admission. */
export function hostedSelfServiceConfiguration(
  environment: Record<string, string | undefined> = process.env,
) {
  if (
    environment.KXRA_HOSTED_SELF_SERVICE_ENABLED !== "true" ||
    environment.NODE_ENV !== "production" ||
    environment.KXRA_AUTH_MODE === "fixture" ||
    !environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  )
    return null;
  const project: "jlebgsxcvhvpueuibekd" | "lhbgeucifxxcdoyrnesf" | null =
    environment.KXRA_ENVIRONMENT === "staging"
      ? "jlebgsxcvhvpueuibekd"
      : environment.KXRA_ENVIRONMENT === "production"
        ? "lhbgeucifxxcdoyrnesf"
        : null;
  if (
    !project ||
    environment.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co`
  )
    return null;
  try {
    const origin = new URL(environment.KXRA_ORIGIN || "");
    if (
      origin.protocol !== "https:" ||
      origin.origin !== environment.KXRA_ORIGIN ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      return null;
    return { origin: origin.origin, project };
  } catch {
    return null;
  }
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
