import crypto from "node:crypto";
import { z } from "zod";
import {
  modernScopeTagSchema,
  assertModernScopeTag,
  type ModernScopeTag,
} from "./modern-billing-scope";
import { LiveEntryError } from "../authz/live-billing-entry";
import {
  portalDeliveryRequest,
  type PortalDeliveryRequest,
} from "../authz/portal-delivery";
import { validatedPortalDeliveryUrl } from "../workspace/portal-url";
const id = z.uuid();
const reserved = z
  .object({
    id,
    state: z.enum(["REQUESTED", "INFLIGHT", "CONSUMED", "UNCERTAIN"]),
    entitlement_authority: z.literal(false),
    execution_scope: modernScopeTagSchema,
  })
  .strict();
const claimed = z
  .object({
    intent: z
      .object({
        id,
        actor_id: id,
        org_id: id,
        kind: z.literal("PORTAL"),
        state: z.literal("REQUESTED"),
        offer_key: z.string(),
        customer_id: z.string().regex(/^cus_[A-Za-z0-9]{6,}$/),
        subscription_id: z.string().regex(/^sub_[A-Za-z0-9]{6,}$/),
      })
      .passthrough(),
    mapping: z.unknown(),
    observed_version: z.number().int().nonnegative().safe(),
    execution_scope: modernScopeTagSchema,
    entitlement_authority: z.literal(false),
  })
  .strict();
export type PortalCanonical = z.infer<typeof claimed>;
export type PortalWorkerPort = {
  scope: ModernScopeTag;
  claim: (id: string) => Promise<unknown>;
  current: (id: string) => Promise<boolean>;
  create: (
    c: PortalCanonical,
    stillCurrent: () => Promise<boolean>,
  ) => Promise<unknown>;
  finish: (r: {
    intent_id: string;
    outcome: "CONSUMED" | "UNCERTAIN";
    provider_session_id: string | null;
    result_sha256: string;
  }) => Promise<unknown>;
};
function manual(): never {
  throw new LiveEntryError(
    409,
    "PORTAL_MANUAL_REVIEW_REQUIRED",
    "This billing request cannot be recovered automatically. Keep its original request ID for review; no replacement was created.",
  );
}

/** Only this synchronous response may deliver the ephemeral portal URL. All ports
 * resolve AFTER their short SQL transactions commit; create performs provider IO.
 */
export async function synchronousPortalDelivery(
  input: unknown,
  principal: { actor_id: string; org_id: string },
  ports: {
    enabled: boolean;
    reserve: (r: PortalDeliveryRequest) => Promise<unknown>;
    loadWorker: () => Promise<PortalWorkerPort>;
    authorityCurrent: () => Promise<boolean>;
    nowSeconds?: () => number;
  },
) {
  if (!ports.enabled)
    throw new LiveEntryError(
      503,
      "PORTAL_DELIVERY_DISABLED",
      "Billing management is not enabled",
    );
  const request = portalDeliveryRequest.parse(input),
    identity = z.object({ actor_id: id, org_id: id }).strict().parse(principal);
  // Authenticated server principal reserves its own tenant first, before any privileged claim.
  const receipt = reserved.parse(await ports.reserve(request));
  if (receipt.id !== request.request_id) manual();
  if (receipt.state !== "REQUESTED") manual();
  const worker = await ports.loadWorker();
  assertModernScopeTag(receipt.execution_scope, worker.scope);
  let canonical: PortalCanonical;
  try {
    canonical = claimed.parse(await worker.claim(request.request_id));
  } catch {
    manual();
  }
  // Never bootstrap a foreign org/actor UUID into the worker path, even after a race.
  if (
    canonical.intent.id !== request.request_id ||
    canonical.intent.actor_id !== identity.actor_id ||
    canonical.intent.org_id !== identity.org_id ||
    canonical.intent.offer_key !== request.offer_key
  )
    manual();
  assertModernScopeTag(canonical.execution_scope, worker.scope);
  const now = ports.nowSeconds || (() => Math.floor(Date.now() / 1000));
  const current = async () => {
    try {
      return (
        (await ports.authorityCurrent()) &&
        (await worker.current(request.request_id))
      );
    } catch {
      return false;
    }
  };
  let outcome: "CONSUMED" | "UNCERTAIN" = "UNCERTAIN",
    session: string | null = null,
    ephemeral: { url: string; expires_at: number } | null = null;
  try {
    if (!(await current())) throw Error();
    const result = z
      .object({
        execution_scope: modernScopeTagSchema,
        id: z.string().regex(/^bps_[A-Za-z0-9]{6,}$/),
        url: z.string().url(),
        expires_at: z.number().int().positive(),
        entitlement_authority: z.literal(false),
      })
      .passthrough()
      .parse(await worker.create(canonical, current));
    assertModernScopeTag(result.execution_scope, worker.scope);
    session = result.id;
    const url = validatedPortalDeliveryUrl(result.url, worker.scope.livemode);
    if (
      result.expires_at <= now() ||
      result.expires_at > now() + 1860 ||
      !(await current())
    )
      throw Error();
    ephemeral = { url, expires_at: result.expires_at };
    outcome = "CONSUMED";
  } catch {
    outcome = "UNCERTAIN";
    ephemeral = null;
  }
  // Only safe completion metadata is durable. No bearer URL or expiry enters this hash/SQL.
  const resultHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        request_id: request.request_id,
        execution_scope: worker.scope,
        observed_version: canonical.observed_version,
        outcome,
        provider_session_id: session,
      }),
    )
    .digest("hex");
  let completion: unknown;
  try {
    completion = await worker.finish({
      intent_id: request.request_id,
      outcome,
      provider_session_id: session,
      result_sha256: resultHash,
    });
  } catch {
    manual();
  }
  if (outcome !== "CONSUMED" || completion !== "CONSUMED" || !ephemeral)
    manual();
  // Finish atomically rechecks generation, resolving late authority/kill-switch loss
  // to UNCERTAIN. Then recheck the real HTTP principal and exact original replay.
  if (!(await ports.authorityCurrent())) manual();
  const final = reserved.parse(await ports.reserve(request));
  assertModernScopeTag(final.execution_scope, worker.scope);
  if (
    final.id !== request.request_id ||
    final.state !== "CONSUMED" ||
    ephemeral.expires_at <= now()
  )
    manual();
  return {
    state: "READY" as const,
    request_id: request.request_id,
    url: ephemeral.url,
    expires_at: ephemeral.expires_at,
    delivery_ready: true as const,
    dispatch_ready: false as const,
    entitlement_authority: false as const,
  };
}
