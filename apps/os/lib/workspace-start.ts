import { z } from "zod";
import { query } from "../../../packages/db";
import type { Actor } from "./auth";
import { teamRooms } from "./team-workspace";
import { workspacePilot } from "./workspace-pilot";
const pilotShape = z.object({
  assigned: z.boolean(),
  entitled: z.boolean(),
  subscription: z
    .object({
      state: z.string(),
      mode: z.enum(["FIXTURE", "TEST_STRIPE"]),
      cancel_at_period_end: z.boolean(),
      period_end: z.string(),
    })
    .nullable(),
  test_billing: z.object({
    requests_available: z.boolean(),
    bound: z.boolean(),
    pending_binding: z.boolean().optional(),
    reconciliation_required: z.boolean(),
  }),
});
/** Read-only account→workspace report. No URL or browser storage grants access. */
export async function workspaceStart(a: Actor) {
  const rooms = await teamRooms(a);
  // Match the existing database administration rule, including customer ORG_ADMIN.
  // The legacy presentation role labels non-KXRA owners as partners and cannot
  // determine customer billing authority. No role or permission is granted here.
  const billingAdmin =
    (
      await query<{ allowed: boolean }>(
        a,
        "select kxra_private.is_owner($1) allowed",
        [a.organisation_id],
      )
    )[0]?.allowed === true;
  const pilot = billingAdmin ? pilotShape.parse(await workspacePilot(a)) : null;
  return {
    account_state: a.account_state,
    organisation: a.organisation_name,
    billing_admin: billingAdmin,
    billing: pilot,
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, access: r.access })),
    provider_execution_accepted: false,
  };
}
export type WorkspaceStart = Awaited<ReturnType<typeof workspaceStart>>;
