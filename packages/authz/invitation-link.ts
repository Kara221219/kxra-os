export function invitationActionUrl(origin: string, token: string) {
  if (!/^[A-Za-z0-9_-]{32,100}$/.test(token))
    throw new Error("INVITATION_TOKEN_INVALID");
  const url = new URL(`/join/${token}`, origin);
  return url.toString();
}

export function invitationTokenFromUrl(value: string) {
  const url = new URL(value);
  const pathToken = url.pathname.match(
    /^\/join\/([A-Za-z0-9_-]{32,100})\/?$/,
  )?.[1];
  return (
    pathToken ||
    url.searchParams.get("token") ||
    new URLSearchParams(url.hash.slice(1)).get("token")
  );
}

// Translate secret-bearing path/query links before rendering the static join page.
// The fragment stays in the browser and is never sent in the next HTTP request.
export function invitationFragmentPath(token: unknown) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{32,100}$/.test(token)
    ? `/join#token=${encodeURIComponent(token)}`
    : "/join/account?state=invalid";
}
