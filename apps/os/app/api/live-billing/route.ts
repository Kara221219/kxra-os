import { HttpError, sameOrigin } from "../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../lib/http";
import { liveEntryController } from "../../../lib/live-billing-entry";
import { LiveEntryError } from "../../../../../packages/authz/live-billing-entry";

export const dynamic = "force-dynamic";
function failure(error: unknown) {
  return safeHttpError(
    error instanceof LiveEntryError
      ? new HttpError(error.status, error.message, error.code)
      : error,
  );
}
export async function GET() {
  try {
    return privateJson(await liveEntryController().read());
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await readJson(request, 4_096);
    return privateJson(
      await liveEntryController(() => sameOrigin(request)).write(body),
      202,
    );
  } catch (error) {
    return failure(error);
  }
}
