import { query } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
import {
  parseAiSetupStatus,
  type AiSetupStatus,
} from "../../../packages/admission/ai-setup-status";
export async function readAiConnectionStatus(
  actor: Actor,
  id?: string,
): Promise<AiSetupStatus | null> {
  const rows = await query<{ value: unknown }>(
    actor,
    "select kxra.ai_connection_status($1::uuid) value",
    [id ?? null],
  );
  if (rows.length !== 1 || !("value" in rows[0]))
    throw new HttpError(503, "AI review status unavailable");
  return rows[0].value === null ? null : parseAiSetupStatus(rows[0].value);
}
export class AiConnectionSetupRequired extends Error {
  readonly admission: AiSetupStatus;
  constructor(value: unknown) {
    super("AI_CONNECTION_REVIEW_REQUIRED");
    this.admission = parseAiSetupStatus(value);
  }
}
