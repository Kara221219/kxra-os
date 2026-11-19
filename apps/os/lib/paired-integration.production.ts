import { HttpError } from "./auth";
export async function integrationHuman(
  ..._args: unknown[]
): Promise<{ result: unknown }> {
  throw new HttpError(404, "Local integration unavailable");
}
export async function integrationDevice(
  ..._args: unknown[]
): Promise<{ result: unknown }> {
  throw new HttpError(404, "Local integration unavailable");
}
