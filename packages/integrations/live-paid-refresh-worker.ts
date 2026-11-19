import crypto from "node:crypto";
import { z } from "zod";
import { createPaidRefreshWorkerQuery } from "./paid-refresh-database";
import {
  assertModernScopeTag,
  modernCatalogueRow,
  validateModernBillingConfiguration,
  type ModernRuntimeIdentity,
  type ModernExecutionMode,
} from "./modern-billing-scope";
import {
  readLiveStripePaymentEvidence,
  readStagingSandboxStripePaymentEvidence,
} from "./live-stripe-payment-evidence";
import {
  readLiveCheckoutConsent,
  readStagingSandboxCheckoutConsent,
} from "./live-checkout-consent";
import {
  buildLivePaidProof,
  buildStagingSandboxPaidProof,
} from "./live-paid-access";
import {
  paidRefreshSubjectSchema,
  readPaidRefreshPreflight,
} from "./live-paid-refresh-preflight";
import type { LiveBillingTransport } from "./live-catalogue-stripe";
/** Each call opens and closes a short worker transaction. Provider calls MUST occur
 * only after this returns. The production path uses the existing LOGIN runner. */
export type PaidRefreshQuery = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;
export const paidRefreshWorkerQuery: PaidRefreshQuery =
  createPaidRefreshWorkerQuery();
export type PaidRefreshOptions = {
  enabled?: boolean;
  nodeEnv?: string;
  mode: ModernExecutionMode;
  runtimeIdentity: ModernRuntimeIdentity;
  secretKey: string;
  origin: string;
  limit?: number;
  transport?: LiveBillingTransport;
  query?: PaidRefreshQuery;
  nowSeconds?: () => number;
  /** Private scheduler notification after the short claim transaction has ended.
   * Never HTTP input, tenant authority or a provider/SQL bypass. */
  onClaimCount?: (count: number) => void;
};
/** Bounded READ-only --once engine. No automatic retries or provider mutations.
 * Configuration and subjects come only from worker RPCs; no caller tenant/invoice. */
export async function runPaidRefreshOnce(options: PaidRefreshOptions) {
  if (options.enabled !== true) throw Error("PAID_REFRESH_DISABLED");
  if ((options.nodeEnv ?? process.env.NODE_ENV) !== "production")
    throw Error("PAID_REFRESH_RUNTIME_REQUIRED");
  const limit = z
    .number()
    .int()
    .min(1)
    .max(20)
    .parse(options.limit ?? 5);
  const origin = new URL(options.origin);
  if (origin.protocol !== "https:" || origin.origin !== options.origin)
    throw Error("PAID_REFRESH_ORIGIN_REQUIRED");
  const query = options.query ?? paidRefreshWorkerQuery,
    prefix = options.mode === "LIVE" ? "" : "staging_sandbox_";
  const configuration = validateModernBillingConfiguration(
    (
      await query(
        "select kxra_private.modern_billing_scope_attestation() value",
      )
    ).rows[0]?.value,
    options.runtimeIdentity,
    options.secretKey,
    options.mode,
  );
  const common = {
    execution: configuration,
    runtimeIdentity: options.runtimeIdentity,
  };
  const wakes = (
    await query(
      `select value from kxra_private.${prefix}claim_live_billing_wakeups($1::integer) value`,
      [limit],
    )
  ).rows.map((r) => r.value);
  const subjects = (
    await query(
      `select value from kxra_private.${prefix}claim_live_paid_refresh($1::integer) value`,
      [limit],
    )
  ).rows;
  options.onClaimCount?.(subjects.length);
  const outcomes: { org_id: string; outcome: string; acknowledged: number }[] =
    [];
  const wakeSchema = z
    .object({
      execution_scope: z.unknown(),
      event_id: z.string(),
      org_id: z.uuid(),
      binding_version: z.number().int(),
      claim_token: z.uuid(),
    })
    .passthrough();
  for (const value of subjects) {
    const subject = paidRefreshSubjectSchema.parse(value.value);
    assertModernScopeTag(
      subject.execution_scope,
      configuration.execution_scope,
    );
    const current = async () =>
      (
        await query(
          `select kxra_private.${prefix}live_paid_refresh_current($1::uuid,$2::uuid) value`,
          [subject.org_id, subject.claim_token],
        )
      ).rows[0]?.value === true;
    let outcome = "UNVERIFIED",
      acknowledged = 0;
    try {
      const preflight = await readPaidRefreshPreflight(
        {
          ...common,
          secretKey: options.secretKey,
          mode: options.mode,
          transport: options.transport ?? fetch,
          stillCurrent: current,
          nowSeconds: options.nowSeconds,
        },
        subject,
      );
      const reconciliation_id = crypto.randomUUID();
      const reservation = (
        await query(
          `select kxra_private.${prefix}reserve_live_paid_refresh($1::uuid,$2::uuid,$3::uuid,$4::integer,$5::text,$6::text,$7::bigint,$8::bigint) value`,
          [
            subject.org_id,
            subject.claim_token,
            reconciliation_id,
            preflight.expected_total_minor,
            preflight.invoice_id,
            preflight.subscription_item_id,
            preflight.period_start,
            preflight.period_end,
          ],
        )
      ).rows[0]?.value;
      const r = z
        .object({
          execution_scope: z.unknown(),
          context: z.record(z.string(), z.unknown()),
          mapping: z.record(z.string(), z.unknown()),
          policy: z.record(z.string(), z.unknown()),
          checkout_actor_id: z.uuid(),
          subscription_item_id: z.string(),
        })
        .passthrough()
        .parse(reservation);
      assertModernScopeTag(r.execution_scope, configuration.execution_scope);
      const c = r.context,
        m = r.mapping,
        p = r.policy;
      if (
        c.org_id !== subject.org_id ||
        c.binding_version !== subject.binding_version ||
        c.reconciliation_id !== reconciliation_id ||
        c.customer_id !== subject.customer_id ||
        c.subscription_id !== subject.subscription_id ||
        c.checkout_intent_id !== subject.checkout_intent_id ||
        c.actor_id !== subject.actor_id ||
        r.checkout_actor_id !== subject.checkout_actor_id ||
        !(await current())
      )
        throw Error("PAID_REFRESH_RESERVATION_CHANGED");
      const principal = { org_id: subject.org_id, actor_id: subject.actor_id };
      const base = {
        reconciliation_id,
        org_id: c.org_id,
        actor_id: c.actor_id,
        binding_version: c.binding_version,
        mapping_revision: c.mapping_revision,
        offer_key: c.offer_key,
        price_id: c.price_id,
        product_id: c.product_id,
        customer_id: c.customer_id,
        subscription_id: c.subscription_id,
        invoice_id: c.invoice_id,
        checkout_intent_id: c.checkout_intent_id,
        subscription_item_id: r.subscription_item_id,
        period_start: c.period_start,
        period_end: c.period_end,
        created_at: c.created_at,
        expires_at: c.expires_at,
      };
      const runtime = {
        enabled: true,
        mode:
          options.mode === "LIVE"
            ? ("live" as const)
            : ("staging_sandbox" as const),
        nodeEnv: "production",
        secretKey: options.secretKey,
      };
      const readCurrent = async () =>
        (await current()) &&
        (
          await query(
            `select kxra_private.${prefix}live_paid_read_current($1::uuid) value`,
            [reconciliation_id],
          )
        ).rows[0]?.value === true;
      const evidenceDeps = {
        ...common,
        runtime,
        transport: options.transport ?? fetch,
        stillCurrent: readCurrent,
        nowSeconds: options.nowSeconds,
      };
      const payment = await (
        options.mode === "LIVE"
          ? readLiveStripePaymentEvidence
          : readStagingSandboxStripePaymentEvidence
      )(
        {
          ...evidenceDeps,
          resolveBinding: async () => ({
            execution_scope: r.execution_scope,
            binding: {
              ...base,
              account_id: configuration.execution_scope.account_id,
              mode: runtime.mode,
              expected_total_minor: c.expected_total_minor,
              tax_behavior: m.tax_behavior,
              automatic_tax: m.automatic_tax,
              activation_review_sha256: m.activation_review_sha256,
              terms_review_sha256: m.terms_review_sha256,
              tax_review_sha256: m.tax_review_sha256,
            },
          }),
        },
        { reconciliation_id },
        principal,
      );
      const consent = await (
        options.mode === "LIVE"
          ? readLiveCheckoutConsent
          : readStagingSandboxCheckoutConsent
      )(
        {
          ...evidenceDeps,
          resolveBinding: async () => ({
            execution_scope: r.execution_scope,
            binding: {
              ...base,
              checkout_session_id: c.checkout_session_id,
              monthly_amount_minor: modernCatalogueRow(
                configuration,
                String(c.offer_key),
              ).monthly_amount_minor,
              terms_review_sha256: p.terms_review_sha256,
              presentation: {
                terms_review_sha256: p.terms_review_sha256,
                presentation_sha256: p.presentation_sha256,
                terms_url: p.terms_url,
                message: p.message,
              },
              origin: options.origin,
            },
          }),
        },
        { reconciliation_id },
        principal,
      );
      if (!(await readCurrent())) throw Error("PAID_REFRESH_SUPERSEDED");
      const proof = (
        options.mode === "LIVE"
          ? buildLivePaidProof
          : buildStagingSandboxPaidProof
      )(
        c,
        p,
        payment,
        consent,
        (options.nowSeconds ?? (() => Math.floor(Date.now() / 1000)))(),
        common,
      );
      outcome = String(
        (
          await query(
            `select kxra_private.${prefix}commit_live_paid_refresh($1::uuid,$2::uuid,$3::uuid,$4::jsonb) value`,
            [
              subject.org_id,
              subject.claim_token,
              reconciliation_id,
              JSON.stringify(proof),
            ],
          )
        ).rows[0]?.value,
      );
      if (outcome === "ELIGIBLE" || outcome === "DENIED")
        for (const raw of wakes) {
          const wake = wakeSchema.parse(raw);
          assertModernScopeTag(
            wake.execution_scope,
            configuration.execution_scope,
          );
          if (
            wake.org_id === subject.org_id &&
            wake.binding_version === subject.binding_version
          ) {
            try {
              if (
                (
                  await query(
                    `select kxra_private.${prefix}ack_live_billing_wakeup($1::text,$2::uuid,$3::uuid) value`,
                    [wake.event_id, wake.claim_token, reconciliation_id],
                  )
                ).rows[0]?.value === "DONE"
              )
                acknowledged++;
            } catch {
              /* Exact-generation ACK may expire/change. Due discovery handles it. */
            }
          }
        }
    } catch {
      /* Fail closed; lease expires and bounded due scheduling rechecks later. */
    }
    outcomes.push({ org_id: subject.org_id, outcome, acknowledged });
  }
  return Object.freeze({ processed: outcomes.length, outcomes });
}
