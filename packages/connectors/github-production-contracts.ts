// Trusted backend contracts only. No browser command, installation or credential issuance API.
import crypto from "node:crypto";
import { z } from "zod";
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const date = z.string().datetime({ offset: true });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const githubProductionBinding = z
  .object({
    provider: z.literal("github"),
    api_version: z.literal("2026-03-10"),
    org_id: z.uuid(),
    user_id: z.uuid(),
    connection_id: z.uuid(),
    session_version: positive,
    grant_version: positive,
    credential_ref: z.string().regex(/^vault:github:[A-Za-z0-9_:/-]{1,160}$/),
    credential_version: positive,
    app_id: positive,
    installation_id: positive,
    account_id: positive,
    repository_id: positive,
    issue_id: positive,
    issue_number: positive,
    author_id: positive,
    owner: z.string().regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/),
    repo: z
      .string()
      .regex(/^[A-Za-z0-9_.-]{1,100}$/)
      .refine((s) => s !== "." && s !== ".."),
    expires_at: date,
  })
  .strict();
export type GithubProductionBinding = z.infer<typeof githubProductionBinding>;
const commentFields = {
  write_id: z.uuid(),
  body: z
    .string()
    .min(1)
    .max(2100)
    .refine((s) => Buffer.byteLength(s, "utf8") <= 8400 && !s.includes("\0")),
  approved_at: date,
  expires_at: date,
};
export const githubProductionOperation = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("REPOSITORY") }).strict(),
  z.object({ kind: z.literal("ISSUE") }).strict(),
  z
    .object({
      kind: z.literal("COMMENTS"),
      page: z.number().int().min(1).max(3),
    })
    .strict(),
  z
    .object({
      kind: z.literal("COMMENT"),
      ...commentFields,
      attempt_id: z.uuid(),
      approval_digest: hash,
    })
    .strict(),
]);
export type GithubProductionOperation = z.infer<
  typeof githubProductionOperation
>;
export const githubBindingDigest = (b: GithubProductionBinding) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(githubProductionBinding.parse(b)))
    .digest("hex");
export function githubCommentApprovalDigest(
  binding: GithubProductionBinding,
  input: unknown,
) {
  const value = z.object(commentFields).strict().parse(input);
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        binding_sha256: githubBindingDigest(binding),
        scope: "issues:write",
        ...value,
      }),
    )
    .digest("hex");
}
export function githubOperationDigest(
  binding: GithubProductionBinding,
  operation: GithubProductionOperation,
) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        binding_sha256: githubBindingDigest(binding),
        operation: githubProductionOperation.parse(operation),
      }),
    )
    .digest("hex");
}
export const githubProductionLease = z
  .object({
    mode: z.literal("GITHUB_APP_INSTALLATION"),
    binding_sha256: hash,
    credential_ref: z.string(),
    credential_version: positive,
    app_id: positive,
    installation_id: positive,
    repository_ids: z.tuple([positive]),
    permissions: z
      .object({
        metadata: z.literal("read"),
        issues: z.enum(["read", "write"]),
      })
      .strict(),
    expires_at: date,
    token: z
      .string()
      .min(1)
      .max(8000)
      .regex(/^[A-Za-z0-9_.-]+$/),
  })
  .strict();
export type GithubProductionLease = z.infer<typeof githubProductionLease>;
export const githubAuthorityAck = z.discriminatedUnion("state", [
  z
    .object({
      state: z.literal("ACTIVE"),
      binding_sha256: hash,
      operation_sha256: hash,
    })
    .strict(),
  z
    .object({
      state: z.literal("DISPATCHING"),
      binding_sha256: hash,
      operation_sha256: hash,
      write_id: z.uuid(),
      attempt_id: z.uuid(),
    })
    .strict(),
]);
export const GITHUB_PRODUCTION_ORIGIN = "https://api.github.com";
export function githubProductionPath(
  b: GithubProductionBinding,
  o: GithubProductionOperation,
) {
  const repo = `/repos/${encodeURIComponent(b.owner)}/${encodeURIComponent(b.repo)}`;
  return o.kind === "REPOSITORY"
    ? repo
    : o.kind === "ISSUE"
      ? `${repo}/issues/${b.issue_number}`
      : o.kind === "COMMENTS"
        ? `${repo}/issues/${b.issue_number}/comments?per_page=100&page=${o.page}`
        : `${repo}/issues/${b.issue_number}/comments`;
}

export const githubAttemptConsumptionAck = z
  .object({
    consumed: z.literal(true),
    binding_sha256: hash,
    operation_sha256: hash,
    write_id: z.uuid(),
    attempt_id: z.uuid(),
  })
  .strict();
