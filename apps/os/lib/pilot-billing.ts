import { z } from "zod";
import { query } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
import {
  pilotStripeRuntime,
  pilotConfigSchema,
  pilotIntentSchema,
  createPilotSession,
  reconcilePilot,
  recordPilotEvent,
  recordPilotSession,
  catalogueOfferKey,
} from "../../../packages/integrations/pilot-stripe";
export async function pilotBilling(a: Actor, kind: string, input: unknown) {
  const v = z
    .object({
      request_id: z.string().uuid(),
      include_setup: z.boolean().optional(),
      offer_key: catalogueOfferKey.optional(),
    })
    .strict()
    .parse(input);
  if (
    !["CHECKOUT", "PORTAL", "RECONCILE"].includes(kind) ||
    (kind !== "CHECKOUT" &&
      (v.include_setup !== undefined || v.offer_key !== undefined)) ||
    (v.offer_key !== undefined && v.include_setup === true)
  )
    throw new HttpError(400, "Invalid pilot billing request");
  // No fall-through to the legacy checkout, fixture simulation or arbitrary provider.
  try {
    pilotStripeRuntime();
  } catch {
    throw new HttpError(
      503,
      "Verified test-mode pilot billing is not configured",
    );
  }
  const load = async () => {
    const value = (
      await query<{ value: unknown }>(
        a,
        v.offer_key !== undefined || kind !== "CHECKOUT"
          ? "select kxra.request_catalogue_stripe($1,$2,$3) value"
          : "select kxra.request_pilot_stripe($1,$2,$3) value",
        [
          v.request_id,
          kind,
          v.offer_key !== undefined || kind !== "CHECKOUT"
            ? (v.offer_key ?? null)
            : v.include_setup || false,
        ],
      )
    )[0]?.value;
    return z
      .object({ intent: pilotIntentSchema, config: pilotConfigSchema })
      .parse(value);
  };
  const { intent, config } = await load();
  if (kind === "RECONCILE") {
    if (intent.state === "READY")
      return { state: "RECORDED", live_charges: false };
    const event = await reconcilePilot(config, intent);
    const state = await recordPilotEvent(event);
    await load(); // Recheck current tenant/MFA after provider IO; no redirect grants access.
    return { state, live_charges: false };
  }
  if (intent.state === "READY") {
    if (!intent.expires_at || Date.parse(intent.expires_at) <= Date.now())
      throw new HttpError(
        409,
        "Pilot session expired; reconciliation required",
      );
    return {
      url: intent.redirect_url,
      expires_at: intent.expires_at,
      livemode: false,
    };
  }
  const session = await createPilotSession(config, intent);
  if ((await recordPilotSession(intent, session)) !== "READY")
    throw new HttpError(503, "Pilot session unavailable");
  await load();
  return { url: session.url, expires_at: session.expires_at, livemode: false };
}
