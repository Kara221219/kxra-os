import { boundedDispatchTransport } from "./live-customer-dispatch-transport";
/** Five provider calls maximum: account, price, customer, portal configuration,
 * then ONE portal POST. Two bounded readers share one outer deadline/budget.
 */
export function boundedPortalTransport(
  fetcher: typeof fetch,
  key: string,
  expected: {
    customer_id: string;
    price_id: string;
    portal_configuration_id: string;
    origin: string;
  },
  options: { deadlineMs?: number; now?: () => number } = {},
) {
  const clock = options.now || Date.now,
    milliseconds = options.deadlineMs ?? 30_000;
  if (
    !Number.isInteger(milliseconds) ||
    milliseconds < 1 ||
    milliseconds > 30_000
  )
    throw Error("PORTAL_TRANSPORT_CONFIGURATION_INVALID");
  const deadline = clock() + milliseconds;
  let calls = 0,
    posts = 0,
    configReads = 0;
  const main = boundedDispatchTransport(
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
          url.pathname === "/v1/billing_portal/sessions" &&
          !url.search;
        if (!get && !post) throw Error("PORTAL_TRANSPORT_REJECTED");
        if (post) {
          if (
            typeof init.body !== "string" ||
            !/^kxra-live-[a-f0-9]{64}$/.test(
              headers.get("idempotency-key") || "",
            )
          )
            throw Error("PORTAL_TRANSPORT_REJECTED");
          const body = new URLSearchParams(init.body),
            fields = {
              customer: expected.customer_id,
              configuration: expected.portal_configuration_id,
              return_url: `${expected.origin}/os/start?billing=returned`,
            };
          if (
            [...body].length !== 3 ||
            Object.entries(fields).some(
              ([name, value]) =>
                body.getAll(name).length !== 1 || body.get(name) !== value,
            )
          )
            throw Error("PORTAL_TRANSPORT_REJECTED");
        }
      },
    },
    options,
  );
  const configuration = boundedDispatchTransport(
    fetcher,
    key,
    {
      authorize: (url, init) => {
        if (
          (init.method || "GET") !== "GET" ||
          init.body ||
          url.search ||
          url.pathname !==
            `/v1/billing_portal/configurations/${expected.portal_configuration_id}` ||
          ++configReads > 1
        )
          throw Error("PORTAL_TRANSPORT_REJECTED");
      },
    },
    options,
  );
  return (url: string, init: RequestInit) => {
    if (
      ++calls > 5 ||
      clock() >= deadline ||
      ((init.method || "GET") === "POST" && ++posts > 1)
    )
      throw Error("PORTAL_TRANSPORT_REJECTED");
    const target = new URL(url);
    return target.pathname.startsWith("/v1/billing_portal/configurations/")
      ? configuration(url, init)
      : main(url, init);
  };
}
