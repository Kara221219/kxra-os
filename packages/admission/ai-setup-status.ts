// Public own-intent metadata only. Never includes keys, ciphertext, fingerprints or evidence.
export const aiSetupProviders = [
  "OPENAI",
  "ANTHROPIC",
  "GOOGLE",
  "OPENROUTER",
  "COMPATIBLE",
] as const;
export const aiSetupReasons = [
  "CLEARED",
  "AWAITING_PROVIDER_REVIEW",
  "BUSINESS_REVIEW_REQUIRED",
  "BUSINESS_REVIEW_UNBOUND",
  "BUSINESS_REVIEW_CHANGED",
  "BUSINESS_PROVIDER_MISMATCH",
  "INTENT_EXPIRED",
  "SESSION_CHANGED",
  "PROVIDER_REVIEW_BLOCKED",
  "REVIEW_WITHDRAWN",
  "REVIEW_NOT_CURRENT",
  "ACCOUNT_MODE_REVIEW_REQUIRED",
  "SAVED",
  "SAVED_AUTHORITY_CHANGED",
] as const;
export const aiSetupActions = [
  "RESUBMIT_SAME_DETAILS",
  "WAIT_FOR_REVIEW",
  "COMPLETE_BUSINESS_REVIEW",
  "CREATE_NEW_INTENT",
  "CONTACT_SUPPORT",
  "USE_CONNECTIONS",
] as const;
export type AiSetupStatus = {
  admission_id: string;
  provider: (typeof aiSetupProviders)[number];
  model: string;
  endpoint_id: string;
  state:
    | "ELIGIBLE"
    | "REVIEW_REQUIRED"
    | "BLOCKED"
    | "NEW_INTENT_REQUIRED"
    | "SAVED";
  reason: (typeof aiSetupReasons)[number];
  next_action: (typeof aiSetupActions)[number];
  expires_at: string;
};
export const isAiAdmissionId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
export function parseAiSetupStatus(value: unknown): AiSetupStatus {
  const fail = () => {
    throw Error("AI_SETUP_STATUS_INVALID");
  };
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join(",") !==
      "admission_id,endpoint_id,expires_at,model,next_action,provider,reason,state" ||
    !isAiAdmissionId(v.admission_id) ||
    !aiSetupProviders.includes(v.provider as AiSetupStatus["provider"]) ||
    typeof v.model !== "string" ||
    !/^[a-zA-Z0-9._:/-]{1,160}$/.test(v.model) ||
    typeof v.endpoint_id !== "string" ||
    !/^[a-zA-Z0-9_-]{0,80}$/.test(v.endpoint_id) ||
    typeof v.expires_at !== "string" ||
    v.expires_at.length > 40 ||
    !Number.isFinite(Date.parse(v.expires_at)) ||
    !aiSetupReasons.includes(v.reason as AiSetupStatus["reason"]) ||
    !aiSetupActions.includes(v.next_action as AiSetupStatus["next_action"])
  )
    return fail();
  const allowed: Record<string, readonly string[]> = {
    ELIGIBLE: ["RESUBMIT_SAME_DETAILS"],
    REVIEW_REQUIRED: ["WAIT_FOR_REVIEW", "CONTACT_SUPPORT"],
    BLOCKED: ["CONTACT_SUPPORT"],
    NEW_INTENT_REQUIRED: ["COMPLETE_BUSINESS_REVIEW", "CREATE_NEW_INTENT"],
    SAVED: ["USE_CONNECTIONS"],
  };
  if (
    typeof v.state !== "string" ||
    !Object.hasOwn(allowed, v.state) ||
    !allowed[v.state].includes(String(v.next_action))
  )
    return fail();
  if (
    (v.state === "ELIGIBLE" && v.reason !== "CLEARED") ||
    (v.state === "SAVED" && v.reason !== "SAVED")
  )
    return fail();
  return {
    admission_id: v.admission_id,
    provider: v.provider as AiSetupStatus["provider"],
    model: v.model,
    endpoint_id: v.endpoint_id,
    state: v.state as AiSetupStatus["state"],
    reason: v.reason as AiSetupStatus["reason"],
    next_action: v.next_action as AiSetupStatus["next_action"],
    expires_at: v.expires_at,
  };
}
