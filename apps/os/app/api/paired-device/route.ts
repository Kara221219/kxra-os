import { privateJson, readJson, safeHttpError } from "../../../lib/http";
import { pairedDevice } from "../../../lib/paired-agent";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    const v = z
      .object({
        operation: z.enum([
          "REDEEM",
          "POLL",
          "START",
          "RESULT",
          "ABANDON",
          "HEARTBEAT",
        ]),
        payload: z.unknown(),
      })
      .strict()
      .parse(await readJson(req));
    const header = req.headers.get("authorization") || "";
    if (!/^Bearer [a-f0-9]{64}$/.test(header))
      return privateJson({ error: "Pairing credential required" }, 401);
    return privateJson(
      await pairedDevice(v.operation, header.slice(7), v.payload),
    );
  } catch (e) {
    return safeHttpError(e);
  }
}
