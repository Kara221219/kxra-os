import { validatedModernBillingWorkerProfile } from "./live-customer-dispatch-config";
import { requireLiveBillingWorkerIdentity } from "./live-worker-identity";
import type { LiveCustomerDatabaseClient } from "./live-customer-worker";

type Profile = ReturnType<typeof validatedModernBillingWorkerProfile>;
type Database = Profile["database"] & { query_timeout: number };
type RefreshClient = Omit<LiveCustomerDatabaseClient, "connect"> & {
  connect: () => Promise<unknown>;
};
/** Private injection is for deterministic tests, never HTTP/request configuration. */
export function createPaidRefreshWorkerQuery(
  ports: {
    environment?: Record<string, string | undefined>;
    clientFactory?: (configuration: Database) => Promise<RefreshClient>;
  } = {},
) {
  return async (text: string, values: unknown[] = []) => {
    const environment = ports.environment ?? process.env;
    // Gate before loading the key/DSN/CA. Dispatch and legacy flags do not opt in.
    if (environment.KXRA_PAID_PROOF_REFRESH_ENABLED !== "true")
      throw Error("PAID_REFRESH_DISABLED");
    let profile: Profile;
    try {
      profile = validatedModernBillingWorkerProfile(environment);
    } catch {
      throw Error("PAID_REFRESH_DATABASE_CONFIGURATION_INVALID");
    }
    const configuration = {
      ...profile.database,
      application_name: "kxra-paid-proof-refresh-once",
      query_timeout: 5000,
    };
    let db: RefreshClient | undefined,
      begun = false;
    try {
      db = ports.clientFactory
        ? await ports.clientFactory(configuration)
        : await (async () => {
            const { default: pg } = await import("pg");
            return new pg.Client(configuration);
          })();
      await db.connect();
      await db.query("begin");
      begun = true;
      await db.query("set local statement_timeout='5s'");
      await db.query("set local lock_timeout='2s'");
      await db.query("set local role kxra_billing_worker");
      requireLiveBillingWorkerIdentity(
        (await db.query("select session_user,current_user")).rows[0],
      );
      const result = await db.query(text, [...values]);
      await db.query("commit");
      begun = false;
      return result;
    } catch {
      if (begun && db) await db.query("rollback").catch(() => {});
      throw Error("PAID_REFRESH_DATABASE_UNAVAILABLE");
    } finally {
      if (db) await db.end().catch(() => {});
    }
  };
}
