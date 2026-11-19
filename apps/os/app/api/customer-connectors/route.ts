import { actor, sameOrigin } from "../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../lib/http";
import {
  customerConnectorCommand,
  listCustomerConnectors,
} from "../../../lib/customer-connectors";
export const runtime = "nodejs";
export async function GET() {
  try {
    return privateJson(await listCustomerConnectors(await actor()));
  } catch (error) {
    return safeHttpError(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const identity = await actor();
    return privateJson(
      await customerConnectorCommand(identity, await readJson(request, 4096)),
    );
  } catch (error) {
    return safeHttpError(error);
  }
}
