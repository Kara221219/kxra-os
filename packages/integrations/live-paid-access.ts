import crypto from "node:crypto";
import {
  validateModernBillingConfiguration,
  assertModernScopeTag,
  modernCatalogueRow,
  modernScopeTagSchema,
  type ModernExecutionDependencies,
  type ModernExecutionMode,
} from "./modern-billing-scope";
import { z } from "zod";
import { approvedPlan } from "../workspace/approved-catalogue";
import type { LivePaymentEvidence } from "./live-stripe-payment-evidence";
import type { LiveCheckoutConsentProof } from "./live-checkout-consent";
const hash = z.string().regex(/^[a-f0-9]{64}$/),
  integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const id = (p: string) =>
  z.string().regex(new RegExp(`^${p}_[A-Za-z0-9]{6,}$`));
const offer = z.enum(["KXRA_STARTER_V1", "KXRA_TEAM_V1", "KXRA_BUSINESS_V1"]);
export const livePaidPolicySchema = z
  .object({
    id: z.uuid(),
    terms_document_id: z.uuid(),
    terms_document_version: integer.positive(),
    terms_url: z.string().url(),
    message: z.string().min(1).max(1200),
    revision: integer.positive(),
    enabled: z.literal(true),
    offer_key: offer,
    mapping_revision: integer.positive(),
    activation_review_sha256: hash,
    terms_review_sha256: hash,
    presentation_sha256: hash,
    tax_review_sha256: hash,
    cancellation_review_sha256: hash,
    grace_review_sha256: hash,
    refund_review_sha256: hash,
    trial_review_sha256: hash,
    ai_review_sha256: hash,
    access_rule: z.literal("CURRENT_COLLECTED_ACTIVE_ONLY"),
    cancellation_mode: z.enum(["END_OF_PAID_PERIOD", "DENY_WHEN_SCHEDULED"]),
    grace_seconds: z.literal(0),
    refund_mode: z.literal("DENY_ANY_REFUND"),
    trial_access: z.literal(false),
    past_due_access: z.literal(false),
    proof_ttl_seconds: integer.positive().max(300),
  })
  .strict();
export type LivePaidPolicy = z.infer<typeof livePaidPolicySchema>;
const contextSchema = z
  .object({
    reconciliation_id: z.uuid(),
    org_id: z.uuid(),
    actor_id: z.uuid(),
    binding_version: integer,
    offer_key: offer,
    mapping_revision: integer.positive(),
    policy_id: z.uuid(),
    policy_revision: integer.positive(),
    customer_id: id("cus"),
    subscription_id: id("sub"),
    invoice_id: id("in"),
    price_id: id("price"),
    product_id: id("prod"),
    checkout_intent_id: z.uuid(),
    checkout_session_id: z.string().regex(/^cs_(live|test)_[A-Za-z0-9_]{6,}$/),
    period_start: integer.positive(),
    period_end: integer.positive(),
    expected_total_minor: integer.positive(),
    created_at: integer.positive(),
    expires_at: integer.positive(),
  })
  .strict();
export type LivePaidContext = z.infer<typeof contextSchema>;
const paymentSchema = z
  .object({
    execution_scope: modernScopeTagSchema,
    version: z.literal(1),
    state: z.enum([
      "COLLECTED",
      "PENDING",
      "FAILED",
      "CANCELLED",
      "REFUNDED",
      "DISPUTED",
      "MISMATCHED",
      "UNVERIFIED",
      "VERSION_RACE",
    ]),
    reason: z.string(),
    org_id: z.uuid(),
    reconciliation_id: z.uuid(),
    binding_version: integer,
    mapping_revision: integer.positive(),
    invoice_id: id("in"),
    subscription_id: id("sub"),
    customer_id: id("cus"),
    offer_key: offer,
    period_start: integer.positive(),
    period_end: integer.positive(),
    currency: z.literal("GBP"),
    expected_total_minor: integer.positive(),
    collected_minor: integer.nullable(),
    refunded_minor: integer.nullable(),
    payment_intent_id: id("pi").nullable(),
    charge_id: id("ch").nullable(),
    subscription_status: z.string().nullable(),
    observation_started_at: integer.positive(),
    observed_at: integer.positive(),
    source_sha256: hash,
    requires_recheck: z.literal(true),
    entitlement_authority: z.literal(false),
    payout_authority: z.literal(false),
  })
  .strict();
const consentSchema = z
  .object({
    execution_scope: modernScopeTagSchema,
    state: z.enum(["VERIFIED", "UNVERIFIED"]),
    reason: z.string(),
    org_id: z.uuid(),
    reconciliation_id: z.uuid(),
    binding_version: integer,
    mapping_revision: integer.positive(),
    offer_key: offer,
    checkout_intent_id: z.uuid(),
    checkout_session_id: z.string().regex(/^cs_(live|test)_[A-Za-z0-9_]{6,}$/),
    customer_id: id("cus"),
    subscription_id: id("sub"),
    invoice_id: id("in"),
    price_id: id("price"),
    product_id: id("prod"),
    terms_review_sha256: hash,
    presentation_sha256: hash,
    period_start: integer.positive(),
    period_end: integer.positive(),
    subscription_status: z.string().nullable(),
    cancel_at_period_end: z.boolean().nullable(),
    observed_at: integer.positive(),
    source_sha256: hash,
    entitlement_authority: z.literal(false),
  })
  .strict();
/** Trusted-worker proposal only. The SQL generation-checked commit is the authority.
 * Signature/provider evidence must be produced by read adapters; NEVER accept it from a client.
 * Policy rows are empty/default-disabled; synthetic policy fixtures are not approved terms.
 */
function buildModernPaidProof(
  contextInput: unknown,
  policyInput: unknown,
  paymentInput: LivePaymentEvidence,
  consentInput: LiveCheckoutConsentProof,
  nowSeconds: number,
  configuration: ModernExecutionDependencies | undefined,
  expectedMode: ModernExecutionMode,
) {
  if (!configuration?.runtimeIdentity)
    throw Error("MODERN_RUNTIME_IDENTITY_REQUIRED");
  const execution = validateModernBillingConfiguration(
      configuration.execution,
      configuration.runtimeIdentity,
      undefined,
      expectedMode,
    ),
    scope = execution.execution_scope;
  const c = contextSchema.parse(contextInput),
    policy = livePaidPolicySchema.parse(policyInput),
    p = paymentSchema.parse(paymentInput),
    s = consentSchema.parse(consentInput);
  const plan = approvedPlan(c.offer_key);
  const row = modernCatalogueRow(execution, c.offer_key);
  assertModernScopeTag(p.execution_scope, scope);
  assertModernScopeTag(s.execution_scope, scope);
  if (
    c.price_id !== row.price_id ||
    c.product_id !== row.product_id ||
    !c.checkout_session_id.startsWith(
      scope.livemode ? "cs_live_" : "cs_test_",
    ) ||
    policy.id !== c.policy_id ||
    policy.revision !== c.policy_revision ||
    policy.offer_key !== c.offer_key ||
    policy.mapping_revision !== c.mapping_revision ||
    c.period_end <= c.period_start ||
    c.expected_total_minor < plan.monthly_amount_minor
  )
    throw Error("LIVE_PAID_CONTEXT_MISMATCH");
  for (const evidence of [p, s])
    if (
      evidence.org_id !== c.org_id ||
      evidence.reconciliation_id !== c.reconciliation_id ||
      evidence.binding_version !== c.binding_version ||
      evidence.mapping_revision !== c.mapping_revision ||
      evidence.offer_key !== c.offer_key ||
      evidence.customer_id !== c.customer_id ||
      evidence.subscription_id !== c.subscription_id ||
      evidence.invoice_id !== c.invoice_id ||
      evidence.period_start !== c.period_start ||
      evidence.period_end !== c.period_end
    )
      throw Error("LIVE_PAID_EVIDENCE_BINDING_MISMATCH");
  if (
    s.checkout_intent_id !== c.checkout_intent_id ||
    s.checkout_session_id !== c.checkout_session_id ||
    s.price_id !== c.price_id ||
    s.product_id !== c.product_id ||
    s.terms_review_sha256 !== policy.terms_review_sha256 ||
    s.presentation_sha256 !== policy.presentation_sha256 ||
    p.expected_total_minor !== c.expected_total_minor
  )
    throw Error("LIVE_PAID_CONSENT_OR_TOTAL_MISMATCH");
  let reason = "MATCHED_CURRENT_PAYMENT_AND_CONSENT";
  if (
    c.created_at > nowSeconds ||
    c.expires_at <= nowSeconds ||
    c.expires_at - c.created_at > 300 ||
    p.observation_started_at < c.created_at ||
    p.observed_at < p.observation_started_at ||
    p.observed_at > nowSeconds + 60 ||
    s.observed_at < c.created_at ||
    s.observed_at > nowSeconds + 60 ||
    nowSeconds - Math.min(p.observed_at, s.observed_at) >
      policy.proof_ttl_seconds
  )
    reason = "EVIDENCE_STALE";
  else if (
    p.state !== "COLLECTED" ||
    p.collected_minor !== c.expected_total_minor ||
    p.refunded_minor !== 0 ||
    !p.payment_intent_id ||
    !p.charge_id
  )
    reason = "PAYMENT_NOT_VERIFIED_COLLECTED";
  else if (s.state !== "VERIFIED") reason = "CONSENT_NOT_VERIFIED";
  else if (
    p.subscription_status !== "active" ||
    s.subscription_status !== "active" ||
    s.cancel_at_period_end === null
  )
    reason = "SUBSCRIPTION_NOT_CURRENT_ACTIVE";
  else if (
    s.cancel_at_period_end &&
    policy.cancellation_mode === "DENY_WHEN_SCHEDULED"
  )
    reason = "REVIEWED_CANCELLATION_POLICY_DENIES";
  else if (c.period_start > nowSeconds || c.period_end <= nowSeconds)
    reason = "PERIOD_NOT_CURRENT";
  const packet = {
    execution_scope: scope,
    reconciliation_id: c.reconciliation_id,
    org_id: c.org_id,
    binding_version: c.binding_version,
    mapping_revision: c.mapping_revision,
    offer_key: c.offer_key,
    policy_id: policy.id,
    policy_revision: policy.revision,
    customer_id: c.customer_id,
    subscription_id: c.subscription_id,
    invoice_id: c.invoice_id,
    price_id: c.price_id,
    product_id: c.product_id,
    checkout_intent_id: c.checkout_intent_id,
    checkout_session_id: c.checkout_session_id,
    period_start: c.period_start,
    period_end: c.period_end,
    currency: "GBP",
    quantity: 1,
    monthly_amount_minor: plan.monthly_amount_minor,
    expected_total_minor: c.expected_total_minor,
    collected_minor: p.collected_minor,
    refunded_minor: p.refunded_minor,
    payment_intent_id: p.payment_intent_id,
    charge_id: p.charge_id,
    payment_state: p.state,
    consent_state: s.state,
    subscription_status: s.subscription_status,
    cancel_at_period_end: s.cancel_at_period_end,
    terms_review_sha256: policy.terms_review_sha256,
    presentation_sha256: policy.presentation_sha256,
    payment_sha256: p.source_sha256,
    consent_sha256: s.source_sha256,
    checked_at: Math.min(p.observed_at, s.observed_at),
    eligibility:
      reason === "MATCHED_CURRENT_PAYMENT_AND_CONSENT" ? "ELIGIBLE" : "DENY",
    reason,
    entitlement_authority: false,
  };
  return Object.freeze({
    ...packet,
    evidence_sha256: packetDigest(packet),
  });
}
const packetSchema = contextSchema
  .omit({ actor_id: true, created_at: true, expires_at: true })
  .extend({
    execution_scope: modernScopeTagSchema,
    currency: z.literal("GBP"),
    quantity: z.literal(1),
    monthly_amount_minor: integer.positive(),
    collected_minor: integer.nullable(),
    refunded_minor: integer.nullable(),
    payment_intent_id: id("pi").nullable(),
    charge_id: id("ch").nullable(),
    payment_state: z.enum([
      "COLLECTED",
      "PENDING",
      "FAILED",
      "CANCELLED",
      "REFUNDED",
      "DISPUTED",
      "MISMATCHED",
      "UNVERIFIED",
      "VERSION_RACE",
    ]),
    consent_state: z.enum(["VERIFIED", "UNVERIFIED"]),
    subscription_status: z.string().nullable(),
    cancel_at_period_end: z.boolean().nullable(),
    terms_review_sha256: hash,
    presentation_sha256: hash,
    payment_sha256: hash,
    consent_sha256: hash,
    checked_at: integer.positive(),
    eligibility: z.enum(["ELIGIBLE", "DENY"]),
    reason: z.string().regex(/^[A-Z_]{3,100}$/),
    entitlement_authority: z.literal(false),
    evidence_sha256: hash,
  })
  .strict();
function packetDigest(packet: Record<string, unknown>) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(packet).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    )
    .digest("hex");
}
export type LivePaidProofPacket = ReturnType<typeof buildLivePaidProof>;
function reserveModernPaidReadCommand(
  input: unknown,
  enabled: boolean,
  expectedMode: ModernExecutionMode,
) {
  if (!enabled) throw Error("LIVE_PAID_DISABLED");
  const r = z
    .object({
      reconciliation_id: z.uuid(),
      org_id: z.uuid(),
      expected_total_minor: integer.positive(),
      invoice_id: id("in"),
      subscription_item_id: id("si"),
      period_start: integer.positive(),
      period_end: integer.positive(),
    })
    .strict()
    .parse(input);
  return Object.freeze({
    text: `select kxra_private.${expectedMode === "LIVE" ? "" : "staging_sandbox_"}reserve_live_paid_read($1::uuid,$2::uuid,$3::integer,$4::text,$5::text,$6::bigint,$7::bigint) value`,
    values: Object.freeze([
      r.reconciliation_id,
      r.org_id,
      r.expected_total_minor,
      r.invoice_id,
      r.subscription_item_id,
      r.period_start,
      r.period_end,
    ]),
    role: "BILLING_WORKER" as const,
    entitlement_authority: false,
  });
}
/** Read-only validation of an immutable stored receipt. This grants no access
 * and executes no SQL; current policy/binding authority remains server-owned. */
export function validateStoredModernPaidProof(
  packet: unknown,
  expectedMode: ModernExecutionMode,
) {
  const parsed = packetSchema.parse(packet);
  if (
    parsed.execution_scope.execution_mode !== expectedMode ||
    parsed.execution_scope.livemode !== (expectedMode === "LIVE") ||
    (expectedMode === "STAGING_SANDBOX" &&
      parsed.execution_scope.project_ref !== "jlebgsxcvhvpueuibekd") ||
    (expectedMode === "LIVE" &&
      parsed.execution_scope.account_id !== "acct_1Rv3KdC84VkhhIRz") ||
    !parsed.checkout_session_id.startsWith(
      expectedMode === "LIVE" ? "cs_live_" : "cs_test_",
    )
  )
    throw Error("MODERN_PAID_COMMAND_SCOPE_MISMATCH");
  const { evidence_sha256, ...content } = parsed;
  if (packetDigest(content) !== evidence_sha256)
    throw Error("LIVE_PAID_PROOF_DIGEST_MISMATCH");
  return Object.freeze(parsed);
}
function commitModernPaidProofCommand(
  packet: LivePaidProofPacket,
  enabled: boolean,
  expectedMode: ModernExecutionMode,
) {
  if (!enabled) throw Error("LIVE_PAID_DISABLED");
  const parsed = validateStoredModernPaidProof(packet, expectedMode);
  return Object.freeze({
    text: `select kxra_private.${expectedMode === "LIVE" ? "" : "staging_sandbox_"}commit_live_paid_proof($1::uuid,$2::jsonb) value`,
    values: Object.freeze([parsed.reconciliation_id, JSON.stringify(parsed)]),
    role: "BILLING_WORKER" as const,
    entitlement_authority: false,
  });
}

/** Safe no-arg view only, within an existing verified selected-tenant transaction. */
function modernPaidAccessStatusCommand(expectedMode: ModernExecutionMode) {
  return Object.freeze({
    text: `select kxra_private.${expectedMode === "LIVE" ? "" : "staging_sandbox_"}live_paid_access_status() value`,
    values: Object.freeze([]),
    role: "AUTHENTICATED_SERVER" as const,
    entitlement_authority: false,
  });
}

/** Bounded authoritative DB-generation recheck for READ adapters only. */
function currentModernPaidReadCommand(
  input: unknown,
  enabled: boolean,
  expectedMode: ModernExecutionMode,
) {
  if (!enabled) throw Error("LIVE_PAID_DISABLED");
  const r = z.object({ reconciliation_id: z.uuid() }).strict().parse(input);
  return Object.freeze({
    text: `select kxra_private.${expectedMode === "LIVE" ? "" : "staging_sandbox_"}live_paid_read_current($1::uuid) value`,
    values: Object.freeze([r.reconciliation_id]),
    role: "BILLING_WORKER" as const,
    entitlement_authority: false,
  });
}

export function buildLivePaidProof(
  c: unknown,
  p: unknown,
  payment: LivePaymentEvidence,
  consent: LiveCheckoutConsentProof,
  now: number,
  configuration?: ModernExecutionDependencies,
) {
  return buildModernPaidProof(
    c,
    p,
    payment,
    consent,
    now,
    configuration,
    "LIVE",
  );
}
export function buildStagingSandboxPaidProof(
  c: unknown,
  p: unknown,
  payment: LivePaymentEvidence,
  consent: LiveCheckoutConsentProof,
  now: number,
  configuration?: ModernExecutionDependencies,
) {
  return buildModernPaidProof(
    c,
    p,
    payment,
    consent,
    now,
    configuration,
    "STAGING_SANDBOX",
  );
}
export function reserveLivePaidReadCommand(i: unknown, enabled = false) {
  return reserveModernPaidReadCommand(i, enabled, "LIVE");
}
export function reserveStagingSandboxPaidReadCommand(
  i: unknown,
  enabled = false,
) {
  return reserveModernPaidReadCommand(i, enabled, "STAGING_SANDBOX");
}
export function commitLivePaidProofCommand(
  p: LivePaidProofPacket,
  enabled = false,
) {
  return commitModernPaidProofCommand(p, enabled, "LIVE");
}
export function commitStagingSandboxPaidProofCommand(
  p: LivePaidProofPacket,
  enabled = false,
) {
  return commitModernPaidProofCommand(p, enabled, "STAGING_SANDBOX");
}
export function livePaidAccessStatusCommand() {
  return modernPaidAccessStatusCommand("LIVE");
}
export function stagingSandboxPaidAccessStatusCommand() {
  return modernPaidAccessStatusCommand("STAGING_SANDBOX");
}
export function currentLivePaidReadCommand(i: unknown, enabled = false) {
  return currentModernPaidReadCommand(i, enabled, "LIVE");
}
export function currentStagingSandboxPaidReadCommand(
  i: unknown,
  enabled = false,
) {
  return currentModernPaidReadCommand(i, enabled, "STAGING_SANDBOX");
}
