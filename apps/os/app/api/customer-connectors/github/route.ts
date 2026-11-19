import { actor, sameOrigin } from "../../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../../lib/http";
import {
  githubConnectorCommand,
  listGithubConnectors,
} from "../../../../lib/github-connectors";
export const runtime = "nodejs";
export const maxDuration = 20;
export async function GET() {
  try {
    return privateJson(await listGithubConnectors(await actor()));
  } catch (error) {
    return safeHttpError(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const identity = await actor();
    return privateJson(
      await githubConnectorCommand(identity, await readJson(request, 5000)),
    );
  } catch (error) {
    return safeHttpError(error);
  }
}
