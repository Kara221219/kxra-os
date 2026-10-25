export const syntheticCaseReviewNote =
  "Synthetic human-reviewed record; no external action";
export type CaseProposalScope = {
  origin: string;
  room: string;
  prefix: "remodel" | "role" | "application" | "travel";
  sourceId: string;
  sourceVersion: number;
  target: string;
};
type ProposalRequest = {
  method(): string;
  url(): string;
  postDataJSON(): unknown;
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function savedCaseIdentity(request: ProposalRequest, origin: string) {
  try {
    const url = new URL(request.url()),
      parts = url.pathname.split("/");
    const prefix = (["remodel", "role", "application", "travel"] as const).find(
      (p) => parts[4] === `${p}-save`,
    );
    if (
      request.method() !== "POST" ||
      url.origin !== new URL(origin).origin ||
      url.search ||
      url.hash ||
      parts.length !== 5 ||
      parts[1] !== "api" ||
      parts[2] !== "team-space" ||
      !uuid.test(parts[3]) ||
      !prefix
    )
      return null;
    const value = request.postDataJSON();
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const body = value as Record<string, unknown>;
    if (
      typeof body.request_id !== "string" ||
      !uuid.test(body.request_id) ||
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.length > 160
    )
      return null;
    return {
      room: parts[3],
      prefix,
      title: body.title,
      sourceId: body.request_id,
    };
  } catch {
    return null;
  }
}

export function renderedCaseVersion(text: string | null) {
  const match = /^Stage [A-Z_]+ · Revision ([1-9][0-9]*)$/.exec(
    text?.trim() || "",
  );
  const version = Number(match?.[1]);
  if (!match || !Number.isSafeInteger(version) || version < 1)
    throw Error("SYNTHETIC_CASE_REVISION_UNAVAILABLE");
  return version;
}

export function matchesCaseProposal(
  request: ProposalRequest,
  expected: CaseProposalScope,
) {
  try {
    const url = new URL(request.url());
    if (
      request.method() !== "POST" ||
      url.origin !== new URL(expected.origin).origin ||
      url.pathname !==
        `/api/team-space/${expected.room}/${expected.prefix}-propose` ||
      url.search ||
      url.hash ||
      !uuid.test(expected.room) ||
      !uuid.test(expected.sourceId) ||
      !Number.isSafeInteger(expected.sourceVersion) ||
      expected.sourceVersion < 1
    )
      return false;
    const value = request.postDataJSON();
    if (!value || typeof value !== "object" || Array.isArray(value))
      return false;
    const body = value as Record<string, unknown>;
    return (
      Object.keys(body).sort().join(",") ===
        "note,request_id,source_id,source_version,target_stage" &&
      typeof body.request_id === "string" &&
      uuid.test(body.request_id) &&
      body.source_id === expected.sourceId &&
      body.source_version === expected.sourceVersion &&
      body.target_stage === expected.target &&
      body.note === syntheticCaseReviewNote
    );
  } catch {
    return false;
  }
}
