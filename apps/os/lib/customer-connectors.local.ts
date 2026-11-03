import { localMode, scoped, type Principal } from "../../../packages/db";
import {
  connectorCommand,
  connectorRegistry,
} from "../../../packages/connectors/contracts";
import {
  mintConnectorCapability,
  verifyConnectorCapability,
} from "../../../packages/connectors/agent-capability";
import { HttpError, type Actor } from "./auth";

function requireSyntheticRuntime() {
  if (!localMode() || process.env.VERCEL_ENV)
    throw new HttpError(
      503,
      "Customer connectors are available only in local synthetic mode",
    );
}
async function dispatch(
  identity: Principal,
  kind: "human" | "agent",
  action: string,
  parameters: unknown,
) {
  return scoped(identity, async (db) => {
    await db.query(
      "select set_config('request.kxra.connector_actor',$1,true)",
      [kind],
    );
    // Capabilities are invalidated by account session revocation as well as membership changes.
    if (
      kind === "agent" &&
      !(
        await db.query(
          "select 1 from kxra.account_identities where account_id=$1 and session_version=$2 and state='ACTIVE'",
          [identity.id, identity.session_version],
        )
      ).rowCount
    )
      throw new HttpError(403, "Agent capability unavailable");
    return (
      await db.query("select kxra.customer_connector($1,$2::jsonb) result", [
        action,
        JSON.stringify(parameters),
      ])
    ).rows[0].result;
  });
}
export async function listCustomerConnectors(actor: Actor) {
  requireSyntheticRuntime();
  if (actor.source !== "fixture")
    throw new HttpError(403, "Synthetic identity required");
  return {
    registry: connectorRegistry,
    result: await dispatch(actor, "human", "list", {}),
  };
}
export async function customerConnectorCommand(actor: Actor, input: unknown) {
  requireSyntheticRuntime();
  if (actor.source !== "fixture")
    throw new HttpError(403, "Synthetic identity required");
  const { action, ...parameters } = connectorCommand.parse(input);
  const result = await dispatch(actor, "human", action, parameters);
  if (action === "connect")
    return {
      result,
      agent_capability: mintConnectorCapability(
        {
          user_id: actor.id,
          org_id: actor.org_id,
          connector_id: result.id,
          session_version: actor.session_version,
        },
        process.env.KXRA_LOCAL_SECRET || "",
      ),
    };
  return { result };
}
export async function customerConnectorAgentCommand(
  authorization: string | null,
  input: unknown,
) {
  requireSyntheticRuntime();
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const claims = verifyConnectorCapability(
    token,
    process.env.KXRA_LOCAL_SECRET || "",
  );
  if (!claims) throw new HttpError(401, "Agent capability required");
  const { action, ...parameters } = connectorCommand.parse(input);
  if (
    !["read", "prepare", "execute"].includes(action) ||
    !("connector_id" in parameters) ||
    parameters.connector_id !== claims.connector_id
  )
    throw new HttpError(403, "Agent tool scope unavailable");
  const identity: Principal = {
    id: claims.user_id,
    organisation_id: claims.org_id,
    session_version: claims.session_version,
    source: "fixture",
    aal: "aal1",
  };
  return { result: await dispatch(identity, "agent", action, parameters) };
}
