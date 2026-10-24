import { z } from "zod";
import {
  liveEntryRequest,
  liveEntryStatus,
  type LiveEntryStatus,
} from "./live-billing-entry-contract";

/** Server-owned admission only; this flag neither configures Stripe nor dispatches work. */
export function liveBillingEntryConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  if (
    env.KXRA_LIVE_BILLING_ENTRY_ENABLED !== "true" ||
    env.NODE_ENV !== "production"
  )
    return null;
  const project =
    env.KXRA_ENVIRONMENT === "staging"
      ? "jlebgsxcvhvpueuibekd"
      : env.KXRA_ENVIRONMENT === "production"
        ? "lhbgeucifxxcdoyrnesf"
        : null;
  if (
    !project ||
    env.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co`
  )
    return null;
  try {
    const origin = new URL(env.KXRA_ORIGIN || "");
    if (
      origin.protocol !== "https:" ||
      origin.origin !== env.KXRA_ORIGIN ||
      origin.username ||
      origin.password ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      return null;
    if (
      env.KXRA_ENVIRONMENT === "production" &&
      origin.origin !== "https://app.kxra-group.com"
    )
      return null;
    if (
      env.KXRA_ENVIRONMENT === "staging" &&
      !/^kxra-os-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin.hostname)
    )
      return null;
    return { origin: origin.origin, project };
  } catch {
    return null;
  }
}

export type LiveEntryIdentity = {
  id: string;
  organisation_id: string;
  source?: "fixture" | "fake-provider" | "supabase";
  email_verified?: boolean;
  account_state: string;
  organisation_kind: string;
  relationship_type: string;
  security_role: string;
  aal: "aal1" | "aal2";
  auth_time?: number;
};
export class LiveEntryError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function requireLiveEntryIdentity(a: LiveEntryIdentity) {
  if (
    a.source !== "supabase" ||
    a.email_verified !== true ||
    a.account_state !== "ACTIVE" ||
    a.organisation_kind !== "CUSTOMER" ||
    a.relationship_type !== "CUSTOMER" ||
    a.security_role !== "ORG_ADMIN" ||
    !z.uuid().safeParse(a.id).success ||
    !z.uuid().safeParse(a.organisation_id).success
  )
    throw new LiveEntryError(
      403,
      "LIVE_BILLING_ACCESS_DENIED",
      "Billing access unavailable",
    );
}
export function requireLiveEntryMfa(a: LiveEntryIdentity, now: number) {
  const at = (a.auth_time || 0) * 1000;
  if (
    a.aal !== "aal2" ||
    !Number.isFinite(at) ||
    at < now - 15 * 60_000 ||
    at > now + 60_000
  )
    throw new LiveEntryError(
      428,
      "RECENT_MFA_REQUIRED",
      "Complete a recent MFA challenge",
    );
}

export type LiveEntryPorts = {
  configuration: () => ReturnType<typeof liveBillingEntryConfiguration>;
  account: () => Promise<LiveEntryIdentity>;
  sameOrigin: () => void;
  legalAllowed: (a: LiveEntryIdentity) => Promise<boolean>;
  status: (a: LiveEntryIdentity) => Promise<unknown>;
  reserve: (
    a: LiveEntryIdentity,
    request: z.infer<typeof liveEntryRequest>,
  ) => Promise<unknown>;
  now: () => number;
};
export function liveBillingEntryController(ports: LiveEntryPorts) {
  async function identity() {
    const a = await ports.account();
    requireLiveEntryIdentity(a);
    if (!ports.configuration())
      throw new LiveEntryError(
        503,
        "LIVE_BILLING_DISABLED",
        "Live billing entry is not enabled",
      );
    return a;
  }
  return {
    async read(): Promise<LiveEntryStatus> {
      const a = await identity();
      return liveEntryStatus.parse(await ports.status(a));
    },
    async write(input: unknown) {
      ports.sameOrigin();
      const request = liveEntryRequest.parse(input);
      const a = await identity();
      requireLiveEntryMfa(a, ports.now());
      if (!(await ports.legalAllowed(a)))
        throw new LiveEntryError(
          428,
          "AGREEMENT_REQUIRED",
          "Review the current required agreements",
        );
      // SQL reserves the caller's own tenant under verified claims and rechecks all authority.
      const result = z
        .object({
          intent_id: z.uuid().optional(),
          id: z.uuid().optional(),
          state: z.enum([
            "REQUESTED",
            "INFLIGHT",
            "BOUND",
            "CONSUMED",
            "UNCERTAIN",
            "QUARANTINED",
          ]),
          version: z.number().int().positive().optional(),
          entitlement_authority: z.literal(false),
        })
        .strict()
        .parse(await ports.reserve(a, request));
      if (
        request.action === "CUSTOMER"
          ? result.intent_id !== request.request_id || result.id !== undefined
          : result.id !== request.request_id || result.intent_id !== undefined
      )
        throw new LiveEntryError(
          503,
          "LIVE_BILLING_RECEIPT_INVALID",
          "Request could not be verified",
        );
      return {
        state:
          result.state === "REQUESTED"
            ? ("QUEUED" as const)
            : ("RECORDED" as const),
        request_id: request.request_id,
        action: request.action,
        request_state: result.state,
        dispatch_ready: false as const,
        entitlement_authority: false as const,
        message:
          "Request recorded. Provider dispatch is not available; no payment or access change is confirmed.",
      };
    },
  };
}
