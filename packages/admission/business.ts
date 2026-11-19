import { z } from "zod";
import { businessCountries, BUSINESS_DECLARATION_VERSION } from "./constants";
export { businessCountries, BUSINESS_DECLARATION_VERSION } from "./constants";

export const businessDeclaration = z
  .object({
    legal_name: z
      .string()
      .trim()
      .min(2)
      .max(160)
      .regex(/^[^\x00-\x1f\x7f]+$/),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => businessCountries.has(v)),
    region: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[^\x00-\x1f\x7f]+$/),
    provider: z
      .string()
      .trim()
      .min(2)
      .max(80)
      .regex(/^[a-zA-Z0-9 ._-]+$/),
    business_use: z.literal(true),
    authorised: z.literal(true),
    provider_costs: z.literal(true),
    declaration_version: z.literal(BUSINESS_DECLARATION_VERSION),
  })
  .strict();
export type BusinessDeclaration = z.infer<typeof businessDeclaration>;
export type AdmissionState = "ELIGIBLE" | "BLOCKED" | "REVIEW_REQUIRED";
