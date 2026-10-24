import { z } from "zod";
import { customerDispatchConfiguration } from "./live-customer-dispatch-config";

/** Same deployment-fixed mode/TLS/role gate; origin is additionally pinned for
 * the checkout return URLs. No caller-selectable mode, origin or offer input.
 */
export function checkoutDispatchConfiguration(
  env: Record<string, string | undefined> = process.env,
) {
  const config = customerDispatchConfiguration(env);
  if (!config) return null;
  try {
    const origin = new URL(env.KXRA_ORIGIN || "");
    if (
      origin.protocol !== "https:" ||
      origin.origin !== env.KXRA_ORIGIN ||
      origin.username ||
      origin.password ||
      origin.port ||
      origin.pathname !== "/" ||
      origin.search ||
      origin.hash
    )
      throw Error();
    if (
      config.executionMode === "LIVE"
        ? origin.origin !== "https://app.kxra-group.com"
        : !/^kxra-os-staging(?:-[a-z0-9-]+)?\.vercel\.app$/.test(
            origin.hostname,
          )
    )
      throw Error();
    return { ...config, origin: origin.origin };
  } catch {
    throw Error("CHECKOUT_DISPATCH_CONFIGURATION_INVALID");
  }
}
export function parseCheckoutDispatchArguments(args: readonly string[]) {
  if (args.length !== 3 || args[0] !== "--once" || args[1] !== "--request")
    throw Error("CHECKOUT_DISPATCH_USAGE");
  return z.uuid().parse(args[2]);
}
