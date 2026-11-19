import { z } from "zod";
import { actor, HttpError } from "../../../lib/auth";
import { readAiConnectionStatus } from "../../../lib/ai-connection-status";
import { privateJson, safeHttpError } from "../../../lib/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const a = await actor(),
      params = new URL(request.url).searchParams;
    if ([...params.keys()].some((k) => params.getAll(k).length !== 1))
      throw new HttpError(400, "Invalid review query");
    const v = z
      .object({ id: z.uuid().optional() })
      .strict()
      .parse(Object.fromEntries(params));
    return privateJson({ admission: await readAiConnectionStatus(a, v.id) });
  } catch (e) {
    return safeHttpError(e);
  }
}
