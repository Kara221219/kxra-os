import crypto from "node:crypto";
import { approvedPlan } from "../workspace/approved-catalogue";
import { z } from "zod";
import type {
  LiveBillingPrincipal,
  LiveBillingTransport,
} from "./live-catalogue-stripe";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const id = (p: string) =>
  z.string().regex(new RegExp(`^${p}_[A-Za-z0-9]{6,}$`));
const offer = z.enum(["KXRA_STARTER_V1", "KXRA_TEAM_V1", "KXRA_BUSINESS_V1"]);
const version = "2025-07-30.basil";
export type CheckoutTermsPresentation = {
  terms_review_sha256: string;
  presentation_sha256: string;
  terms_url: string;
  message: string;
};
export function checkoutTermsPresentationDigest(
  p: Omit<CheckoutTermsPresentation, "presentation_sha256">,
) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        terms_review_sha256: p.terms_review_sha256,
        terms_url: p.terms_url,
        message: p.message,
      }),
    )
    .digest("hex");
}
/** URL must serve immutable reviewed bytes and reject mismatched sha256; publishing that legal
 * route and configuring Stripe's terms URL are separate owner gates, not performed here. */
export function validateCheckoutTermsPresentation(
  input: unknown,
  termsDigest: string,
  origin: string,
): CheckoutTermsPresentation {
  const p = z
    .object({
      terms_review_sha256: digest,
      presentation_sha256: digest,
      terms_url: z.string().url(),
      message: z.string().min(1).max(1200),
    })
    .strict()
    .parse(input);
  const url = new URL(p.terms_url);
  if (
    p.terms_review_sha256 !== termsDigest ||
    url.protocol !== "https:" ||
    url.origin !== origin ||
    url.username ||
    url.password ||
    url.hash ||
    url.searchParams.get("sha256") !== termsDigest ||
    !p.message.includes(`](${p.terms_url})`) ||
    /[<>\r]/.test(p.message) ||
    checkoutTermsPresentationDigest(p) !== p.presentation_sha256
  )
    throw Error("LIVE_CHECKOUT_REVIEWED_PRESENTATION_REQUIRED");
  return p;
}
const bindingSchema = z
  .object({
    reconciliation_id: z.uuid(),
    org_id: z.uuid(),
    actor_id: z.uuid(),
    binding_version: z.number().int().nonnegative(),
    checkout_intent_id: z.uuid(),
    checkout_session_id: z.string().regex(/^cs_live_[A-Za-z0-9_]{6,}$/),
    customer_id: id("cus"),
    subscription_id: id("sub"),
    invoice_id: id("in"),
    subscription_item_id: id("si"),
    offer_key: offer,
    mapping_revision: z.number().int().positive(),
    price_id: id("price"),
    product_id: id("prod"),
    monthly_amount_minor: z.number().int().positive(),
    period_start: z.number().int().positive(),
    period_end: z.number().int().positive(),
    terms_review_sha256: digest,
    presentation: z.object({
      terms_review_sha256: digest,
      presentation_sha256: digest,
      terms_url: z.string(),
      message: z.string(),
    }),
    origin: z.string().url(),
    created_at: z.number().int().positive(),
    expires_at: z.number().int().positive(),
  })
  .strict();
export type LiveConsentBinding = z.infer<typeof bindingSchema>;
export type LiveCheckoutConsentProof = Readonly<{
  state: "VERIFIED" | "UNVERIFIED";
  reason: string;
  org_id: string;
  reconciliation_id: string;
  binding_version: number;
  mapping_revision: number;
  offer_key: string;
  checkout_intent_id: string;
  checkout_session_id: string;
  customer_id: string;
  subscription_id: string;
  invoice_id: string;
  price_id: string;
  product_id: string;
  terms_review_sha256: string;
  presentation_sha256: string;
  period_start: number;
  period_end: number;
  subscription_status: string | null;
  cancel_at_period_end: boolean | null;
  observed_at: number;
  source_sha256: string;
  entitlement_authority: false;
}>;
export type LiveConsentDependencies = {
  runtime?: {
    enabled: boolean;
    mode: "live";
    nodeEnv: string;
    secretKey: string;
  };
  transport: LiveBillingTransport;
  resolveBinding: (
    id: string,
    principal: LiveBillingPrincipal,
  ) => Promise<unknown>;
  stillCurrent: (binding: Readonly<LiveConsentBinding>) => Promise<boolean>;
  nowSeconds?: () => number;
};
export async function readLiveCheckoutConsent(
  deps: LiveConsentDependencies,
  input: unknown,
  principal: LiveBillingPrincipal,
): Promise<LiveCheckoutConsentProof> {
  const r = deps.runtime;
  if (
    !r?.enabled ||
    r.mode !== "live" ||
    r.nodeEnv !== "production" ||
    !/^(sk|rk)_live_[A-Za-z0-9_]{20,}$/.test(r.secretKey)
  )
    throw Error("LIVE_CONSENT_DISABLED");
  const request = z
    .object({ reconciliation_id: z.uuid() })
    .strict()
    .parse(input);
  const actor = z
    .object({ actor_id: z.uuid(), org_id: z.uuid() })
    .strict()
    .parse(principal);
  const b = bindingSchema.parse(
    await deps.resolveBinding(request.reconciliation_id, actor),
  );
  const now = deps.nowSeconds || (() => Math.floor(Date.now() / 1000));
  if (
    b.reconciliation_id !== request.reconciliation_id ||
    b.org_id !== actor.org_id ||
    b.actor_id !== actor.actor_id ||
    b.created_at > now() ||
    b.expires_at <= now() ||
    b.expires_at - b.created_at > 300
  )
    throw Error("LIVE_CONSENT_BINDING_UNAVAILABLE");
  const approvedIds = {
    KXRA_STARTER_V1: ["price_1UTbq7C84VkhhIRzkBHEHivV", "prod_VUb2kv7rUiTeiu"],
    KXRA_TEAM_V1: ["price_1UTbrLC84VkhhIRzMN225zAr", "prod_VUb3rh9e9eNw5a"],
    KXRA_BUSINESS_V1: ["price_1UTlt5C84VkhhIRzGztXl6ey", "prod_VUlPLWhBBf7lmP"],
  };
  if (
    b.price_id !== approvedIds[b.offer_key][0] ||
    b.product_id !== approvedIds[b.offer_key][1] ||
    b.monthly_amount_minor !== approvedPlan(b.offer_key).monthly_amount_minor
  )
    throw Error("LIVE_CONSENT_CATALOGUE_UNAVAILABLE");
  const presentation = validateCheckoutTermsPresentation(
    b.presentation,
    b.terms_review_sha256,
    b.origin,
  );
  const deadline = Date.now() + 30_000;
  let subscriptionStatus: string | null = null,
    cancelAtEnd: boolean | null = null;
  const sources: unknown[] = [];
  function proof(
    state: "VERIFIED" | "UNVERIFIED",
    reason: string,
  ): LiveCheckoutConsentProof {
    return Object.freeze({
      state,
      reason,
      org_id: b.org_id,
      reconciliation_id: b.reconciliation_id,
      binding_version: b.binding_version,
      mapping_revision: b.mapping_revision,
      offer_key: b.offer_key,
      checkout_intent_id: b.checkout_intent_id,
      checkout_session_id: b.checkout_session_id,
      customer_id: b.customer_id,
      subscription_id: b.subscription_id,
      invoice_id: b.invoice_id,
      price_id: b.price_id,
      product_id: b.product_id,
      terms_review_sha256: b.terms_review_sha256,
      presentation_sha256: presentation.presentation_sha256,
      period_start: b.period_start,
      period_end: b.period_end,
      subscription_status: subscriptionStatus,
      cancel_at_period_end: cancelAtEnd,
      observed_at: now(),
      source_sha256: crypto
        .createHash("sha256")
        .update(JSON.stringify(sources))
        .digest("hex"),
      entitlement_authority: false,
    });
  }
  async function get<T extends z.ZodType>(
    path: string,
    schema: T,
  ): Promise<z.infer<T>> {
    if (Date.now() >= deadline) throw Error("BUDGET");
    const response = await deps.transport(`https://api.stripe.com/v1/${path}`, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(15_000, deadline - Date.now())),
      ),
      headers: {
        Authorization: `Bearer ${r!.secretKey}`,
        "Stripe-Version": version,
      },
    });
    if (!response.ok || !response.body) throw Error("PROVIDER");
    const reader = response.body.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 100_000 || Date.now() >= deadline) {
          await reader.cancel();
          throw Error("BUDGET");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    return schema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  }
  try {
    const account = await get(
      "account",
      z.object({
        id: z.literal("acct_1Rv3KdC84VkhhIRz"),
        object: z.literal("account"),
      }),
    );
    sources.push(account);
    const schema = z.object({
      id: z.literal(b.checkout_session_id),
      object: z.literal("checkout.session"),
      livemode: z.literal(true),
      mode: z.literal("subscription"),
      status: z.literal("complete"),
      customer: z.literal(b.customer_id),
      subscription: z.literal(b.subscription_id),
      client_reference_id: z.literal(b.checkout_intent_id),
      consent_collection: z.object({ terms_of_service: z.literal("required") }),
      consent: z.object({ terms_of_service: z.literal("accepted") }),
      custom_text: z.object({
        terms_of_service_acceptance: z.object({
          message: z.literal(presentation.message),
        }),
      }),
      metadata: z.object({
        kxra_live_intent_id: z.literal(b.checkout_intent_id),
        kxra_catalogue_offer: z.literal(b.offer_key),
        kxra_mapping_revision: z.literal(String(b.mapping_revision)),
        kxra_terms_sha256: z.literal(b.terms_review_sha256),
        kxra_consent_presentation_sha256: z.literal(
          presentation.presentation_sha256,
        ),
      }),
    });
    const session = await get(
      `checkout/sessions/${b.checkout_session_id}`,
      schema,
    );
    sources.push(session);
    const lines = await get(
      `checkout/sessions/${b.checkout_session_id}/line_items?limit=2`,
      z.object({
        object: z.literal("list"),
        has_more: z.literal(false),
        data: z
          .array(
            z.object({
              quantity: z.literal(1),
              currency: z.literal("gbp"),
              price: z.object({
                id: z.literal(b.price_id),
                product: z.literal(b.product_id),
                livemode: z.literal(true),
                currency: z.literal("gbp"),
                unit_amount: z.literal(b.monthly_amount_minor),
                recurring: z.object({
                  interval: z.literal("month"),
                  interval_count: z.literal(1),
                  usage_type: z.literal("licensed"),
                }),
              }),
            }),
          )
          .length(1),
      }),
    );
    sources.push(lines);
    const sub = await get(
      `subscriptions/${b.subscription_id}`,
      z.object({
        id: z.literal(b.subscription_id),
        object: z.literal("subscription"),
        customer: z.literal(b.customer_id),
        livemode: z.literal(true),
        status: z.string(),
        cancel_at_period_end: z.boolean(),
        latest_invoice: z.literal(b.invoice_id),
        metadata: z.object({
          kxra_live_intent_id: z.literal(b.checkout_intent_id),
          kxra_catalogue_offer: z.literal(b.offer_key),
          kxra_mapping_revision: z.literal(String(b.mapping_revision)),
          kxra_terms_sha256: z.literal(b.terms_review_sha256),
          kxra_consent_presentation_sha256: z.literal(
            presentation.presentation_sha256,
          ),
        }),
        items: z.object({
          has_more: z.literal(false),
          data: z
            .array(
              z.object({
                id: z.literal(b.subscription_item_id),
                quantity: z.literal(1),
                current_period_start: z.literal(b.period_start),
                current_period_end: z.literal(b.period_end),
                price: z.object({ id: z.literal(b.price_id) }),
              }),
            )
            .length(1),
        }),
      }),
    );
    sources.push(sub);
    subscriptionStatus = sub.status;
    cancelAtEnd = sub.cancel_at_period_end;
    const again = await get(
      `checkout/sessions/${b.checkout_session_id}`,
      schema,
    );
    if (JSON.stringify(again) !== JSON.stringify(session))
      throw Error("CHANGED");
    if (
      !(await deps.stillCurrent(Object.freeze({ ...b }))) ||
      now() >= b.expires_at ||
      Date.now() >= deadline
    )
      return proof("UNVERIFIED", "CONSENT_BINDING_CHANGED");
    return proof("VERIFIED", "STRIPE_REQUIRED_TERMS_ACCEPTED");
  } catch {
    return proof("UNVERIFIED", "CONSENT_PROVIDER_OR_BINDING_UNVERIFIED");
  }
}
