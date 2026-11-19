import { hostedSupabaseConfiguration } from "../authz/hosted-supabase";
/** Default-off room operations. No setting asserts hosted acceptance. */
export function hostedRoomOperations(
  environment: Record<string, string | undefined> = process.env,
) {
  return (
    environment.KXRA_HOSTED_ROOM_JOBS === "true" &&
    hostedSupabaseConfiguration(environment) !== null &&
    /^[a-f0-9]{64}$/i.test(environment.KXRA_ROOM_WORKER_SECRET || "")
  );
}
