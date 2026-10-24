import {
  billingTransaction,
  billingWorkerDatabaseConfiguration,
} from "./billing-worker";
import { liveWakeupSchema, type LiveWakeup } from "./live-webhook";
import { requireLiveBillingWorkerIdentity } from "./live-worker-identity";

/** No provider calls. Receipts are accepted only through the existing worker capability. */
export async function recordLiveWebhookWakeup(input: LiveWakeup) {
  const event = liveWakeupSchema.parse(input);
  return billingTransaction(
    async (db) => {
      const identity = (await db.query("select session_user,current_user"))
        .rows[0];
      requireLiveBillingWorkerIdentity(identity);
      const result = await db.query(
        "select kxra_private.record_live_billing_wakeup($1::jsonb) state",
        [JSON.stringify(event)],
      );
      return result.rows[0]?.state;
    },
    { ...billingWorkerDatabaseConfiguration(), connectionTimeoutMillis: 3000 },
  );
}
