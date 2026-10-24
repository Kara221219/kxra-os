import {
  checkoutResultRequest,
  type CheckoutResultMode,
} from "../integrations/checkout-result";
import {
  requireLiveEntryIdentity,
  requireLiveEntryMfa,
  LiveEntryError,
  type LiveEntryIdentity,
} from "./live-billing-entry";

export function checkoutResultConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  if (
    env.KXRA_CHECKOUT_RESULT_ENABLED !== "true" ||
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
      origin.hash ||
      origin.search
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
      mode: (staging ? "STAGING_SANDBOX" : "LIVE") as CheckoutResultMode,
      runtimeIdentity: {
        environment: (staging ? "staging" : "production") as
          "staging" | "production",
        project_ref: project,
        supabase_url: env.NEXT_PUBLIC_SUPABASE_URL,
      },
    };
  } catch {
    return null;
  }
}
export type CheckoutResultPorts = {
  sameOrigin: () => void;
  account: () => Promise<LiveEntryIdentity>;
  configuration: () => ReturnType<typeof checkoutResultConfiguration>;
  legalAllowed: (a: LiveEntryIdentity) => Promise<boolean>;
  consumeReadRate: (a: LiveEntryIdentity) => Promise<boolean>;
  deliver: (
    a: LiveEntryIdentity,
    request: { request_id: string },
    configuration: NonNullable<ReturnType<typeof checkoutResultConfiguration>>,
  ) => Promise<unknown>;
  now: () => number;
};
export async function authorizedCheckoutResult(
  ports: CheckoutResultPorts,
  input: unknown,
) {
  ports.sameOrigin();
  const request = checkoutResultRequest.parse(input);
  const configuration = ports.configuration();
  if (!configuration)
    throw new LiveEntryError(
      503,
      "CHECKOUT_RESULT_DISABLED",
      "Checkout recovery is not enabled",
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
  if (!(await ports.consumeReadRate(a)))
    throw new LiveEntryError(
      429,
      "CHECKOUT_RESULT_RATE_LIMITED",
      "Too many recovery requests; try again later",
    );
  return ports.deliver(a, request, configuration);
}
