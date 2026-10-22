import crypto from "node:crypto";
import { z } from "zod";

/** Protocol foundation only. No route, device pairing, credential, host tool or
 * transport is registered by this module. Packets are data, never bearer access.
 * Authority and approval arguments must come from server transactions, not JSON.
 */
const id = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const nativeBridgeInput = z
  .object({
    request_id: id,
    adapter: z.enum(["MANUAL_DRAFT", "CODEX_CLI", "CLAUDE_CODE"]),
    objective: z.string().trim().min(1).max(2000),
    message_ids: z
      .array(id)
      .min(1)
      .max(10)
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
const message = z
  .object({
    id,
    room_id: id,
    org_id: id,
    body: z.string().min(1).max(12000),
  })
  .strict();
export type BridgeMessage = z.infer<typeof message>;
const authoritySchema = z
  .object({
    actor_id: id,
    org_id: id,
    room_id: id,
    room_creator_id: id,
    session_version: z.number().int().min(1),
    active: z.boolean(),
    can_read: z.boolean(),
    can_write: z.boolean(),
    entitled: z.boolean(),
  })
  .strict();
export type BridgeAuthority = z.infer<typeof authoritySchema>;
const packetSchema = z
  .object({
    protocol: z.literal("kxra-native-draft/v1"),
    request_id: id,
    adapter: nativeBridgeInput.shape.adapter,
    actor_id: id,
    org_id: id,
    room_id: id,
    session_version: z.number().int().min(1),
    objective: z.string().trim().min(1).max(2000),
    created_at: z.number().int().nonnegative(),
    expires_at: z.number().int().nonnegative(),
    connection_status: z.literal("UNCONNECTED"),
    output_mode: z.literal("DRAFT_TEXT_ONLY"),
    source_trust: z.literal("UNTRUSTED_QUOTED_DATA"),
    execution_permitted: z.literal(false),
    sources: z.array(message).min(1).max(10),
  })
  .strict();
export type NativeDraftPacket = z.infer<typeof packetSchema>;
export type BridgeApproval = {
  request_id: string;
  packet_sha256: string;
  reviewed_by: string;
  state: "PROPOSED" | "APPROVED" | "CANCELLED" | "CONSUMED";
};
function hash(value: unknown) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}
function authorised(a: BridgeAuthority) {
  authoritySchema.parse(a);
  if (
    !Number.isSafeInteger(a.session_version) ||
    a.session_version < 1 ||
    !a.active ||
    !a.can_read ||
    !a.can_write ||
    !a.entitled
  )
    throw Error("BRIDGE_AUTHORITY_UNAVAILABLE");
}
function selectedMessages(
  a: BridgeAuthority,
  ids: string[],
  rows: BridgeMessage[],
) {
  const parsed = z.array(message).max(10).parse(rows);
  if (
    parsed.length !== ids.length ||
    new Set(parsed.map((r) => r.id)).size !== ids.length
  )
    throw Error("BRIDGE_SOURCE_UNAVAILABLE");
  const sources = ids.map((i) => {
    const row = parsed.find((r) => r.id === i);
    if (!row || row.room_id !== a.room_id || row.org_id !== a.org_id)
      throw Error("BRIDGE_SOURCE_UNAVAILABLE");
    return row;
  });
  if (Buffer.byteLength(JSON.stringify(sources), "utf8") > 24000)
    throw Error("BRIDGE_CONTEXT_TOO_LARGE");
  return sources;
}
export function prepareNativeDraftPacket(
  input: unknown,
  authority: BridgeAuthority,
  currentMessages: BridgeMessage[],
  now = Date.now(),
) {
  const v = nativeBridgeInput.parse(input);
  authorised(authority);
  if (
    !Number.isSafeInteger(now) ||
    !Number.isSafeInteger(now + 10 * 60_000) ||
    now < 0
  )
    throw Error("BRIDGE_TIME_INVALID");
  const packet: NativeDraftPacket = {
    protocol: "kxra-native-draft/v1",
    request_id: v.request_id,
    adapter: v.adapter,
    actor_id: authority.actor_id,
    org_id: authority.org_id,
    room_id: authority.room_id,
    session_version: authority.session_version,
    objective: v.objective,
    created_at: now,
    expires_at: now + 10 * 60_000,
    connection_status: "UNCONNECTED",
    output_mode: "DRAFT_TEXT_ONLY",
    source_trust: "UNTRUSTED_QUOTED_DATA",
    execution_permitted: false,
    sources: selectedMessages(authority, v.message_ids, currentMessages),
  };
  // This digest requires an authoritative stored approval; it is not a signature
  // and must never be accepted merely because the caller recomputed it.
  return { packet, packet_sha256: hash(packet) };
}
export function validateReviewedNativeDraft(
  rawPacket: unknown,
  approval: BridgeApproval,
  currentAuthority: BridgeAuthority,
  currentMessages: BridgeMessage[],
  now = Date.now(),
) {
  const p = packetSchema.parse(rawPacket);
  authorised(currentAuthority);
  if (
    !Number.isSafeInteger(now) ||
    now < p.created_at ||
    now >= p.expires_at ||
    p.expires_at - p.created_at !== 10 * 60_000
  )
    throw Error("BRIDGE_EXPIRED");
  if (
    p.actor_id !== currentAuthority.actor_id ||
    p.org_id !== currentAuthority.org_id ||
    p.room_id !== currentAuthority.room_id ||
    p.session_version !== currentAuthority.session_version
  )
    throw Error("BRIDGE_SCOPE_CHANGED");
  if (
    approval.state !== "APPROVED" ||
    approval.request_id !== p.request_id ||
    approval.reviewed_by !== currentAuthority.room_creator_id ||
    digest.parse(approval.packet_sha256) !== hash(p)
  )
    throw Error("BRIDGE_REVIEW_UNAVAILABLE");
  const current = selectedMessages(
    currentAuthority,
    p.sources.map((r) => r.id),
    currentMessages,
  );
  if (hash(current) !== hash(p.sources)) throw Error("BRIDGE_SOURCE_CHANGED");
  return p;
}
export function parseNativeDraftResult(
  input: unknown,
  packet: NativeDraftPacket,
  trustedPacketDigest: string,
) {
  // JSONB/transport can reorder keys. Hash the same strict canonical shape used
  // for preparation, never incidental object insertion order.
  const canonicalPacket = packetSchema.parse(packet);
  const result = z
    .object({
      request_id: id,
      packet_sha256: digest,
      draft_text: z.string().trim().min(1).max(12000),
    })
    .strict()
    .parse(input);
  if (
    result.request_id !== canonicalPacket.request_id ||
    result.packet_sha256 !== digest.parse(trustedPacketDigest) ||
    result.packet_sha256 !== hash(canonicalPacket)
  )
    throw Error("BRIDGE_RESULT_BINDING_MISMATCH");
  if (Buffer.byteLength(result.draft_text, "utf8") > 24000)
    throw Error("BRIDGE_RESULT_TOO_LARGE");
  return {
    ...result,
    provenance: "MANUAL_UNVERIFIED" as const,
    state: "REVIEW_REQUIRED" as const,
    execution_permitted: false as const,
  };
}
export function nativeBridgeReadiness() {
  return {
    protocol: "kxra-native-draft/v1",
    protocol_available: true,
    pairing_available: false,
    export_available: false,
    dispatch_available: false,
    blockers: [
      "ATOMIC_REQUEST_REVIEW_AND_SINGLE_USE_LEDGER_PENDING",
      "SCOPED_DEVICE_PAIRING_AND_REVOCATION_PENDING",
      "REAL_ADAPTER_ACCEPTANCE_PENDING",
    ],
  } as const;
}
export function requireNativeBridgeAdapter(): never {
  // No environment flag, invented success result or caller endpoint enables it.
  throw Error("NATIVE_BRIDGE_NOT_CONNECTED");
}
