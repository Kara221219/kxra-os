import { z } from "zod";
import type { Principal } from "../db";
import type { PairedSqlPool } from "./paired-admission-store";
const id = z.uuid();
import {
  pairedSetupCommand,
  pairedSetupReceipt,
  pairedSetupOptions,
} from "./paired-setup-contract";
export {
  pairedSetupCommand,
  pairedSetupReceipt,
} from "./paired-setup-contract";
import {
  isPairedSetupFixtureBoundary,
  type PairedSetupFixtureBoundary,
} from "./paired-setup-fixture";
/** Server-injected, request-only onboarding. No secret, bearer token, device
 * session or executable authority is issued. Actual activation is deliberately absent. */
export class PairedSetupStore {
  readonly #pool: PairedSqlPool;
  readonly #actor: Readonly<Principal>;
  readonly #enabled: boolean;
  constructor(
    pool: PairedSqlPool,
    actor: Principal,
    enabled = false,
    fixture?: PairedSetupFixtureBoundary,
  ) {
    if (
      (actor.source !== "supabase" &&
        !(
          actor.source === "fixture" && isPairedSetupFixtureBoundary(fixture)
        )) ||
      !id.safeParse(actor.id).success ||
      !id.safeParse(actor.organisation_id).success ||
      !Number.isSafeInteger(actor.session_version) ||
      actor.session_version! < 1 ||
      !Number.isSafeInteger(actor.auth_time) ||
      actor.auth_time! <= 0
    )
      throw Error("PAIRED_SETUP_IDENTITY_REQUIRED");
    this.#pool = pool;
    this.#actor = Object.freeze({ ...actor });
    this.#enabled = enabled === true;
  }
  toJSON() {
    return { component: "PairedSetupStore", authority: "REDACTED" };
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toJSON();
  }
  async options() {
    if (!this.#enabled) throw Error("PAIRED_SETUP_DISABLED");
    const c = await this.#pool.connect();
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
            aal: this.#actor.aal,
            session_version: this.#actor.session_version,
            auth_time: this.#actor.auth_time,
          }),
          this.#actor.organisation_id,
        ],
      );
      const rows = (
        await c.query("select kxra_paired_admission.setup_options() value")
      ).rows;
      if (rows.length !== 1) throw Error("INVALID_OPTIONS");
      const result = pairedSetupOptions.parse(rows[0].value);
      await c.query("commit");
      return result;
    } catch {
      await c.query("rollback").catch(() => undefined);
      throw Error("PAIRED_SETUP_UNAVAILABLE");
    } finally {
      c.release();
    }
  }
  async command(raw: unknown) {
    if (!this.#enabled) throw Error("PAIRED_SETUP_DISABLED");
    const v = pairedSetupCommand.parse(raw),
      c = await this.#pool.connect();
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
            aal: this.#actor.aal,
            session_version: this.#actor.session_version,
            auth_time: this.#actor.auth_time,
          }),
          this.#actor.organisation_id,
        ],
      );
      const rows = (
        v.action === "REQUEST"
          ? await c.query(
              "select kxra_paired_admission.request_setup($1,$2,$3,$4,$5) value",
              [v.request_id, v.room_id, v.ai_intent_id, v.auth_route, v.label],
            )
          : await c.query(
              v.action === "STATUS"
                ? "select kxra_paired_admission.setup_status($1) value"
                : "select kxra_paired_admission.cancel_setup($1) value",
              [v.request_id],
            )
      ).rows;
      if (rows.length !== 1) throw Error("INVALID_RECEIPT");
      const result = pairedSetupReceipt.parse(rows[0].value);
      if (
        result.request_id !== v.request_id ||
        (v.action === "REQUEST" && result.room_id !== v.room_id) ||
        (v.action === "CANCEL" && result.reason !== "CANCELLED")
      )
        throw Error("FOREIGN_RECEIPT");
      await c.query("commit");
      return result;
    } catch {
      await c.query("rollback").catch(() => undefined);
      throw Error("PAIRED_SETUP_UNAVAILABLE");
    } finally {
      c.release();
    }
  }
}
