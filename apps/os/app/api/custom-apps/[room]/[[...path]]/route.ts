import { actor, sameOrigin, HttpError } from "../../../../../lib/auth";
import {
  customApps,
  customAppDetail,
  customAppMutation,
} from "../../../../../lib/custom-apps";
import { privateJson, readJson, safeHttpError } from "../../../../../lib/http";
export const runtime = "nodejs";
async function handle(
  req: Request,
  ctx: { params: Promise<{ room: string; path?: string[] }> },
) {
  try {
    if (req.method !== "GET") sameOrigin(req);
    const a = await actor(),
      { room, path = [] } = await ctx.params;
    if (req.method === "GET" && path.length === 0)
      return privateJson(await customApps(a, room));
    if (req.method === "GET" && path.length === 1)
      return privateJson(await customAppDetail(a, room, path[0]));
    if (req.method === "POST" && path.length === 0)
      return privateJson(
        await customAppMutation(a, room, await readJson(req, 32768)),
      );
    throw new HttpError(405, "Method unavailable");
  } catch (error) {
    return safeHttpError(error);
  }
}
export { handle as GET, handle as POST };
