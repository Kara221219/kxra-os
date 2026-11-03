import { integrationDevice } from "#kxra/paired-integration";
import { privateJson, readJson, safeHttpError } from "../../../../lib/http";
export const runtime = "nodejs";
export async function POST(req: Request) {
  try {
    return privateJson(
      await integrationDevice(
        req.headers.get("authorization"),
        req.headers.get("x-kxra-delegation"),
        await readJson(req),
      ),
    );
  } catch (error) {
    return safeHttpError(error);
  }
}
