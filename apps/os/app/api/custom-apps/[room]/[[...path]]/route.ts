import { actor, sameOrigin, HttpError } from "../../../../../lib/auth";
import {
  customApps,
  customAppDetail,
  customAppMutation,
} from "../../../../../lib/custom-apps";
import { privateJson, readJson, safeHttpError } from "../../../../../lib/http";
import {
  customAppRecords,
  saveCustomAppRecord,
  customAppRecordReceipt,
} from "../../../../../lib/custom-app-records";
export const runtime = "nodejs";
async function handle(
  req: Request,
  ctx: { params: Promise<{ room: string; path?: string[] }> },
) {
  try {
    if (req.method !== "GET") sameOrigin(req);
    const a = await actor(),
      { room, path = [] } = await ctx.params;
    if (path.length === 2 && path[1] === "records") {
      if (req.method === "GET") {
        const params = new URL(req.url).searchParams;
        if (
          [...params.keys()].some(
            (k) => k !== "before" || params.getAll(k).length !== 1,
          )
        )
          throw new HttpError(400, "Invalid record cursor");
        return privateJson(
          await customAppRecords(
            a,
            room,
            path[0],
            params.get("before") ?? undefined,
          ),
        );
      }
      if (req.method === "POST")
        return privateJson(
          await saveCustomAppRecord(
            a,
            room,
            path[0],
            await readJson(req, 32768),
          ),
        );
    }
    if (req.method === "GET" && path.length === 3 && path[1] === "receipts")
      return privateJson(
        await customAppRecordReceipt(a, room, path[0], path[2]),
      );
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
