import { actor, sameOrigin } from "../../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../../lib/http";
import {
  roomOperationRecovery,
  reviewRoomOperationRecovery,
} from "../../../../lib/room-operation-recovery";
export const runtime = "nodejs";
export const maxDuration = 10;
export async function GET(
  _req: Request,
  context: { params: Promise<{ room: string }> },
) {
  try {
    return privateJson(
      await roomOperationRecovery(await actor(), (await context.params).room),
    );
  } catch (error) {
    return safeHttpError(error);
  }
}
export async function POST(
  req: Request,
  context: { params: Promise<{ room: string }> },
) {
  try {
    sameOrigin(req);
    return privateJson(
      await reviewRoomOperationRecovery(
        await actor(),
        (await context.params).room,
        await readJson(req, 1024),
      ),
    );
  } catch (error) {
    return safeHttpError(error);
  }
}
