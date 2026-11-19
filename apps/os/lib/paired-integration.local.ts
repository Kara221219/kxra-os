import crypto from "node:crypto";
import { scoped } from "../../../packages/db";
import {
  integrationHumanCommand,
  integrationDeviceCommand,
} from "../../../packages/integration/contracts";
import {
  GithubConnectorService,
  LocalGithubAdapter,
} from "../../../packages/connectors/github";
import {
  fixturePairingOnly,
  credentialHash,
  resolveCredential,
} from "./paired-agent";
import { HttpError, type Actor } from "./auth";
export async function integrationHuman(actor: Actor, raw: unknown) {
  fixturePairingOnly();
  if (actor.source !== "fixture")
    throw new HttpError(403, "Fixture identity required");
  const { operation, ...input } = integrationHumanCommand.parse(raw);
  const token =
    operation === "DELEGATE"
      ? crypto.randomBytes(32).toString("hex")
      : undefined;
  const result = await scoped(actor, async (db) => {
    await db.query(
      "select set_config('request.kxra.integration_actor','human',true)",
    );
    return (
      await db.query(
        "select kxra.paired_integration_control($1,$2::jsonb) result",
        [
          operation,
          JSON.stringify({
            ...input,
            ...(token
              ? {
                  delegation_id: crypto.randomUUID(),
                  secret_hash: credentialHash(token),
                }
              : {}),
          }),
        ],
      )
    ).rows[0].result;
  });
  return { result, ...(token ? { delegation_token: token } : {}) };
}
export async function integrationDevice(
  authorization: string | null,
  delegation: string | null,
  raw: unknown,
) {
  fixturePairingOnly();
  if (
    !authorization ||
    !/^Bearer [a-f0-9]{64}$/.test(authorization) ||
    !delegation ||
    !/^[a-f0-9]{64}$/.test(delegation)
  )
    throw new HttpError(401, "Device and delegation credentials required");
  const identity = await resolveCredential(authorization.slice(7), "SESSION");
  const { task_id, fence, command } = integrationDeviceCommand.parse(raw);
  const invoke = async (action: string, input: Record<string, unknown>) =>
    scoped(identity, async (db) => {
      await db.query(
        "select set_config('request.kxra.integration_actor','device',true)",
      );
      return (
        await db.query(
          "select kxra.paired_integration_device($1,$2,$3,$4,$5,$6::jsonb) result",
          [
            credentialHash(authorization.slice(7)),
            credentialHash(delegation),
            task_id,
            fence,
            action,
            JSON.stringify(input),
          ],
        )
      ).rows[0].result;
    });
  if (command.action === "app_propose")
    return { result: await invoke("app_propose", { schema: command.schema }) };
  const origin = process.env.KXRA_GITHUB_FAKE_ORIGIN;
  if (!origin) throw new HttpError(503, "Local fake provider unavailable");
  const service = new GithubConnectorService(
    async (_kind, action, input) => invoke(action, input),
    new LocalGithubAdapter(origin),
  );
  return { result: await service.command(command) };
}
