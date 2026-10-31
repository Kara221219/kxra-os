import { z } from "zod";
import { validatedModernBillingWorkerProfile } from "./live-customer-dispatch-config";
import { requireLiveBillingWorkerIdentity } from "./live-worker-identity";
import {
  assertModernScopeTag,
  modernScopeTagSchema,
  validateModernBillingConfiguration,
  type ModernScopeTag,
} from "./modern-billing-scope";

const count = z.number().int().min(0).max(2_147_483_647);
const summarySchema = z
  .object({
    execution_scope: modernScopeTagSchema,
    unmatched_quarantined: count,
    quarantined: count,
    conflict_quarantined: count,
    unproven_associations: count,
    operator_held: count,
    exhausted: count,
    pending: count,
    claimed: count,
    completed: count,
    superseded: count,
    oldest_quarantine_age_seconds: count,
    automatic_resolution: z.literal(false),
    entitlement_authority: z.literal(false),
    version: z.literal("WEBHOOK_RECONCILIATION_V1"),
  })
  .strict();

/** Finite operator-only presentation, never customer readiness or authority.
 * No event/customer/org/account IDs, provider bodies, URLs or raw errors leave.
 */
export function webhookReconciliationPresentation(
  input: unknown,
  expected: ModernScopeTag,
) {
  const value = summarySchema.parse(input);
  assertModernScopeTag(value.execution_scope, expected);
  if (
    value.conflict_quarantined > value.quarantined ||
    value.exhausted > value.operator_held
  )
    throw Error("RECONCILIATION_COUNTS_INVALID");
  const quarantined =
    value.unmatched_quarantined +
    value.quarantined +
    value.unproven_associations +
    value.operator_held;
  if (quarantined === 0 && value.oldest_quarantine_age_seconds !== 0)
    throw Error("RECONCILIATION_COUNTS_INVALID");
  const { execution_scope: _scope, ...safe } = value;
  return Object.freeze({
    ...safe,
    mode: expected.execution_mode,
    scope_verified: true,
    state:
      quarantined > 0
        ? ("REVIEW_REQUIRED" as const)
        : ("NO_QUARANTINED_EVENTS" as const),
    operator_action:
      quarantined > 0
        ? ("REVIEW_VERIFIED_RESOURCE_LINEAGE" as const)
        : ("NONE" as const),
  });
}
type Profile = ReturnType<typeof validatedModernBillingWorkerProfile>;
type StatusClient = {
  connect(): Promise<unknown>;
  query(text: string): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<unknown>;
};

/** Separate default-off READ-ONLY entry, without enabling dispatch/refresh or
 * calling Stripe. Reuses the existing TLS/CA/genuine runner; no new credential.
 * Client injection is private test infrastructure, never HTTP/user input.
 */
export async function readWebhookReconciliationStatus(
  source: Record<string, string | undefined>,
  ports: {
    clientFactory?: (
      configuration: Profile["database"] & { query_timeout: number },
    ) => Promise<StatusClient>;
  } = {},
) {
  if (source.KXRA_BILLING_RECONCILIATION_STATUS_ENABLED !== "true")
    throw Error("BILLING_RECONCILIATION_STATUS_DISABLED");
  let client: StatusClient | undefined,
    begun = false;
  try {
    const profile = validatedModernBillingWorkerProfile(source);
    const config = {
      ...profile.database,
      application_name: "kxra-webhook-reconciliation-readonly",
      query_timeout: 5000,
    };
    client = ports.clientFactory
      ? await ports.clientFactory(config)
      : await (async () => {
          const { default: pg } = await import("pg");
          return new pg.Client(config);
        })();
    await client.connect();
    await client.query("begin read only");
    begun = true;
    await client.query("set local statement_timeout='5s'");
    await client.query("set local lock_timeout='1s'");
    await client.query("set local role kxra_billing_worker");
    requireLiveBillingWorkerIdentity(
      (await client.query("select session_user,current_user")).rows[0],
    );
    const execution = validateModernBillingConfiguration(
      (
        await client.query(
          "select kxra_private.webhook_reconciliation_scope_attestation() value",
        )
      ).rows[0]?.value,
      profile.runtimeIdentity,
      profile.runtime.secretKey,
      profile.executionMode,
    );
    const sql =
      profile.executionMode === "LIVE"
        ? "select kxra_private.webhook_reconciliation_summary() value"
        : "select kxra_private.staging_sandbox_webhook_reconciliation_summary() value";
    const result = webhookReconciliationPresentation(
      (await client.query(sql)).rows[0]?.value,
      execution.execution_scope,
    );
    await client.query("commit");
    begun = false;
    return result;
  } catch {
    if (begun && client) await client.query("rollback").catch(() => {});
    throw Error("BILLING_RECONCILIATION_STATUS_UNAVAILABLE");
  } finally {
    if (client) await client.end().catch(() => {});
  }
}
