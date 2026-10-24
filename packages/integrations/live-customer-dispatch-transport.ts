import type { LiveBillingTransport } from "./live-catalogue-stripe";
import { LIVE_STRIPE_API_VERSION } from "./live-catalogue-stripe";

/** Pin destination, explicit bounded call/POST budget, decoded response bytes
 * and complete body deadline. Single-job wrappers retain four calls/one POST;
 * a batch may impose a larger shared ceiling without weakening those wrappers.
 */
export function boundedDispatchTransport(
  fetcher: typeof fetch,
  secretKey: string,
  policy: {
    authorize: (url: URL, init: RequestInit) => void;
    inspect?: (url: URL, body: Buffer) => void;
  },
  options: {
    deadlineMs?: number;
    now?: () => number;
    maxRequests?: number;
    maxPosts?: number;
  } = {},
): LiveBillingTransport {
  const milliseconds = options.deadlineMs ?? 30_000,
    clock = options.now ?? Date.now;
  const maxRequests = options.maxRequests ?? 4,
    maxPosts = options.maxPosts ?? 1;
  if (
    !Number.isInteger(milliseconds) ||
    milliseconds < 1 ||
    milliseconds > 90_000 ||
    !Number.isInteger(maxRequests) ||
    maxRequests < 1 ||
    maxRequests > 80 ||
    !Number.isInteger(maxPosts) ||
    maxPosts < 0 ||
    maxPosts > 20 ||
    maxPosts > maxRequests
  )
    throw Error("LIVE_CUSTOMER_TRANSPORT_CONFIGURATION_INVALID");
  const deadline = clock() + milliseconds;
  let calls = 0,
    posts = 0;
  return async (url, init) => {
    const target = new URL(url),
      headers = new Headers(init.headers),
      method = init.method || "GET";
    if (
      target.origin !== "https://api.stripe.com" ||
      target.username ||
      target.password ||
      target.hash ||
      !["GET", "POST"].includes(method) ||
      headers.get("authorization") !== `Bearer ${secretKey}` ||
      headers.get("stripe-version") !== LIVE_STRIPE_API_VERSION ||
      headers.has("stripe-account") ||
      ++calls > maxRequests ||
      clock() >= deadline
    )
      throw Error("LIVE_CUSTOMER_TRANSPORT_REJECTED");
    if (method === "POST" && ++posts > maxPosts)
      throw Error("LIVE_CUSTOMER_TRANSPORT_REJECTED");
    policy.authorize(target, init);
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let reject!: (error: unknown) => void;
    const cancelled = new Promise<never>((_, fail) => {
      reject = fail;
    });
    const abort = () => {
      controller.abort();
      if (reader) void reader.cancel().catch(() => {});
      reject(Error("LIVE_CUSTOMER_TRANSPORT_UNAVAILABLE"));
    };
    const timer = setTimeout(
      abort,
      Math.max(1, Math.min(15_000, deadline - clock())),
    );
    init.signal?.addEventListener("abort", abort, { once: true });
    try {
      const operation = Promise.resolve().then(async () => {
        if (
          init.signal?.aborted ||
          controller.signal.aborted ||
          clock() >= deadline
        )
          throw Error();
        const response = await fetcher(url, {
          ...init,
          signal: controller.signal,
          redirect: "error",
        });
        if (
          controller.signal.aborted ||
          response.redirected ||
          (response.url && response.url !== url)
        )
          throw Error();
        if (!response.body)
          return new Response(null, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        reader = response.body.getReader();
        const length = response.headers.get("content-length");
        try {
          if (length && (!/^\d+$/.test(length) || Number(length) > 100_000))
            throw Error();
          const chunks: Uint8Array[] = [];
          let total = 0;
          while (true) {
            const next = await reader.read();
            if (controller.signal.aborted) throw Error();
            if (next.done) break;
            total += next.value.byteLength;
            if (total > 100_000 || clock() >= deadline) throw Error();
            chunks.push(next.value.slice());
          }
          const bytes = Buffer.concat(chunks, total);
          policy.inspect?.(target, bytes);
          return new Response(bytes, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        } catch {
          void reader.cancel().catch(() => {});
          throw Error();
        } finally {
          reader.releaseLock();
          reader = undefined;
        }
      });
      return await Promise.race([operation, cancelled]);
    } catch {
      throw Error("LIVE_CUSTOMER_TRANSPORT_UNAVAILABLE");
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", abort);
    }
  };
}

/** Strict customer-only capability retained for existing callers. */
export function boundedLiveCustomerTransport(
  fetcher: typeof fetch,
  secretKey: string,
  prices: readonly string[],
  options: { deadlineMs?: number; now?: () => number } = {},
) {
  if (options.deadlineMs !== undefined && options.deadlineMs > 30_000)
    throw Error("LIVE_CUSTOMER_TRANSPORT_CONFIGURATION_INVALID");
  return boundedDispatchTransport(
    fetcher,
    secretKey,
    {
      authorize: (target, init) => {
        const method = init.method || "GET",
          headers = new Headers(init.headers);
        const price = target.pathname.startsWith("/v1/prices/")
          ? target.pathname.slice("/v1/prices/".length)
          : null;
        const get =
          method === "GET" &&
          !init.body &&
          ((target.pathname === "/v1/account" && !target.search) ||
            (/^\/v1\/customers\/cus_[A-Za-z0-9]{6,}$/.test(target.pathname) &&
              !target.search) ||
            (price !== null &&
              prices.includes(price) &&
              [...target.searchParams].length === 1 &&
              target.searchParams.get("expand[]") === "product"));
        const post =
          method === "POST" &&
          target.pathname === "/v1/customers" &&
          !target.search;
        if (!get && !post) throw Error("LIVE_CUSTOMER_TRANSPORT_REJECTED");
        if (post) {
          if (
            typeof init.body !== "string" ||
            !headers.get("idempotency-key")?.startsWith("kxra-customer-")
          )
            throw Error("LIVE_CUSTOMER_TRANSPORT_REJECTED");
          const body = new URLSearchParams(init.body),
            keys = [
              "kxra_customer_intent",
              "kxra_org",
              "kxra_actor",
              "kxra_offer",
              "kxra_mapping_revision",
              "kxra_intent_version",
              "kxra_terms_sha256",
              "kxra_execution_scope",
              "kxra_execution_mode",
              "kxra_execution_sha256",
              "kxra_execution_project",
            ];
          if (
            [...body].length !== keys.length ||
            keys.some((key) => body.getAll(`metadata[${key}]`).length !== 1)
          )
            throw Error("LIVE_CUSTOMER_TRANSPORT_REJECTED");
        }
      },
    },
    { deadlineMs: options.deadlineMs, now: options.now },
  );
}
