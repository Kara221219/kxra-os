import { HttpError, type Actor } from "./auth";
function unavailable(): never {
  throw new HttpError(503, "Customer connectors are unavailable");
}
export async function listCustomerConnectors(_actor: Actor): Promise<unknown> {
  return unavailable();
}
export async function customerConnectorCommand(
  _actor: Actor,
  _input: unknown,
): Promise<unknown> {
  return unavailable();
}
export async function customerConnectorAgentCommand(
  _authorization: string | null,
  _input: unknown,
): Promise<unknown> {
  return unavailable();
}
