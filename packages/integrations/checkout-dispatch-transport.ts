import { boundedDispatchTransport } from "./live-customer-dispatch-transport";

/** Canonical private checkout capability. No portal/customer/subscription writes,
 * custom amounts, trials, discounts, extra items or client-supplied redirect URL.
 */
export function boundedCheckoutTransport(
  fetcher: typeof fetch,
  key: string,
  expected: {
    customer_id: string;
    price_id: string;
    request_id: string;
    origin: string;
    terms_url: string;
    message: string;
    automatic_tax: boolean;
    metadata: Readonly<Record<string, string>>;
  },
  options: { deadlineMs?: number; now?: () => number } = {},
) {
  if (options.deadlineMs !== undefined && options.deadlineMs > 30_000)
    throw Error("CHECKOUT_TRANSPORT_CONFIGURATION_INVALID");
  return boundedDispatchTransport(
    fetcher,
    key,
    {
      authorize: (url, init) => {
        const method = init.method || "GET",
          headers = new Headers(init.headers);
        const get =
          method === "GET" &&
          !init.body &&
          ((url.pathname === "/v1/account" && !url.search) ||
            (url.pathname === `/v1/customers/${expected.customer_id}` &&
              !url.search) ||
            (url.pathname === `/v1/prices/${expected.price_id}` &&
              [...url.searchParams].length === 1 &&
              url.searchParams.get("expand[]") === "product"));
        const post =
          method === "POST" &&
          url.pathname === "/v1/checkout/sessions" &&
          !url.search;
        if (!get && !post) throw Error("CHECKOUT_TRANSPORT_REJECTED");
        if (post) {
          if (
            typeof init.body !== "string" ||
            !headers.get("idempotency-key")?.startsWith("kxra-live-")
          )
            throw Error("CHECKOUT_TRANSPORT_REJECTED");
          const fields: Record<string, string> = {
            customer: expected.customer_id,
            mode: "subscription",
            "consent_collection[terms_of_service]": "required",
            "custom_text[terms_of_service_acceptance][message]":
              expected.message,
            "line_items[0][price]": expected.price_id,
            "line_items[0][quantity]": "1",
            client_reference_id: expected.request_id,
            "automatic_tax[enabled]": String(expected.automatic_tax),
            allow_promotion_codes: "false",
            "payment_method_types[0]": "card",
            success_url: `${expected.origin}/os/start?billing=returned`,
            cancel_url: `${expected.origin}/os/start?billing=cancelled`,
          };
          for (const [name, value] of Object.entries(expected.metadata)) {
            fields[`metadata[${name}]`] = value;
            fields[`subscription_data[metadata][${name}]`] = value;
          }
          const body = new URLSearchParams(init.body);
          if (
            [...body].length !== Object.keys(fields).length ||
            Object.entries(fields).some(
              ([name, value]) =>
                body.getAll(name).length !== 1 || body.get(name) !== value,
            )
          )
            throw Error("CHECKOUT_TRANSPORT_REJECTED");
        }
      },
      inspect: (url, bytes) => {
        if (url.pathname === "/v1/account") {
          const account = JSON.parse(bytes.toString("utf8")) as {
            business_profile?: { terms_of_service_url?: unknown };
          };
          if (
            account.business_profile?.terms_of_service_url !==
            expected.terms_url
          )
            throw Error("CHECKOUT_ACCOUNT_TERMS_UNVERIFIED");
        }
      },
    },
    { deadlineMs: options.deadlineMs, now: options.now },
  );
}
