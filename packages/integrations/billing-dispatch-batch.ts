import { z } from "zod";
import { checkoutDispatchConfiguration } from "./checkout-dispatch-config";
import {
  liveCustomerDatabaseExecutor,
  runCustomerWorkerOnce,
  type LiveCustomerExecute,
} from "./live-customer-worker";
import { runCheckoutWorkerOnce } from "./checkout-worker";
import { boundedDispatchTransport } from "./live-customer-dispatch-transport";
import {
  validateModernBillingConfiguration,
  assertModernScopeTag,
  modernScopeTagSchema,
} from "./modern-billing-scope";
const candidateSchema = z
  .object({
    request_id: z.uuid(),
    action: z.enum(["CUSTOMER", "CHECKOUT"]),
    execution_scope: modernScopeTagSchema,
  })
  .strict();
const batchOptions = z
  .object({ limit: z.number().int().min(1).max(20).default(5) })
  .strict();
const environmentKeys = [
  "KXRA_MODERN_BILLING_DISPATCH_ENABLED",
  "NODE_ENV",
  "KXRA_ENVIRONMENT",
  "NEXT_PUBLIC_SUPABASE_URL",
  "STRIPE_SECRET_KEY",
  "KXRA_BILLING_WORKER_DATABASE_URL",
  "KXRA_DATABASE_CA_CERT_BASE64",
  "KXRA_ORIGIN",
] as const;
export type DispatchBatchItem = {
  request_id: string;
  action: "CUSTOMER" | "CHECKOUT";
  state: "RECORDED" | "READY" | "NOT_CONFIRMED";
  outcome?: "BOUND" | "UNCERTAIN" | "QUARANTINED";
  code?: "CLAIM_NOT_AVAILABLE" | "DISPATCH_NOT_CONFIRMED";
};
type ItemPorts = {
  environment: Record<string, string | undefined>;
  execute: LiveCustomerExecute;
  fetch: typeof fetch;
};
export type DispatchBatchPorts = {
  environment?: Record<string, string | undefined>;
  execute?: LiveCustomerExecute;
  fetch?: typeof fetch;
  nowMs?: () => number;
  durationMs?: number;
  customer?: (id: string, ports: ItemPorts) => Promise<unknown>;
  checkout?: (id: string, ports: ItemPorts) => Promise<unknown>;
};

/** One bounded pass, not a watch loop. Only scoped DB discovery can supply IDs.
 * Discovery is a read, not authority: 100/102 must claim each request exactly once.
 * Admission/provider budget is at most 90 seconds / 80 requests / 20 POSTs. After that only an
 * already-in-flight driver's bounded completion transaction may finish its receipt.
 */
export async function runBillingDispatchBatchOnce(
  input: unknown = {},
  ports: DispatchBatchPorts = {},
) {
  const { limit } = batchOptions.parse(input),
    source = ports.environment ?? process.env;
  if (source.KXRA_MODERN_BILLING_DISPATCH_ENABLED !== "true")
    return {
      state: "DISABLED" as const,
      discovered: 0,
      attempted: 0,
      skipped: 0,
      provider_requests: 0,
      provider_posts: 0,
      results: [] as DispatchBatchItem[],
      entitlement_authority: false as const,
    };
  // Explicit necessary settings only, not environment enumeration. Contains private
  // credentials; never serialize this snapshot or raw provider/DB errors.
  const environment = Object.fromEntries(
    environmentKeys.map((key) => [key, source[key]]),
  );
  const config = checkoutDispatchConfiguration(environment);
  if (!config) throw Error("BILLING_BATCH_CONFIGURATION_INVALID");
  const clock = ports.nowMs ?? Date.now,
    duration = ports.durationMs ?? 90_000;
  if (!Number.isInteger(duration) || duration < 1 || duration > 90_000)
    throw Error("BILLING_BATCH_BUDGET_INVALID");
  const deadline = clock() + duration,
    base = ports.execute ?? liveCustomerDatabaseExecutor(config);
  let completionCount = 0;
  const execute: LiveCustomerExecute = async (command) => {
    const completion =
      /\.(staging_sandbox_)?finish_live_(customer|billing)_intent\(/.test(
        command.text,
      );
    if (completion) {
      if (++completionCount > limit)
        throw Error("BILLING_BATCH_COMPLETION_LIMIT");
    } else if (clock() >= deadline) throw Error("BILLING_BATCH_TIME_LIMIT");
    return base(command);
  };
  const execution = validateModernBillingConfiguration(
    await execute({
      text: "select kxra_private.modern_billing_scope_attestation() value",
      values: [],
    }),
    config.runtimeIdentity,
    config.runtime.secretKey,
    config.executionMode,
  );
  const prefix = config.executionMode === "LIVE" ? "" : "staging_sandbox_";
  const raw = await execute({
    text: `select coalesce(jsonb_agg(value),'[]'::jsonb) value from kxra_private.${prefix}discover_billing_dispatch($1::integer,$2::text) rows(value)`,
    values: [limit, config.origin],
  });
  const candidates = z.array(candidateSchema).max(limit).parse(raw),
    seen = new Set<string>();
  for (const candidate of candidates) {
    assertModernScopeTag(candidate.execution_scope, execution.execution_scope);
    const key = `${candidate.action}:${candidate.request_id}`;
    if (seen.has(key)) throw Error("BILLING_BATCH_DISCOVERY_INVALID");
    seen.add(key);
  }
  let requests = 0,
    posts = 0;
  const fetcher = ports.fetch ?? globalThis.fetch;
  const budget = boundedDispatchTransport(
    async (input, init) => {
      requests++;
      if (init?.method === "POST") posts++;
      return fetcher(input, init);
    },
    config.runtime.secretKey,
    {
      authorize: (url, init) => {
        const method = init.method || "GET";
        const get =
          method === "GET" &&
          !init.body &&
          (url.pathname === "/v1/account" ||
            /^\/v1\/(prices\/price_|customers\/cus_)[A-Za-z0-9]+$/.test(
              url.pathname,
            ));
        const post =
          method === "POST" &&
          !url.search &&
          ["/v1/customers", "/v1/checkout/sessions"].includes(url.pathname);
        if (!get && !post) throw Error("BILLING_BATCH_PROVIDER_SCOPE_INVALID");
      },
    },
    {
      deadlineMs: Math.max(1, deadline - clock()),
      now: clock,
      maxRequests: limit * 4,
      maxPosts: limit,
    },
  );
  const scopedFetch: typeof fetch = async (input, init) => {
    if (typeof input !== "string")
      throw Error("BILLING_BATCH_PROVIDER_SCOPE_INVALID");
    return budget(input, init ?? {});
  };
  const customer = ports.customer ?? runCustomerWorkerOnce,
    checkout = ports.checkout ?? runCheckoutWorkerOnce;
  const results: DispatchBatchItem[] = [];
  for (const candidate of candidates) {
    if (clock() >= deadline) break;
    try {
      const response = await (
        candidate.action === "CUSTOMER" ? customer : checkout
      )(candidate.request_id, { environment, execute, fetch: scopedFetch });
      if (candidate.action === "CUSTOMER") {
        const result = z
          .object({
            state: z.literal("RECORDED"),
            intent_id: z.literal(candidate.request_id),
            outcome: z.enum(["BOUND", "UNCERTAIN", "QUARANTINED"]),
            entitlement_authority: z.literal(false),
          })
          .strict()
          .parse(response);
        results.push({
          request_id: candidate.request_id,
          action: candidate.action,
          state: "RECORDED",
          outcome: result.outcome,
        });
      } else {
        const result = z
          .object({
            state: z.enum(["READY", "RECORDED"]),
            request_id: z.literal(candidate.request_id),
            entitlement_authority: z.literal(false),
          })
          .strict()
          .parse(response);
        results.push({
          request_id: candidate.request_id,
          action: candidate.action,
          state: result.state,
        });
      }
    } catch (error) {
      const code =
        error instanceof Error &&
        error.message === "LIVE_CUSTOMER_DISPATCH_CLAIM_UNAVAILABLE"
          ? ("CLAIM_NOT_AVAILABLE" as const)
          : ("DISPATCH_NOT_CONFIRMED" as const);
      results.push({
        request_id: candidate.request_id,
        action: candidate.action,
        state: "NOT_CONFIRMED",
        code,
      });
    }
  }
  return {
    state:
      clock() >= deadline
        ? ("BUDGET_EXHAUSTED" as const)
        : ("COMPLETED" as const),
    discovered: candidates.length,
    attempted: results.length,
    skipped: candidates.length - results.length,
    provider_requests: requests,
    provider_posts: posts,
    results,
    entitlement_authority: false as const,
  };
}

export function parseBillingBatchArguments(args: readonly string[]) {
  if (args.length === 1 && args[0] === "--once") return { limit: 5 };
  if (
    args.length !== 3 ||
    args[0] !== "--once" ||
    args[1] !== "--limit" ||
    !/^\d{1,2}$/.test(args[2])
  )
    throw Error("BILLING_BATCH_USAGE");
  return batchOptions.parse({ limit: Number(args[2]) });
}
