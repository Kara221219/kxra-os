import { actor, sameOrigin, HttpError } from "../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../lib/http";
import { reviewOperation } from "../../../lib/review-operations";
import {
  reviewGet,
  reviewPost,
} from "../../../../../packages/review-operations/commands";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const a = await actor(),
      params = new URL(request.url).searchParams;
    if ([...params.keys()].some((k) => params.getAll(k).length !== 1))
      throw new HttpError(400, "Invalid review query");
    const q = reviewGet.parse(Object.fromEntries(params));
    return privateJson({
      result: await reviewOperation(
        a,
        "request_id" in q
          ? { action: "VIEW", request_id: q.request_id }
          : { action: "LIST", ...q },
      ),
    });
  } catch (e) {
    return safeHttpError(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const a = await actor(),
      command = reviewPost.parse(await readJson(request, 16384));
    return privateJson(
      { result: await reviewOperation(a, command) },
      command.action === "OPEN" ? 201 : 200,
    );
  } catch (e) {
    return safeHttpError(e);
  }
}
