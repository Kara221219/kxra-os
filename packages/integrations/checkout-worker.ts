import crypto from "node:crypto";
import { z } from "zod";
import { checkoutDispatchConfiguration } from "./checkout-dispatch-config";
import {
  liveCustomerDatabaseExecutor,
  type LiveCustomerExecute,
} from "./live-customer-worker";
import {
  validateModernBillingConfiguration,
  assertModernScopeTag,
  modernScopeMetadata,
  modernScopeTagSchema,
} from "./modern-billing-scope";
import {
  claimLiveLedgerCommand,
  claimStagingSandboxLedgerCommand,
  currentLiveLedgerCommand,
  currentStagingSandboxLedgerCommand,
  finishLiveLedgerCommand,
  finishStagingSandboxLedgerCommand,
} from "./live-billing-ledger";
import {
  createLiveCatalogueSession,
  createStagingSandboxCatalogueSession,
} from "./live-catalogue-stripe";
import { validateCheckoutTermsPresentation } from "./live-checkout-consent";
import { boundedCheckoutTransport } from "./checkout-dispatch-transport";
const canonicalSchema = z
  .object({
    intent: z
      .object({
        id: z.uuid(),
        org_id: z.uuid(),
        actor_id: z.uuid(),
        kind: z.literal("CHECKOUT"),
        terms_review_sha256: z.string().regex(/^[a-f0-9]{64}$/),
        customer_id: z.string(),
        offer_key: z.string(),
        mapping_revision: z.number().int().positive(),
      })
      .passthrough(),
    mapping: z
      .object({ price_id: z.string(), automatic_tax: z.boolean() })
      .passthrough(),
    observed_version: z.number().int().nonnegative().safe(),
    execution_scope: modernScopeTagSchema,
    entitlement_authority: z.literal(false),
  })
  .strict();
const presentationSchema = z
  .object({
    request_id: z.uuid(),
    presentation: z
      .object({
        terms_review_sha256: z.string(),
        presentation_sha256: z.string(),
        terms_url: z.string(),
        message: z.string(),
      })
      .strict(),
    execution_scope: modernScopeTagSchema,
  })
  .strict();

/** One CHECKOUT UUID only. Shared scoped engine; no portal/discovery or durable
 * bearer URL storage. READY means canonical CONSUMED receipt, not paid access.
 */
export async function runCheckoutWorkerOnce(
  input: unknown,
  ports: {
    environment?: Record<string, string | undefined>;
    execute?: LiveCustomerExecute;
    fetch?: typeof fetch;
    nowSeconds?: () => number;
  } = {},
) {
  const id = z.uuid().parse(input),
    config = checkoutDispatchConfiguration(ports.environment);
  if (!config)
    return {
      state: "DISABLED" as const,
      request_id: id,
      entitlement_authority: false as const,
    };
  const approvedOrigin = config.origin;
  const execute = ports.execute ?? liveCustomerDatabaseExecutor(config);
  const execution = validateModernBillingConfiguration(
    await execute({
      text: "select kxra_private.modern_billing_scope_attestation() value",
      values: [],
    }),
    config.runtimeIdentity,
    config.runtime.secretKey,
    config.executionMode,
  );
  const ledger = { enabled: true, mode: config.runtime.mode };
  const claim =
    config.executionMode === "LIVE"
      ? claimLiveLedgerCommand
      : claimStagingSandboxLedgerCommand;
  const current =
    config.executionMode === "LIVE"
      ? currentLiveLedgerCommand
      : currentStagingSandboxLedgerCommand;
  const finish =
    config.executionMode === "LIVE"
      ? finishLiveLedgerCommand
      : finishStagingSandboxLedgerCommand;
  const create =
    config.executionMode === "LIVE"
      ? createLiveCatalogueSession
      : createStagingSandboxCatalogueSession;
  const prefix = config.executionMode === "LIVE" ? "" : "staging_sandbox_";
  async function presentation() {
    const result = presentationSchema.parse(
      await execute({
        text: `select kxra_private.${prefix}live_checkout_dispatch_presentation($1::uuid) value`,
        values: [id],
      }),
    );
    if (result.request_id !== id)
      throw Error("CHECKOUT_DISPATCH_PRESENTATION_INVALID");
    assertModernScopeTag(result.execution_scope, execution.execution_scope);
    return validateCheckoutTermsPresentation(
      result.presentation,
      result.presentation.terms_review_sha256,
      approvedOrigin,
    );
  }
  // Rejected PORTAL/missing policy stays unclaimed; never consumes its UUID.
  const reviewed = await presentation();
  const canonical = canonicalSchema.parse(
    await execute(claim({ intent_id: id }, ledger)),
  );
  if (canonical.intent.id !== id)
    throw Error("CHECKOUT_DISPATCH_CANONICAL_INVALID");
  assertModernScopeTag(canonical.execution_scope, execution.execution_scope);
  let outcome: "CONSUMED" | "UNCERTAIN" = "UNCERTAIN",
    session: string | null = null,
    reason = "DISPATCH_UNVERIFIED";
  try {
    if (
      canonical.intent.terms_review_sha256 !== reviewed.terms_review_sha256 ||
      JSON.stringify(await presentation()) !== JSON.stringify(reviewed)
    )
      throw Error();
    const transport = boundedCheckoutTransport(
      ports.fetch ?? globalThis.fetch,
      config.runtime.secretKey,
      {
        customer_id: canonical.intent.customer_id,
        price_id: canonical.mapping.price_id,
        request_id: id,
        origin: config.origin,
        terms_url: reviewed.terms_url,
        message: reviewed.message,
        automatic_tax: canonical.mapping.automatic_tax,
        metadata: {
          ...modernScopeMetadata(execution.execution_scope),
          kxra_live_intent_id: id,
          kxra_catalogue_offer: canonical.intent.offer_key,
          kxra_mapping_revision: String(canonical.intent.mapping_revision),
          kxra_terms_sha256: reviewed.terms_review_sha256,
          kxra_consent_presentation_sha256: reviewed.presentation_sha256,
        },
      },
    );
    const result = await create(
      {
        execution,
        runtimeIdentity: config.runtimeIdentity,
        runtime: { ...config.runtime, origin: config.origin },
        checkoutTerms: reviewed,
        transport,
        nowSeconds: ports.nowSeconds,
        resolveIntent: async (request, principal) =>
          request === id &&
          principal.actor_id === canonical.intent.actor_id &&
          principal.org_id === canonical.intent.org_id
            ? canonical
            : null,
        stillCurrent: async () => {
          try {
            return (
              (await execute(current({ intent_id: id }, ledger))) === true &&
              JSON.stringify(await presentation()) === JSON.stringify(reviewed)
            );
          } catch {
            return false;
          }
        },
      },
      { intent_id: id },
      { actor_id: canonical.intent.actor_id, org_id: canonical.intent.org_id },
    );
    assertModernScopeTag(result.execution_scope, execution.execution_scope);
    session = z
      .string()
      .regex(
        config.executionMode === "LIVE"
          ? /^cs_live_[A-Za-z0-9_]{6,}$/
          : /^cs_test_[A-Za-z0-9_]{6,}$/,
      )
      .parse(result.id);
    outcome = "CONSUMED";
    reason = "PROVIDER_SESSION_VERIFIED";
    // result.url/expires_at are deliberately ephemeral and never copied to receipt/output.
  } catch {
    outcome = "UNCERTAIN";
    session = null;
  }
  const resultHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        request_id: id,
        execution_scope: execution.execution_scope,
        observed_version: canonical.observed_version,
        outcome,
        provider_session_id: session,
        reason,
      }),
    )
    .digest("hex");
  let recorded: unknown;
  try {
    recorded = await execute(
      finish(
        {
          intent_id: id,
          outcome,
          provider_session_id: session,
          result_sha256: resultHash,
        },
        ledger,
      ),
    );
  } catch {
    throw Error("CHECKOUT_DISPATCH_COMPLETION_UNCERTAIN");
  }
  if (recorded !== "CONSUMED" && recorded !== "UNCERTAIN")
    throw Error("CHECKOUT_DISPATCH_COMPLETION_INVALID");
  if (outcome === "UNCERTAIN" && recorded !== "UNCERTAIN")
    throw Error("CHECKOUT_DISPATCH_COMPLETION_INVALID");
  return {
    state: recorded === "CONSUMED" ? ("READY" as const) : ("RECORDED" as const),
    request_id: id,
    entitlement_authority: false as const,
  };
}
