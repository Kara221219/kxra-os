/** Client-safe Stripe portal URL validation. Never log, store or interpolate errors
 * with the returned bearer URL. Server additionally supplies the attested mode.
 */
export function validatedPortalDeliveryUrl(
  input: unknown,
  livemode?: boolean,
): string {
  if (typeof input !== "string" || input.length > 8_192)
    throw Error("PORTAL_URL_REJECTED");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw Error("PORTAL_URL_REJECTED");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== "billing.stripe.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  )
    throw Error("PORTAL_URL_REJECTED");
  const tokenPath = /^\/p\/session\/([A-Za-z0-9_~-]{6,})$/.exec(url.pathname);
  if (tokenPath) {
    if (url.search) throw Error("PORTAL_URL_REJECTED");
    if (
      livemode !== undefined &&
      /^(live|test)_/.test(tokenPath[1]) &&
      !tokenPath[1].startsWith(livemode ? "live_" : "test_")
    )
      throw Error("PORTAL_URL_REJECTED");
  } else {
    const secret = url.searchParams.get("secret");
    if (
      url.pathname !== "/p/session" ||
      [...url.searchParams].length !== 1 ||
      url.searchParams.getAll("secret").length !== 1 ||
      !secret ||
      !/^(live|test)_[A-Za-z0-9_-]{6,}={0,2}$/.test(secret) ||
      (livemode !== undefined &&
        !secret.startsWith(livemode ? "live_" : "test_"))
    )
      throw Error("PORTAL_URL_REJECTED");
  }
  return url.toString();
}
