import { z } from "zod";
import { validateCheckoutTermsPresentation } from "./live-checkout-consent";
import type { CheckoutTermsPresentation } from "./live-checkout-consent";

const digest = z.string().regex(/^[a-f0-9]{64}$/),
  integer = z.number().int().nonnegative(),
  pid = (p: string) => z.string().regex(new RegExp(`^${p}_[A-Za-z0-9]{6,}$`));
export const checkoutResultRequest = z
  .object({ request_id: z.uuid() })
  .strict();
export type CheckoutResultMode = "LIVE" | "STAGING_SANDBOX";
export type CheckoutResultScope = {
  scope_id: string;
  execution_mode: CheckoutResultMode;
  project_ref: string;
  account_id: string;
  api_version: "2025-07-30.basil";
  catalogue_revision: number;
  scope_sha256: string;
  livemode: boolean;
};
export type CheckoutResultConfiguration = {
  execution_scope: CheckoutResultScope;
  enabled: true;
  review_sha256: string;
  catalogue: readonly {
    offer_key: string;
    price_id: string;
    product_id: string;
    monthly_amount_minor: number;
    people: number;
    currency: "gbp";
    interval: "month";
  }[];
};
export type CheckoutResultIdentity = { actor_id: string; org_id: string };
const snapshotSchema = z
  .object({
    execution_scope: z.unknown(),
    attestation: z.unknown(),
    generation_sha256: digest,
    intent: z
      .object({
        id: z.uuid(),
        actor_id: z.uuid(),
        org_id: z.uuid(),
        kind: z.literal("CHECKOUT"),
        state: z.literal("CONSUMED"),
        customer_id: pid("cus"),
        provider_session_id: z.string(),
        offer_key: z.enum([
          "KXRA_STARTER_V1",
          "KXRA_TEAM_V1",
          "KXRA_BUSINESS_V1",
        ]),
        mapping_revision: integer.positive(),
        terms_review_sha256: digest,
        observed_version: integer,
        created_at: integer.positive(),
        expires_at: integer.positive(),
      })
      .strict(),
    binding_version: integer,
    mapping: z.object({
      account_id: pid("acct"),
      price_id: pid("price"),
      product_id: pid("prod"),
      offer_key: z.string(),
      revision: integer.positive(),
      terms_review_sha256: digest,
      tax_review_sha256: digest,
      tax_behavior: z.enum(["inclusive", "exclusive"]),
      automatic_tax: z.boolean(),
      payment_method: z.literal("card"),
    }),
    presentation: z.object({
      terms_review_sha256: digest,
      presentation_sha256: digest,
      terms_url: z.string(),
      message: z.string(),
    }),
  })
  .strict();
export type CheckoutResultSnapshot = z.infer<typeof snapshotSchema>;
export type CheckoutResultDependencies = {
  enabled: boolean;
  nodeEnv: string;
  origin: string;
  key: string | undefined;
  expectedMode: CheckoutResultMode;
  prepare: (id: string, principal: CheckoutResultIdentity) => Promise<unknown>;
  confirm: (
    id: string,
    generation: string,
    principal: CheckoutResultIdentity,
  ) => Promise<boolean>;
  // Must be the107 attested configuration factory, bound by the server facade.
  validateConfiguration: (
    attestation: unknown,
    key: string | undefined,
    mode: CheckoutResultMode,
  ) => CheckoutResultConfiguration;
  transport: (url: string, init: RequestInit) => Promise<Response>;
  nowSeconds?: () => number;
};
function fail(code: string): never {
  throw Error("CHECKOUT_RESULT_" + code);
}
function sameScope(actual: unknown, expected: CheckoutResultScope) {
  const keys = [
    "scope_id",
    "execution_mode",
    "project_ref",
    "account_id",
    "api_version",
    "catalogue_revision",
    "scope_sha256",
    "livemode",
  ];
  if (
    !actual ||
    typeof actual !== "object" ||
    Object.keys(actual).length !== keys.length ||
    keys.some(
      (k) =>
        (actual as Record<string, unknown>)[k] !==
        expected[k as keyof CheckoutResultScope],
    )
  )
    fail("SCOPE_DRIFT");
}
function metadata(scope: CheckoutResultScope) {
  return {
    kxra_execution_scope: scope.scope_id,
    kxra_execution_mode: scope.execution_mode,
    kxra_execution_sha256: scope.scope_sha256,
    kxra_execution_project: scope.project_ref,
  };
}
function assertMetadata(actual: unknown, expected: Record<string, string>) {
  if (
    !actual ||
    typeof actual !== "object" ||
    Object.entries(expected).some(
      ([k, v]) => (actual as Record<string, unknown>)[k] !== v,
    )
  )
    fail("PROVENANCE_MISMATCH");
}
async function boundedJson(response: Response, signal: AbortSignal) {
  if (!response.ok || !response.body) fail("PROVIDER_UNAVAILABLE");
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      signal.throwIfAborted();
      let abort: (() => void) | undefined;
      const interrupted = new Promise<never>((_, reject) => {
        abort = () => reject(Error("CHECKOUT_RESULT_READ_TIMEOUT"));
        signal.addEventListener("abort", abort, { once: true });
      });
      let next: ReadableStreamReadResult<Uint8Array>;
      try {
        next = await Promise.race([reader.read(), interrupted]);
      } finally {
        if (abort) signal.removeEventListener("abort", abort);
      }
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 100_000) {
        void reader.cancel().catch(() => {});
        fail("RESPONSE_TOO_LARGE");
      }
      chunks.push(next.value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      fail("INVALID_PROVIDER_JSON");
    }
  } catch {
    void reader.cancel().catch(() => {});
    fail("PROVIDER_READ_FAILED");
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* Pending aborted read; no body is retained. */
    }
  }
}

/** GET-only recovery of an existing durable session. Never returns/stores raw provider objects.
 * Pre/post ports are short independent SQL transactions; provider IO cannot hold their locks.
 */
export async function deliverCheckoutResult(
  deps: CheckoutResultDependencies,
  input: unknown,
  principal: CheckoutResultIdentity,
) {
  if (!deps.enabled || deps.nodeEnv !== "production") fail("DISABLED");
  if (
    !new RegExp(
      `^(sk|rk)_${deps.expectedMode === "LIVE" ? "live" : "test"}_[A-Za-z0-9_]{20,}$`,
    ).test(deps.key || "")
  )
    fail("KEY_MODE_MISMATCH");
  const { request_id } = checkoutResultRequest.parse(input);
  const identity = z
    .object({ actor_id: z.uuid(), org_id: z.uuid() })
    .strict()
    .parse(principal);
  const snapshot = snapshotSchema.parse(
    await deps.prepare(request_id, identity),
  );
  const c = deps.validateConfiguration(
      snapshot.attestation,
      deps.key,
      deps.expectedMode,
    ),
    scope = c.execution_scope;
  sameScope(snapshot.execution_scope, scope);
  if (
    !c.enabled ||
    scope.execution_mode !== deps.expectedMode ||
    scope.livemode !== (deps.expectedMode === "LIVE")
  )
    fail("MODE_MISMATCH");
  const { intent, mapping: m } = snapshot,
    now = deps.nowSeconds || (() => Math.floor(Date.now() / 1000));
  const plan = c.catalogue.find((p) => p.offer_key === intent.offer_key);
  if (!plan) fail("CATALOGUE_MISSING");
  const current = now();
  if (
    intent.id !== request_id ||
    intent.actor_id !== identity.actor_id ||
    intent.org_id !== identity.org_id ||
    intent.observed_version !== snapshot.binding_version ||
    intent.created_at > current ||
    intent.expires_at <= current ||
    intent.expires_at - intent.created_at > 1800
  )
    fail("INTENT_NOT_CURRENT");
  if (
    !new RegExp(
      `^cs_${scope.livemode ? "live" : "test"}_[A-Za-z0-9_]{6,}$`,
    ).test(intent.provider_session_id)
  )
    fail("SESSION_MODE_MISMATCH");
  if (
    m.account_id !== scope.account_id ||
    m.offer_key !== intent.offer_key ||
    m.revision !== intent.mapping_revision ||
    m.terms_review_sha256 !== intent.terms_review_sha256 ||
    m.price_id !== plan.price_id ||
    m.product_id !== plan.product_id
  )
    fail("MAPPING_DRIFT");
  const presentation: CheckoutTermsPresentation =
    validateCheckoutTermsPresentation(
      snapshot.presentation,
      m.terms_review_sha256,
      deps.origin,
    );
  const total = AbortSignal.timeout(20_000);
  async function get(path: string) {
    let response: Response;
    const signal = AbortSignal.any([total, AbortSignal.timeout(8_000)]);
    try {
      response = await deps.transport("https://api.stripe.com/v1/" + path, {
        method: "GET",
        redirect: "error",
        cache: "no-store",
        signal,
        headers: {
          Authorization: `Bearer ${deps.key}`,
          "Stripe-Version": scope.api_version,
        },
      });
    } catch {
      fail("PROVIDER_UNAVAILABLE");
    }
    return boundedJson(response, signal);
  }
  const account = z
    .object({
      id: z.string(),
      object: z.literal("account"),
      charges_enabled: z.literal(true),
      business_profile: z.object({ terms_of_service_url: z.string().url() }),
    })
    .parse(await get("account"));
  if (account.id !== scope.account_id) fail("ACCOUNT_MISMATCH");
  if (account.business_profile.terms_of_service_url !== presentation.terms_url)
    fail("ACCOUNT_TERMS_MISMATCH");
  const priceSchema = z.object({
    id: z.string(),
    object: z.literal("price"),
    livemode: z.boolean(),
    active: z.literal(true),
    currency: z.literal("gbp"),
    unit_amount: integer.positive(),
    type: z.literal("recurring"),
    billing_scheme: z.literal("per_unit"),
    tax_behavior: z.enum(["inclusive", "exclusive"]),
    recurring: z.object({
      interval: z.literal("month"),
      interval_count: z.literal(1),
      usage_type: z.literal("licensed"),
      trial_period_days: z.union([z.null(), z.literal(0)]).optional(),
    }),
    transform_quantity: z.null().optional(),
    custom_unit_amount: z.null().optional(),
    product: z.object({
      id: z.string(),
      object: z.literal("product"),
      livemode: z.boolean(),
      active: z.literal(true),
    }),
  });
  function checkPrice(value: unknown) {
    const p = priceSchema.parse(value);
    if (
      p.id !== plan!.price_id ||
      p.product.id !== plan!.product_id ||
      p.unit_amount !== plan!.monthly_amount_minor ||
      p.tax_behavior !== m.tax_behavior ||
      p.livemode !== scope.livemode ||
      p.product.livemode !== scope.livemode
    )
      fail("PRICE_MISMATCH");
    return p;
  }
  checkPrice(
    await get(`prices/${encodeURIComponent(m.price_id)}?expand[]=product`),
  );
  const customer = z
    .object({
      id: z.string(),
      object: z.literal("customer"),
      livemode: z.boolean(),
      deleted: z.literal(false).optional(),
      metadata: z.record(z.string(), z.string()),
    })
    .parse(await get(`customers/${encodeURIComponent(intent.customer_id)}`));
  if (
    customer.id !== intent.customer_id ||
    customer.livemode !== scope.livemode
  )
    fail("CUSTOMER_MISMATCH");
  assertMetadata(customer.metadata, {
    ...metadata(scope),
    kxra_org: intent.org_id,
    kxra_offer: intent.offer_key,
    kxra_mapping_revision: String(intent.mapping_revision),
    kxra_terms_sha256: m.terms_review_sha256,
  });
  const session = z
    .object({
      id: z.string(),
      object: z.literal("checkout.session"),
      livemode: z.boolean(),
      customer: z.string(),
      url: z.string().url(),
      created: integer.positive(),
      expires_at: integer.positive(),
      mode: z.literal("subscription"),
      status: z.literal("open"),
      payment_status: z.literal("unpaid"),
      client_reference_id: z.uuid(),
      currency: z.literal("gbp"),
      success_url: z.string().url(),
      cancel_url: z.string().url(),
      total_details: z.object({
        amount_discount: z.literal(0),
        amount_shipping: z.literal(0),
      }),
      amount_subtotal: integer.positive(),
      payment_method_types: z.array(z.literal("card")).length(1),
      allow_promotion_codes: z.literal(false),
      automatic_tax: z.object({ enabled: z.boolean() }),
      consent_collection: z.object({ terms_of_service: z.literal("required") }),
      custom_text: z.object({
        terms_of_service_acceptance: z.object({ message: z.string() }),
      }),
      metadata: z.record(z.string(), z.string()),
      line_items: z.object({
        object: z.literal("list"),
        has_more: z.literal(false),
        data: z
          .array(z.object({ quantity: z.literal(1), price: priceSchema }))
          .length(1),
      }),
    })
    .parse(
      await get(
        `checkout/sessions/${encodeURIComponent(intent.provider_session_id)}?expand[]=line_items.data.price.product`,
      ),
    );
  checkPrice(session.line_items.data[0].price);
  if (
    session.success_url !== `${deps.origin}/os/start?billing=returned` ||
    session.cancel_url !== `${deps.origin}/os/start?billing=cancelled` ||
    session.id !== intent.provider_session_id ||
    session.livemode !== scope.livemode ||
    session.customer !== intent.customer_id ||
    session.client_reference_id !== intent.id ||
    session.amount_subtotal !== plan.monthly_amount_minor ||
    session.automatic_tax.enabled !== m.automatic_tax ||
    session.custom_text.terms_of_service_acceptance.message !==
      presentation.message ||
    session.created < intent.created_at - 60 ||
    session.created > now() + 60 ||
    session.expires_at <= now() ||
    session.expires_at > session.created + 86460
  )
    fail("SESSION_MISMATCH");
  assertMetadata(session.metadata, {
    ...metadata(scope),
    kxra_live_intent_id: intent.id,
    kxra_catalogue_offer: intent.offer_key,
    kxra_mapping_revision: String(intent.mapping_revision),
    kxra_terms_sha256: m.terms_review_sha256,
    kxra_consent_presentation_sha256: presentation.presentation_sha256,
  });
  const url = new URL(session.url);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "checkout.stripe.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== `/c/pay/${session.id}`
  )
    fail("URL_REJECTED");
  if (
    !(await deps.confirm(request_id, snapshot.generation_sha256, identity)) ||
    session.expires_at <= now() ||
    intent.expires_at <= now()
  )
    fail("FINAL_FENCE_REJECTED");
  return {
    state: "READY" as const,
    request_id,
    url: url.toString(),
    expires_at: session.expires_at,
    delivery_ready: true as const,
    dispatch_ready: false as const,
    entitlement_authority: false as const,
  };
}
