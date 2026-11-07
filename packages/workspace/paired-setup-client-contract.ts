import type { z } from "zod";
import type {
  pairedSetupOptions,
  pairedSetupReceipt,
} from "./paired-setup-contract";
export type PairedSetupOptions = z.infer<typeof pairedSetupOptions>;
export type PairedSetupReceipt = z.infer<typeof pairedSetupReceipt>;
const reasons = new Set([
  "POLICY_READY_SETUP_HELD",
  "SUBSCRIPTION_PROVIDER_CONFIRMATION_REQUIRED",
  "TRANSPORT_REVIEW_REQUIRED",
  "TERMS_REQUIRED",
  "PAID_PROOF_REQUIRED",
  "BUSINESS_REVIEW_REQUIRED",
  "AI_REVIEW_REQUIRED",
  "NEW_REQUEST_REQUIRED",
  "EXPIRED",
  "CANCELLED",
]);
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i.test(
    value,
  );
const text = (value: unknown, maximum: number) =>
  typeof value === "string" && value.length <= maximum;
function object(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function invalid(): never {
  throw Error("SETUP_RESPONSE_INVALID");
}
/** Small client projection checks. The server independently uses the canonical
 * strict schema and SQL authorization; these checks never grant authority. */
export function parsePairedSetupReceipt(value: unknown): PairedSetupReceipt {
  if (
    !object(value, [
      "request_id",
      "agent_id",
      "room_id",
      "reason",
      "expires_at",
      "activation_allowed",
      "credential_issued",
    ]) ||
    !uuid(value.request_id) ||
    !uuid(value.agent_id) ||
    !uuid(value.room_id) ||
    typeof value.reason !== "string" ||
    !reasons.has(value.reason) ||
    typeof value.expires_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value.expires_at,
    ) ||
    !Number.isFinite(Date.parse(value.expires_at)) ||
    value.activation_allowed !== false ||
    value.credential_issued !== false
  )
    return invalid();
  return value as PairedSetupReceipt;
}
export function parsePairedSetupOptions(value: unknown): PairedSetupOptions {
  if (
    !object(value, ["rooms", "ai_intents", "requests"]) ||
    !Array.isArray(value.rooms) ||
    value.rooms.length > 50 ||
    !Array.isArray(value.ai_intents) ||
    value.ai_intents.length > 20 ||
    !Array.isArray(value.requests) ||
    value.requests.length > 20 ||
    !value.rooms.every(
      (v) => object(v, ["id", "name"]) && uuid(v.id) && text(v.name, 120),
    ) ||
    !value.ai_intents.every(
      (v) => object(v, ["id", "model"]) && uuid(v.id) && text(v.model, 160),
    ) ||
    !value.requests.every(
      (v) =>
        object(v, ["id", "agent_id", "room_id", "label"]) &&
        uuid(v.id) &&
        uuid(v.agent_id) &&
        uuid(v.room_id) &&
        text(v.label, 100),
    )
  )
    return invalid();
  return value as PairedSetupOptions;
}
