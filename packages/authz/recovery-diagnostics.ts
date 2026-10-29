// Private, finite diagnostics only. Never accept request data as event fields.
const stages = [
  "INPUT",
  "VERIFY_USER",
  "VERIFY_CLAIMS",
  "VERIFY_INTENT",
  "ESTABLISH_SESSION",
  "CHECK_ELIGIBILITY",
  "UPDATE_PASSWORD",
  "AUDIT",
  "SIGN_OUT",
  "COMPLETE",
] as const;
const reasons = [
  "UNCLASSIFIED_EXCEPTION",
  "INPUT_INVALID",
  "MISSING_RECOVERY_INPUT",
  "PROVIDER_USER_REJECTED",
  "CLAIMS_REJECTED",
  "IDENTITY_MISMATCH",
  "INTENT_INVALID",
  "EMAIL_BINDING_MISMATCH",
  "RECOVERY_METHOD_INVALID",
  "SESSION_REJECTED",
  "ELIGIBILITY_DENIED",
  "PASSWORD_UPDATE_REJECTED",
  "AUDIT_FAILED",
  "AUDIT_RESULT_UNACKNOWLEDGED",
  "SIGN_OUT_FAILED",
  "SUCCESS",
] as const;
export type RecoveryStage = (typeof stages)[number];
export type RecoveryReason = (typeof reasons)[number];
type CredentialState =
  "NOT_ATTEMPTED" | "ATTEMPTED_UNCONFIRMED" | "PROVIDER_CONFIRMED_CHANGED";
export type RecoveryDiagnostic = {
  event: "KXRA_RECOVERY_CONFIRM_RESULT";
  stage: RecoveryStage;
  reason: RecoveryReason;
  credentialState: CredentialState;
  providerStatus: number | null;
  providerCategory:
    | "NONE"
    | "SESSION_INVALID"
    | "PASSWORD_POLICY"
    | "SAME_PASSWORD"
    | "REAUTH_REQUIRED"
    | "RATE_LIMITED"
    | "OTHER";
};

function providerDetail(
  error: unknown,
): Pick<RecoveryDiagnostic, "providerStatus" | "providerCategory"> {
  if (!error) return { providerStatus: null, providerCategory: "NONE" };
  // Even a throwing getter/proxy cannot escape into the authentication result.
  try {
    const detail = error as { status?: unknown; code?: unknown };
    const status = detail.status;
    const code = detail.code;
    const providerStatus =
      typeof status === "number" &&
      Number.isInteger(status) &&
      status >= 100 &&
      status <= 599
        ? status
        : null;
    const providerCategory = [
      "session_not_found",
      "session_expired",
      "bad_jwt",
      "otp_expired",
      "refresh_token_not_found",
      "refresh_token_already_used",
    ].includes(code as string)
      ? "SESSION_INVALID"
      : ["weak_password", "password_too_short"].includes(code as string)
        ? "PASSWORD_POLICY"
        : code === "same_password"
          ? "SAME_PASSWORD"
          : [
                "reauthentication_needed",
                "reauthentication_not_valid",
                "insufficient_aal",
                "mfa_verification_failed",
              ].includes(code as string)
            ? "REAUTH_REQUIRED"
            : providerStatus === 429 ||
                [
                  "over_request_rate_limit",
                  "over_email_send_rate_limit",
                ].includes(code as string)
              ? "RATE_LIMITED"
              : "OTHER";
    return { providerStatus, providerCategory };
  } catch {
    return { providerStatus: null, providerCategory: "OTHER" };
  }
}

export function createRecoveryConfirmationDiagnostics(
  writer: (event: RecoveryDiagnostic) => unknown = (event) =>
    console.warn("KXRA recovery confirmation", event),
) {
  let stage: RecoveryStage = "INPUT";
  let reason: RecoveryReason = "UNCLASSIFIED_EXCEPTION";
  let credentialState: CredentialState = "NOT_ATTEMPTED";
  let detail = providerDetail(null);
  let emitted = false;
  return {
    mark(
      nextStage: RecoveryStage,
      nextReason: RecoveryReason = "UNCLASSIFIED_EXCEPTION",
      error?: unknown,
    ) {
      stage = stages.includes(nextStage) ? nextStage : "INPUT";
      reason = reasons.includes(nextReason)
        ? nextReason
        : "UNCLASSIFIED_EXCEPTION";
      detail = providerDetail(error);
    },
    attempted() {
      credentialState = "ATTEMPTED_UNCONFIRMED";
    },
    confirmed() {
      credentialState = "PROVIDER_CONFIRMED_CHANGED";
    },
    emit() {
      if (emitted) return;
      emitted = true;
      try {
        const result = writer({
          event: "KXRA_RECOVERY_CONFIRM_RESULT",
          stage,
          reason,
          credentialState,
          providerStatus: detail.providerStatus,
          providerCategory: detail.providerCategory,
        });
        // Also contain a writer returning a rejected promise; never await it.
        if (
          result &&
          typeof (result as PromiseLike<unknown>).then === "function"
        )
          Promise.resolve(result).catch(() => undefined);
      } catch {
        /* Logging must not change authentication behavior. */
      }
    },
  };
}
