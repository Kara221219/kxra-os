import {
  billingTransaction,
  billingWorkerDatabaseConfiguration,
} from "./billing-worker";
import {
  liveWakeupSchema,
  stagingSandboxWakeupSchema,
  type LiveWakeup,
  type StagingSandboxWakeup,
} from "./live-webhook";
import { requireLiveBillingWorkerIdentity } from "./live-worker-identity";
import type { ModernExecutionMode } from "./modern-billing-scope";
/** Existing genuine LOGIN runner -> SET ROLE worker pair remains mandatory; no new access. */
async function recordCore(input: unknown, mode: ModernExecutionMode) {
  const event =
    mode === "LIVE"
      ? liveWakeupSchema.parse(input)
      : stagingSandboxWakeupSchema.parse(input);
  return billingTransaction(
    async (db) => {
      requireLiveBillingWorkerIdentity(
        (await db.query("select session_user,current_user")).rows[0],
      );
      const result = await db.query(
        `select kxra_private.${mode === "LIVE" ? "" : "staging_sandbox_"}record_live_billing_wakeup($1::jsonb) state`,
        [JSON.stringify(event)],
      );
      return result.rows[0]?.state;
    },
    { ...billingWorkerDatabaseConfiguration(), connectionTimeoutMillis: 3000 },
  );
}
export function recordLiveWebhookWakeup(input: LiveWakeup) {
  return recordCore(input, "LIVE");
}
export function recordStagingSandboxWebhookWakeup(input: StagingSandboxWakeup) {
  return recordCore(input, "STAGING_SANDBOX");
}
