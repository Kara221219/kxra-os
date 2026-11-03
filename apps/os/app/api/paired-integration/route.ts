import { integrationHuman } from "#kxra/paired-integration";
import { actor, sameOrigin } from "../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../lib/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    return privateJson(
      await integrationHuman(await actor(), await readJson(req)),
    );
  } catch (error) {
    return safeHttpError(error);
  }
}
