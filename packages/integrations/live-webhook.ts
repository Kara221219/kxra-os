import { z } from "zod";
import { verifyBillingWebhook } from "./billing";

export const LIVE_WEBHOOK_ACCOUNT = "acct_1Rv3KdC84VkhhIRz";
export const LIVE_WEBHOOK_API_VERSION = "2025-07-30.basil";
export const LIVE_WEBHOOK_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.pending_update_applied",
  "customer.subscription.pending_update_expired",
  "customer.subscription.trial_will_end",
  "invoice.created",
  "invoice.updated",
  "invoice.finalized",
  "invoice.paid",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.payment_action_required",
  "invoice.voided",
  "invoice.marked_uncollectible",
  "payment_intent.succeeded",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "payment_intent.processing",
  "payment_intent.requires_action",
  "charge.succeeded",
  "charge.failed",
  "charge.refunded",
  "charge.updated",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
  "refund.created",
  "refund.updated",
  "refund.failed",
] as const;
const id = (prefix: string) =>
  z
    .string()
    .max(128)
    .regex(new RegExp(`^${prefix}_[A-Za-z0-9]{6,}$`));
export const liveWakeupSchema = z
  .object({
    event_id: id("evt"),
    event_type: z.enum(LIVE_WEBHOOK_TYPES),
    payload_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    customer_id: id("cus").nullable(),
    subscription_id: id("sub").nullable(),
    invoice_id: id("in").nullable(),
    account_id: z.literal(LIVE_WEBHOOK_ACCOUNT),
    project_ref: z.enum(["jlebgsxcvhvpueuibekd", "lhbgeucifxxcdoyrnesf"]),
    api_version: z.literal(LIVE_WEBHOOK_API_VERSION),
    livemode: z.literal(true),
  })
  .strict();
export type LiveWakeup = z.infer<typeof liveWakeupSchema>;
export type LiveWebhookEndpoint = {
  project: LiveWakeup["project_ref"];
  origin: string;
  secret: string;
};

/** Only exact server-owned endpoint configuration enables this dedicated live route. */
export function liveWebhookConfiguration(
  env: Record<string, string | undefined> = process.env,
): LiveWebhookEndpoint | null {
  const project =
    env.KXRA_ENVIRONMENT === "production"
      ? "lhbgeucifxxcdoyrnesf"
      : env.KXRA_ENVIRONMENT === "staging"
        ? "jlebgsxcvhvpueuibekd"
        : null;
  if (
    env.KXRA_LIVE_WEBHOOK_ENABLED !== "true" ||
    env.NODE_ENV !== "production" ||
    env.KXRA_AUTH_MODE === "fixture" ||
    !project ||
    env.KXRA_LIVE_WEBHOOK_PROJECT_REF !== project ||
    env.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co` ||
    env.KXRA_LIVE_WEBHOOK_ACCOUNT_ID !== LIVE_WEBHOOK_ACCOUNT ||
    env.KXRA_LIVE_WEBHOOK_MODE !== "live" ||
    env.KXRA_LIVE_WEBHOOK_API_VERSION !== LIVE_WEBHOOK_API_VERSION ||
    !env.KXRA_LIVE_WEBHOOK_SECRET ||
    !/^whsec_[A-Za-z0-9_]{32,250}$/.test(env.KXRA_LIVE_WEBHOOK_SECRET)
  )
    return null;
  try {
    const origin = new URL(env.KXRA_ORIGIN || "");
    if (
      origin.protocol !== "https:" ||
      origin.origin !== env.KXRA_ORIGIN ||
      origin.username ||
      origin.password
    )
      return null;
    return {
      project,
      origin: origin.origin,
      secret: env.KXRA_LIVE_WEBHOOK_SECRET,
    };
  } catch {
    return null;
  }
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function reference(value: unknown, prefix: string) {
  if (value == null) return null;
  return id(prefix).parse(typeof value === "string" ? value : object(value).id);
}

/** HMAC verification in the reused verifier precedes JSON parsing. No paid facts retained. */
export function normalizeLiveWebhook(
  raw: Buffer,
  signature: string,
  endpoint: LiveWebhookEndpoint,
  now: number,
): LiveWakeup | null {
  if (signature.length > 2048) throw Error("LIVE_WEBHOOK_INVALID");
  const verified = verifyBillingWebhook(raw, signature, endpoint.secret, now);
  const event = verified.payload;
  if (
    event.object !== "event" ||
    event.livemode !== true ||
    event.api_version !== LIVE_WEBHOOK_API_VERSION ||
    (event.account !== undefined && event.account !== LIVE_WEBHOOK_ACCOUNT) ||
    verified.created > now + 60
  )
    throw Error("LIVE_WEBHOOK_INVALID");
  id("evt").parse(event.id);
  if (
    !LIVE_WEBHOOK_TYPES.includes(
      verified.type as (typeof LIVE_WEBHOOK_TYPES)[number],
    )
  )
    return null;
  const data = object(object(event.data).object);
  if (!Object.keys(data).length) throw Error("LIVE_WEBHOOK_INVALID");
  const subscription = verified.type.startsWith("customer.subscription.")
    ? data.id
    : verified.type.startsWith("invoice.")
      ? object(object(data.parent).subscription_details).subscription
      : data.subscription;
  return liveWakeupSchema.parse({
    event_id: verified.id,
    event_type: verified.type,
    payload_sha256: verified.rawSha256,
    customer_id: reference(data.customer, "cus"),
    subscription_id: reference(subscription, "sub"),
    invoice_id: reference(
      verified.type.startsWith("invoice.") ? data.id : data.invoice,
      "in",
    ),
    account_id: LIVE_WEBHOOK_ACCOUNT,
    project_ref: endpoint.project,
    api_version: LIVE_WEBHOOK_API_VERSION,
    livemode: true,
  });
}

async function boundedRawBody(request: Request, deadlineMs: number) {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 1_000_000)) {
    if (request.body) void request.body.cancel().catch(() => {});
    throw Error("LIVE_WEBHOOK_INVALID");
  }
  if (!request.body) throw Error("LIVE_WEBHOOK_INVALID");
  const reader = request.body.getReader();
  let reject!: (error: unknown) => void;
  const stopped = new Promise<never>((_, fail) => {
    reject = fail;
  });
  const stop = () => {
    void reader.cancel().catch(() => {});
    reject(Error("LIVE_WEBHOOK_INVALID"));
  };
  const timer = setTimeout(stop, deadlineMs);
  request.signal.addEventListener("abort", stop, { once: true });
  try {
    if (request.signal.aborted) throw Error("LIVE_WEBHOOK_INVALID");
    const work = (async () => {
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        total += part.value.byteLength;
        if (total > 1_000_000) {
          stop();
          throw Error("LIVE_WEBHOOK_INVALID");
        }
        chunks.push(part.value.slice());
      }
      return Buffer.concat(chunks, total);
    })();
    return await Promise.race([work, stopped]);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", stop);
    reader.releaseLock();
  }
}

/** Inject persistence in pure tests; actual route supplies existing worker-only DB capability. */
export function createLiveWebhookHandler(ports: {
  configuration: () => LiveWebhookEndpoint | null;
  record: (event: LiveWakeup) => Promise<unknown>;
  now?: () => number;
  bodyDeadlineMs?: number;
}) {
  const deadline = ports.bodyDeadlineMs ?? 3000;
  if (!Number.isInteger(deadline) || deadline < 1 || deadline > 3000)
    throw Error("LIVE_WEBHOOK_CONFIGURATION_INVALID");
  return async (request: Request) => {
    const endpoint = ports.configuration();
    if (!endpoint)
      return Response.json({ error: "Unavailable" }, { status: 404 });
    let verified = false;
    try {
      if (
        request.method !== "POST" ||
        request.url !== `${endpoint.origin}/api/webhooks/workspace-live` ||
        !(request.headers.get("content-type") || "").startsWith(
          "application/json",
        )
      )
        throw Error("LIVE_WEBHOOK_INVALID");
      const raw = await boundedRawBody(request, deadline);
      const safe = normalizeLiveWebhook(
        raw,
        request.headers.get("stripe-signature") || "",
        endpoint,
        ports.now?.() ?? Math.floor(Date.now() / 1000),
      );
      verified = true;
      if (!safe) return Response.json({ received: true, ignored: true });
      await ports.record(safe);
      return Response.json({ received: true });
    } catch {
      return Response.json(
        { error: verified ? "Temporarily unavailable" : "Invalid webhook" },
        { status: verified ? 503 : 400 },
      );
    }
  };
}
