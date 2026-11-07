import { z } from "zod";
import type { Principal } from "../db";
import { hostedSupabaseConfiguration } from "../authz/hosted-supabase";
import {
  pairedSetupHttpCommand,
  pairedSetupOptions,
  pairedSetupReceipt,
} from "./paired-setup-contract";

type Environment = Record<string, string | undefined>;
export type HostedPairedSetupPorts = {
  /** Server-only verified Supabase identity and existing authenticated RLS query. */
  identity(): Promise<Principal | null>;
  query(
    actor: Principal,
    sql: string,
    values: unknown[],
  ): Promise<{ value: unknown }[]>;
};
export function hostedPairedSetupConfiguration(
  environment: Environment = process.env,
) {
  return environment.KXRA_PAIRED_SETUP_ENABLED === "true"
    ? hostedSupabaseConfiguration(environment)
    : null;
}
const id = z.uuid();
function currentActor(value: Principal | null, now = Date.now()): Principal {
  if (
    !value ||
    value.source !== "supabase" ||
    value.aal !== "aal2" ||
    !id.safeParse(value.id).success ||
    !id.safeParse(value.organisation_id).success ||
    !id.safeParse(value.provider_session_id).success ||
    !Number.isSafeInteger(value.session_version) ||
    value.session_version! < 1 ||
    value.provider_session_version !== value.session_version ||
    !Number.isSafeInteger(value.auth_time) ||
    value.auth_time! * 1000 < now - 900000 ||
    value.auth_time! * 1000 > now + 60000
  ) {
    throw Error("PAIRED_SETUP_IDENTITY_REQUIRED");
  }
  return Object.freeze({ ...value });
}
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
function error(status: number, code: string) {
  return json({ error: code }, status);
}
class BodyError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}
async function commandBody(request: Request) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new BodyError(415, "JSON_REQUIRED");
  const reader = request.body?.getReader();
  if (!reader) throw new BodyError(400, "INVALID_COMMAND");
  const chunks: Uint8Array[] = [];
  let size = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  let cleanupAbort = () => {};
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new BodyError(408, "REQUEST_TIMEOUT")),
      3000,
    );
  });
  const aborted = new Promise<never>((_, reject) => {
    const abort = () => reject(new BodyError(400, "REQUEST_ABORTED"));
    request.signal.addEventListener("abort", abort, { once: true });
    cleanupAbort = () => request.signal.removeEventListener("abort", abort);
    if (request.signal.aborted) abort();
  });
  let complete = false;
  try {
    for (;;) {
      const part = await Promise.race([reader.read(), deadline, aborted]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192 || chunks.length >= 256)
        throw new BodyError(413, "BODY_TOO_LARGE");
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const command = pairedSetupHttpCommand.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    complete = true;
    return command;
  } catch (failure) {
    if (failure instanceof BodyError) throw failure;
    throw new BodyError(400, "INVALID_COMMAND");
  } finally {
    clearTimeout(timer);
    cleanupAbort();
    if (!complete) void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
async function execute(
  actor: Principal,
  command: z.infer<typeof pairedSetupHttpCommand>,
  ports: HostedPairedSetupPorts,
) {
  const sql =
    command.action === "OPTIONS"
      ? "select kxra_paired_admission.setup_options() value"
      : command.action === "REQUEST"
        ? "select kxra_paired_admission.request_setup($1,$2,$3,$4,$5) value"
        : command.action === "STATUS"
          ? "select kxra_paired_admission.setup_status($1) value"
          : "select kxra_paired_admission.cancel_setup($1) value";
  const values =
    command.action === "OPTIONS"
      ? []
      : command.action === "REQUEST"
        ? [
            command.request_id,
            command.room_id,
            command.ai_intent_id,
            command.auth_route,
            command.label,
          ]
        : [command.request_id];
  // The separate reviewed SQL session guard is mandatory. Missing SQL fails
  // closed even if the configuration flag is enabled accidentally. CASE
  // prevents invoking any setup RPC when the original session is no longer current.
  const guardedSql = sql.replace(
    /^select (.*) value$/,
    "select case when kxra_paired_admission.hosted_setup_session_current() then $1 end value",
  );
  const rows = await ports.query(actor, guardedSql, values);
  if (rows.length !== 1) throw Error("INVALID_RECEIPT");
  if (command.action === "OPTIONS")
    return pairedSetupOptions.parse(rows[0].value);
  const result = pairedSetupReceipt.parse(rows[0].value);
  if (
    result.request_id !== command.request_id ||
    (command.action === "REQUEST" && result.room_id !== command.room_id) ||
    (command.action === "CANCEL" && result.reason !== "CANCELLED")
  )
    throw Error("FOREIGN_RECEIPT");
  return result;
}
/** Request-only preparation. No device bearer, activation, provider or credential APIs. */
export async function hostedPairedSetupRoute(
  request: Request,
  ports: HostedPairedSetupPorts,
  environment: Environment = process.env,
) {
  const config = hostedPairedSetupConfiguration(environment);
  if (!config) return error(503, "PAIRED_SETUP_DISABLED");
  if (request.method !== "POST") return error(405, "METHOD_NOT_ALLOWED");
  // Ignore forwarded host headers. Next's internal URL may be loopback, but the
  // actual Host and browser Origin must both match the configured HTTPS origin.
  if (
    request.headers.get("origin") !== config.origin ||
    request.headers.get("host") !== new URL(config.origin).host
  )
    return error(403, "ORIGIN_REJECTED");
  let command: z.infer<typeof pairedSetupHttpCommand>;
  try {
    command = await commandBody(request);
  } catch (failure) {
    return failure instanceof BodyError
      ? error(failure.status, failure.code)
      : error(400, "INVALID_COMMAND");
  }
  let actor: Principal;
  try {
    actor = currentActor(await ports.identity());
  } catch {
    return error(401, "IDENTITY_REQUIRED");
  }
  if (request.signal.aborted) return error(400, "REQUEST_ABORTED");
  try {
    return json(await execute(actor, command, ports));
  } catch {
    return error(503, "SETUP_UNAVAILABLE");
  }
}
export async function hostedPairedSetupPageData(
  ports: HostedPairedSetupPorts,
  environment: Environment = process.env,
) {
  if (!hostedPairedSetupConfiguration(environment)) return null;
  try {
    const actor = currentActor(await ports.identity());
    return pairedSetupOptions.parse(
      await execute(actor, { action: "OPTIONS" }, ports),
    );
  } catch {
    return null;
  }
}
