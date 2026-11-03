import { privateJson, readJson, safeHttpError } from "../../../../lib/http";
import { customerConnectorAgentCommand } from "../../../../lib/customer-connectors";
export const runtime = "nodejs";
// Machine-only synthetic capability. Cookies confer no authority on this route.
export async function POST(request: Request) {
  try {
    return privateJson(
      await customerConnectorAgentCommand(
        request.headers.get("authorization"),
        await readJson(request, 4096),
      ),
    );
  } catch (error) {
    return safeHttpError(error);
  }
}
