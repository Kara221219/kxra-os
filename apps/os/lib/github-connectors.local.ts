import { localMode, scoped } from "../../../packages/db";
import {
  GithubConnectorService,
  LocalGithubAdapter,
} from "../../../packages/connectors/github";
import { HttpError, type Actor } from "./auth";
function service(identity: Actor) {
  if (!localMode() || process.env.VERCEL_ENV || identity.source !== "fixture")
    throw new HttpError(503, "GitHub local adapter unavailable");
  const origin = process.env.KXRA_GITHUB_FAKE_ORIGIN;
  if (!origin)
    throw new HttpError(503, "Local fake GitHub endpoint unavailable");
  return new GithubConnectorService(
    async (kind, action, input) =>
      scoped(identity, async (db) => {
        await db.query(
          "select set_config('request.kxra.connector_actor',$1,true)",
          [kind],
        );
        return (
          await db.query("select kxra.github_connector($1,$2::jsonb) result", [
            action,
            JSON.stringify(input),
          ])
        ).rows[0].result;
      }),
    new LocalGithubAdapter(origin),
  );
}
export async function listGithubConnectors(identity: Actor) {
  return service(identity).list();
}
export async function githubConnectorCommand(identity: Actor, input: unknown) {
  return { result: await service(identity).command(input) };
}
