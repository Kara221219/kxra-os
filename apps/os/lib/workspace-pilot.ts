import { workspaceExecutionReadiness } from "../../../packages/workspace/execution-readiness";
import { z } from "zod";
import { localMode, query } from "../../../packages/db";
import { pilotStripeRuntime } from "../../../packages/integrations/pilot-stripe";
import { HttpError, type Actor } from "./auth";
export async function workspacePilot(a: Actor) {
  const status = (
    await query<{ status: Record<string, unknown> | null }>(
      a,
      "select kxra_private.pilot_status() status",
    )
  )[0]?.status;
  if (!status) throw new HttpError(403, "Workspace administration required");
  const billing = (
    await query<{
      value: {
        mapping_reviewed: boolean;
        customer_mapped: boolean;
        bound: boolean;
        pending_binding: boolean;
        reconciliation_required: boolean;
      };
    }>(a, "select kxra_private.pilot_stripe_readiness() value")
  )[0]?.value;
  // RLS restricts this metadata to the original requester with current fresh MFA.
  // No saved redirect, provider secret or browser-selected identity is returned.
  const recovery =
    (
      await query<{
        request_id: string;
        include_setup: boolean;
        expired: boolean;
        state: string;
      }>(
        a,
        `select i.id request_id,i.include_setup,i.state,
      (i.created_at<now()-interval '23 hours' or coalesce(i.expires_at<=now(),false)) expired
     from kxra.pilot_stripe_intents i join kxra.pilot_stripe_bindings b on b.org_id=i.org_id
     where i.org_id=$1 and i.actor_id=$2 and i.kind='CHECKOUT'
      and b.subscription_id is null and not b.terminal
     order by i.created_at desc limit 1`,
        [a.organisation_id, a.id],
      )
    )[0] ?? null;
  let configured = false;
  try {
    pilotStripeRuntime();
    configured = !!billing?.mapping_reviewed && !!billing?.customer_mapped;
  } catch {}
  const proposed = z.coerce.number().int().positive().max(1000000);
  return {
    ...status,
    proposed_capacity: {
      rooms: {
        value: proposed.parse(process.env.KXRA_PILOT_PROPOSED_ROOM_CAP || 10),
        approved: false,
        enforced: false,
      },
      monthly_drafts: {
        value: proposed.parse(process.env.KXRA_PILOT_PROPOSED_DRAFT_CAP || 250),
        approved: false,
        enforced: false,
      },
    },
    execution_readiness: workspaceExecutionReadiness(),
    integration: "INACTIVE_UNLESS_SEPARATELY_VERIFIED_TEST_STRIPE",
    checkout_enabled: false, // No configuration is seeded; this is not a hosted-acceptance claim.
    test_billing: {
      ...billing,
      requests_available: configured,
      provider_verified: false,
      recovery,
    },
  };
}
export async function workspacePilotEvent(a: Actor, value: unknown) {
  if (!localMode() || process.env.VERCEL_ENV)
    throw new HttpError(
      503,
      "Pilot billing simulation requires the guarded local fixture runtime",
    );
  const v = z
    .object({
      request_id: z.string().uuid(),
      version: z.number().int().nonnegative(),
      action: z.enum([
        "ACTIVATE",
        "RENEW",
        "PAST_DUE",
        "RECOVER",
        "PAUSE",
        "RESUME",
        "CANCEL_AT_END",
        "CANCEL_NOW",
        "RECONCILE",
      ]),
    })
    .strict()
    .parse(value);
  await query(a, "select kxra.workspace_pilot_event($1,$2,$3)", [
    v.request_id,
    v.version,
    v.action,
  ]);
  return workspacePilot(a);
}
