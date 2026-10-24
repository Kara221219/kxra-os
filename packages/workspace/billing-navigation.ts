import { z } from "zod";
import { validatedPortalDeliveryUrl } from "./portal-url";

const ready = z
  .object({
    state: z.literal("READY"),
    request_id: z.uuid(),
    url: z.string().url().max(4096),
    expires_at: z.number().int().positive(),
    delivery_ready: z.literal(true),
    dispatch_ready: z.literal(false),
    entitlement_authority: z.literal(false),
  })
  .strict();

/** Navigation only. Paid access always comes from current server state. */
export function billingResultDestination(
  input: unknown,
  requestId: string,
  kind: "CHECKOUT" | "PORTAL",
  now = Date.now(),
) {
  z.uuid().parse(requestId);
  z.enum(["CHECKOUT", "PORTAL"]).parse(kind);
  const result = ready.parse(input);
  if (
    result.request_id !== requestId ||
    !Number.isFinite(now) ||
    result.expires_at <= Math.floor(now / 1000) ||
    result.expires_at > Math.floor(now / 1000) + 86460
  )
    throw Error("BILLING_RESULT_UNAVAILABLE");
  const url = new URL(result.url);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname !==
      (kind === "CHECKOUT" ? "checkout.stripe.com" : "billing.stripe.com") ||
    (kind === "CHECKOUT" &&
      !/^\/c\/pay\/cs_(live|test)_[A-Za-z0-9_]{6,}$/.test(url.pathname))
  )
    throw Error("BILLING_RESULT_UNAVAILABLE");
  return kind === "PORTAL"
    ? validatedPortalDeliveryUrl(url.toString())
    : url.toString();
}

export function openBillingResult(
  input: unknown,
  requestId: string,
  kind: "CHECKOUT" | "PORTAL",
  navigate: (url: string) => void,
  now = Date.now(),
) {
  navigate(billingResultDestination(input, requestId, kind, now));
}
