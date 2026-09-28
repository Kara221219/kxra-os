import crypto from "node:crypto";

export function authCallbackDestination(requested: string | null) {
  return requested === "/join/finish" ? requested : "/os";
}

type HostedRecoveryIntent = {
  emailDigest: string;
  issuedAt: number;
  expiresAt: number;
};

function recoveryKey(secret: string) {
  if (secret.length < 64) throw new Error("Recovery secret too short");
  return crypto
    .createHash("sha256")
    .update(`kxra-hosted-recovery:${secret}`)
    .digest();
}

function emailDigest(email: string) {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

export function sealHostedRecoveryIntent(
  email: string,
  secret: string,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({
      v: 2,
      emailDigest: emailDigest(email),
      issuedAt: now,
      expiresAt: now + 60 * 60_000,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", recoveryKey(secret))
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function openHostedRecoveryIntent(
  value: string | undefined,
  secret: string,
  now = Date.now(),
): HostedRecoveryIntent | null {
  try {
    if (!value || value.length > 1024) return null;
    const [payload, signature, ...extra] = value.split(".");
    if (extra.length || !payload || !signature) return null;
    const expected = crypto
      .createHmac("sha256", recoveryKey(secret))
      .update(payload)
      .digest();
    const supplied = Buffer.from(signature, "base64url");
    if (
      expected.length !== supplied.length ||
      !crypto.timingSafeEqual(expected, supplied)
    )
      return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      parsed.v !== 2 ||
      typeof parsed.emailDigest !== "string" ||
      !/^[a-f0-9]{64}$/.test(parsed.emailDigest) ||
      !Number.isInteger(parsed.issuedAt) ||
      !Number.isInteger(parsed.expiresAt) ||
      parsed.issuedAt > now + 60_000 ||
      parsed.expiresAt <= now ||
      parsed.expiresAt - parsed.issuedAt !== 60 * 60_000
    )
      return null;
    return {
      emailDigest: parsed.emailDigest,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function hostedRecoveryIntentMatches(
  intent: HostedRecoveryIntent,
  email: string,
) {
  const expected = Buffer.from(intent.emailDigest, "hex");
  const supplied = Buffer.from(emailDigest(email), "hex");
  return (
    expected.length === supplied.length &&
    crypto.timingSafeEqual(expected, supplied)
  );
}

export function validSupabaseRefreshTokenShape(token: string) {
  if (token.length < 12 || token.length > 10_000) return false;
  // Supabase still accepts legacy refresh tokens as 12 lowercase
  // alphanumeric characters. Longer tokens use its signed token format and
  // are verified by Auth when the session is established.
  return token.length !== 12 || /^[a-z0-9]{12}$/.test(token);
}

export function classifyHostedRecoveryRequestFailure(error: unknown) {
  const detail = error as { code?: unknown; status?: unknown } | null;
  const providerStatus =
    typeof detail?.status === "number" && Number.isInteger(detail.status)
      ? detail.status
      : null;
  const providerCode =
    typeof detail?.code === "string" ? detail.code.toLowerCase() : "";
  return {
    event:
      providerStatus === 429 || providerCode.includes("rate_limit")
        ? "PROVIDER_RATE_LIMITED"
        : "PROVIDER_REJECTED",
    providerStatus,
    // Keep the client response invariant across provider failures so it does
    // not become an account-discovery signal. Provider detail stays in
    // privacy-safe server diagnostics only.
    publicStatus: 503,
    publicMessage:
      "Password reset email is temporarily unavailable. Please try again later.",
  } as const;
}

export function recoveryAuthenticationMatchesIntent(
  claims: unknown,
  intent: Pick<HostedRecoveryIntent, "issuedAt" | "expiresAt">,
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
  if (latest.length !== 1 || !["otp", "recovery"].includes(latest[0].method))
    return false;
  const timestamp = latest[0].timestamp;
  const issuedAt = Math.floor(intent.issuedAt / 1000);
  const expiresAt = Math.floor(intent.expiresAt / 1000);
  return timestamp >= issuedAt - 60 && timestamp <= expiresAt + 60;
}
