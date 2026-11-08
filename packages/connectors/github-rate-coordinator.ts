// Backend-only durable coordination. No pool discovery, credential or provider API.
import { z } from "zod";
import type { GithubSqlPool } from "./github-production-outbox";
import type { GithubRateEvidence } from "./github-production-transport";
const uuid = z.uuid(),
  hash = z.string().regex(/^[a-f0-9]{64}$/),
  positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const githubRateSubject = z
  .object({
    reservation_id: uuid,
    app_id: positive,
    installation_id: positive,
    account_id: positive,
    binding_sha256: hash,
    operation_sha256: hash,
    kind: z.enum(["READ", "COMMENT"]),
  })
  .strict();
export type GithubRateSubject = z.infer<typeof githubRateSubject>;
export const githubRateReservation = githubRateSubject
  .extend({ realm: uuid, epoch: positive, reserved: z.literal(true) })
  .strict();
export type GithubRateReservation = z.infer<typeof githubRateReservation>;
export const githubRateCompletion = z
  .object({
    realm: uuid,
    epoch: positive,
    reservation_id: uuid,
    completed: z.literal(true),
    held: z.boolean(),
  })
  .strict();
export const githubRateControl = z
  .object({
    stop: z.boolean(),
    not_before: z.string().datetime({ offset: true }).nullable(),
    reason: z.enum(["NONE", "RATE_LIMIT", "RATE_CONTROL_INVALID"]),
  })
  .strict()
  .refine((v) =>
    v.reason === "NONE" ? !v.stop && v.not_before === null : v.stop,
  );
export type GithubRateSettlement = {
  rate: GithubRateEvidence;
  settlement: "CONFIRMED" | "UNCONFIRMED";
};
export type GithubSharedRate = {
  /** Atomically reserve once. Lost acknowledgement must deny, never resolve a duplicate
   * as another permit. The shared store owns quotas, target allowlist and in-flight state. */
  reserve(subject: GithubRateSubject, signal: AbortSignal): Promise<unknown>;
  /** Record only a settled execution's rate evidence. No refund, retry or timed lease
   * release. Lost acknowledgement is a coordination hold, not proof of nonexecution. */
  complete(
    reservation: GithubRateReservation,
    receipt: GithubRateSettlement,
    signal: AbortSignal,
  ): Promise<unknown>;
};
const fail = () => Error("GITHUB_RATE_HELD_OR_UNCONFIRMED");
/** Uses a separately supplied durable store, isolated from application restores.
 * The pool must bound connect/query time and use the reviewed dedicated runtime role.
 * The caller supplies one server-owned canonical realm/epoch, never browser values. */
export class GithubPostgresRateCoordinator implements GithubSharedRate {
  #pool: GithubSqlPool;
  #realm: string;
  #epoch: number;
  #after?: (action: "RESERVE" | "COMPLETE") => Promise<void>;
  constructor(
    pool: GithubSqlPool,
    realm: string,
    epoch: number,
    afterCommit?: (action: "RESERVE" | "COMPLETE") => Promise<void>,
  ) {
    try {
      this.#realm = uuid.parse(realm);
      this.#epoch = positive.parse(epoch);
      if (!pool?.connect) throw fail();
    } catch {
      throw fail();
    }
    this.#pool = pool;
    this.#after = afterCommit;
  }
  private async call(
    action: "RESERVE" | "COMPLETE",
    payload: unknown,
    signal: AbortSignal,
  ) {
    let client: Awaited<ReturnType<GithubSqlPool["connect"]>> | undefined;
    try {
      signal.throwIfAborted();
      client = await this.#pool.connect();
      signal.throwIfAborted();
      await client.query("begin");
      signal.throwIfAborted();
      await client.query("set local statement_timeout='2s'");
      await client.query("set local lock_timeout='1s'");
      await client.query("set local synchronous_commit=on");
      signal.throwIfAborted();
      const result = await client.query(
        "select kxra_github_rate.runtime($1::uuid,$2::bigint,$3,$4::jsonb) value",
        [this.#realm, this.#epoch, action, JSON.stringify(payload)],
      );
      signal.throwIfAborted();
      await client.query("commit");
      await this.#after?.(action);
      signal.throwIfAborted();
      if (result.rows.length !== 1) throw fail();
      return result.rows[0]?.value;
    } catch {
      try {
        await client?.query("rollback");
      } catch {}
      throw fail();
    } finally {
      client?.release();
    }
  }
  async reserve(raw: GithubRateSubject, signal: AbortSignal) {
    try {
      const subject = githubRateSubject.parse(raw);
      const ack = githubRateReservation.parse(
        await this.call("RESERVE", subject, signal),
      );
      if (
        ack.realm !== this.#realm ||
        ack.epoch !== this.#epoch ||
        Object.entries(subject).some(
          ([k, v]) => ack[k as keyof GithubRateReservation] !== v,
        )
      )
        throw fail();
      return Object.freeze(ack);
    } catch {
      throw fail();
    }
  }
  async complete(
    raw: GithubRateReservation,
    evidence: GithubRateSettlement,
    signal: AbortSignal,
  ) {
    try {
      const reservation = githubRateReservation.parse(raw),
        receipt = z
          .object({
            rate: githubRateControl,
            settlement: z.enum(["CONFIRMED", "UNCONFIRMED"]),
          })
          .strict()
          .parse(evidence);
      if (
        reservation.realm !== this.#realm ||
        reservation.epoch !== this.#epoch
      )
        throw fail();
      const ack = githubRateCompletion.parse(
        await this.call(
          "COMPLETE",
          { reservation_id: reservation.reservation_id, ...receipt },
          signal,
        ),
      );
      if (
        ack.realm !== this.#realm ||
        ack.epoch !== this.#epoch ||
        ack.reservation_id !== reservation.reservation_id
      )
        throw fail();
      return Object.freeze(ack);
    } catch {
      throw fail();
    }
  }
  toJSON() {
    return {
      component: "GithubPostgresRateCoordinator",
      configuration: "REDACTED",
    };
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toJSON();
  }
}
