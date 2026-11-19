import { roomWorkerAuthorized } from "../../../../../../../packages/workspace/room-worker-auth";
import { runHostedRoomDelivery } from "../../../../../lib/team-hosted-worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  const reply = (body: unknown, status: number) =>
    Response.json(body, { status, headers: { "cache-control": "no-store" } });
  if (!roomWorkerAuthorized(req.headers.get("authorization")))
    return reply({ error: "Worker unavailable" }, 404);
  try {
    const reader = req.body?.getReader();
    if (!reader) return reply({ error: "Invalid delivery" }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0,
      timedOut = false;
    const bodyTimer = setTimeout(() => {
      timedOut = true;
      void reader.cancel().catch(() => {});
    }, 2000);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 256 || chunks.length >= 8) {
          void reader.cancel().catch(() => {});
          return reply({ error: "Invalid delivery" }, 400);
        }
        chunks.push(value);
      }
    } finally {
      clearTimeout(bodyTimer);
      reader.releaseLock();
    }
    if (timedOut) return reply({ error: "Invalid delivery" }, 400);
    let body: unknown;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return reply({ error: "Invalid delivery" }, 400);
    }
    if (
      !body ||
      typeof body !== "object" ||
      Object.keys(body).length !== 1 ||
      !("request_id" in body) ||
      typeof body.request_id !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        body.request_id,
      )
    )
      return reply({ error: "Invalid delivery" }, 400);
    return reply(await runHostedRoomDelivery(body), 200);
  } catch {
    return reply({ error: "Room worker unavailable" }, 503);
  }
}
