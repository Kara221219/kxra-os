import { pacedBillingReads } from "./billing-refresh-scheduler";
import { billingBodyBuffer } from "./billing-body-buffer";
import crypto from "node:crypto";
import { z } from "zod";
import {
  assertModernScopeTag,
  validateModernBillingConfiguration,
  type ModernBillingConfiguration,
  type ModernExecutionMode,
  type ModernRuntimeIdentity,
} from "./modern-billing-scope";
import {
  paidRefreshSubjectSchema,
  readPaidRefreshPreflight,
} from "./live-paid-refresh-preflight";
import { validateStoredModernPaidProof } from "./live-paid-access";
import {
  readLiveStripePaymentEvidence,
  readStagingSandboxStripePaymentEvidence,
} from "./live-stripe-payment-evidence";
import {
  paidRefreshWorkerQuery,
  type PaidRefreshQuery,
} from "./live-paid-refresh-worker";
import type { LiveBillingTransport } from "./live-catalogue-stripe";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const REDUCED_SHADOW_MAX_GETS = 7;
const claimSchema = z
  .object({
    subject: paidRefreshSubjectSchema,
    consent: z
      .object({
        source_job_id: z.uuid(),
        source_sha256: hash,
        proof: z.unknown(),
      })
      .strict(),
  })
  .strict();
export type ReducedShadowClaim = z.infer<typeof claimSchema>;

/** No new consent is inferred. Only an immutable original ELIGIBLE strict-worker
 * receipt may supply historical assent. SQL verifies its origin and current
 * policy; this independently verifies its original canonical packet digest. */
export function validateReducedShadowConsent(
  input: unknown,
  mode: ModernExecutionMode,
) {
  const claim = claimSchema.parse(input),
    s = claim.subject;
  const p = validateStoredModernPaidProof(claim.consent.proof, mode);
  assertModernScopeTag(s.execution_scope, p.execution_scope);
  if (
    p.reconciliation_id !== claim.consent.source_job_id ||
    p.evidence_sha256 !== claim.consent.source_sha256 ||
    p.org_id !== s.org_id ||
    p.customer_id !== s.customer_id ||
    p.subscription_id !== s.subscription_id ||
    p.checkout_intent_id !== s.checkout_intent_id ||
    p.checkout_session_id !== s.checkout_session_id ||
    p.policy_id !== s.policy.id ||
    p.policy_revision !== s.policy.revision ||
    p.price_id !== s.mapping.price_id ||
    p.product_id !== s.mapping.product_id ||
    p.offer_key !== s.offer_key ||
    p.mapping_revision !== s.mapping_revision ||
    p.terms_review_sha256 !== s.policy.terms_review_sha256 ||
    p.presentation_sha256 !== s.policy.presentation_sha256 ||
    p.payment_state !== "COLLECTED" ||
    p.consent_state !== "VERIFIED" ||
    p.eligibility !== "ELIGIBLE" ||
    p.refunded_minor !== 0
  )
    throw Error("REDUCED_SHADOW_CONSENT_UNVERIFIED");
  return claim;
}

class ShadowReadFault extends Error {
  constructor(readonly retryAfter = 0) {
    super("REDUCED_SHADOW_READ_UNVERIFIED");
  }
}
/** Deliberately SHADOW ONLY: validators' repeated GETs are served from one bounded
 * per-attempt observation. This changes cross-read coherence and MUST NOT be
 * passed to the production proof-commit path. No cache crosses attempts, accounts,
 * revisions or processes. Existing validators still check the full money graph.
 */
export function createReducedShadowSnapshot(input: {
  secretKey: string;
  apiVersion: string;
  transport: LiveBillingTransport;
  stillCurrent: () => Promise<boolean>;
  deadlineMs?: number;
}) {
  const cache = new Map<string, Uint8Array>();
  const duration = z
    .number()
    .int()
    .min(1)
    .max(45_000)
    .parse(input.deadlineMs ?? 45_000);
  const deadline = Date.now() + duration;
  let reads = 0,
    retryAfter = 0;
  const transport: LiveBillingTransport = async (url, init) => {
    const headers = new Headers(init.headers);
    if (
      init.method !== "GET" ||
      init.redirect !== "error" ||
      headers.get("Authorization") !== `Bearer ${input.secretKey}` ||
      headers.get("Stripe-Version") !== input.apiVersion ||
      !/^https:\/\/api\.stripe\.com\/v1\/(?:account|subscriptions\/sub_[A-Za-z0-9]{6,}|invoices\/in_[A-Za-z0-9]{6,}|prices\/price_[A-Za-z0-9]{6,}\?expand\[\]=product|invoice_payments\?invoice=in_[A-Za-z0-9]{6,}&limit=2|payment_intents\/pi_[A-Za-z0-9]{6,}|charges\/ch_[A-Za-z0-9]{6,})$/.test(
        url,
      ) ||
      init.signal?.aborted ||
      Date.now() >= deadline ||
      !(await input.stillCurrent())
    )
      throw new ShadowReadFault();
    const cached = cache.get(url);
    if (cached)
      return new Response(cached.slice(), {
        headers: { "content-type": "application/json" },
      });
    if (++reads > REDUCED_SHADOW_MAX_GETS) throw new ShadowReadFault();
    const response = await input.transport(url, {
      ...init,
      signal: AbortSignal.any([
        ...(init.signal ? [init.signal] : []),
        AbortSignal.timeout(Math.max(1, deadline - Date.now())),
      ]),
    });
    if (!response.ok || !response.body) {
      if (
        response.status === 429 &&
        /^\d{1,6}$/.test(response.headers.get("retry-after") ?? "")
      )
        retryAfter = Math.min(
          3600,
          Number(response.headers.get("retry-after")),
        );
      void response.body?.cancel().catch(() => {});
      throw new ShadowReadFault(retryAfter);
    }
    const reader = response.body.getReader();
    let timer: ReturnType<typeof setTimeout> | undefined,
      stopped = false;
    const stop = () => {
      stopped = true;
      void reader.cancel().catch(() => {});
    };
    const signal = AbortSignal.any([
      ...(init.signal ? [init.signal] : []),
      AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    ]);
    signal.addEventListener("abort", stop, { once: true });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          stop();
          reject(new ShadowReadFault());
        },
        Math.max(1, deadline - Date.now()),
      );
    });
    try {
      const bytes = await Promise.race([
        (async () => {
          const chunks = billingBodyBuffer(100_000);
          let length = 0,
            empty = 0;
          while (true) {
            const part = await reader.read();
            if (stopped || signal.aborted || Date.now() >= deadline)
              throw new ShadowReadFault();
            if (part.done) break;
            if (!part.value.length) {
              if (++empty > 64) throw new ShadowReadFault();
              continue;
            }
            if ((length += part.value.length) > 100_000)
              throw new ShadowReadFault();
            try {
              chunks.append(part.value);
            } catch (error) {
              void reader.cancel().catch(() => {});
              throw error;
            }
          }
          return new Uint8Array(chunks.finish());
        })(),
        timeout,
      ]);
      if (!(await input.stillCurrent())) throw new ShadowReadFault();
      cache.set(url, bytes);
      return new Response(bytes.slice(), {
        headers: { "content-type": "application/json" },
      });
    } catch {
      stop();
      throw new ShadowReadFault(retryAfter);
    } finally {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      reader.releaseLock();
    }
  };
  return {
    transport,
    reads: () => Math.min(reads, REDUCED_SHADOW_MAX_GETS),
    retryAfter: () => retryAfter,
  };
}

export async function observeReducedBillingShadow(input: {
  enabled?: boolean;
  mode: ModernExecutionMode;
  execution: ModernBillingConfiguration;
  runtimeIdentity: ModernRuntimeIdentity;
  secretKey: string;
  claim: unknown;
  transport?: LiveBillingTransport;
  stillCurrent: () => Promise<boolean>;
  nowSeconds?: () => number;
}) {
  if (input.enabled !== true) throw Error("REDUCED_BILLING_SHADOW_DISABLED");
  const claim = validateReducedShadowConsent(input.claim, input.mode),
    s = claim.subject;
  const execution = validateModernBillingConfiguration(
    input.execution,
    input.runtimeIdentity,
    input.secretKey,
    input.mode,
  );
  assertModernScopeTag(s.execution_scope, execution.execution_scope);
  const now = input.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const started = now(),
    snapshot = createReducedShadowSnapshot({
      secretKey: input.secretKey,
      apiVersion: execution.execution_scope.api_version,
      transport: input.transport ?? fetch,
      stillCurrent: input.stillCurrent,
    });
  let outcome: "COLLECTED" | "DENIED" | "UNVERIFIED" = "UNVERIFIED",
    sourceHash: string | null = null;
  try {
    const preflight = await readPaidRefreshPreflight(
      { ...input, execution, transport: snapshot.transport },
      s,
    );
    const reconciliation = crypto.randomUUID();
    const evidence = await (
      input.mode === "LIVE"
        ? readLiveStripePaymentEvidence
        : readStagingSandboxStripePaymentEvidence
    )(
      {
        execution,
        runtimeIdentity: input.runtimeIdentity,
        runtime: {
          enabled: true,
          nodeEnv: "production",
          secretKey: input.secretKey,
          mode: input.mode === "LIVE" ? "live" : "staging_sandbox",
        },
        transport: snapshot.transport,
        nowSeconds: now,
        stillCurrent: input.stillCurrent,
        resolveBinding: async () => ({
          execution_scope: execution.execution_scope,
          binding: {
            reconciliation_id: reconciliation,
            org_id: s.org_id,
            actor_id: s.actor_id,
            binding_version: s.binding_version,
            mapping_revision: s.mapping_revision,
            account_id: execution.execution_scope.account_id,
            mode: input.mode === "LIVE" ? "live" : "staging_sandbox",
            offer_key: s.offer_key,
            price_id: s.mapping.price_id,
            product_id: s.mapping.product_id,
            customer_id: s.customer_id,
            subscription_id: s.subscription_id,
            subscription_item_id: preflight.subscription_item_id,
            invoice_id: preflight.invoice_id,
            checkout_intent_id: s.checkout_intent_id,
            period_start: preflight.period_start,
            period_end: preflight.period_end,
            expected_total_minor: preflight.expected_total_minor,
            tax_behavior: s.mapping.tax_behavior,
            automatic_tax: s.mapping.automatic_tax,
            activation_review_sha256: s.mapping.activation_review_sha256,
            terms_review_sha256: s.mapping.terms_review_sha256,
            tax_review_sha256: s.mapping.tax_review_sha256,
            created_at: started,
            expires_at: Math.min(started + 55, s.lease_until),
          },
        }),
      },
      { reconciliation_id: reconciliation },
      { org_id: s.org_id, actor_id: s.actor_id },
    );
    sourceHash = evidence.source_sha256;
    outcome =
      evidence.state === "COLLECTED" &&
      evidence.subscription_status === "active"
        ? "COLLECTED"
        : ["REFUNDED", "DISPUTED", "FAILED", "CANCELLED"].includes(
              evidence.state,
            ) ||
            (evidence.subscription_status !== null &&
              evidence.subscription_status !== "active")
          ? "DENIED"
          : "UNVERIFIED";
    if (!(await input.stillCurrent())) outcome = "UNVERIFIED";
  } catch {
    /* finite output only; no key, body, URL or raw provider error */
  }
  return Object.freeze({
    outcome,
    started_at: started,
    observed_at: now(),
    reads: snapshot.reads(),
    retry_after_seconds: snapshot.retryAfter(),
    source_sha256: sourceHash,
    consent_source_sha256: claim.consent.source_sha256,
    entitlement_authority: false as const,
    observation_model: "REDUCED_SHADOW_V1" as const,
  });
}

/** New default-off worker. Only its private shadow RPCs are called; never reserve,
 * commit or ACK the authoritative paid-proof worker's jobs/queue. */
export async function runReducedBillingShadowOnce(options: {
  enabled?: boolean;
  nodeEnv?: string;
  mode: ModernExecutionMode;
  runtimeIdentity: ModernRuntimeIdentity;
  secretKey: string;
  readReview: string;
  readCeiling: number;
  limit?: number;
  query?: PaidRefreshQuery;
  transport?: LiveBillingTransport;
  nowSeconds?: () => number;
}) {
  if (
    options.enabled !== true ||
    (options.nodeEnv ?? process.env.NODE_ENV) !== "production"
  )
    throw Error("REDUCED_BILLING_SHADOW_DISABLED");
  hash.parse(options.readReview);
  z.number().int().min(7).max(1_000_000_000).parse(options.readCeiling);
  const limit = z
    .number()
    .int()
    .min(1)
    .max(3)
    .parse(options.limit ?? 3);
  const query = options.query ?? paidRefreshWorkerQuery;
  const execution = validateModernBillingConfiguration(
    (
      await query(
        "select kxra_private.modern_billing_scope_attestation() value",
      )
    ).rows[0]?.value,
    options.runtimeIdentity,
    options.secretKey,
    options.mode,
  );
  const claims = (
    await query(
      "select value from kxra_private.claim_reduced_billing_shadow($1::integer,$2::text) value",
      [limit, options.mode],
    )
  ).rows;
  if (claims.length > limit) throw Error("REDUCED_SHADOW_CLAIM_LIMIT");
  const rawTransport = options.transport ?? fetch;
  const paced = pacedBillingReads(
    {
      provider_reads_per_second: 4,
      maximum_provider_reads: limit * REDUCED_SHADOW_MAX_GETS,
    },
    {
      fetch: async (url, init = {}) => {
        if (typeof url !== "string")
          throw Error("REDUCED_SHADOW_FIXED_TRANSPORT_REQUIRED");
        return rawTransport(url, init);
      },
    },
  );
  const counts = {
    collected: 0,
    denied: 0,
    unverified: 0,
    stale: 0,
    reads: 0,
    entitlement_authority: false,
  };
  for (const row of claims) {
    const claim = claimSchema.parse(row.value),
      s = claim.subject;
    let result: Awaited<ReturnType<typeof observeReducedBillingShadow>>;
    try {
      validateReducedShadowConsent(claim, options.mode);
      assertModernScopeTag(s.execution_scope, execution.execution_scope);
      const budget = (
        await query(
          "select kxra_private.reserve_reduced_shadow_reads($1::text,$2::bigint) value",
          [options.readReview, options.readCeiling],
        )
      ).rows[0]?.value;
      const b = z
        .object({
          state: z.literal("GRANTED"),
          reserved_reads: z.literal(7),
          valid_until: z.number().int(),
        })
        .passthrough()
        .parse(budget);
      const now = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
      if (b.valid_until <= now() || b.valid_until > now() + 60)
        throw Error("REDUCED_SHADOW_BUDGET_UNAVAILABLE");
      result = await observeReducedBillingShadow({
        ...options,
        transport: (url, init) => paced.fetch(url, init),
        execution,
        claim,
        stillCurrent: async () =>
          b.valid_until > now() &&
          (
            await query(
              "select kxra_private.reduced_billing_shadow_current($1::uuid,$2::uuid,$3::text) value",
              [s.org_id, s.claim_token, options.mode],
            )
          ).rows[0]?.value === true,
      });
    } catch {
      const now = options.nowSeconds?.() ?? Math.floor(Date.now() / 1000);
      result = {
        outcome: "UNVERIFIED",
        started_at: now,
        observed_at: now,
        reads: 0,
        retry_after_seconds: 0,
        source_sha256: null,
        consent_source_sha256: claim.consent.source_sha256,
        entitlement_authority: false,
        observation_model: "REDUCED_SHADOW_V1",
      };
    }
    counts.reads += result.reads;
    const finished = (
      await query(
        "select kxra_private.finish_reduced_billing_shadow($1::uuid,$2::uuid,$3::jsonb,$4::text) value",
        [s.org_id, s.claim_token, JSON.stringify(result), options.mode],
      )
    ).rows[0]?.value;
    if (finished === "STALE") counts.stale++;
    else if (finished !== "RECORDED")
      throw Error("REDUCED_SHADOW_COMMIT_UNAVAILABLE");
    else
      counts[
        result.outcome === "COLLECTED"
          ? "collected"
          : result.outcome === "DENIED"
            ? "denied"
            : "unverified"
      ]++;
  }
  return Object.freeze(counts);
}
