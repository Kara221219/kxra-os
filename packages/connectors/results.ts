import { z } from "zod";
import type { ConnectorOperation } from "./contracts";

const date = z.string().datetime({ offset: true });
export const connectionSchema = z
  .object({
    id: z.string().uuid(),
    org_id: z.string().uuid(),
    user_id: z.string().uuid(),
    provider: z.literal("synthetic-notes"),
    allow_write: z.boolean(),
    state: z.enum(["ACTIVE", "REVOKED"]),
    revision: z.number().int().positive(),
    expires_at: date,
    created_at: date,
  })
  .strict();
export const readSchema = z
  .object({
    read_id: z.string().uuid(),
    revision: z.number().int().positive(),
    expires_at: date,
    notes: z
      .array(
        z.object({ note: z.string().max(2000), created_at: date }).strict(),
      )
      .max(50),
    total_count: z.number().int().nonnegative(),
    untrusted_content: z.literal(true),
  })
  .strict()
  .refine(
    (value) => value.total_count >= value.notes.length,
    "Invalid mock read count",
  );
export const proposalSchema = z
  .object({
    id: z.string().uuid(),
    connector_id: z.string().uuid(),
    revision: z.number().int().positive(),
    state: z.enum(["PENDING", "APPROVED", "REJECTED", "EXECUTED"]),
    payload: z
      .object({
        tool: z.literal("notes.append"),
        note: z.string().min(1).max(2000),
      })
      .strict(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    expires_at: date,
  })
  .strict();
export const connectionListSchema = z
  .object({
    connections: z.array(connectionSchema),
    provider: z.literal("synthetic-notes"),
    tools: z.tuple([z.literal("notes.read"), z.literal("notes.append")]),
    synthetic: z.literal(true),
  })
  .strict();
export type CustomerConnection = z.infer<typeof connectionSchema>;
export type ConnectorRead = z.infer<typeof readSchema>;
export type ConnectorProposal = z.infer<typeof proposalSchema>;

function decode<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Error("Mock adapter outcome unavailable");
  return result.data;
}
/** Shared server/client result validation. Call before committing a transaction
 * or changing UI state; command scope and expected lifecycle state must match. */
export function decodeConnectorOutcome(
  command: ConnectorOperation,
  result: unknown,
): unknown {
  if (command.action === "list") return decode(connectionListSchema, result);
  if (command.action === "connect") {
    const connection = decode(connectionSchema, result);
    if (
      connection.allow_write !== command.allow_write ||
      connection.state !== "ACTIVE"
    )
      throw Error("Mock adapter outcome mismatch");
    return connection;
  }
  if (command.action === "revoke")
    return decode(z.object({ state: z.literal("REVOKED") }).strict(), result);
  if (command.action === "read") return decode(readSchema, result);
  const proposal = decode(proposalSchema, result);
  const expected = {
    prepare: "PENDING",
    approve: "APPROVED",
    reject: "REJECTED",
    execute: "EXECUTED",
  }[command.action];
  if (
    proposal.state !== expected ||
    proposal.connector_id !== command.connector_id ||
    ("request_id" in command && proposal.id !== command.request_id) ||
    (command.action === "prepare" && proposal.id !== command.read_id) ||
    (command.action === "approve" && proposal.digest !== command.digest)
  )
    throw Error("Mock adapter outcome mismatch");
  return proposal;
}
