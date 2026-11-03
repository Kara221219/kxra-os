import { z } from "zod";

const connector = { connector_id: z.string().uuid() };
const request = { ...connector, request_id: z.string().uuid() };
// This registry intentionally has no configurable endpoints, secrets or adapters.
export const connectorRegistry = Object.freeze({
  provider: "synthetic-notes",
  synthetic: true,
  tools: Object.freeze(["notes.read", "notes.append"]),
});
export const connectorCommand = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect"), allow_write: z.boolean() }).strict(),
  z.object({ action: z.literal("read"), ...connector }).strict(),
  z.object({ action: z.literal("revoke"), ...connector }).strict(),
  z
    .object({
      action: z.literal("prepare"),
      ...connector,
      read_id: z.string().uuid(),
      note: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("approve"),
      ...request,
      digest: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  z.object({ action: z.literal("reject"), ...request }).strict(),
  z.object({ action: z.literal("execute"), ...request }).strict(),
]);

export const connectorOperation = z.union([
  connectorCommand,
  z.object({ action: z.literal("list") }).strict(),
]);
export type ConnectorOperation = z.infer<typeof connectorOperation>;
