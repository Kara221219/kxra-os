import { sameOrigin, HttpError } from "../../../../lib/auth";
import { readJson, privateJson, safeHttpError } from "../../../../lib/http";
import { portalDelivery } from "../../../../lib/portal-delivery";
import { LiveEntryError } from "../../../../../../packages/authz/live-billing-entry";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    return privateJson(
      await portalDelivery(await readJson(request, 2_048), () =>
        sameOrigin(request),
      ),
    );
  } catch (error) {
    return safeHttpError(
      error instanceof LiveEntryError
        ? new HttpError(error.status, error.message, error.code)
        : error,
    );
  }
}
