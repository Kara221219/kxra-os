import { z } from "zod";
import { localMode, query } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
import { teamRoom } from "./team-room";
import {
  nativeBridgeInput,
  prepareNativeDraftPacket,
  parseNativeDraftResult,
  nativeBridgeReadiness,
  type NativeDraftPacket,
  type BridgeAuthority,
} from "../../../packages/workspace/native-bridge-contract";
import type { CatalogCursor } from "./team-catalog";
export type BridgeRequest = {
  id: string;
  room_id: string;
  objective: string;
  state: string;
  version: number;
  export_count: number;
  expires_at: string;
  created_at: string;
};
export type BridgeView = {
  packet: NativeDraftPacket;
  packet_sha256: string;
  result_text: string | null;
  provenance: "MANUAL_UNVERIFIED";
  execution_permitted: false;
};
const id = z.uuid();
function contract<T>(work: () => T): T {
  try {
    return work();
  } catch (error) {
    if (error instanceof z.ZodError) throw error;
    throw new HttpError(
      409,
      "Handoff scope or content changed; create a new request",
    );
  }
}

function localBridgeOnly() {
  if (!localMode() || process.env.VERCEL_ENV)
    throw new HttpError(
      503,
      "Native bridge and manual handoff are not activated for hosted use",
    );
}
export async function bridgeCatalog(
  a: Actor,
  r: string,
  cursor?: CatalogCursor,
) {
  localBridgeOnly();
  await teamRoom(a, r);
  let anchor: { stamp: string; id: string } | undefined;
  if (cursor) {
    if (cursor.band !== 0) throw new HttpError(400, "Invalid bridge cursor");
    anchor = (
      await query<{ stamp: string; id: string }>(
        a,
        "select created_at::text stamp,id from kxra.team_bridge_requests where id=$1 and room_id=$2",
        [cursor.before, r],
      )
    )[0];
    if (!anchor) throw new HttpError(404, "Bridge cursor unavailable");
  }
  const rows = await query<BridgeRequest>(
    a,
    `select id,room_id,objective,state,version,export_count,expires_at,created_at
    from kxra.team_bridge_requests where room_id=$1 and ($2::timestamptz is null or (created_at,id)<($2::timestamptz,$3::uuid))
    order by created_at desc,id desc limit 101`,
    [r, anchor?.stamp ?? null, anchor?.id ?? null],
  );
  const requests = rows.slice(0, 100);
  return {
    requests,
    next_cursor:
      rows.length > 100 ? { before: requests.at(-1)!.id, band: 0 } : null,
    readiness: { ...nativeBridgeReadiness(), local_manual_handoff: true },
  };
}
export async function bridgeView(
  a: Actor,
  r: string,
  i: string,
): Promise<BridgeView> {
  localBridgeOnly();
  await teamRoom(a, r);
  return (
    await query<{ value: BridgeView }>(
      a,
      "select kxra.team_bridge_view($1,$2) value",
      [r, id.parse(i)],
    )
  )[0].value;
}
export async function createBridgeRequest(a: Actor, r: string, input: unknown) {
  localBridgeOnly();
  const v = nativeBridgeInput.parse(input),
    room = await teamRoom(a, r);
  if (v.adapter !== "MANUAL_DRAFT")
    throw new HttpError(
      503,
      "Native device is unpaired; no adapter or external execution is activated",
    );
  if (room.created_by !== a.id)
    throw new HttpError(403, "Manual handoff requires the room creator");
  const messages = await query<{
    id: string;
    room_id: string;
    org_id: string;
    body: string;
  }>(
    a,
    "select m.id,m.room_id,r.org_id,m.body from kxra.team_messages m join kxra.team_rooms r on r.id=m.room_id where m.room_id=$1 and m.id=any($2::uuid[])",
    [r, v.message_ids],
  );
  const scope = (
    await query<{ value: BridgeAuthority }>(
      a,
      "select kxra.team_bridge_scope($1) value",
      [r],
    )
  )[0].value;
  const prepared = contract(() => prepareNativeDraftPacket(v, scope, messages));
  // SQL independently rechecks creator/write/paid/session/source authority under locks.
  return (
    await query<{ request_id: string }>(
      a,
      "select kxra.team_bridge_create($1,$2,$3) request_id",
      [v.request_id, r, JSON.stringify(prepared.packet)],
    )
  )[0];
}
export async function bridgeMutation(
  a: Actor,
  r: string,
  i: string,
  operation: string,
  input: unknown,
) {
  localBridgeOnly();
  await teamRoom(a, r);
  id.parse(i);
  if (operation === "dispatch")
    throw new HttpError(
      503,
      "Native device is unpaired; no provider call or external execution is permitted",
    );
  if (operation === "review") {
    const v = z
      .object({
        version: z.number().int().positive(),
        decision: z.enum(["APPROVED", "ACCEPTED", "REJECTED", "CANCELLED"]),
      })
      .strict()
      .parse(input);
    await query(a, "select kxra.team_bridge_decide($1,$2,$3,$4)", [
      r,
      i,
      v.version,
      v.decision,
    ]);
    return { request_id: i };
  }
  if (operation === "export") {
    const v = z
      .object({ version: z.number().int().positive() })
      .strict()
      .parse(input);
    return (
      await query<{ value: unknown }>(
        a,
        "select kxra.team_bridge_export($1,$2,$3) value",
        [r, i, v.version],
      )
    )[0].value;
  }
  if (operation === "result") {
    const v = z
        .object({ version: z.number().int().positive(), result: z.unknown() })
        .strict()
        .parse(input),
      view = await bridgeView(a, r, i);
    const result = contract(() =>
      parseNativeDraftResult(v.result, view.packet, view.packet_sha256),
    );
    return (
      await query<{ value: unknown }>(
        a,
        "select kxra.team_bridge_result($1,$2,$3,$4,$5) value",
        [r, i, v.version, result.packet_sha256, result.draft_text],
      )
    )[0].value;
  }
  throw new HttpError(404, "Bridge operation unavailable");
}
