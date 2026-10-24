import { reserveLiveBillingEntry } from "../../../packages/authz/live-billing-reservation";
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
    reserve: (a, r) => reserveLiveBillingEntry(a, r, query),
  });
}
