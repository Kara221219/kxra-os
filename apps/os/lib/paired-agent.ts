import crypto from "node:crypto";
import { z } from "zod";
import { localMode, getPool, query } from "../../../packages/db";
import type { Principal } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
const id = z.uuid(),
  secret = z.string().regex(/^[a-f0-9]{64}$/);
export const pairedSchemas = {
  CREATE: z
    .object({
      room_id: id,
      agent_id: id,
      name: z.string().trim().min(1).max(80),
    })
    .strict(),
  INVITE: z.object({ room_id: id, agent_id: id }).strict(),
  REVOKE: z.object({ room_id: id, agent_id: id }).strict(),
  PROPOSE: z
    .object({
      room_id: id,
      agent_id: id,
      request_id: id,
      objective: z.string().trim().min(1).max(2000),
      message_ids: z.array(id).min(1).max(10),
    })
    .strict(),
  APPROVE: z
    .object({ room_id: id, agent_id: id, task_id: id, content_hash: secret })
    .strict(),
  CANCEL: z.object({ room_id: id, agent_id: id, task_id: id }).strict(),
  VIEW: z.object({ room_id: id, agent_id: id, task_id: id }).strict(),
  LIST: z.object({ room_id: id }).strict(),
};
export function fixturePairingOnly() {
  if (!localMode() || process.env.VERCEL || process.env.VERCEL_ENV)
    throw new HttpError(
      503,
      "Paired agents are available only in an isolated local fixture; live pairing is not activated",
    );
}
export const credentialHash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
export async function pairedControl(actor: Actor, op: string, input: unknown) {
  fixturePairingOnly();
  if (!(op in pairedSchemas))
    throw new HttpError(404, "Unknown paired operation");
  const v = pairedSchemas[op as keyof typeof pairedSchemas].parse(input),
    code = op === "INVITE" ? crypto.randomBytes(32).toString("hex") : undefined;
  const payload = {
    ...v,
    ...(code
      ? { request_id: crypto.randomUUID(), secret_hash: credentialHash(code) }
      : {}),
  };
  const rows = await query<{ value: unknown }>(
    actor,
    "select kxra.paired_control($1,$2::jsonb) value",
    [op, JSON.stringify(payload)],
  );
  return {
    ...(rows[0].value as Record<string, unknown>),
    ...(code ? { pairing_code: code } : {}),
    mode: "FIXTURE_ONLY",
    provider_verified: false,
  };
}
export async function resolveCredential(
  value: string,
  kind: "INVITATION" | "SESSION",
): Promise<Principal> {
  // Only this server-side lookup uses app identity. Every action then rechecks
  // the bound principal under authenticated RLS; no token is a general login.
  const db = await getPool().connect();
  try {
    await db.query("begin");
    await db.query(
      "select set_config('request.kxra.execution_mode','fixture',true)",
    );
    const rows = (
      await db.query<{
        owner_id: string;
        org_id: string;
        session_version: number;
      }>("select * from kxra_pairing.paired_resolve($1,$2)", [
        credentialHash(value),
        kind,
      ])
    ).rows;
    await db.query("commit");
    if (rows.length !== 1)
      throw new HttpError(401, "Pairing credential expired, used or revoked");
    const row = rows[0];
    return {
      id: row.owner_id,
      organisation_id: row.org_id,
      session_version: row.session_version,
      aal: "aal1",
      source: "fixture",
    };
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
const deviceSchemas = {
  HEARTBEAT: z.object({}).strict(),
  STATUS: z.object({ task_id: id, fence: id }).strict(),
  POLL: z.object({ request_id: id }).strict(),
  ABANDON: z.object({ task_id: id, fence: id }).strict(),
  START: z.object({ task_id: id, fence: id }).strict(),
  RESULT: z
    .object({
      task_id: id,
      fence: id,
      draft_text: z
        .string()
        .trim()
        .min(1)
        .max(10000)
        .refine((s) => Buffer.byteLength(s, "utf8") <= 20000),
    })
    .strict(),
};
export async function pairedDevice(op: string, token: unknown, input: unknown) {
  fixturePairingOnly();
  const credential = secret.parse(token);
  const redeem = op === "REDEEM";
  if (!redeem && !(op in deviceSchemas))
    throw new HttpError(404, "Unknown paired operation");
  const v = redeem
    ? z.object({}).strict().parse(input)
    : deviceSchemas[op as keyof typeof deviceSchemas].parse(input);
  const actor = await resolveCredential(
    credential,
    redeem ? "INVITATION" : "SESSION",
  );
  const next = redeem ? crypto.randomBytes(32).toString("hex") : undefined;
  const payload = {
    ...v,
    ...(next
      ? { session_id: crypto.randomUUID(), session_hash: credentialHash(next) }
      : {}),
  };
  const rows = await query<{ value: unknown }>(
    actor,
    op === "STATUS"
      ? "select kxra.paired_task_status($1,$2::uuid,$3::uuid) value"
      : "select kxra.paired_device($1,$2,$3::jsonb) value",
    op === "STATUS"
      ? [
          credentialHash(credential),
          (v as { task_id: string }).task_id,
          (v as { fence: string }).fence,
        ]
      : [credentialHash(credential), op, JSON.stringify(payload)],
  );
  return {
    ...(rows[0].value as Record<string, unknown>),
    ...(next ? { session_token: next } : {}),
    mode: "FIXTURE_ONLY",
    provider_verified: false,
  };
}
