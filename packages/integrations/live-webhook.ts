import { z } from "zod";
import { verifyBillingWebhook } from "./billing";
import {
  bindModernExecution,
  modernExecution,
  assertModernProviderMode,
  assertModernModeTag,
  modernScopeTagSchema,
  type ModernExecutionDependencies,
  type ModernExecutionMode,
  type ModernBillingConfiguration,
  MODERN_PRODUCTION_PROJECT,
  MODERN_STAGING_PROJECT,
} from "./modern-billing-scope";
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

const id = (p: string) =>
  z
    .string()
    .max(128)
    .regex(new RegExp(`^${p}_[A-Za-z0-9]{6,}$`));
const baseWakeup = z
  .object({
    event_id: id("evt"),
    event_type: z.enum(LIVE_WEBHOOK_TYPES),
    payload_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    customer_id: id("cus").nullable(),
    subscription_id: id("sub").nullable(),
    invoice_id: id("in").nullable(),
    account_id: id("acct"),
    project_ref: z.enum([MODERN_PRODUCTION_PROJECT, MODERN_STAGING_PROJECT]),
    api_version: z.literal(LIVE_WEBHOOK_API_VERSION),
    livemode: z.boolean(),
    execution_scope: modernScopeTagSchema,
  })
  .strict();
function boundWakeup(e: z.infer<typeof baseWakeup>, mode: ModernExecutionMode) {
  const s = assertModernModeTag(e.execution_scope, mode);
  return (
    e.account_id === s.account_id &&
    e.project_ref === s.project_ref &&
    e.api_version === s.api_version &&
    e.livemode === s.livemode
  );
}
export const liveWakeupSchema = baseWakeup
  .extend({
    livemode: z.literal(true),
    account_id: z.literal(LIVE_WEBHOOK_ACCOUNT),
    project_ref: z.literal(MODERN_PRODUCTION_PROJECT),
  })
  .refine((e) => boundWakeup(e, "LIVE"));
export const stagingSandboxWakeupSchema = baseWakeup
  .extend({
    livemode: z.literal(false),
    project_ref: z.literal(MODERN_STAGING_PROJECT),
  })
  .refine((e) => boundWakeup(e, "STAGING_SANDBOX"));
export type LiveWakeup = z.infer<typeof liveWakeupSchema>;
export type StagingSandboxWakeup = z.infer<typeof stagingSandboxWakeupSchema>;
export type ModernWakeup = LiveWakeup | StagingSandboxWakeup;
export type LiveWebhookEndpoint = ModernExecutionDependencies & {
  project: "lhbgeucifxxcdoyrnesf" | "jlebgsxcvhvpueuibekd";
  origin: string;
  secret: string;
  account_id?: string;
};
function configuration(
  env: Record<string, string | undefined>,
  mode: ModernExecutionMode,
  execution?: ModernBillingConfiguration,
): LiveWebhookEndpoint | null {
  const live = mode === "LIVE",
    project = live ? MODERN_PRODUCTION_PROJECT : MODERN_STAGING_PROJECT,
    prefix = live ? "KXRA_LIVE_WEBHOOK_" : "KXRA_MODERN_SANDBOX_WEBHOOK_";
  if (
    env.NODE_ENV !== "production" ||
    env.KXRA_ENVIRONMENT !== (live ? "production" : "staging") ||
    env[prefix + "ENABLED"] !== "true" ||
    env[prefix + "PROJECT_REF"] !== project ||
    env.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co` ||
    env[prefix + "MODE"] !== (live ? "live" : "staging_sandbox") ||
    env[prefix + "API_VERSION"] !== LIVE_WEBHOOK_API_VERSION ||
    !/^whsec_[A-Za-z0-9_]{32,250}$/.test(env[prefix + "SECRET"] || "") ||
    !/^acct_[A-Za-z0-9]{6,}$/.test(env[prefix + "ACCOUNT_ID"] || "") ||
    (live && env[prefix + "ACCOUNT_ID"] !== LIVE_WEBHOOK_ACCOUNT)
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
    const endpoint: LiveWebhookEndpoint = {
      project,
      origin: origin.origin,
      secret: env[prefix + "SECRET"]!,
      account_id: env[prefix + "ACCOUNT_ID"],
      runtimeIdentity: {
        environment: live ? "production" : "staging",
        project_ref: project,
        supabase_url: env.NEXT_PUBLIC_SUPABASE_URL!,
      },
      ...(execution ? { execution } : {}),
    };
    if (execution) {
      const bound = bindModernExecution(endpoint, undefined, mode);
      if (
        modernExecution(bound).execution_scope.account_id !==
        endpoint.account_id
      )
        return null;
    }
    return endpoint;
  } catch {
    return null;
  }
}
/** Legacy production API remains hard-LIVE. Private attestation is loaded only after HMAC verification. */
export function liveWebhookConfiguration(
  env: Record<string, string | undefined> = process.env,
  execution?: ModernBillingConfiguration,
) {
  return configuration(env, "LIVE", execution);
}
export function stagingSandboxWebhookConfiguration(
  env: Record<string, string | undefined> = process.env,
  execution?: ModernBillingConfiguration,
) {
  return configuration(env, "STAGING_SANDBOX", execution);
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function reference(value: unknown, prefix: string) {
  if (value == null) return null;
  return id(prefix).parse(typeof value === "string" ? value : object(value).id);
}
function normalizeCore(
  raw: Buffer,
  signature: string,
  endpoint: LiveWebhookEndpoint,
  now: number,
  mode: ModernExecutionMode,
): ModernWakeup | null {
  if (signature.length > 2048) throw Error("LIVE_WEBHOOK_INVALID");
  endpoint = bindModernExecution(endpoint, undefined, mode);
  const scope = modernExecution(endpoint).execution_scope;
  if (
    endpoint.project !== scope.project_ref ||
    (endpoint.account_id !== undefined &&
      endpoint.account_id !== scope.account_id)
  )
    throw Error("MODERN_WEBHOOK_SCOPE_MISMATCH");
  const verified = verifyBillingWebhook(raw, signature, endpoint.secret, now),
    event = verified.payload;
  assertModernProviderMode(event, scope);
  if (
    event.object !== "event" ||
    event.livemode !== scope.livemode ||
    event.api_version !== LIVE_WEBHOOK_API_VERSION ||
    (event.account !== undefined && event.account !== scope.account_id) ||
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
  const result = {
    event_id: verified.id,
    event_type: verified.type,
    payload_sha256: verified.rawSha256,
    customer_id: reference(data.customer, "cus"),
    subscription_id: reference(subscription, "sub"),
    invoice_id: reference(
      verified.type.startsWith("invoice.") ? data.id : data.invoice,
      "in",
    ),
    account_id: scope.account_id,
    project_ref: scope.project_ref,
    api_version: LIVE_WEBHOOK_API_VERSION,
    livemode: scope.livemode,
    execution_scope: scope,
  };
  return mode === "LIVE"
    ? liveWakeupSchema.parse(result)
    : stagingSandboxWakeupSchema.parse(result);
}
export function normalizeLiveWebhook(
  raw: Buffer,
  signature: string,
  endpoint: LiveWebhookEndpoint,
  now: number,
) {
  const r = normalizeCore(raw, signature, endpoint, now, "LIVE");
  return r === null ? null : liveWakeupSchema.parse(r);
}
export function normalizeStagingSandboxWebhook(
  raw: Buffer,
  signature: string,
  endpoint: LiveWebhookEndpoint,
  now: number,
) {
  const r = normalizeCore(raw, signature, endpoint, now, "STAGING_SANDBOX");
  return r === null ? null : stagingSandboxWakeupSchema.parse(r);
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

type Ports = {
  configuration: () => LiveWebhookEndpoint | null;
  loadExecutionScope?: () => Promise<ModernBillingConfiguration>;
  record: (e: ModernWakeup) => Promise<unknown>;
  now?: () => number;
  bodyDeadlineMs?: number;
};
function handlerCore(ports: Ports, mode: ModernExecutionMode) {
  const deadline = ports.bodyDeadlineMs ?? 3000;
  if (!Number.isInteger(deadline) || deadline < 1 || deadline > 3000)
    throw Error("LIVE_WEBHOOK_CONFIGURATION_INVALID");
  return async (request: Request) => {
    let endpoint = ports.configuration();
    if (!endpoint)
      return Response.json({ error: "Unavailable" }, { status: 404 });
    let verified = false;
    try {
      if (
        request.method !== "POST" ||
        request.url !==
          `${endpoint.origin}/api/webhooks/${mode === "LIVE" ? "workspace-live" : "workspace-sandbox"}` ||
        !(request.headers.get("content-type") || "").startsWith(
          "application/json",
        )
      )
        throw Error("LIVE_WEBHOOK_INVALID");
      const raw = await boundedRawBody(request, deadline),
        signature = request.headers.get("stripe-signature") || "",
        now = ports.now?.() ?? Math.floor(Date.now() / 1000);
      if (!endpoint.execution) {
        verifyBillingWebhook(raw, signature, endpoint.secret, now);
        if (!ports.loadExecutionScope)
          return Response.json({ error: "Unavailable" }, { status: 503 });
        try {
          endpoint = {
            ...endpoint,
            execution: await ports.loadExecutionScope(),
          };
        } catch {
          return Response.json(
            { error: "Temporarily unavailable" },
            { status: 503 },
          );
        }
      }
      const safe = normalizeCore(raw, signature, endpoint, now, mode);
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
export function createLiveWebhookHandler(
  ports: Omit<Ports, "record"> & {
    record: (e: LiveWakeup) => Promise<unknown>;
  },
) {
  return handlerCore(
    { ...ports, record: (e) => ports.record(liveWakeupSchema.parse(e)) },
    "LIVE",
  );
}
export function createStagingSandboxWebhookHandler(
  ports: Omit<Ports, "record"> & {
    record: (e: StagingSandboxWakeup) => Promise<unknown>;
  },
) {
  return handlerCore(
    {
      ...ports,
      record: (e) => ports.record(stagingSandboxWakeupSchema.parse(e)),
    },
    "STAGING_SANDBOX",
  );
}
