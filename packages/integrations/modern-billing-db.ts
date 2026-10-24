import {
  billingTransaction,
  billingWorkerDatabaseConfiguration,
} from "./billing-worker";
import { requireLiveBillingWorkerIdentity } from "./live-worker-identity";
import type { ModernBillingConfiguration } from "./modern-billing-scope";
/** Called only by private server ports after HMAC or authenticated admission. No provider calls.
 * No new credentials: requires the already approved worker identity and existing TLS config. */
export async function loadModernBillingScopeConfiguration(): Promise<ModernBillingConfiguration> {
  return billingTransaction(
    async (db) => {
      const identity = (await db.query("select session_user,current_user"))
        .rows[0];
      requireLiveBillingWorkerIdentity(identity);
      const r = await db.query(
        "select kxra_private.modern_billing_scope_attestation() value",
      );
      if (!r.rows[0]?.value) throw Error("MODERN_SCOPE_UNBOUND");
      return r.rows[0].value;
    },
    { ...billingWorkerDatabaseConfiguration(), connectionTimeoutMillis: 3000 },
  );
}
