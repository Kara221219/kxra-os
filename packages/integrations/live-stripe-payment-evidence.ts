import crypto from "node:crypto";
import { z } from "zod";
import { approvedPlan } from "../workspace/approved-catalogue";
import {
  LIVE_STRIPE_API_VERSION,
  type LiveBillingPrincipal,
  type LiveBillingTransport,
} from "./live-catalogue-stripe";

/** Read-only, UNWIRED evidence contract. Does not connect, mutate Stripe/DB or grant access.
 * All binding/config/principal inputs belong to the server, never request bodies.
 * COLLECTED means observed captured card collection, not bank payout or irrevocable settlement.
 */
const id = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{6,}$`));
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const catalogue = {
  KXRA_STARTER_V1: ["price_1UTbq7C84VkhhIRzkBHEHivV", "prod_VUb2kv7rUiTeiu"],
  KXRA_TEAM_V1: ["price_1UTbrLC84VkhhIRzMN225zAr", "prod_VUb3rh9e9eNw5a"],
  KXRA_BUSINESS_V1: ["price_1UTlt5C84VkhhIRzGztXl6ey", "prod_VUlPLWhBBf7lmP"],
} as const;
const bindingSchema = z
  .object({
    reconciliation_id: z.uuid(),
    actor_id: z.uuid(),
    org_id: z.uuid(),
    binding_version: integer,
    mapping_revision: integer.positive(),
    account_id: z.literal("acct_1Rv3KdC84VkhhIRz"),
    mode: z.literal("live"),
    offer_key: z.enum(["KXRA_STARTER_V1", "KXRA_TEAM_V1", "KXRA_BUSINESS_V1"]),
    price_id: id("price"),
    product_id: id("prod"),
    customer_id: id("cus"),
    subscription_id: id("sub"),
    subscription_item_id: id("si"),
    invoice_id: id("in"),
    checkout_intent_id: z.uuid(),
    period_start: integer.positive(),
    period_end: integer.positive(),
    // Gross total must come from reviewed deterministic server tax computation. No tax rate invented here.
    expected_total_minor: integer.positive(),
    tax_behavior: z.enum(["inclusive", "exclusive"]),
    automatic_tax: z.boolean(),
    activation_review_sha256: digest,
    terms_review_sha256: digest,
    tax_review_sha256: digest,
    created_at: integer.positive(),
    expires_at: integer.positive(),
  })
  .strict()
  .refine(
    (b) =>
      b.price_id === catalogue[b.offer_key][0] &&
      b.product_id === catalogue[b.offer_key][1] &&
      b.period_end > b.period_start,
    "REVIEWED_PAYMENT_BINDING_REQUIRED",
  );
export type LivePaymentBinding = z.infer<typeof bindingSchema>;
export type PaymentEvidenceState =
  | "COLLECTED"
  | "PENDING"
  | "FAILED"
  | "CANCELLED"
  | "REFUNDED"
  | "DISPUTED"
  | "MISMATCHED"
  | "UNVERIFIED"
  | "VERSION_RACE";
export type LivePaymentEvidence = Readonly<{
  version: 1;
  state: PaymentEvidenceState;
  reason: string;
  org_id: string;
  reconciliation_id: string;
  binding_version: number;
  mapping_revision: number;
  invoice_id: string;
  subscription_id: string;
  customer_id: string;
  offer_key: string;
  period_start: number;
  period_end: number;
  currency: "GBP";
  expected_total_minor: number;
  collected_minor: number | null;
  refunded_minor: number | null;
  payment_intent_id: string | null;
  charge_id: string | null;
  subscription_status: string | null;
  observation_started_at: number;
  observed_at: number;
  source_sha256: string;
  requires_recheck: true;
  entitlement_authority: false;
  payout_authority: false;
}>;
export type LivePaymentEvidenceDependencies = {
  runtime?: {
    enabled: boolean;
    mode: "live";
    nodeEnv: string;
    secretKey: string;
  };
  transport: LiveBillingTransport;
  resolveBinding: (
    reconciliationId: string,
    principal: LiveBillingPrincipal,
  ) => Promise<unknown>;
  // Authoritative DB generation/mapping/identity recheck after provider reads; must be server-owned.
  stillCurrent: (binding: Readonly<LivePaymentBinding>) => Promise<boolean>;
  nowSeconds?: () => number;
};
class EvidenceFault extends Error {
  constructor(
    readonly state: PaymentEvidenceState,
    readonly reason: string,
  ) {
    super(reason);
  }
}
function mismatch(condition: boolean, reason: string): asserts condition {
  if (!condition) throw new EvidenceFault("MISMATCHED", reason);
}
function unverified(reason: string): never {
  throw new EvidenceFault("UNVERIFIED", reason);
}
const list = <T extends z.ZodType>(schema: T) =>
  z.object({
    object: z.literal("list"),
    has_more: z.boolean(),
    data: z.array(schema).max(2),
  });
const period = z.object({ start: integer.positive(), end: integer.positive() });
const lineSchema = z.object({
  id: z.string(),
  object: z.literal("line_item"),
  invoice: id("in"),
  livemode: z.boolean(),
  currency: z.string(),
  amount: integer,
  quantity: integer,
  period,
  pricing: z.object({
    type: z.literal("price_details"),
    price_details: z.object({ price: id("price"), product: id("prod") }),
  }),
  parent: z.object({
    type: z.literal("subscription_item_details"),
    subscription_item_details: z.object({
      subscription: id("sub"),
      subscription_item: id("si"),
      proration: z.boolean(),
    }),
  }),
  discount_amounts: z.array(z.unknown()),
  pretax_credit_amounts: z.array(z.unknown()).nullable().optional(),
});
const invoiceSchema = z.object({
  id: id("in"),
  object: z.literal("invoice"),
  livemode: z.boolean(),
  customer: id("cus"),
  currency: z.string(),
  status: z.enum(["draft", "open", "paid", "uncollectible", "void"]),
  billing_reason: z.string(),
  collection_method: z.string(),
  subtotal: integer,
  total: integer,
  amount_due: integer,
  amount_paid: integer,
  amount_remaining: integer,
  amount_overpaid: integer,
  starting_balance: z.number().int(),
  pre_payment_credit_notes_amount: integer,
  post_payment_credit_notes_amount: integer,
  total_discount_amounts: z.array(z.unknown()),
  automatic_tax: z.object({
    enabled: z.boolean(),
    status: z.string().nullable(),
  }),
  parent: z.object({
    type: z.literal("subscription_details"),
    subscription_details: z.object({ subscription: id("sub") }),
  }),
  lines: list(lineSchema),
});
const paymentSchema = z.object({
  id: id("inpay"),
  object: z.literal("invoice_payment"),
  livemode: z.boolean(),
  invoice: id("in"),
  currency: z.string(),
  status: z.enum(["open", "paid", "canceled"]),
  amount_requested: integer,
  amount_paid: integer.nullable(),
  payment: z.object({ type: z.string(), payment_intent: id("pi").optional() }),
});
const piSchema = z.object({
  id: id("pi"),
  object: z.literal("payment_intent"),
  livemode: z.boolean(),
  customer: id("cus"),
  currency: z.string(),
  amount: integer,
  amount_received: integer,
  amount_capturable: integer,
  latest_charge: id("ch").nullable(),
  status: z.enum([
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "processing",
    "requires_capture",
    "canceled",
    "succeeded",
  ]),
  last_payment_error: z
    .object({})
    .nullable()
    .transform((value) => (value === null ? null : { present: true })),
  on_behalf_of: z.null(),
  transfer_data: z.null(),
});
const chargeSchema = z.object({
  id: id("ch"),
  object: z.literal("charge"),
  livemode: z.boolean(),
  customer: id("cus"),
  currency: z.string(),
  payment_intent: id("pi"),
  amount: integer,
  amount_captured: integer,
  amount_refunded: integer,
  paid: z.boolean(),
  captured: z.boolean(),
  refunded: z.boolean(),
  disputed: z.boolean(),
  status: z.enum(["succeeded", "pending", "failed"]),
  payment_method_details: z.object({ type: z.string() }),
  on_behalf_of: z.null(),
  transfer_data: z.null(),
});
const subSchema = z.object({
  id: id("sub"),
  object: z.literal("subscription"),
  livemode: z.boolean(),
  customer: id("cus"),
  status: z.string(),
  latest_invoice: id("in").nullable(),
  metadata: z.object({
    kxra_live_intent_id: z.uuid(),
    kxra_catalogue_offer: z.string(),
    kxra_mapping_revision: z.string(),
  }),
  items: list(
    z.object({
      id: id("si"),
      quantity: integer,
      current_period_start: integer.positive(),
      current_period_end: integer.positive(),
      price: z.object({ id: id("price") }),
    }),
  ),
});
const priceSchema = z.object({
  id: id("price"),
  object: z.literal("price"),
  livemode: z.boolean(),
  currency: z.string(),
  unit_amount: integer,
  billing_scheme: z.string(),
  tax_behavior: z.string(),
  type: z.string(),
  recurring: z.object({
    interval: z.string(),
    interval_count: integer,
    usage_type: z.string(),
  }),
  transform_quantity: z.null(),
  custom_unit_amount: z.null(),
  product: z.object({
    id: id("prod"),
    object: z.literal("product"),
    livemode: z.boolean(),
  }),
});

/** GET only, maximum 12 reads, 100KB/read and a 30-second observation budget. No retries.
 * Multi-allocation/out-of-band/adjusted invoices explicitly remain UNVERIFIED in this v1;
 * they are not mistaken for unpaid or silently treated as settled.
 */
export async function readLiveStripePaymentEvidence(
  deps: LivePaymentEvidenceDependencies,
  input: unknown,
  principalInput: LiveBillingPrincipal,
): Promise<LivePaymentEvidence> {
  const runtime = deps.runtime;
  if (
    !runtime?.enabled ||
    runtime.mode !== "live" ||
    runtime.nodeEnv !== "production"
  )
    throw Error("LIVE_PAYMENT_EVIDENCE_DISABLED");
  if (!/^(sk|rk)_live_[A-Za-z0-9_]{20,}$/.test(runtime.secretKey))
    throw Error("LIVE_PAYMENT_EVIDENCE_LIVE_KEY_REQUIRED");
  const { reconciliation_id } = z
    .object({ reconciliation_id: z.uuid() })
    .strict()
    .parse(input);
  const principal = z
    .object({ actor_id: z.uuid(), org_id: z.uuid() })
    .strict()
    .parse(principalInput);
  const b = bindingSchema.parse(
    await deps.resolveBinding(reconciliation_id, principal),
  );
  const now = deps.nowSeconds || (() => Math.floor(Date.now() / 1000));
  const started = now();
  if (
    b.reconciliation_id !== reconciliation_id ||
    b.actor_id !== principal.actor_id ||
    b.org_id !== principal.org_id
  )
    throw Error("LIVE_PAYMENT_BINDING_NOT_AUTHORIZED");
  if (
    b.created_at > started ||
    b.expires_at <= started ||
    b.expires_at - b.created_at > 300
  )
    throw Error("LIVE_PAYMENT_BINDING_EXPIRED");
  const plan = approvedPlan(b.offer_key);
  if (
    b.expected_total_minor < plan.monthly_amount_minor ||
    (b.tax_behavior === "inclusive" &&
      b.expected_total_minor !== plan.monthly_amount_minor)
  )
    throw Error("LIVE_PAYMENT_TAX_TOTAL_UNREVIEWED");
  const deadline = Date.now() + 30_000;
  let calls = 0;
  const sources: unknown[] = [];
  let collected: number | null = null,
    refunded: number | null = null,
    piId: string | null = null,
    chargeId: string | null = null,
    subStatus: string | null = null;
  function result(
    state: PaymentEvidenceState,
    reason: string,
  ): LivePaymentEvidence {
    return Object.freeze({
      version: 1,
      state,
      reason,
      org_id: b.org_id,
      reconciliation_id,
      binding_version: b.binding_version,
      mapping_revision: b.mapping_revision,
      invoice_id: b.invoice_id,
      subscription_id: b.subscription_id,
      customer_id: b.customer_id,
      offer_key: b.offer_key,
      period_start: b.period_start,
      period_end: b.period_end,
      currency: "GBP",
      expected_total_minor: b.expected_total_minor,
      collected_minor: collected,
      refunded_minor: refunded,
      payment_intent_id: piId,
      charge_id: chargeId,
      subscription_status: subStatus,
      observation_started_at: started,
      observed_at: now(),
      source_sha256: crypto
        .createHash("sha256")
        .update(JSON.stringify(sources))
        .digest("hex"),
      requires_recheck: true,
      entitlement_authority: false,
      payout_authority: false,
    });
  }
  async function finish(
    state: PaymentEvidenceState,
    reason: string,
  ): Promise<LivePaymentEvidence> {
    try {
      if (!(await deps.stillCurrent(Object.freeze({ ...b }))))
        return result("VERSION_RACE", "BINDING_CHANGED_DURING_READ");
    } catch {
      return result("UNVERIFIED", "BINDING_RECHECK_UNVERIFIED");
    }
    if (now() >= b.expires_at || Date.now() >= deadline)
      return result("UNVERIFIED", "OBSERVATION_EXPIRED");
    return result(state, reason);
  }
  async function get<T extends z.ZodType>(
    path: string,
    schema: T,
  ): Promise<z.infer<T>> {
    if (++calls > 12 || Date.now() >= deadline)
      unverified("OBSERVATION_BUDGET_EXCEEDED");
    let response: Response;
    try {
      response = await deps.transport(`https://api.stripe.com/v1/${path}`, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(
          Math.max(1, Math.min(15_000, deadline - Date.now())),
        ),
        headers: {
          Authorization: `Bearer ${runtime!.secretKey}`,
          "Stripe-Version": LIVE_STRIPE_API_VERSION,
        },
      });
    } catch {
      unverified("PROVIDER_UNAVAILABLE");
    }
    if (!response.ok || !response.body)
      unverified("PROVIDER_RESPONSE_UNVERIFIED");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 100_000 || Date.now() >= deadline) {
          await reader.cancel();
          unverified("RESPONSE_BUDGET_EXCEEDED");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  }
  try {
    const a = await get(
      "account",
      z.object({ id: id("acct"), object: z.literal("account") }),
    );
    mismatch(a.id === b.account_id, "ACCOUNT_MISMATCH");
    sources.push(a);
    const price = await get(
      `prices/${b.price_id}?expand[]=product`,
      priceSchema,
    );
    mismatch(price.livemode && price.product.livemode, "MODE_MISMATCH");
    mismatch(
      price.id === b.price_id &&
        price.product.id === b.product_id &&
        price.currency === "gbp" &&
        price.unit_amount === plan.monthly_amount_minor,
      "CATALOGUE_MISMATCH",
    );
    mismatch(
      price.type === "recurring" &&
        price.billing_scheme === "per_unit" &&
        price.recurring.interval === "month" &&
        price.recurring.interval_count === 1 &&
        price.recurring.usage_type === "licensed" &&
        price.tax_behavior === b.tax_behavior,
      "PRICE_TERMS_MISMATCH",
    );
    sources.push(price);
    const sub = await get(`subscriptions/${b.subscription_id}`, subSchema);
    subStatus = sub.status;
    mismatch(
      sub.id === b.subscription_id &&
        sub.customer === b.customer_id &&
        sub.livemode,
      "SUBSCRIPTION_BINDING_MISMATCH",
    );
    mismatch(
      !sub.items.has_more &&
        sub.items.data.length === 1 &&
        sub.latest_invoice === b.invoice_id,
      "SUBSCRIPTION_INVOICE_MISMATCH",
    );
    mismatch(
      sub.metadata.kxra_live_intent_id === b.checkout_intent_id &&
        sub.metadata.kxra_catalogue_offer === b.offer_key &&
        sub.metadata.kxra_mapping_revision === String(b.mapping_revision),
      "SUBSCRIPTION_PROVENANCE_MISMATCH",
    );
    const si = sub.items.data[0];
    mismatch(
      si.id === b.subscription_item_id &&
        si.quantity === 1 &&
        si.price.id === b.price_id &&
        si.current_period_start === b.period_start &&
        si.current_period_end === b.period_end,
      "SUBSCRIPTION_PERIOD_MISMATCH",
    );
    sources.push(sub);
    const invoice = await get(`invoices/${b.invoice_id}`, invoiceSchema);
    mismatch(
      invoice.id === b.invoice_id &&
        invoice.customer === b.customer_id &&
        invoice.livemode &&
        invoice.currency === "gbp" &&
        invoice.parent.subscription_details.subscription === b.subscription_id,
      "INVOICE_BINDING_MISMATCH",
    );
    mismatch(
      invoice.lines.data.length === 1 && !invoice.lines.has_more,
      "INVOICE_LINES_MISMATCH",
    );
    const line = invoice.lines.data[0];
    mismatch(
      line.invoice === b.invoice_id &&
        line.livemode &&
        line.currency === "gbp" &&
        line.quantity === 1 &&
        line.amount === plan.monthly_amount_minor &&
        line.pricing.price_details.price === b.price_id &&
        line.pricing.price_details.product === b.product_id,
      "INVOICE_PRICE_MISMATCH",
    );
    mismatch(
      line.parent.subscription_item_details.subscription ===
        b.subscription_id &&
        line.parent.subscription_item_details.subscription_item ===
          b.subscription_item_id &&
        !line.parent.subscription_item_details.proration &&
        line.period.start === b.period_start &&
        line.period.end === b.period_end,
      "INVOICE_PERIOD_MISMATCH",
    );
    mismatch(
      invoice.subtotal === plan.monthly_amount_minor &&
        invoice.total === b.expected_total_minor &&
        invoice.amount_due === b.expected_total_minor &&
        invoice.amount_overpaid === 0 &&
        invoice.starting_balance === 0,
      "INVOICE_TOTAL_MISMATCH",
    );
    mismatch(
      invoice.automatic_tax.enabled === b.automatic_tax,
      "INVOICE_TAX_MISMATCH",
    );
    if (b.automatic_tax && invoice.automatic_tax.status !== "complete")
      unverified("TAX_NOT_COMPLETE");
    if (
      !["subscription_create", "subscription_cycle"].includes(
        invoice.billing_reason,
      ) ||
      invoice.collection_method !== "charge_automatically" ||
      invoice.total_discount_amounts.length ||
      line.discount_amounts.length ||
      line.pretax_credit_amounts?.length
    )
      unverified("ADJUSTMENTS_NOT_REVIEWED");
    sources.push(invoice);
    if (invoice.status === "void") return finish("CANCELLED", "INVOICE_VOID");
    if (invoice.status === "uncollectible")
      return finish("FAILED", "INVOICE_UNCOLLECTIBLE");
    if (invoice.status === "draft") return finish("PENDING", "INVOICE_DRAFT");
    const paymentsPath = `invoice_payments?invoice=${b.invoice_id}&limit=2`;
    const payments = await get(paymentsPath, list(paymentSchema));
    sources.push(payments);
    if (payments.has_more || payments.data.length > 1)
      unverified("MULTIPLE_ALLOCATIONS_REQUIRE_REVIEW");
    if (payments.data.length === 0)
      return finish(
        invoice.status === "paid" ? "UNVERIFIED" : "PENDING",
        invoice.status === "paid"
          ? "PAID_WITHOUT_PROVIDER_ALLOCATION"
          : "PAYMENT_ALLOCATION_PENDING",
      );
    const payment = payments.data[0];
    mismatch(
      payment.invoice === b.invoice_id &&
        payment.livemode &&
        payment.currency === "gbp" &&
        payment.amount_requested === b.expected_total_minor,
      "PAYMENT_ALLOCATION_MISMATCH",
    );
    if (
      payment.payment.type !== "payment_intent" ||
      !payment.payment.payment_intent
    )
      unverified("PAYMENT_TYPE_UNVERIFIED");
    piId = payment.payment.payment_intent;
    const pi = await get(`payment_intents/${piId}`, piSchema);
    sources.push(pi);
    mismatch(
      pi.id === piId &&
        pi.customer === b.customer_id &&
        pi.livemode &&
        pi.currency === "gbp" &&
        pi.amount === b.expected_total_minor,
      "PAYMENT_INTENT_MISMATCH",
    );
    let charge: z.infer<typeof chargeSchema> | null = null;
    if (pi.latest_charge) {
      chargeId = pi.latest_charge;
      charge = await get(`charges/${chargeId}`, chargeSchema);
      sources.push(charge);
      mismatch(
        charge.id === chargeId &&
          charge.payment_intent === piId &&
          charge.customer === b.customer_id &&
          charge.livemode &&
          charge.currency === "gbp" &&
          charge.amount === b.expected_total_minor &&
          charge.amount_refunded <= charge.amount_captured,
        "CHARGE_BINDING_MISMATCH",
      );
      if (charge.payment_method_details.type !== "card")
        unverified("PAYMENT_METHOD_UNREVIEWED");
      refunded = charge.amount_refunded;
      collected = charge.amount_captured;
    }
    // Re-read money objects, allocation and invoice before returning any financial conclusion.
    // Detects observable interleaving, not an atomic provider snapshot; later events still recheck.
    const finalInvoice = await get(`invoices/${b.invoice_id}`, invoiceSchema);
    const finalPayments = await get(paymentsPath, list(paymentSchema));
    const finalPi = await get(`payment_intents/${piId}`, piSchema);
    const finalCharge = charge
      ? await get(`charges/${chargeId}`, chargeSchema)
      : null;
    if (
      JSON.stringify([invoice, payments, pi, charge]) !==
      JSON.stringify([finalInvoice, finalPayments, finalPi, finalCharge])
    )
      unverified("PROVIDER_CHANGED_DURING_READ");
    if (now() >= b.expires_at || Date.now() >= deadline)
      unverified("OBSERVATION_EXPIRED");
    if (charge?.disputed) return finish("DISPUTED", "CHARGE_DISPUTED");
    if (charge && (charge.refunded || charge.amount_refunded > 0))
      return finish(
        "REFUNDED",
        charge.amount_refunded === charge.amount_captured
          ? "CHARGE_REFUNDED"
          : "CHARGE_PARTIALLY_REFUNDED",
      );
    if (
      invoice.pre_payment_credit_notes_amount ||
      invoice.post_payment_credit_notes_amount
    )
      unverified("CREDIT_NOTE_POLICY_UNREVIEWED");
    if (pi.status === "canceled" || payment.status === "canceled")
      return finish("CANCELLED", "PAYMENT_CANCELLED");
    if (
      charge?.status === "failed" ||
      (pi.status === "requires_payment_method" &&
        pi.last_payment_error !== null)
    )
      return finish("FAILED", "PAYMENT_FAILED");
    if (
      invoice.status !== "paid" ||
      payment.status !== "paid" ||
      pi.status !== "succeeded" ||
      !charge ||
      !charge.paid ||
      !charge.captured ||
      charge.status !== "succeeded"
    )
      return finish("PENDING", "PAYMENT_NOT_FULLY_COLLECTED");
    mismatch(
      payment.amount_paid === b.expected_total_minor &&
        invoice.amount_paid === b.expected_total_minor &&
        invoice.amount_remaining === 0 &&
        pi.amount_received === b.expected_total_minor &&
        pi.amount_capturable === 0 &&
        charge.amount_captured === b.expected_total_minor,
      "COLLECTION_AMOUNT_MISMATCH",
    );
    return finish("COLLECTED", "MATCHED_CAPTURED_CARD_COLLECTION_NOT_PAYOUT");
  } catch (error) {
    if (error instanceof EvidenceFault)
      return finish(error.state, error.reason);
    return finish("UNVERIFIED", "PROVIDER_SCHEMA_OR_READ_UNVERIFIED");
  }
}
