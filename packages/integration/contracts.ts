import { z } from "zod";
import { customAppSchema } from "../custom-apps/contract";
const id = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const integrationHumanCommand = z.discriminatedUnion("operation", [
  z
    .object({
      operation: z.literal("DELEGATE"),
      task_id: id,
      connection_id: id,
      allow_proposal: z.boolean(),
    })
    .strict(),
  z.object({ operation: z.literal("LIST"), task_id: id }).strict(),
  z
    .object({ operation: z.literal("REVOKE"), task_id: id, delegation_id: id })
    .strict(),
  z
    .object({
      operation: z.literal("IMPORT_APP"),
      task_id: id,
      delegation_id: id,
      proposal_id: id,
      digest,
      app_id: id,
      expected_revision: z.number().int().min(0).max(2147483646),
    })
    .strict(),
]);
export const integrationDeviceCommand = z
  .object({
    task_id: id,
    fence: id,
    command: z.discriminatedUnion("action", [
      z.object({ action: z.literal("read"), connection_id: id }).strict(),
      z
        .object({
          action: z.literal("prepare"),
          connection_id: id,
          read_id: id,
          note: z.string().trim().min(1).max(2000),
        })
        .strict(),
      ...(["dispatch", "reconcile"] as const).map((action) =>
        z
          .object({
            action: z.literal(action),
            connection_id: id,
            write_id: id,
          })
          .strict(),
      ),
      z
        .object({
          action: z.literal("app_propose"),
          schema: z.custom<import("../custom-apps/contract").CustomAppSchema>(
            (value) => customAppSchema.safeParse(value).success,
          ),
        })
        .strict(),
    ]),
  })
  .strict();
