import { HttpError, type Actor } from "./auth";
export async function listGithubConnectors(_actor: Actor): Promise<unknown> {
  throw new HttpError(503, "GitHub connector unavailable");
}
export async function githubConnectorCommand(
  _actor: Actor,
  _input: unknown,
): Promise<unknown> {
  throw new HttpError(503, "GitHub connector unavailable");
}
