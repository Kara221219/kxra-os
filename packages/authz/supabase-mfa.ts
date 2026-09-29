type MfaResult = { data: any; error: { message?: string } | null };

type HostedFactor = {
  id: string;
  friendly_name?: string;
  factor_type: string;
  status: string;
};

const providerFactorId =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HostedMfaApi = {
  enroll(input: {
    factorType: "totp";
    friendlyName: string;
    issuer: string;
  }): Promise<MfaResult>;
  challengeAndVerify(input: {
    factorId: string;
    code: string;
  }): Promise<MfaResult>;
  unenroll(input: { factorId: string }): Promise<MfaResult>;
  listFactors(): Promise<MfaResult>;
  getAuthenticatorAssuranceLevel(): Promise<MfaResult>;
};

export function requiresHostedMfa(
  source: string | undefined,
  mfaState: string | undefined,
  aal: string | undefined,
) {
  return source === "supabase" && mfaState === "ENROLLED" && aal !== "aal2";
}

export function hostedTotpTimestamp(claims: { aal?: unknown; amr?: unknown }) {
  if (claims.aal !== "aal2" || !Array.isArray(claims.amr)) return undefined;
  const timestamps = claims.amr
    .filter(
      (entry): entry is { method: string; timestamp: number } =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { method?: unknown }).method === "totp" &&
        Number.isInteger((entry as { timestamp?: unknown }).timestamp) &&
        Number((entry as { timestamp?: unknown }).timestamp) > 0,
    )
    .map((entry) => entry.timestamp);
  return timestamps.length ? Math.max(...timestamps) : undefined;
}

function providerError(result: MfaResult, code: string) {
  if (result.error || !result.data) throw Error(code);
  return result.data;
}

export function hostedTotpEnrollmentResponseFailure(data: any) {
  if (data?.type !== "totp") return "factor_type";
  if (typeof data.id !== "string" || !providerFactorId.test(data.id))
    return "factor_id";
  if (typeof data.totp?.qr_code !== "string") return "qr_type";
  if (!data.totp.qr_code.startsWith("data:image/svg+xml;utf-8,"))
    return "qr_scheme";
  if (data.totp.qr_code.length > 100_000) return "qr_size";
  if (typeof data.totp?.secret !== "string") return "secret_type";
  if (!/^[A-Z2-7]{16,256}$/.test(data.totp.secret)) return "secret_shape";
  return undefined;
}

export async function beginHostedTotp(api: HostedMfaApi) {
  const data = providerError(
    await api.enroll({
      factorType: "totp",
      friendlyName: "KXRA OS",
      issuer: "KXRA Group",
    }),
    "MFA_ENROLLMENT_FAILED",
  );
  const responseFailure = hostedTotpEnrollmentResponseFailure(data);
  if (responseFailure) {
    console.error("KXRA MFA enrollment response rejected", {
      reason: responseFailure,
    });
    throw Error("MFA_ENROLLMENT_RESPONSE_INVALID");
  }
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

function factors(result: MfaResult): HostedFactor[] {
  const data = providerError(result, "MFA_FACTOR_LOOKUP_FAILED");
  if (!Array.isArray(data.all)) throw Error("MFA_FACTOR_RESPONSE_INVALID");
  for (const factor of data.all) {
    if (
      typeof factor?.id !== "string" ||
      !providerFactorId.test(factor.id) ||
      typeof factor?.factor_type !== "string" ||
      !["verified", "unverified"].includes(factor?.status)
    )
      throw Error("MFA_FACTOR_RESPONSE_INVALID");
  }
  return data.all;
}

export async function hostedMfaGate(api: HostedMfaApi) {
  const assurance = providerError(
    await api.getAuthenticatorAssuranceLevel(),
    "MFA_ASSURANCE_LOOKUP_FAILED",
  );
  const current = assurance.currentLevel;
  const next = assurance.nextLevel;
  if (!["aal1", "aal2"].includes(current) || !["aal1", "aal2"].includes(next))
    throw Error("MFA_ASSURANCE_RESPONSE_INVALID");
  if (current === "aal2") return { challengeRequired: false as const };
  if (next === "aal1") return { challengeRequired: false as const };
  const verified = factors(await api.listFactors()).filter(
    (factor) => factor.factor_type === "totp" && factor.status === "verified",
  );
  const preferred = verified.filter(
    (factor) => factor.friendly_name === "KXRA OS",
  );
  const eligible = preferred.length ? preferred : verified;
  if (eligible.length !== 1) throw Error("MFA_FACTOR_AMBIGUOUS");
  return { challengeRequired: true as const, factorId: eligible[0].id };
}

async function unenrollExact(api: HostedMfaApi, factorId: string) {
  const data = providerError(
    await api.unenroll({ factorId }),
    "MFA_REMOVAL_FAILED",
  );
  if (data.id !== factorId) throw Error("MFA_REMOVAL_RESPONSE_INVALID");
}

export async function prepareHostedTotp(
  api: HostedMfaApi,
  expectedFactorId?: string | null,
) {
  const all = factors(await api.listFactors());
  const expected = expectedFactorId
    ? all.find((factor) => factor.id === expectedFactorId)
    : undefined;
  if (expected) {
    if (expected.factor_type !== "totp") throw Error("MFA_FACTOR_MISMATCH");
    if (expected.status === "verified")
      return { state: "ENROLLED" as const, factorId: expected.id };
    await unenrollExact(api, expected.id);
  } else if (expectedFactorId) {
    // The database may retain a reference after an interrupted provider removal.
    // Starting a fresh enrollment safely replaces that stale reference.
  } else {
    const verified = all.filter(
      (factor) =>
        factor.factor_type === "totp" &&
        factor.status === "verified" &&
        factor.friendly_name === "KXRA OS",
    );
    if (verified.length > 1) throw Error("MFA_FACTOR_AMBIGUOUS");
    if (verified.length === 1)
      return { state: "ENROLLED" as const, factorId: verified[0].id };
    for (const orphan of all.filter(
      (factor) =>
        factor.factor_type === "totp" &&
        factor.status === "unverified" &&
        factor.friendly_name === "KXRA OS",
    ))
      await unenrollExact(api, orphan.id);
  }
  const enrollment = await beginHostedTotp(api);
  return { state: "ENROLLING" as const, ...enrollment };
}

export async function verifyHostedTotp(
  api: HostedMfaApi,
  factorId: string,
  code: string,
) {
  if (!factorId || !/^\d{6}$/.test(code)) throw Error("MFA_PROOF_INVALID");
  const data = providerError(
    await api.challengeAndVerify({ factorId, code }),
    "MFA_VERIFICATION_FAILED",
  );
  if (
    typeof data.access_token !== "string" ||
    typeof data.refresh_token !== "string" ||
    data.user?.id == null
  )
    throw Error("MFA_VERIFICATION_RESPONSE_INVALID");
}

export async function removeHostedTotp(
  api: HostedMfaApi,
  factorId: string,
  code: string,
) {
  await verifyHostedTotp(api, factorId, code);
  await unenrollExact(api, factorId);
}
