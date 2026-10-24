import {
  billingTransaction,
  billingWorkerDatabaseConfiguration,
} from "./billing-worker";
import { liveWakeupSchema, type LiveWakeup } from "./live-webhook";

/** No provider calls. Receipts are accepted only through the existing worker capability. */
export async function recordLiveWebhookWakeup(input: LiveWakeup) {
  const event = liveWakeupSchema.parse(input);
  return billingTransaction(
    async (db) => {
      const identity = (await db.query("select session_user,current_user"))
        .rows[0];
      if (
        identity?.session_user !== "kxra_billing_worker" ||
        identity?.current_user !== "kxra_billing_worker"
      )
        throw Error("LIVE_WEBHOOK_WORKER_IDENTITY_INVALID");
      const result = await db.query(
        "select kxra_private.record_live_billing_wakeup($1::jsonb) state",
        [JSON.stringify(event)],
      );
      return result.rows[0]?.state;
    },
    { ...billingWorkerDatabaseConfiguration(), connectionTimeoutMillis: 3000 },
  );
}
