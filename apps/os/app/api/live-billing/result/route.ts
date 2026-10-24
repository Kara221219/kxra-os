import { HttpError, sameOrigin } from "../../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../../lib/http";
import { checkoutResult } from "../../../../lib/checkout-result";
import { LiveEntryError } from "../../../../../../packages/authz/live-billing-entry";
export const dynamic = "force-dynamic";
// POST is the authenticated same-origin HTTP read request; the provider adapter is GET-only.
// No automatic redirect: bearer URL is returned transiently only after both current fences.
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const body = await readJson(request, 1_024);
    return privateJson(await checkoutResult(body, () => sameOrigin(request)));
  } catch (error) {
    return safeHttpError(
      error instanceof LiveEntryError
        ? new HttpError(error.status, error.message, error.code)
        : error,
    );
  }
}
