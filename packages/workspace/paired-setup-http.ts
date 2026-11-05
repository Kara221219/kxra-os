import type { Principal } from "../db";
import { pairedSetupCommand, type PairedSetupStore } from "./paired-setup";
/** Unwired HTTP boundary. The hosting application must supply its verified
 * identity resolver and trusted origin; a request-body/paired token is never identity. */
export async function pairedSetupHttp(
  request: Request,
  ports?: {
    enabled?: boolean;
    origin: string;
    verifyIdentity(request: Request): Promise<Principal | null>;
    store(actor: Principal): Pick<PairedSetupStore, "command">;
  },
): Promise<Response> {
  const response = (status: number, error: string) =>
    Response.json(
      { error },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  if (ports?.enabled !== true) return response(503, "PAIRED_SETUP_DISABLED");
  if (request.method !== "POST") return response(405, "METHOD_NOT_ALLOWED");
  if (
    request.headers.get("origin") !== ports.origin ||
    new URL(request.url).origin !== ports.origin
  )
    return response(403, "ORIGIN_REJECTED");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return response(415, "JSON_REQUIRED");
  let actor: Principal | null;
  try {
    actor = await ports.verifyIdentity(request);
  } catch {
    return response(401, "IDENTITY_REQUIRED");
  }
  if (!actor || actor.source !== "supabase")
    return response(401, "IDENTITY_REQUIRED");
  let value: unknown,
    reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!reader) return response(400, "INVALID_COMMAND");
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 8192) {
        await reader.cancel();
        return response(413, "BODY_TOO_LARGE");
      }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    value = pairedSetupCommand.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
  } catch {
    return response(400, "INVALID_COMMAND");
  } finally {
    reader?.releaseLock();
  }
  try {
    return Response.json(await ports.store(actor).command(value), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return response(403, "SETUP_UNAVAILABLE");
  }
}
