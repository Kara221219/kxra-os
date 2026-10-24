import crypto from "node:crypto";
import { account } from "./auth";
import { query } from "../../../packages/db";
import {
  authorizedCheckoutResult,
  checkoutResultConfiguration,
} from "../../../packages/authz/checkout-result-controller";
import { deliverCheckoutResult } from "../../../packages/integrations/checkout-result";
import { validateModernBillingConfiguration } from "../../../packages/integrations/modern-billing-scope";

/** No borrowed worker login, new credentials, URL cache or provider mutation. */
export async function checkoutResult(input: unknown, sameOrigin: () => void) {
  return authorizedCheckoutResult(
    {
      sameOrigin,
      account,
      configuration: checkoutResultConfiguration,
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
      consumeReadRate: async (a) => {
        const subject = crypto
          .createHash("sha256")
          .update(`checkout-result:${a.organisation_id}:${a.id}`)
          .digest("hex");
        return (
          (
            await query<{ allowed: boolean }>(
              a,
              "select kxra.consume_rate_limit('checkout-result',$1,8,900) allowed",
              [subject],
            )
          )[0]?.allowed === true
        );
      },
      deliver: async (a, request, config) => {
        // Only server environment chooses the literal scope entrypoints; HTTP has no mode input.
        const stage = config.mode === "STAGING_SANDBOX";
        const pre = stage
          ? "select kxra_private.staging_sandbox_checkout_result_context($1) value"
          : "select kxra_private.live_checkout_result_context($1) value";
        const post = stage
          ? "select kxra_private.staging_sandbox_checkout_result_current($1,$2) value"
          : "select kxra_private.live_checkout_result_current($1,$2) value";
        return deliverCheckoutResult(
          {
            enabled: true,
            nodeEnv: "production",
            origin: config.origin,
            key: process.env.STRIPE_SECRET_KEY,
            expectedMode: config.mode,
            prepare: async (id) =>
              (await query<{ value: unknown }>(a, pre, [id]))[0]?.value,
            confirm: async (id, generation) =>
              (await query<{ value: boolean }>(a, post, [id, generation]))[0]
                ?.value === true,
            validateConfiguration: (attestation, key, mode) =>
              validateModernBillingConfiguration(
                attestation,
                config.runtimeIdentity,
                key,
                mode,
              ),
            transport: fetch,
          },
          request,
          { actor_id: a.id, org_id: a.organisation_id },
        );
      },
    },
    input,
  );
}
