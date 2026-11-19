import type { LiveCustomerDatabaseClient } from "./live-customer-worker";
import type { PaidRefreshQuery } from "./live-paid-refresh-worker";
import { requireLiveBillingWorkerIdentity } from "./live-worker-identity";
import { BILLING_HTTP_RECEIPT_MS } from "./billing-http-controller";

type RefreshClient = Omit<LiveCustomerDatabaseClient, "connect"> & {
  connect: () => Promise<unknown>;
  on?: (event: "error", listener: () => void) => unknown;
};

/** One invocation only. Reuse a connection, never a transaction or a principal.
 * No environment/profile/credential lookup and no provider I/O in this module.
 * The caller must close in finally; idle/deadline expiry also closes the socket.
 */
export function createBillingRefreshSession(ports: {
  createClient: () => Promise<RefreshClient>;
  stopAt: number;
  nowMs?: () => number;
  cleanupMs?: number;
}) {
  const clock = ports.nowMs ?? Date.now,
    remaining = ports.stopAt - clock(),
    cleanupMs =
      ports.cleanupMs ?? Math.min(1000, Math.max(1, Math.floor(remaining / 2))),
    queryStopAt = ports.stopAt - cleanupMs;
  if (
    !Number.isFinite(remaining) ||
    remaining <= cleanupMs ||
    remaining > BILLING_HTTP_RECEIPT_MS ||
    !Number.isInteger(cleanupMs) ||
    cleanupMs < 1 ||
    cleanupMs > 1000
  )
    throw Error("BILLING_REFRESH_SESSION_BUDGET_INVALID");
  let client: RefreshClient | undefined,
    connecting: Promise<RefreshClient> | undefined,
    ending: Promise<void> | undefined,
    busy = false,
    closed = false,
    ended = false;
  const end = () => {
    if (!client) return Promise.resolve();
    if (!ending) {
      const closing = client;
      ending = Promise.resolve()
        .then(() => closing.end())
        .then(() => {
          ended = true;
        })
        .catch(() => {
          throw Error("BILLING_REFRESH_SESSION_CLOSE_UNCONFIRMED");
        });
    }
    return ending;
  };
  const expire = () => {
    closed = true;
    void end().catch(() => {});
  };
  // Cleanup is reserved INSIDE the invocation receipt envelope, never added to it.
  const lifetime = setTimeout(expire, Math.max(1, queryStopAt - clock()));
  lifetime.unref?.();
  const current = () => {
    if (closed || clock() >= queryStopAt) {
      expire();
      throw Error("BILLING_REFRESH_SESSION_EXPIRED");
    }
  };
  const getClient = () => {
    if (!connecting)
      connecting = (async () => {
        client = await ports.createClient();
        // pg emits idle socket failures outside query promises. Contain them
        // without logging driver messages or reusing/reconnecting this session.
        client.on?.("error", expire);
        current();
        await client.connect();
        current();
        return client;
      })();
    return connecting;
  };
  const query: PaidRefreshQuery = async (text, values = []) => {
    current();
    // The worker is sequential. Unexpected overlap must not share a transaction,
    // start another connection, or build an unbounded admission queue.
    if (busy) throw Error("BILLING_REFRESH_SESSION_BUSY");
    busy = true;
    let cutoff: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      cutoff = setTimeout(
        () => {
          expire();
          reject(Error("BILLING_REFRESH_SESSION_EXPIRED"));
        },
        Math.max(1, queryStopAt - clock()),
      );
    });
    const operation = (async () => {
      let begun = false;
      try {
        const db = await getClient();
        current();
        await db.query("begin");
        begun = true;
        await db.query("set local statement_timeout='2s'");
        await db.query("set local lock_timeout='500ms'");
        await db.query("set local idle_in_transaction_session_timeout='3s'");
        await db.query("set local role kxra_billing_worker");
        requireLiveBillingWorkerIdentity(
          (await db.query("select session_user,current_user")).rows[0],
        );
        current();
        const result = await db.query(text, [...values]);
        current();
        await db.query("commit");
        begun = false;
        current();
        return result;
      } catch {
        if (begun && client) await client.query("rollback").catch(() => {});
        expire(); // A failed connection/transaction is never retried or reused.
        throw Error("BILLING_REFRESH_SESSION_UNAVAILABLE");
      }
    })();
    try {
      return await Promise.race([operation, deadline]);
    } finally {
      if (cutoff) clearTimeout(cutoff);
      busy = false;
    }
  };
  const close = async () => {
    closed = true;
    clearTimeout(lifetime);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const closing = end();
      if (ended || !client) return;
      const budget = Math.min(cleanupMs, ports.stopAt - clock());
      if (budget <= 0) {
        void closing.catch(() => {});
        throw Error("BILLING_REFRESH_SESSION_CLOSE_UNCONFIRMED");
      }
      await Promise.race([
        closing,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(Error("BILLING_REFRESH_SESSION_CLOSE_UNCONFIRMED")),
            budget,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  return { query, close };
}
