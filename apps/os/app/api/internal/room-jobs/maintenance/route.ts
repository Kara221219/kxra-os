import {
  roomMaintenanceAuthorized,
  roomMaintenanceInput,
  roomMaintenanceCommand,
} from "../../../../../../../packages/workspace/room-maintenance";
export const runtime = "nodejs";
export const maxDuration = 10;
const reply = (body: unknown, status: number) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "private, no-store" },
  });
export async function GET(req: Request) {
  if (!roomMaintenanceAuthorized(req.headers.get("authorization")))
    return reply({ error: "Maintenance unavailable" }, 404);
  try {
    return reply(await roomMaintenanceCommand(null, true), 200);
  } catch {
    return reply({ error: "Maintenance unavailable" }, 503);
  }
}
export async function POST(req: Request) {
  if (!roomMaintenanceAuthorized(req.headers.get("authorization")))
    return reply({ error: "Maintenance unavailable" }, 404);
  const reader = req.body?.getReader();
  if (!reader) return reply({ error: "Invalid maintenance request" }, 400);
  let expired = false,
    bytes = 0;
  const chunks: Uint8Array[] = [];
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 2000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > 256 || chunks.length >= 8) {
        void reader.cancel().catch(() => {});
        return reply({ error: "Invalid maintenance request" }, 400);
      }
      chunks.push(value);
    }
    if (expired) return reply({ error: "Invalid maintenance request" }, 400);
    let value: unknown;
    try {
      value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return reply({ error: "Invalid maintenance request" }, 400);
    }
    const parsed = roomMaintenanceInput.safeParse(value);
    if (!parsed.success)
      return reply({ error: "Invalid maintenance request" }, 400);
    return reply(await roomMaintenanceCommand(parsed.data), 200);
  } catch {
    return reply({ error: "Maintenance unavailable" }, 503);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
