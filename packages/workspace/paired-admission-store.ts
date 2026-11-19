import { z } from "zod";
import type { Principal } from "../db";
import {
  pairedAdmissionDigest,
  pairedExecutionAuthoritySchema,
  pairedExecutionRequest,
  type PairedExecutionContext,
} from "./paired-execution-admission";

export interface PairedSqlClient {
  query(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
  release(): void;
}
export interface PairedSqlPool {
  connect(): Promise<PairedSqlClient>;
}
const id = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const unavailable = () => Error("PAIRED_AUTHORITY_UNAVAILABLE");

/** Injected server-only storage boundary. NO environment lookup, route wiring,
 * activation, credential discovery, execution or publication. Both pools must
 * have bounded connect timeouts. The fence pool belongs to an independently
 * administered restore domain; sharing an application backup defeats the fence.
 * This object is NOT a complete PairedAdmissionPorts implementation. A returned
 * receipt is not independently verifiable launch authority for another process.
 * Real execution must verify the burned external subject at its own launch
 * boundary, authenticate measurements and enforce current revocation. */
export class PairedAdmissionStore {
  readonly context: PairedExecutionContext;
  readonly #actor: Principal;
  readonly #app: PairedSqlPool;
  readonly #external: PairedSqlPool;
  readonly #options: {
    enabled?: boolean;
    afterExternalCommit?: () => Promise<void>;
  };
  constructor(
    app: PairedSqlPool,
    external: PairedSqlPool,
    actor: Principal,
    options: {
      enabled?: boolean;
      afterExternalCommit?: () => Promise<void>;
    } = {},
  ) {
    if (
      actor.source !== "supabase" ||
      !id.safeParse(actor.id).success ||
      !id.safeParse(actor.organisation_id).success ||
      !Number.isSafeInteger(actor.session_version) ||
      actor.session_version! < 1 ||
      !Number.isSafeInteger(actor.auth_time) ||
      actor.auth_time! <= 0
    )
      throw unavailable();
    this.#actor = Object.freeze({ ...actor });
    this.#app = app;
    this.#external = external;
    this.#options = Object.freeze({ ...options });
    this.context = Object.freeze({
      organization_id: actor.organisation_id!,
      account_id: actor.id,
      session_revision: actor.session_version!,
    });
  }
  toJSON() {
    return { component: "PairedAdmissionStore", authority: "REDACTED" };
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toJSON();
  }
  private async appTransaction<T>(
    work: (c: PairedSqlClient) => Promise<T>,
    signal?: AbortSignal,
  ) {
    if (this.#options.enabled !== true) throw unavailable();
    signal?.throwIfAborted();
    const c = await this.#app.connect();
    try {
      await c.query("begin");
      await c.query("set local statement_timeout='2s'");
      await c.query("set local role authenticated");
      await c.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.execution_mode','hosted',true)",
        [
          this.#actor.id,
          JSON.stringify({
            sub: this.#actor.id,
            session_version: this.#actor.session_version,
            aal: this.#actor.aal,
            auth_time: this.#actor.auth_time,
          }),
          this.#actor.organisation_id,
        ],
      );
      signal?.throwIfAborted();
      const value = await work(c);
      signal?.throwIfAborted();
      await c.query("commit");
      signal?.throwIfAborted();
      return value;
    } catch (error) {
      await c.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      c.release();
    }
  }
  private async current(c: PairedSqlClient, raw: unknown) {
    const request = pairedExecutionRequest.parse(raw);
    const rows = (
      await c.query(
        "select manifest,snapshot_sha256 from kxra_paired_admission.authorities where task_id=$1",
        [request.task_id],
      )
    ).rows;
    if (rows.length !== 1) throw unavailable();
    const a = pairedExecutionAuthoritySchema.parse(rows[0].manifest);
    if (
      a.task.id !== request.task_id ||
      a.task.fence !== request.fence ||
      pairedAdmissionDigest(a.context) !==
        pairedAdmissionDigest(this.context) ||
      pairedAdmissionDigest(a) !== rows[0].snapshot_sha256
    )
      throw unavailable();
    return a;
  }
  async readCurrent(request: unknown, signal?: AbortSignal) {
    return this.appTransaction((c) => this.current(c, request), signal);
  }
  async consume(raw: unknown, snapshot: string, signal?: AbortSignal) {
    const request = pairedExecutionRequest.parse(raw);
    digest.parse(snapshot);
    const a = await this.readCurrent(request, signal);
    if (pairedAdmissionDigest(a) !== snapshot) throw unavailable();
    let fence: PairedSqlClient | undefined;
    try {
      signal?.throwIfAborted();
      fence = await this.#external.connect();
      await fence.query("begin");
      await fence.query("set local statement_timeout='2s'");
      await fence.query("set local synchronous_commit=on");
      signal?.throwIfAborted();
      const subject = {
        purpose: a.purpose,
        org_id: a.context.organization_id,
        account_id: a.context.account_id,
        device_id: a.device_id,
        device_session_id: a.device_session_id,
        fence: request.fence,
        attempt_id: request.attempt_id,
        snapshot_sha256: snapshot,
      };
      const rows = (
        await fence.query(
          "select kxra_paired_fence.burn($1,$2,$3,$4::jsonb) permit_id",
          [a.realm_id, a.continuity_epoch, a.task.id, JSON.stringify(subject)],
        )
      ).rows;
      if (rows.length !== 1) throw unavailable();
      const permit = id.parse(rows[0].permit_id);
      signal?.throwIfAborted();
      await fence.query("commit");
      await this.#options.afterExternalCommit?.();
      signal?.throwIfAborted();
      // Re-read through RLS and recheck under consumption locks AFTER the independent burn.
      return await this.appTransaction(async (c) => {
        if (pairedAdmissionDigest(await this.current(c, request)) !== snapshot)
          throw unavailable();
        const rows = (
          await c.query(
            "select kxra_paired_admission.consume($1,$2,$3,$4,$5) value",
            [
              request.task_id,
              request.fence,
              request.attempt_id,
              snapshot,
              permit,
            ],
          )
        ).rows;
        if (rows.length !== 1) throw unavailable();
        return rows[0].value;
      }, signal);
    } catch {
      await fence?.query("rollback").catch(() => undefined);
      // No automatic retry, even when COMMIT acknowledgement or abort is uncertain.
      throw Error("PAIRED_CONSUMPTION_UNCONFIRMED_NO_REPLAY");
    } finally {
      fence?.release();
    }
  }
}
