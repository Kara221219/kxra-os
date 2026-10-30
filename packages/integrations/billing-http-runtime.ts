import { runBillingDispatchBatchOnce } from "./billing-dispatch-batch";
import { checkoutDispatchConfiguration } from "./checkout-dispatch-config";
import {
  runPaidRefreshOnce,
  type PaidRefreshQuery,
} from "./live-paid-refresh-worker";
import { requireLiveBillingWorkerIdentity } from "./live-worker-identity";
import { boundedDispatchTransport } from "./live-customer-dispatch-transport";
import {
  BILLING_HTTP_PROVIDER_MS,
  BILLING_HTTP_RECEIPT_MS,
  type BillingHttpKind,
} from "./billing-http-controller";
import type { LiveCustomerDatabaseClient } from "./live-customer-worker";
/** Explicit settings only. Never enumerate/process or serialize the environment. */
const keys = [
  "NODE_ENV",
  "KXRA_ENVIRONMENT",
  "NEXT_PUBLIC_SUPABASE_URL",
  "KXRA_MODERN_BILLING_DISPATCH_ENABLED",
  "KXRA_PAID_PROOF_REFRESH_ENABLED",
  "STRIPE_SECRET_KEY",
  "KXRA_BILLING_WORKER_DATABASE_URL",
  "KXRA_DATABASE_CA_CERT_BASE64",
  "KXRA_ORIGIN",
] as const;
export type BillingHttpRuntimePorts = {
  nowMs?: () => number;
  fetch?: typeof fetch;
  clientFactory?: () => Promise<LiveCustomerDatabaseClient>;
  /** Server-only scheduler signal; no request can supply this port. */
  onRefreshClaimCount?: (count: number) => void;
};
/** Separate, short transactions. No provider HTTP runs while these SQL locks exist.
 * Hard receipt deadline also bounds control queries; disconnect rolls back an interrupted transaction.
 */
export function billingHttpQuery(
  config: NonNullable<ReturnType<typeof checkoutDispatchConfiguration>>,
  stopAt: number,
  ports: BillingHttpRuntimePorts = {},
): PaidRefreshQuery {
  const clock = ports.nowMs ?? Date.now;
  return async (text, values = []) => {
    if (clock() >= stopAt) throw Error("BILLING_HTTP_SQL_BUDGET");
    const client = ports.clientFactory
      ? await ports.clientFactory()
      : await (async () => {
          const { default: pg } = await import("pg");
          return new pg.Client({
            ...config.database,
            connectionTimeoutMillis: Math.max(
              1,
              Math.min(2000, stopAt - clock()),
            ),
            query_timeout: 2000,
          });
        })();
    let begun = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const cutoff = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => {
          void client.end().catch(() => {});
          reject(Error("BILLING_HTTP_SQL_BUDGET"));
        },
        Math.max(1, stopAt - clock()),
      );
    });
    const operation = (async () => {
      try {
        await client.connect();
        await client.query("begin");
        begun = true;
        await client.query("set local statement_timeout='2s'");
        await client.query("set local lock_timeout='500ms'");
        await client.query(
          "set local idle_in_transaction_session_timeout='3s'",
        );
        await client.query("set local role kxra_billing_worker");
        requireLiveBillingWorkerIdentity(
          (await client.query("select session_user,current_user")).rows[0],
        );
        if (clock() >= stopAt) throw Error("BILLING_HTTP_SQL_BUDGET");
        const result = await client.query(text, values);
        await client.query("commit");
        begun = false;
        return result;
      } catch {
        if (begun) await client.query("rollback").catch(() => {});
        throw Error("BILLING_HTTP_DATABASE_UNAVAILABLE");
      } finally {
        await client.end().catch(() => {});
      }
    })();
    try {
      return await Promise.race([operation, cutoff]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}
/** Real packaged invocation. HTTP supplies no identifiers/mode/options. Fixed mode/TLS/catalogue/runner guards remain inside the existing cores. */
export async function runBillingHttpInvocation(
  kind: BillingHttpKind,
  source: Record<string, string | undefined>,
  ports: BillingHttpRuntimePorts = {},
) {
  if (
    source.KXRA_BILLING_HTTP_ENABLED !== "true" ||
    (kind === "dispatch"
      ? source.KXRA_MODERN_BILLING_DISPATCH_ENABLED
      : source.KXRA_PAID_PROOF_REFRESH_ENABLED) !== "true"
  )
    throw Error("BILLING_HTTP_DISABLED");
  const environment = Object.fromEntries(keys.map((key) => [key, source[key]]));
  // Read-only refresh reuses the identical fixed mode, existing runner TLS identity and origin parser.
  const config = checkoutDispatchConfiguration({
    ...environment,
    KXRA_MODERN_BILLING_DISPATCH_ENABLED: "true",
  });
  if (!config) throw Error("BILLING_HTTP_CONFIGURATION_INVALID");
  const clock = ports.nowMs ?? Date.now,
    start = clock(),
    query = billingHttpQuery(config, start + BILLING_HTTP_RECEIPT_MS, ports);
  const execute = async (command: {
    text: string;
    values: readonly unknown[];
  }) => (await query(command.text, [...command.values])).rows[0]?.value;
  if (kind === "dispatch")
    return runBillingDispatchBatchOnce(
      { limit: 2 },
      {
        environment,
        execute,
        fetch: ports.fetch,
        nowMs: clock,
        durationMs: BILLING_HTTP_PROVIDER_MS,
      },
    );
  const deadline = start + BILLING_HTTP_PROVIDER_MS;
  const transport = billingHttpReadTransport(config.runtime.secretKey, ports);
  const boundedQuery: PaidRefreshQuery = async (text, values) => {
    const completion =
      /\.(?:staging_sandbox_)?(?:commit_live_paid_refresh|ack_live_billing_wakeup)\(/.test(
        text,
      );
    if (!completion && clock() >= deadline)
      throw Error("BILLING_HTTP_READ_BUDGET");
    return query(text, values);
  };
  return runPaidRefreshOnce({
    enabled: true,
    nodeEnv: environment.NODE_ENV,
    mode: config.executionMode,
    runtimeIdentity: config.runtimeIdentity,
    secretKey: config.runtime.secretKey,
    origin: config.origin,
    limit: 1,
    transport,
    query: boundedQuery,
    onClaimCount: ports.onRefreshClaimCount,
  });
}

/** Shared READ-only45s budget across preflight, settled invoice evidence and consent. */
export function billingHttpReadTransport(
  secretKey: string,
  ports: BillingHttpRuntimePorts = {},
) {
  const clock = ports.nowMs ?? Date.now;
  return boundedDispatchTransport(
    ports.fetch ?? globalThis.fetch,
    secretKey,
    {
      authorize: (url, init) => {
        if (
          (init.method ?? "GET") !== "GET" ||
          init.body ||
          !/^\/v1\/(?:account|prices\/price_[A-Za-z0-9]+|subscriptions\/sub_[A-Za-z0-9]+|invoices\/in_[A-Za-z0-9]+|invoice_payments|payment_intents\/pi_[A-Za-z0-9]+|charges\/ch_[A-Za-z0-9]+|checkout\/sessions\/cs_(?:live|test)_[A-Za-z0-9_]+(?:\/line_items)?)$/.test(
            url.pathname,
          )
        )
          throw Error("BILLING_HTTP_READ_SCOPE");
      },
    },
    {
      deadlineMs: BILLING_HTTP_PROVIDER_MS,
      now: clock,
      maxRequests: 32,
      maxPosts: 0,
    },
  );
}
