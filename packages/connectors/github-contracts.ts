import { z } from "zod";
export const githubBinding = z
  .object({
    provider: z.literal("github"),
    api_version: z.literal("2026-03-10"),
    owner: z.literal("fixture-org"),
    repo: z.literal("fixture-repo"),
    issue_number: z.literal(1),
    repository_id: z.literal(404),
    account_id: z.literal(101),
    installation_id: z.literal(303),
    author_id: z.literal(202),
  })
  .strict();
const date = z.string().datetime({ offset: true });
export const githubConnection = z
  .object({
    id: z.string().uuid(),
    org_id: z.string().uuid(),
    user_id: z.string().uuid(),
    session_version: z.number().int().positive(),
    state: z.enum(["ACTIVE", "REVOKED"]),
    allow_write: z.boolean(),
    grant_version: z.number().int().positive(),
    credential_ref: z
      .string()
      .regex(/^fixture:github:[0-9a-f-]{36}:v[1-9][0-9]*$/)
      .optional(),
    expires_at: date,
    binding: githubBinding,
    created_at: date,
  })
  .strict();
export const githubWrite = z
  .object({
    id: z.string().uuid(),
    connection_id: z.string().uuid(),
    read_id: z.string().uuid(),
    payload: z
      .object({
        org_id: z.string().uuid(),
        user_id: z.string().uuid(),
        connection_id: z.string().uuid(),
        binding: githubBinding,
        credential_ref: z.string(),
        grant_version: z.number().int().positive(),
        scope: z.literal("issues:write"),
        session_version: z.number().int().positive(),
        body: z.string().max(2100),
      })
      .strict(),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    expires_at: date,
    state: z.enum([
      "PENDING",
      "APPROVED",
      "QUEUED",
      "DISPATCHING",
      "UNCERTAIN",
      "ACCEPTED",
      "REJECTED",
      "NOT_EXECUTED",
      "CANCELLED",
    ]),
    attempt_id: z.string().uuid().nullable(),
    dispatch_at: date.nullable(),
    cancel_requested: z.boolean(),
    reason: z.string().max(100),
    provider_comment_id: z.number().int().positive().nullable(),
    created_at: date,
  })
  .strict();
export type GithubConnection = z.infer<typeof githubConnection>;
export type GithubWrite = z.infer<typeof githubWrite>;
const ids = { connection_id: z.string().uuid(), write_id: z.string().uuid() };
export const githubCommand = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("connect_fixture"), allow_write: z.boolean() })
    .strict(),
  ...(["read", "revoke", "rotate_fixture_grant", "recover"] as const).map(
    (action) =>
      z
        .object({ action: z.literal(action), connection_id: z.string().uuid() })
        .strict(),
  ),
  z
    .object({
      action: z.literal("prepare"),
      connection_id: z.string().uuid(),
      read_id: z.string().uuid(),
      note: z.string().trim().min(1).max(2000),
    })
    .strict(),
  ...(["approve", "enqueue"] as const).map((action) =>
    z
      .object({
        action: z.literal(action),
        ...ids,
        digest: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  ),
  ...(["dispatch", "reconcile", "cancel"] as const).map((action) =>
    z.object({ action: z.literal(action), ...ids }).strict(),
  ),
]);
export type GithubCommand = z.infer<typeof githubCommand>;

export const githubReadResult = z
  .object({
    receipt: z
      .object({
        id: z.string().uuid(),
        connection_id: z.string().uuid(),
        grant_version: z.number().int().positive(),
        consumed: z.boolean(),
        expires_at: date,
      })
      .strict(),
    comments: z
      .array(
        z.object({
          id: z.number().int().positive(),
          body: z.string().max(65536),
          user: z.object({ id: z.number().int().positive() }),
          issue_url: z.string(),
          created_at: date,
        }),
      )
      .max(50),
    complete: z.boolean(),
    untrusted_content: z.literal(true),
  })
  .strict();
export const githubList = z
  .object({
    connections: z.array(githubConnection),
    writes: z.array(githubWrite),
    receipts: z.array(
      z
        .object({
          id: z.number().int().positive(),
          write_id: z.string().uuid(),
          attempt_id: z.string().uuid().nullable(),
          event: z.string().max(100),
          evidence: z.record(z.string(), z.unknown()),
          evidence_hash: z.string(),
          created_at: date,
        })
        .strict(),
    ),
  })
  .strict();
export type GithubList = z.infer<typeof githubList>;
export type GithubRead = z.infer<typeof githubReadResult>;
