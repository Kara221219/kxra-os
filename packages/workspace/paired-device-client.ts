import crypto from "node:crypto";
import { z } from "zod";
import {
  leasedDraftSchema,
  runPairedCycle,
  type PairedDraftAdapter,
} from "./paired-runtime";
export type DeviceState =
  | "UNPAIRED"
  | "ONLINE"
  | "OFFLINE"
  | "RUNNING"
  | "UNCERTAIN"
  | "REVOKED"
  | "CLOSED";
export class DeviceRequestError extends Error {
  constructor(readonly terminal: boolean) {
    super(
      terminal ? "PAIRING_REVOKED_OR_EXPIRED" : "PAIRING_OFFLINE_OR_UNCERTAIN",
    );
  }
}
/** Memory-only, explicit foreground lifecycle for the still fixture-only API.
 * No cookies, refresh token, disk store, automatic pairing, task replay or daemon. */
export class PairedDeviceClient {
  private token?: string;
  private expires = 0;
  private binding?: { agent: string; room: string };
  private busy = false;
  private active?: AbortController;
  private current: DeviceState = "UNPAIRED";
  private readonly endpoint: string;
  constructor(
    origin: string,
    private readonly request: typeof fetch = fetch,
  ) {
    const u = new URL(origin);
    if (
      u.protocol !== "http:" ||
      !["127.0.0.1", "[::1]"].includes(u.hostname) ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash
    )
      throw Error("PAIRING_LOOPBACK_FIXTURE_ORIGIN_REQUIRED");
    this.endpoint = u.origin + "/api/paired-device";
  }
  get state() {
    return this.current;
  }
  private async send(
    operation: string,
    payload: unknown,
    credential = this.token,
  ) {
    if (!credential || this.current === "CLOSED" || this.current === "REVOKED")
      throw new DeviceRequestError(true);
    let response: Response;
    try {
      response = await this.request(this.endpoint, {
        method: "POST",
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
        headers: {
          authorization: "Bearer " + credential,
          "content-type": "application/json",
        },
        body: JSON.stringify({ operation, payload }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new DeviceRequestError([401, 403].includes(response.status));
      }
      const reader = response.body?.getReader();
      if (!reader) throw Error("EMPTY_RESPONSE");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const r = await reader.read();
          if (r.done) break;
          size += r.value.length;
          if (size > 65536) throw Error("RESPONSE_LIMIT");
          chunks.push(r.value);
        }
      } finally {
        await reader.cancel();
      }
      const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (
        !value ||
        typeof value !== "object" ||
        value.mode !== "FIXTURE_ONLY" ||
        value.provider_verified !== false
      )
        throw Error("RESPONSE_MODE_INVALID");
      return value as Record<string, unknown>;
    } catch (e) {
      if (e instanceof DeviceRequestError && e.terminal) {
        this.token = undefined;
        if (!["CLOSED"].includes(this.current)) this.current = "REVOKED";
        this.active?.abort();
        throw e;
      }
      throw new DeviceRequestError(false);
    }
  }
  async setup(invitation: string) {
    if (this.busy || this.current !== "UNPAIRED")
      throw Error("PAIRING_SETUP_STATE");
    this.busy = true;
    try {
      const value = await this.send(
        "REDEEM",
        {},
        z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .parse(invitation),
      );
      const session = z
        .object({
          session_token: z.string().regex(/^[a-f0-9]{64}$/),
          agent_id: z.uuid(),
          room_id: z.uuid(),
          expires_in_seconds: z.number().int().positive().max(900),
          capability: z.literal("TEXT_DRAFT_ONLY"),
        })
        .parse(value);
      if (["CLOSED"].includes(this.current)) throw Error("PAIRING_CLOSED");
      this.binding = { agent: session.agent_id, room: session.room_id };
      this.token = session.session_token;
      this.expires = Date.now() + session.expires_in_seconds * 1000;
      this.current = "ONLINE";
    } catch (e) {
      if (!["CLOSED", "REVOKED"].includes(this.current))
        this.current = "UNCERTAIN";
      throw e;
    } finally {
      this.busy = false;
    }
  }
  private async heartbeat() {
    if (Date.now() >= this.expires) {
      this.token = undefined;
      this.current = "REVOKED";
      this.active?.abort();
      throw new DeviceRequestError(true);
    }
    const v = await this.send("HEARTBEAT", {});
    if (v.presence !== "ONLINE") throw new DeviceRequestError(false);
  }
  async reconnect() {
    if (
      this.busy ||
      !this.token ||
      ["CLOSED", "REVOKED"].includes(this.current)
    )
      throw Error("PAIRING_RECONNECT_STATE");
    this.busy = true;
    try {
      await this.heartbeat();
      if (this.current !== "CLOSED") this.current = "ONLINE";
    } catch (e) {
      if (!["CLOSED", "REVOKED"].includes(this.current))
        this.current = "OFFLINE";
      throw e;
    } finally {
      this.busy = false;
    }
  }
  async runOnce(adapter: PairedDraftAdapter) {
    if (this.busy || this.current !== "ONLINE")
      throw Error("PAIRING_EXPLICIT_RECONNECT_REQUIRED");
    this.busy = true;
    const controller = new AbortController();
    this.active = controller;
    this.current = "RUNNING";
    let timer: ReturnType<typeof setTimeout> | undefined;
    let monitoring: Promise<void> | undefined;
    let runningTask: { task_id: string; fence: string } | undefined;
    const monitor = async () => {
      try {
        await this.heartbeat();
        if (
          runningTask &&
          (await this.send("STATUS", runningTask)).state !== "RUNNING"
        )
          controller.abort();
      } catch {
        controller.abort();
        return;
      }
      if (!controller.signal.aborted)
        timer = setTimeout(() => {
          monitoring = monitor();
        }, 1000);
    };
    try {
      await this.heartbeat();
      timer = setTimeout(() => {
        monitoring = monitor();
      }, 1000);
      const receipt = await runPairedCycle(
        async (op, payload) => {
          if (op !== "ABANDON") controller.signal.throwIfAborted();
          const result = await this.send(op, payload);
          if (op === "POLL" && result.task) {
            const t = leasedDraftSchema.parse(result.task);
            if (
              t.agent_id !== this.binding?.agent ||
              t.room_id !== this.binding?.room
            )
              throw Error("PAIRING_SCOPE_MISMATCH");
          }
          if (op === "START" && result.dispatched === true)
            runningTask = payload as { task_id: string; fence: string };
          return result;
        },
        adapter,
        crypto.randomUUID(),
        controller.signal,
      );
      if (!["REVOKED", "CLOSED"].includes(this.current))
        this.current = receipt.state === "UNCERTAIN" ? "UNCERTAIN" : "ONLINE";
      return receipt;
    } catch (e) {
      if (!["CLOSED", "REVOKED"].includes(this.current))
        this.current = "OFFLINE";
      throw e;
    } finally {
      controller.abort();
      if (timer) clearTimeout(timer);
      await monitoring;
      this.active = undefined;
      this.busy = false;
    }
  }
  /** Local disconnect only. Owner's authenticated REVOKE is authoritative. */
  close() {
    this.current = "CLOSED";
    this.token = undefined;
    this.active?.abort();
  }
}
