import crypto from "node:crypto";
import { hostedRoomOperations } from "./hosted-operations";
export function roomWorkerAuthorized(
  header: string | null,
  environment: Record<string, string | undefined> = process.env,
) {
  if (!hostedRoomOperations(environment)) return false;
  const key = environment.KXRA_ROOM_WORKER_SECRET;
  if (!key || !/^[a-f0-9]{64}$/i.test(key)) return false;
  const expected = Buffer.from(`Bearer ${key}`),
    actual = Buffer.from(header || "");
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}
