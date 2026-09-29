export function invitationActionUrl(origin: string, token: string) {
  const url = new URL("/join", origin);
  url.searchParams.set("token", token);
  return url.toString();
}

export function invitationTokenFromUrl(value: string) {
  const url = new URL(value);
  return (
    url.searchParams.get("token") ||
    new URLSearchParams(url.hash.slice(1)).get("token")
  );
}
