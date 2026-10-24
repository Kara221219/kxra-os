import {
  authorizeWorkerRequest,
  validWorkerTriggerSecret,
} from "./worker-auth";
export type BillingHttpKind = "dispatch" | "refresh";
export const BILLING_HTTP_PROVIDER_MS = 45_000;
export const BILLING_HTTP_RECEIPT_MS = 55_000;
export type BillingHttpPorts = {
  environment?: () => Record<string, string | undefined>;
  invoke?: (
    kind: BillingHttpKind,
    environment: Record<string, string | undefined>,
  ) => Promise<unknown>;
  bodyDeadlineMs?: number;
};
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
/** Authentication precedes even a body reader. Zero bytes, including streamed/chunked input. */
async function requireEmptyBody(request: Request, milliseconds: number) {
  if (request.signal.aborted) throw Error("BILLING_BODY_PROHIBITED");
  const length = request.headers.get("content-length");
  if (length !== null && !/^0+$/.test(length))
    throw Error("BILLING_BODY_PROHIBITED");
  if (!request.body) return;
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      void reader.cancel().catch(() => {});
      reject(Error("BILLING_BODY_PROHIBITED"));
    }, milliseconds);
  });
  try {
    await Promise.race([
      (async () => {
        let chunks = 0;
        while (true) {
          if (++chunks > 64) throw Error("BILLING_BODY_PROHIBITED");
          const next = await reader.read();
          if (next.done) return;
          if (next.value.byteLength) throw Error("BILLING_BODY_PROHIBITED");
        }
      })(),
      timeout,
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function count(value: unknown, maximum: number) {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > maximum)
    throw Error("BILLING_RESULT_INVALID");
  return Number(value);
}
/** Never serialize driver rows, identifiers, URLs, tokens, SQL/provider errors or raw outcomes. */
export function billingHttpSummary(kind: BillingHttpKind, raw: unknown) {
  if (!raw || typeof raw !== "object") throw Error("BILLING_RESULT_INVALID");
  const r = raw as Record<string, unknown>;
  if (kind === "dispatch") {
    if (
      !["DISABLED", "COMPLETED", "BUDGET_EXHAUSTED"].includes(
        String(r.state),
      ) ||
      !Array.isArray(r.results) ||
      r.results.length > 2 ||
      r.entitlement_authority !== false
    )
      throw Error("BILLING_RESULT_INVALID");
    const codes: Record<string, number> = {
      BOUND: 0,
      UNCERTAIN: 0,
      QUARANTINED: 0,
      READY: 0,
      RECORDED: 0,
      CLAIM_NOT_AVAILABLE: 0,
      DISPATCH_NOT_CONFIRMED: 0,
    };
    for (const item of r.results) {
      const key =
        item.state === "NOT_CONFIRMED"
          ? item.code
          : (item.outcome ?? item.state);
      if (typeof key !== "string" || !Object.hasOwn(codes, key))
        throw Error("BILLING_RESULT_INVALID");
      codes[key]++;
    }
    return {
      state: r.state,
      discovered: count(r.discovered, 2),
      attempted: count(r.attempted, 2),
      skipped: count(r.skipped, 2),
      provider_requests: count(r.provider_requests, 8),
      provider_posts: count(r.provider_posts, 2),
      outcomes: codes,
      entitlement_authority: false,
    };
  }
  if (!Array.isArray(r.outcomes) || r.outcomes.length > 1)
    throw Error("BILLING_RESULT_INVALID");
  const codes = { ELIGIBLE: 0, DENIED: 0, UNVERIFIED: 0 };
  let acknowledged = 0;
  for (const item of r.outcomes) {
    const key =
      item.outcome === "ELIGIBLE" || item.outcome === "DENIED"
        ? item.outcome
        : "UNVERIFIED";
    codes[key as keyof typeof codes]++;
    acknowledged += count(item.acknowledged, 1);
  }
  return {
    state: "COMPLETED",
    processed: count(r.processed, 1),
    acknowledged,
    outcomes: codes,
    entitlement_authority: false,
  };
}
export function createBillingHttpHandler(
  kind: BillingHttpKind,
  ports: BillingHttpPorts = {},
) {
  const deadline = ports.bodyDeadlineMs ?? 1000;
  if (!Number.isInteger(deadline) || deadline < 1 || deadline > 1000)
    throw Error("BILLING_HTTP_BODY_BUDGET_INVALID");
  return async (request: Request) => {
    if (!["GET", "POST"].includes(request.method))
      return json({ error: "Method unavailable" }, 405);
    const env = (ports.environment ?? (() => process.env))();
    if (
      env.KXRA_BILLING_HTTP_ENABLED !== "true" ||
      (kind === "dispatch"
        ? env.KXRA_MODERN_BILLING_DISPATCH_ENABLED
        : env.KXRA_PAID_PROOF_REFRESH_ENABLED) !== "true"
    )
      return json({ error: "Unavailable" }, 404);
    // Never call the email helper's default parameter. Invalid/absent dedicated billing secret has no fallback.
    const secret = env.KXRA_BILLING_WORKER_TRIGGER_SECRET;
    if (!validWorkerTriggerSecret(secret))
      return json({ error: "Access unavailable" }, 401);
    if (!authorizeWorkerRequest(request, secret!))
      return json({ error: "Access unavailable" }, 401);
    try {
      const url = new URL(request.url);
      if (url.search || url.hash || url.pathname !== `/api/billing/${kind}`)
        return json({ error: "Request prohibited" }, 400);
      await requireEmptyBody(request, deadline);
    } catch {
      return json({ error: "Request prohibited" }, 400);
    }
    try {
      const invoke =
        ports.invoke ??
        (async (k, e) =>
          (await import("./billing-http-runtime")).runBillingHttpInvocation(
            k,
            e,
          ));
      const result = await invoke(kind, env);
      return json(billingHttpSummary(kind, result));
    } catch {
      return json(
        { error: "Worker unavailable", code: "BILLING_WORKER_NOT_CONFIRMED" },
        503,
      );
    }
  };
}
