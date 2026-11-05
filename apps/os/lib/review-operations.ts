import { query } from "../../../packages/db";
import { HttpError, type Actor } from "./auth";
import type { ReviewCommand } from "../../../packages/review-operations/commands";
import {
  parseReviewDetail,
  parseReviewQueue,
  parseReviewReceipt,
} from "../../../packages/review-operations/public";
export function reviewOperationsConfiguration(
  env: NodeJS.ProcessEnv = process.env,
) {
  const sha = env.KXRA_REVIEW_OPERATIONS_POLICY_SHA256;
  return env.KXRA_REVIEW_OPERATIONS_ENABLED === "true" &&
    typeof sha === "string" &&
    /^[a-f0-9]{64}$/.test(sha)
    ? { policySha256: sha }
    : null;
}
export async function reviewOperation(actor: Actor, command: ReviewCommand) {
  if (
    actor.security_role !== "KXRA_OWNER" ||
    actor.organisation_kind !== "KXRA"
  )
    throw new HttpError(403, "Review access unavailable");
  const cfg = reviewOperationsConfiguration();
  if (!cfg) throw new HttpError(503, "Review operations are not configured");
  const { action, ...input } = command;
  const rows = await query<{ value: unknown }>(
    actor,
    "select kxra.review_operations($1,$2::jsonb,$3) value",
    [action, JSON.stringify(input), cfg.policySha256],
  );
  if (rows.length !== 1)
    throw new HttpError(503, "Review operations unavailable");
  return action === "LIST"
    ? parseReviewQueue(rows[0].value)
    : action === "OPEN" || action === "VIEW"
      ? parseReviewDetail(rows[0].value)
      : parseReviewReceipt(rows[0].value);
}
