// Backend-only SQL adapter. No production pool is created or discovered here.
import crypto from "node:crypto";
import { z } from "zod";
import type { Principal } from "../db";
import type {
  GithubAuthorityInput,
  GithubExecutionAuthority,
  GithubExecutionResult,
} from "./github-production-transport";
import {
  githubProductionBinding,
  githubProductionOperation,
  githubAuthorityAck,
  githubAttemptConsumptionAck,
  githubBindingDigest,
  githubOperationDigest,
} from "./github-production-contracts";
export type GithubSqlClient = {
  query(sql: string, values?: unknown[]): Promise<{ rows: any[] }>;
  release(): void;
};
export type GithubSqlPool = { connect(): Promise<GithubSqlClient> };
const id = z.uuid(),
  hash = z.string().regex(/^[a-f0-9]{64}$/),
  token = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const date = z.string().datetime({ offset: true });
const target = githubProductionBinding.omit({
  org_id: true,
  user_id: true,
  connection_id: true,
  credential_ref: true,
  expires_at: true,
});
export const githubOutboxWrite = z
  .object({
    write_id: id,
    connection_id: id,
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
    body: z.string().max(2100),
    expires_at: date,
    proposal_digest: hash,
    approval_digest: hash.nullable(),
    approved_at: date.nullable(),
    attempt_id: id.nullable(),
    cancel_requested: z.boolean(),
    provider_comment_id: z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .nullable(),
    target,
    consumed: z.boolean(),
  })
  .strict();
const humanCommand = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("PROPOSE"),
      connection_id: id,
      write_id: id,
      read_id: id,
      note: z.string().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal("APPROVE"),
      connection_id: id,
      write_id: id,
      proposal_digest: hash,
      attested: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal("ENQUEUE"),
      connection_id: id,
      write_id: id,
      approval_digest: hash,
    })
    .strict(),
  ...(["VIEW", "CANCEL", "RECOVER"] as const).map((action) =>
    z
      .object({ action: z.literal(action), connection_id: id, write_id: id })
      .strict(),
  ),
  z.object({ action: z.literal("REVOKE"), connection_id: id }).strict(),
]);
const receipt = z
  .object({
    recorded: z.literal(true),
    state: z.enum([
      "DISPATCHING",
      "UNCERTAIN",
      "ACCEPTED",
      "REJECTED",
      "NOT_EXECUTED",
    ]),
    duplicate: z.boolean(),
  })
  .strict();
export type GithubAttemptRecoveryMaterial = {
  dispatch_token: string;
  receipt_token: string;
  binding: unknown;
  operation: unknown;
  operation_sha256: string;
};
const fail = () => Error("GITHUB_OUTBOX_UNAVAILABLE_OR_UNCONFIRMED");
/** Actor parameters come only from verified server identity, never a command body.
 * Worker and receipt calls explicitly clear JWT/org and use distinct LOCAL capability channels. */
export class GithubProductionOutbox {
  #pool: GithubSqlPool;
  #options: {
    environment?: () => Record<string, string | undefined>;
    afterCommit?: (stage: string) => Promise<void>;
  };
  constructor(
    pool: GithubSqlPool,
    options: {
      environment?: () => Record<string, string | undefined>;
      afterCommit?: (stage: string) => Promise<void>;
    } = {},
  ) {
    this.#pool = pool;
    this.#options = options;
  }
  toJSON() {
    return { component: "GithubProductionOutbox", credentials: "REDACTED" };
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toJSON();
  }
  private configuration() {
    const env = this.#options.environment?.() ?? process.env;
    if (
      env.KXRA_GITHUB_OUTBOX_ENABLED !== "true" ||
      !hash.safeParse(env.KXRA_GITHUB_OUTBOX_POLICY_SHA256).success
    )
      throw fail();
    return env.KXRA_GITHUB_OUTBOX_POLICY_SHA256!;
  }
  private async transaction(
    channel: "human" | "worker" | "receipt",
    capability: string | undefined,
    actor: Principal | null,
    sql: string,
    args: unknown[],
    stage: string,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    let client: GithubSqlClient | undefined;
    try {
      if (channel === "human") {
        if (
          !actor ||
          !id.safeParse(actor.id).success ||
          !id.safeParse(actor.organisation_id).success ||
          !Number.isSafeInteger(actor.session_version) ||
          actor.session_version! < 1
        )
          throw fail();
      } else token.parse(capability);
      client = await this.#pool.connect();
      await client.query("begin");
      await client.query("set local statement_timeout='5s'");
      await client.query("set local role authenticated");
      await client.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.execution_mode','hosted',true),set_config('request.kxra.github_capability',$4,true),set_config('request.kxra.github_receipt',$5,true)",
        [
          actor?.id ?? "",
          JSON.stringify(
            actor
              ? {
                  sub: actor.id,
                  aal: actor.aal,
                  auth_time: actor.auth_time,
                  session_version: actor.session_version,
                }
              : {},
          ),
          actor?.organisation_id ?? "",
          channel === "worker" ? capability : "",
          channel === "receipt" ? capability : "",
        ],
      );
      signal?.throwIfAborted();
      const rows = (await client.query(sql, args)).rows;
      if (rows.length !== 1) throw fail();
      signal?.throwIfAborted();
      await client.query("commit");
      await this.#options.afterCommit?.(stage);
      return rows[0].value as unknown;
    } catch {
      if (client)
        try {
          await client.query("rollback");
        } catch {}
      throw fail();
    } finally {
      client?.release();
    }
  }
  async human(actor: Principal, raw: unknown, signal?: AbortSignal) {
    const policy = this.configuration();
    const command = humanCommand.parse(raw);
    const { action, ...input } = command;
    const value = await this.transaction(
      "human",
      undefined,
      actor,
      "select kxra.github_prod_human($1,$2::jsonb,$3) value",
      [action, JSON.stringify(input), policy],
      action,
      signal,
    );
    return action === "REVOKE"
      ? z
          .object({ revoked: z.literal(true) })
          .strict()
          .parse(value)
      : githubOutboxWrite.parse(value);
  }
  private worker(
    capability: string,
    action: string,
    input: unknown,
    signal?: AbortSignal,
  ) {
    const policy = this.configuration();
    return this.transaction(
      "worker",
      capability,
      null,
      "select kxra.github_prod_worker($1,$2::jsonb,$3) value",
      [action, JSON.stringify(input), policy],
      action,
      signal,
    );
  }
  async readContext(capability: string, signal?: AbortSignal) {
    return z
      .object({ binding: githubProductionBinding, binding_sha256: hash })
      .strict()
      .parse(await this.worker(capability, "READ_CONTEXT", {}, signal));
  }
  async recordRead(
    capability: string,
    evidenceSha256: string,
    signal?: AbortSignal,
  ) {
    return z
      .object({ read_id: id, binding_sha256: hash, expires_at: date })
      .strict()
      .parse(
        await this.worker(
          capability,
          "RECORD_READ",
          { evidence_sha256: hash.parse(evidenceSha256) },
          signal,
        ),
      );
  }
  authority(capability: string): GithubExecutionAuthority {
    token.parse(capability);
    const input = (v: GithubAuthorityInput) => {
      const binding = githubProductionBinding.parse(v.binding),
        operation = githubProductionOperation.parse(v.operation);
      if (
        githubBindingDigest(binding) !== v.binding_sha256 ||
        githubOperationDigest(binding, operation) !== v.operation_sha256 ||
        v.scope !==
          (operation.kind === "COMMENT" ? "issues:write" : "issues:read")
      )
        throw fail();
      return {
        binding_sha256: v.binding_sha256,
        operation,
        operation_sha256: v.operation_sha256,
      };
    };
    return {
      current: async (v, s) =>
        githubAuthorityAck.parse(
          await this.worker(capability, "CURRENT", input(v), s),
        ),
      consume: async (v, s) =>
        githubAttemptConsumptionAck.parse(
          await this.worker(capability, "CONSUME", input(v), s),
        ),
    };
  }
  async claim(workerCapability: string, writeId: string, signal?: AbortSignal) {
    const attemptId = crypto.randomUUID(),
      dispatch = crypto.randomBytes(32).toString("base64url"),
      receiptCapability = crypto.randomBytes(32).toString("base64url");
    const sha = (v: string) =>
      crypto.createHash("sha256").update(v).digest("hex");
    const value = await this.worker(
      workerCapability,
      "CLAIM",
      {
        write_id: id.parse(writeId),
        attempt_id: attemptId,
        dispatch_sha256: sha(dispatch),
        receipt_sha256: sha(receiptCapability),
      },
      signal,
    );
    const denied = z
      .object({
        claimed: z.literal(false),
        write_id: id,
        state: z.string().max(30),
      })
      .strict()
      .safeParse(value);
    if (denied.success) return denied.data;
    const c = z
      .object({
        claimed: z.literal(true),
        binding: githubProductionBinding,
        operation: githubProductionOperation,
        operation_sha256: hash,
      })
      .strict()
      .parse(value);
    if (
      c.operation.kind !== "COMMENT" ||
      c.operation.write_id !== writeId ||
      c.operation.attempt_id !== attemptId ||
      githubOperationDigest(c.binding, c.operation) !== c.operation_sha256
    )
      throw fail();
    return new GithubClaim(this, {
      dispatch_token: dispatch,
      receipt_token: receiptCapability,
      binding: c.binding,
      operation: c.operation,
      operation_sha256: c.operation_sha256,
    });
  }
  /** Receipt processing intentionally survives send-feature withdrawal. Existing exact capabilities
   * and SQL purpose/attempt/expiry checks remain mandatory; this grants no dispatch/read authority. */
  async publishReceipt(
    capability: string,
    attemptId: string,
    operationSha256: string,
    result: Pick<GithubExecutionResult, "outcome" | "evidence">,
    signal?: AbortSignal,
  ) {
    if (
      !["ACCEPTED", "REJECTED", "NOT_EXECUTED", "UNCERTAIN"].includes(
        result.outcome,
      )
    )
      throw fail();
    const value = await this.transaction(
      "receipt",
      capability,
      null,
      "select kxra.github_prod_receipt($1::uuid,$2,$3,$4::jsonb) value",
      [
        id.parse(attemptId),
        hash.parse(operationSha256),
        result.outcome,
        JSON.stringify(result.evidence),
      ],
      "RECEIPT",
      signal,
    );
    return receipt.parse(value);
  }
  restoreClaim(material: GithubAttemptRecoveryMaterial) {
    const binding = githubProductionBinding.parse(material.binding),
      operation = githubProductionOperation.parse(material.operation);
    if (
      operation.kind !== "COMMENT" ||
      githubOperationDigest(binding, operation) !==
        hash.parse(material.operation_sha256)
    )
      throw fail();
    token.parse(material.dispatch_token);
    token.parse(material.receipt_token);
    return new GithubClaim(this, { ...material, binding, operation });
  }
}
export class GithubClaim {
  readonly claimed = true as const;
  readonly binding;
  readonly operation;
  readonly operation_sha256;
  #material: GithubAttemptRecoveryMaterial;
  #store: GithubProductionOutbox;
  constructor(
    store: GithubProductionOutbox,
    material: GithubAttemptRecoveryMaterial,
  ) {
    this.#material = material;
    this.#store = store;
    this.binding = Object.freeze(
      githubProductionBinding.parse(material.binding),
    );
    this.operation = Object.freeze(
      githubProductionOperation.parse(material.operation),
    );
    this.operation_sha256 = material.operation_sha256;
  }
  authority() {
    return this.#store.authority(this.#material.dispatch_token);
  }
  publish(
    result: Pick<GithubExecutionResult, "outcome" | "evidence">,
    signal?: AbortSignal,
  ) {
    if (this.operation.kind !== "COMMENT") throw fail();
    return this.#store.publishReceipt(
      this.#material.receipt_token,
      this.operation.attempt_id,
      this.operation_sha256,
      result,
      signal,
    );
  }
  /** Explicit protected-backend escrow seam. Never send this material to a client or logger.
   * A real encrypted durable escrow/workload implementation remains a separate activation gate. */
  escrow<T>(seal: (material: GithubAttemptRecoveryMaterial) => Promise<T>) {
    return seal({
      ...this.#material,
      binding: this.binding,
      operation: this.operation,
    });
  }
  toJSON() {
    return {
      claimed: true,
      write_id:
        this.operation.kind === "COMMENT" ? this.operation.write_id : null,
      attempt_id:
        this.operation.kind === "COMMENT" ? this.operation.attempt_id : null,
      capabilities: "REDACTED",
    };
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toJSON();
  }
}
