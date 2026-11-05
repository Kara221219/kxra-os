// Strict nonsecret projection. No fingerprint, ciphertext, account/evidence hash or raw document.
export type ReviewKind = "BUSINESS" | "AI";
export type ReviewState = "ELIGIBLE" | "BLOCKED" | "REVIEW_REQUIRED";
export const reviewProviders = [
  "OPENAI",
  "ANTHROPIC",
  "GOOGLE",
  "OPENROUTER",
  "COMPATIBLE",
] as const;
export type ReviewReceipt = {
  operation_id: string;
  request_id: string;
  kind: ReviewKind;
  subject_id: string;
  review_id: string;
  state: ReviewState | "WITHDRAWN";
  expires_at: string | null;
  entitlement_authority: false;
  provider_acceptance: false;
};
export type ReviewDetail = {
  request_id: string | null;
  kind: ReviewKind;
  subject_id: string;
  organization_name: string;
  legal_name: string;
  country: string;
  region: string;
  provider: (typeof reviewProviders)[number];
  model: string;
  endpoint_id: string;
  policy_version: string;
  reason:
    | "READY"
    | "BILLING_OR_TERMS_REQUIRED"
    | "SAVED_REQUIRES_NEW_INTENT"
    | "INTENT_EXPIRED"
    | "BUSINESS_OR_ACCOUNT_REVIEW_REQUIRED"
    | "REPLACEMENT_REQUIRES_AUTHORITY";
  can_decide: boolean;
  can_withdraw: boolean;
  request_current: boolean;
  prior_review: {
    id: string;
    state: ReviewState;
    withdrawn: boolean;
    expires_at: string;
  } | null;
  expires_at: string | null;
  receipt: ReviewReceipt | null;
};
export type ReviewQueue = { items: ReviewDetail[]; next_cursor: string | null };
export const isReviewId = (v: unknown): v is string =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    v,
  );
const fail = (): never => {
  throw Error("REVIEW_RESPONSE_INVALID");
};
function object(v: unknown, keys: string[]) {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).sort().join(",") !== keys.sort().join(",")
  )
    return fail();
  return v as Record<string, unknown>;
}
function string(v: unknown, min: number, max: number) {
  if (
    typeof v !== "string" ||
    v.length < min ||
    v.length > max ||
    /[\x00-\x1f\x7f]/.test(v)
  )
    return fail();
  return v;
}
function id(v: unknown) {
  return isReviewId(v) ? v : fail();
}
function time(v: unknown) {
  const s = string(v, 1, 40);
  return Number.isFinite(Date.parse(s)) ? s : fail();
}
function kind(v: unknown): ReviewKind {
  return v === "AI" || v === "BUSINESS" ? v : fail();
}
function state(v: unknown): ReviewState {
  return v === "ELIGIBLE" || v === "BLOCKED" || v === "REVIEW_REQUIRED"
    ? v
    : fail();
}
function bool(v: unknown) {
  return typeof v === "boolean" ? v : fail();
}
export function parseReviewReceipt(value: unknown): ReviewReceipt {
  const v = object(value, [
    "operation_id",
    "request_id",
    "kind",
    "subject_id",
    "review_id",
    "state",
    "expires_at",
    "entitlement_authority",
    "provider_acceptance",
  ]);
  if (v.entitlement_authority !== false || v.provider_acceptance !== false)
    return fail();
  const status = v.state === "WITHDRAWN" ? "WITHDRAWN" : state(v.state);
  if (status === "WITHDRAWN" ? v.expires_at !== null : v.expires_at === null)
    return fail();
  return {
    operation_id: id(v.operation_id),
    request_id: id(v.request_id),
    kind: kind(v.kind),
    subject_id: id(v.subject_id),
    review_id: id(v.review_id),
    state: status,
    expires_at: v.expires_at === null ? null : time(v.expires_at),
    entitlement_authority: false,
    provider_acceptance: false,
  };
}
export function parseReviewDetail(value: unknown): ReviewDetail {
  const v = object(value, [
    "request_id",
    "kind",
    "subject_id",
    "organization_name",
    "legal_name",
    "country",
    "region",
    "provider",
    "model",
    "endpoint_id",
    "policy_version",
    "reason",
    "can_decide",
    "can_withdraw",
    "request_current",
    "prior_review",
    "expires_at",
    "receipt",
  ]);
  if (
    !reviewProviders.includes(v.provider as (typeof reviewProviders)[number]) ||
    ![
      "READY",
      "BILLING_OR_TERMS_REQUIRED",
      "SAVED_REQUIRES_NEW_INTENT",
      "INTENT_EXPIRED",
      "BUSINESS_OR_ACCOUNT_REVIEW_REQUIRED",
      "REPLACEMENT_REQUIRES_AUTHORITY",
    ].includes(String(v.reason))
  )
    return fail();
  let prior: ReviewDetail["prior_review"] = null;
  if (v.prior_review !== null) {
    const p = object(v.prior_review, [
      "id",
      "state",
      "withdrawn",
      "expires_at",
    ]);
    prior = {
      id: id(p.id),
      state: state(p.state),
      withdrawn: bool(p.withdrawn),
      expires_at: time(p.expires_at),
    };
  }
  const model = string(v.model, 0, 160),
    endpoint = string(v.endpoint_id, 0, 80),
    country = string(v.country, 2, 2);
  if (
    !/^[a-zA-Z0-9._:/-]*$/.test(model) ||
    !/^[-a-zA-Z0-9_]*$/.test(endpoint) ||
    !/^[A-Z]{2}$/.test(country)
  )
    return fail();
  const result: ReviewDetail = {
    request_id: v.request_id === null ? null : id(v.request_id),
    kind: kind(v.kind),
    subject_id: id(v.subject_id),
    organization_name: string(v.organization_name, 1, 512),
    legal_name: string(v.legal_name, 2, 160),
    country,
    region: string(v.region, 1, 120),
    provider: v.provider as ReviewDetail["provider"],
    model,
    endpoint_id: endpoint,
    policy_version: string(v.policy_version, 1, 160),
    reason: v.reason as ReviewDetail["reason"],
    can_decide: bool(v.can_decide),
    can_withdraw: bool(v.can_withdraw),
    request_current: bool(v.request_current),
    prior_review: prior,
    expires_at: v.expires_at === null ? null : time(v.expires_at),
    receipt: v.receipt === null ? null : parseReviewReceipt(v.receipt),
  };
  if (
    (result.request_id === null) !== (result.expires_at === null) ||
    (!result.request_current &&
      result.request_id !== null &&
      (result.can_decide || result.can_withdraw)) ||
    (result.receipt !== null && result.request_current)
  )
    return fail();
  return result;
}
export function parseReviewQueue(value: unknown): ReviewQueue {
  const v = object(value, ["items", "next_cursor"]);
  if (
    !Array.isArray(v.items) ||
    v.items.length > 20 ||
    !(
      v.next_cursor === null ||
      (typeof v.next_cursor === "string" &&
        /^(BUSINESS|AI):[a-f0-9-]{36}$/.test(v.next_cursor))
    )
  )
    return fail();
  const items = v.items.map(parseReviewDetail);
  if (
    items.some(
      (i) =>
        i.request_id !== null ||
        i.receipt !== null ||
        i.request_current ||
        i.can_withdraw,
    )
  )
    return fail();
  return { items, next_cursor: v.next_cursor as string | null };
}
