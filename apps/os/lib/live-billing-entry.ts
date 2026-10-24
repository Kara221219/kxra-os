import { account } from "./auth";
import { query } from "../../../packages/db";
import {
  liveBillingEntryConfiguration,
  liveBillingEntryController,
} from "../../../packages/authz/live-billing-entry";

export function liveEntryController(sameOrigin: () => void = () => {}) {
  return liveBillingEntryController({
    configuration: liveBillingEntryConfiguration,
    account,
    sameOrigin,
    now: Date.now,
    legalAllowed: async (a) => {
      const gate = (
        await query<{ allowed: boolean; code: string }>(
          a,
          "select allowed,code from kxra.legal_gate_status()",
          [],
        )
      )[0];
      return gate?.allowed === true && gate.code === "ALLOWED";
    },
    status: async (a) =>
      (
        await query<{ value: unknown }>(
          a,
          "select kxra_private.own_live_billing_status() value",
          [],
        )
      )[0]?.value,
    reserve: async (a, r) =>
      (
        await query<{ value: unknown }>(
          a,
          r.action === "CUSTOMER"
            ? "select kxra_private.request_live_customer_intent($1,$2) value"
            : "select kxra_private.request_live_billing_intent($1,$2,$3) value",
          r.action === "CUSTOMER"
            ? [r.request_id, r.offer_key]
            : [r.request_id, r.action, r.offer_key],
        )
      )[0]?.value,
  });
}
