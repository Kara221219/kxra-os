// Trusted backend port; this pool must be outside application backups and restore administration.
import crypto from "node:crypto";
import { z } from "zod";
import type { GithubAuthorityInput } from "./github-production-transport";
import type { GithubSqlPool } from "./github-production-outbox";
import {
  githubBindingDigest,
  githubOperationDigest,
} from "./github-production-contracts";
const uuid = z.uuid(),
  hash = z.string().regex(/^[a-f0-9]{64}$/);
export const fenceAck = z
  .object({
    realm: uuid,
    epoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    reservation_id: uuid,
    write_id: uuid,
    attempt_id: uuid,
    binding_sha256: hash,
    operation_sha256: hash,
  })
  .strict();
export type GithubRollbackFence = {
  reserve(input: GithubAuthorityInput, signal: AbortSignal): Promise<unknown>;
  send(
    input: GithubAuthorityInput,
    reservation: unknown,
    signal: AbortSignal,
  ): Promise<unknown>;
};
export function fenceSubject(v: GithubAuthorityInput) {
  if (
    v.operation.kind !== "COMMENT" ||
    v.scope !== "issues:write" ||
    githubBindingDigest(v.binding) !== v.binding_sha256 ||
    githubOperationDigest(v.binding, v.operation) !== v.operation_sha256
  )
    throw Error("GITHUB_FENCE_HELD");
  return {
    org_id: v.binding.org_id,
    user_id: v.binding.user_id,
    connection_id: v.binding.connection_id,
    write_id: v.operation.write_id,
    attempt_id: v.operation.attempt_id,
    binding_sha256: v.binding_sha256,
    operation_sha256: v.operation_sha256,
    body_sha256: crypto
      .createHash("sha256")
      .update(v.operation.body)
      .digest("hex"),
    repository_id: v.binding.repository_id,
    issue_id: v.binding.issue_id,
    author_id: v.binding.author_id,
  };
}
export class GithubDurableFence implements GithubRollbackFence {
  #pool: GithubSqlPool;
  #realm: string;
  #epoch: number;
  #after?: (stage: string) => Promise<void>;
  constructor(
    pool: GithubSqlPool,
    realm: string,
    epoch: number,
    afterCommit?: (stage: string) => Promise<void>,
  ) {
    this.#pool = pool;
    this.#realm = uuid.parse(realm);
    this.#epoch = z
      .number()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER)
      .parse(epoch);
    this.#after = afterCommit;
  }
  toJSON() {
    return { component: "GithubDurableFence", configuration: "REDACTED" };
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toJSON();
  }
  private async call(action: string, input: unknown, signal?: AbortSignal) {
    signal?.throwIfAborted();
    let c: Awaited<ReturnType<GithubSqlPool["connect"]>> | undefined;
    try {
      c = await this.#pool.connect();
      await c.query("begin");
      await c.query("set local statement_timeout='2s'");
      await c.query("set local synchronous_commit=on");
      const r = await c.query(
        "select kxra_github_fence.runtime($1::uuid,$2::bigint,$3,$4::jsonb) value",
        [this.#realm, this.#epoch, action, JSON.stringify(input)],
      );
      signal?.throwIfAborted();
      await c.query("commit");
      await this.#after?.(action);
      return r.rows[0]?.value;
    } catch {
      try {
        await c?.query("rollback");
      } catch {}
      throw Error("GITHUB_FENCE_HELD_OR_UNCONFIRMED");
    } finally {
      c?.release();
    }
  }
  async reserve(input: GithubAuthorityInput, signal: AbortSignal) {
    return fenceAck.parse(
      await this.call("RESERVE", { subject: fenceSubject(input) }, signal),
    );
  }
  async send(
    input: GithubAuthorityInput,
    reservation: unknown,
    signal: AbortSignal,
  ) {
    const r = fenceAck.parse(reservation);
    if (r.realm !== this.#realm || r.epoch !== this.#epoch)
      throw Error("GITHUB_FENCE_HELD");
    return fenceAck.parse(
      await this.call(
        "SEND",
        { subject: fenceSubject(input), reservation_id: r.reservation_id },
        signal,
      ),
    );
  }
  // No provider, vault, application-pool or dispatch credential is held by this operator adapter.
}
export class GithubFenceReconciler {
  #pool: GithubSqlPool;
  #realm: string;
  constructor(operatorPool: GithubSqlPool, realm: string) {
    this.#pool = operatorPool;
    this.#realm = uuid.parse(realm);
  }
  async command(
    action: "HOLD" | "LIST" | "OBSERVE" | "RESUME",
    input: unknown,
  ) {
    let c: Awaited<ReturnType<GithubSqlPool["connect"]>> | undefined;
    try {
      c = await this.#pool.connect();
      await c.query("begin");
      await c.query("set local statement_timeout='2s'");
      await c.query("set local synchronous_commit=on");
      const r = await c.query(
        "select kxra_github_fence.reconcile($1::uuid,$2,$3::jsonb) value",
        [this.#realm, action, JSON.stringify(input)],
      );
      await c.query("commit");
      return r.rows[0]?.value;
    } catch {
      try {
        await c?.query("rollback");
      } catch {}
      throw Error("GITHUB_RECONCILIATION_HELD_OR_UNCONFIRMED");
    } finally {
      c?.release();
    }
  }
  toJSON() {
    return { component: "GithubFenceReconciler", configuration: "REDACTED" };
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toJSON();
  }
}
