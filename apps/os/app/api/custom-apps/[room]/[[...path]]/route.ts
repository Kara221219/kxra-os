import { actor } from "../../../../../lib/auth";
import { customAppHttp } from "../../../../../lib/custom-app-http";
export const runtime = "nodejs";
function handle(
  req: Request,
  ctx: { params: Promise<{ room: string; path?: string[] }> },
) {
  return customAppHttp(req, ctx, actor);
}
export { handle as GET, handle as POST };
