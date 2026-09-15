import { z } from "zod";
import { account, HttpError, sameOrigin } from "../../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../../lib/http";
import { query } from "../../../../../../packages/db";

const uuid = z.string().uuid();
const schemas = [
  z.object({ acknowledged: z.literal(true) }).strict(),
  z
    .object({
      first_name: z.string().trim().min(1).max(100),
      last_name: z.string().trim().min(1).max(100),
      job_title: z.string().trim().max(160),
      company: z.string().trim().max(200),
      phone: z.string().trim().max(40),
    })
    .strict(),
  z.object({ security_acknowledged: z.literal(true) }).strict(),
  z.object({ access_acknowledged: z.literal(true) }).strict(),
  z.object({ working_acknowledged: z.literal(true) }).strict(),
  z.object({ whatsapp_choice: z.enum(["SKIP", "CONNECT_LATER"]) }).strict(),
  z
    .object({
      timezone: z.string().min(1).max(100),
      email_notifications: z.boolean(),
      whatsapp_notifications: z.literal(false),
      display_density: z.enum(["comfortable", "compact"]),
    })
    .strict(),
  z
    .object({
      agreement_ids: z.array(uuid).min(1).max(20),
      placeholder_acknowledged: z.literal(true),
    })
    .strict(),
  z.object({ complete: z.literal(true) }).strict(),
] as const;

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const envelope = z
      .object({ step: z.number().int().min(1).max(9), data: z.unknown() })
      .strict()
      .parse(await readJson(request));
    const a = await account();
    if (a.account_state !== "ONBOARDING")
      throw new HttpError(409, "Onboarding unavailable");
    const data = schemas[envelope.step - 1].parse(envelope.data);
    const rows = await query<{ next: number }>(
      a,
      "select kxra.complete_onboarding_step($1,$2) as next",
      [envelope.step, JSON.stringify(data)],
    );
    return privateJson({ next: rows[0].next, complete: envelope.step === 9 });
  } catch (error) {
    return safeHttpError(error);
  }
}
