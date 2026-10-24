import { z } from "zod";
import {
  LiveEntryError,
  requireLiveEntryIdentity,
  requireLiveEntryMfa,
  type LiveEntryIdentity,
} from "./live-billing-entry";

export const portalDeliveryRequest = z
  .object({
    request_id: z.uuid(),
    offer_key: z.enum(["KXRA_STARTER_V1", "KXRA_TEAM_V1", "KXRA_BUSINESS_V1"]),
  })
  .strict();
export type PortalDeliveryRequest = z.infer<typeof portalDeliveryRequest>;
/** Non-secret availability only. Credentials are loaded after authenticated reservation. */
export function portalDeliveryConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  if (
    env.KXRA_PORTAL_DELIVERY_ENABLED !== "true" ||
    env.KXRA_MODERN_BILLING_DISPATCH_ENABLED !== "true" ||
    env.NODE_ENV !== "production"
  )
    return null;
  const staging = env.KXRA_ENVIRONMENT === "staging",
    production = env.KXRA_ENVIRONMENT === "production";
  if (!staging && !production) return null;
  const project = staging ? "jlebgsxcvhvpueuibekd" : "lhbgeucifxxcdoyrnesf";
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${project}.supabase.co`)
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
    if (production && origin.origin !== "https://app.kxra-group.com")
      return null;
    if (
      staging &&
      !/^kxra-os-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(origin.hostname)
    )
      return null;
    return {
      origin: origin.origin,
      project,
      mode: (staging ? "STAGING_SANDBOX" : "LIVE") as
        "STAGING_SANDBOX" | "LIVE",
    };
  } catch {
    return null;
  }
}
export type PortalDeliveryConfiguration = NonNullable<
  ReturnType<typeof portalDeliveryConfiguration>
>;
export async function authorizePortalDelivery(
  ports: {
    configuration: () => ReturnType<typeof portalDeliveryConfiguration>;
    sameOrigin: () => void;
    account: () => Promise<LiveEntryIdentity>;
    now: () => number;
    legalAllowed: (a: LiveEntryIdentity) => Promise<boolean>;
    rate: (a: LiveEntryIdentity) => Promise<boolean>;
    deliver: (
      a: LiveEntryIdentity,
      r: PortalDeliveryRequest,
      c: PortalDeliveryConfiguration,
    ) => Promise<unknown>;
  },
  input: unknown,
) {
  ports.sameOrigin();
  const request = portalDeliveryRequest.parse(input),
    config = ports.configuration();
  if (!config)
    throw new LiveEntryError(
      503,
      "PORTAL_DELIVERY_DISABLED",
      "Billing management is not enabled",
    );
  const a = await ports.account();
  requireLiveEntryIdentity(a);
  requireLiveEntryMfa(a, ports.now());
  if (!(await ports.legalAllowed(a)))
    throw new LiveEntryError(
      428,
      "AGREEMENT_REQUIRED",
      "Review the current required agreements",
    );
  if (!(await ports.rate(a)))
    throw new LiveEntryError(
      429,
      "PORTAL_RATE_LIMITED",
      "Too many billing management requests; try again later",
    );
  return ports.deliver(a, request, config);
}
