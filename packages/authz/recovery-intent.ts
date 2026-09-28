export function authCallbackDestination(requested: string | null) {
  return requested === "/join/finish" ? requested : "/os";
}

export function validSupabaseRefreshTokenShape(token: string) {
  if (token.length < 12 || token.length > 10_000) return false;
  // Supabase still accepts legacy refresh tokens as 12 lowercase
  // alphanumeric characters. Longer tokens use its signed token format and
  // are verified by Auth when the session is established.
  return token.length !== 12 || /^[a-z0-9]{12}$/.test(token);
}

export function recentRecoveryAuthentication(
  claims: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  if (!claims || typeof claims !== "object") return false;
  const methods = (claims as { amr?: unknown }).amr;
  if (!Array.isArray(methods) || !methods.length) return false;
  const parsed = methods.filter(
    (entry): entry is { method: string; timestamp: number } =>
      Boolean(
        entry &&
        typeof entry === "object" &&
        typeof (entry as { method?: unknown }).method === "string" &&
        Number.isInteger((entry as { timestamp?: unknown }).timestamp),
      ),
  );
  if (parsed.length !== methods.length) return false;
  const latestTimestamp = Math.max(...parsed.map((entry) => entry.timestamp));
  const latest = parsed.filter((entry) => entry.timestamp === latestTimestamp);
  if (latest.length !== 1 || latest[0].method !== "recovery") return false;
  const timestamp = latest[0].timestamp;
  return timestamp >= nowSeconds - 10 * 60 && timestamp <= nowSeconds + 60;
}
