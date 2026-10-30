import { billingBodyBuffer } from "./billing-body-buffer";
import { z } from "zod";
import {
  assertModernProviderMode,
  assertModernScopeTag,
  modernCatalogueRow,
  validateModernBillingConfiguration,
  type ModernBillingConfiguration,
  type ModernExecutionMode,
  type ModernRuntimeIdentity,
} from "./modern-billing-scope";
import type { LiveBillingTransport } from "./live-catalogue-stripe";
const id = (p: string) =>
  z.string().regex(new RegExp(`^${p}_[A-Za-z0-9]{6,}$`));
const integer = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const paidRefreshSubjectSchema = z
  .object({
    execution_scope: z.unknown(),
    org_id: z.uuid(),
    claim_token: z.uuid(),
    binding_version: z.number().int().nonnegative(),
    customer_id: id("cus"),
    subscription_id: id("sub"),
    checkout_intent_id: z.uuid(),
    checkout_session_id: z.string(),
    checkout_actor_id: z.uuid(),
    actor_id: z.uuid(),
    offer_key: z.string(),
    mapping_revision: integer,
    mapping: z.record(z.string(), z.unknown()),
    policy: z.record(z.string(), z.unknown()),
    lease_until: integer,
  })
  .strict();
export type PaidRefreshSubject = z.infer<typeof paidRefreshSubjectSchema>;
/** Reads the current provider subscription/invoice BEFORE reserving 0104. No POST,
 * retries or client invoice/period/total inputs. Existing evidence adapters verify money. */
export async function readPaidRefreshPreflight(
  deps: {
    execution: ModernBillingConfiguration;
    runtimeIdentity: ModernRuntimeIdentity;
    secretKey: string;
    mode: ModernExecutionMode;
    transport: LiveBillingTransport;
    stillCurrent: () => Promise<boolean>;
    nowSeconds?: () => number;
  },
  input: unknown,
) {
  const config = validateModernBillingConfiguration(
    deps.execution,
    deps.runtimeIdentity,
    deps.secretKey,
    deps.mode,
  );
  const s = paidRefreshSubjectSchema.parse(input),
    scope = config.execution_scope;
  assertModernScopeTag(s.execution_scope, scope);
  const row = modernCatalogueRow(config, s.offer_key),
    now = deps.nowSeconds || (() => Math.floor(Date.now() / 1000));
  if (s.lease_until <= now() || !(await deps.stillCurrent()))
    throw Error("PAID_REFRESH_SUPERSEDED");
  const deadline = Date.now() + 20_000;
  async function get(path: string): Promise<unknown> {
    if (Date.now() >= deadline) throw Error("PAID_PREFLIGHT_BUDGET");
    const r = await deps.transport(`https://api.stripe.com/v1/${path}`, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(8_000, deadline - Date.now())),
      ),
      headers: {
        Authorization: `Bearer ${deps.secretKey}`,
        "Stripe-Version": scope.api_version,
      },
    });
    if (!r.ok || !r.body) throw Error("PAID_PREFLIGHT_PROVIDER_UNVERIFIED");
    const reader = r.body.getReader(),
      chunks = billingBodyBuffer(100_000);
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 100_000 || Date.now() >= deadline) {
          void reader.cancel().catch(() => {});
          throw Error("PAID_PREFLIGHT_BUDGET");
        }
        try {
          chunks.append(value);
        } catch (error) {
          void reader.cancel().catch(() => {});
          throw error;
        }
      }
    } finally {
      reader.releaseLock();
    }
    const value: unknown = JSON.parse(chunks.finish().toString("utf8"));
    assertModernProviderMode(value, scope);
    return value;
  }
  const account = z
    .object({ id: z.literal(scope.account_id), object: z.literal("account") })
    .parse(await get("account"));
  const schema = z.object({
    id: z.literal(s.subscription_id),
    object: z.literal("subscription"),
    livemode: z.literal(scope.livemode),
    customer: z.literal(s.customer_id),
    latest_invoice: id("in"),
    metadata: z.object({
      kxra_live_intent_id: z.literal(s.checkout_intent_id),
      kxra_catalogue_offer: z.literal(s.offer_key),
      kxra_mapping_revision: z.literal(String(s.mapping_revision)),
      kxra_execution_scope: z.literal(scope.scope_id),
      kxra_execution_mode: z.literal(scope.execution_mode),
      kxra_execution_sha256: z.literal(scope.scope_sha256),
      kxra_execution_project: z.literal(scope.project_ref),
    }),
    items: z.object({
      has_more: z.literal(false),
      data: z
        .array(
          z.object({
            id: id("si"),
            quantity: z.literal(1),
            current_period_start: integer,
            current_period_end: integer,
            price: z.object({ id: z.literal(row.price_id) }),
          }),
        )
        .length(1),
    }),
  });
  const sub = schema.parse(await get(`subscriptions/${s.subscription_id}`)),
    item = sub.items.data[0];
  const invoice = z
    .object({
      id: z.literal(sub.latest_invoice),
      object: z.literal("invoice"),
      livemode: z.literal(scope.livemode),
      customer: z.literal(s.customer_id),
      currency: z.literal("gbp"),
      total: integer,
      subtotal: z.literal(row.monthly_amount_minor),
      parent: z.object({
        type: z.literal("subscription_details"),
        subscription_details: z.object({
          subscription: z.literal(s.subscription_id),
        }),
      }),
      automatic_tax: z.object({
        enabled: z.boolean(),
        status: z.string().nullable(),
      }),
    })
    .parse(await get(`invoices/${sub.latest_invoice}`));
  if (
    item.current_period_end <= item.current_period_start ||
    invoice.total < row.monthly_amount_minor ||
    (s.mapping.tax_behavior === "inclusive" &&
      invoice.total !== row.monthly_amount_minor) ||
    invoice.automatic_tax.enabled !== s.mapping.automatic_tax ||
    (invoice.automatic_tax.enabled &&
      invoice.automatic_tax.status !== "complete")
  )
    throw Error("PAID_PREFLIGHT_TOTAL_OR_PERIOD_UNVERIFIED");
  const again = schema.parse(await get(`subscriptions/${s.subscription_id}`));
  if (
    JSON.stringify(again) !== JSON.stringify(sub) ||
    Date.now() >= deadline ||
    s.lease_until <= now() ||
    !(await deps.stillCurrent())
  )
    throw Error("PAID_REFRESH_SUPERSEDED");
  void account;
  return Object.freeze({
    expected_total_minor: invoice.total,
    invoice_id: invoice.id,
    subscription_item_id: item.id,
    period_start: item.current_period_start,
    period_end: item.current_period_end,
  });
}
