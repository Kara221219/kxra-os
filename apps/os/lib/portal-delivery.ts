import crypto from "node:crypto";
import { account } from "./auth";
import { query } from "../../../packages/db";
import {
  authorizePortalDelivery,
  portalDeliveryConfiguration,
} from "../../../packages/authz/portal-delivery";
import { synchronousPortalDelivery } from "../../../packages/integrations/synchronous-portal";
import { portalWorker } from "../../../packages/integrations/portal-delivery-worker";
import {
  requireLiveEntryIdentity,
  requireLiveEntryMfa,
  type LiveEntryIdentity,
} from "../../../packages/authz/live-billing-entry";
async function legal(a: LiveEntryIdentity) {
  const gate = (
    await query<{ allowed: boolean; code: string }>(
      a,
      "select allowed,code from kxra.legal_gate_status()",
      [],
    )
  )[0];
  return gate?.allowed === true && gate.code === "ALLOWED";
}

export async function portalDelivery(input: unknown, sameOrigin: () => void) {
  return authorizePortalDelivery(
    {
      configuration: portalDeliveryConfiguration,
      sameOrigin,
      account,
      now: Date.now,
      legalAllowed: legal,
      rate: async (a) => {
        const subject = crypto
          .createHash("sha256")
          .update(`portal-delivery:${a.organisation_id}:${a.id}`)
          .digest("hex");
        return (
          (
            await query<{ allowed: boolean }>(
              a,
              "select kxra.consume_rate_limit('portal-delivery',$1,8,900) allowed",
              [subject],
            )
          )[0]?.allowed === true
        );
      },
      deliver: async (a, r, config) => {
        const requestSQL =
          config.mode === "LIVE"
            ? "select kxra_private.request_live_billing_intent($1,'PORTAL',$2) value"
            : "select kxra_private.staging_sandbox_request_live_billing_intent($1,'PORTAL',$2) value";
        return synchronousPortalDelivery(
          r,
          { actor_id: a.id, org_id: a.organisation_id },
          {
            enabled: true,
            reserve: async (request) =>
              (
                await query<{ value: unknown }>(a, requestSQL, [
                  request.request_id,
                  request.offer_key,
                ])
              )[0]?.value,
            loadWorker: () => portalWorker(config),
            authorityCurrent: async () => {
              try {
                const current = await account();
                requireLiveEntryIdentity(current);
                requireLiveEntryMfa(current, Date.now());
                return (
                  current.id === a.id &&
                  current.organisation_id === a.organisation_id &&
                  (await legal(current))
                );
              } catch {
                return false;
              }
            },
          },
        );
      },
    },
    input,
  );
}
