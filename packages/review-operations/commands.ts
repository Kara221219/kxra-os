import { z } from "zod";
const id = z.uuid(),
  sha = z.string().regex(/^[a-f0-9]{64}$/),
  status = z.enum(["CLEARED", "BLOCKED", "REVIEW_REQUIRED"]);
const business = z
  .object({
    expires_at: z.iso.datetime({ offset: true }),
    legal_status: status,
    payment_status: status,
    provider_status: status,
    tax_status: status,
    legal_evidence_sha256: sha,
    payment_evidence_sha256: sha,
    provider_evidence_sha256: sha,
    tax_evidence_sha256: sha,
  })
  .strict();
const ai = z
  .object({
    expires_at: z.iso.datetime({ offset: true }),
    state: z.enum(["ELIGIBLE", "BLOCKED", "REVIEW_REQUIRED"]),
    account_mode: z.enum(["CUSTOMER_BILLED", "GOOGLE_PAID", "UNKNOWN"]),
    account_reference_sha256: sha,
    provider_evidence_sha256: sha,
  })
  .strict();
export const reviewPost = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("OPEN"),
      kind: z.enum(["BUSINESS", "AI"]),
      subject_id: id,
    })
    .strict(),
  z
    .object({
      action: z.literal("DECIDE"),
      request_id: id,
      operation_id: id,
      decision: z.union([business, ai]),
      attested: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("WITHDRAW"),
      request_id: id,
      operation_id: id,
      decision: z.object({}).strict(),
      attested: z.literal(true),
    })
    .strict(),
]);
export const reviewGet = z.union([
  z.object({ request_id: id }).strict(),
  z
    .object({
      after: z
        .string()
        .regex(/^(BUSINESS|AI):[a-f0-9-]{36}$/)
        .optional(),
    })
    .strict(),
]);
export type ReviewCommand =
  | z.infer<typeof reviewPost>
  | { action: "VIEW"; request_id: string }
  | { action: "LIST"; after?: string };
