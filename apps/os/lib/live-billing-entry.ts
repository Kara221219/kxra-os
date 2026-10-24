import { reserveLiveBillingEntry } from "../../../packages/authz/live-billing-reservation";
import {
  modernEntrySql,
  unwrapModernEntryReceipt,
} from "../../../packages/authz/modern-billing-entry-scope";
import { account } from "./auth";
import { query } from "../../../packages/db";
import {
  liveBillingEntryConfiguration,
  liveBillingEntryController,
} from "../../../packages/authz/live-billing-entry";

function configuration() {
  const c = liveBillingEntryConfiguration();
  if (!c) throw Error("MODERN_BILLING_ENTRY_DISABLED");
  return c;
}

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
    status: async (a) => {
      const c = configuration();
      const value = (
        await query<{ value: unknown }>(a, modernEntrySql("STATUS", c.mode), [])
      )[0]?.value;
      return unwrapModernEntryReceipt(value, c);
    },
    reserve: async (a, r) => {
      const c = configuration();
      return unwrapModernEntryReceipt(
        await reserveLiveBillingEntry(a, r, query, c.mode),
        c,
      );
    },
  });
}
