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
