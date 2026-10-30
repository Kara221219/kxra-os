import { businessDeclaration } from "../../../../../packages/admission/business";
import { query } from "../../../../../packages/db";
import { account, sameOrigin } from "../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../lib/http";
export const runtime = "nodejs";
export async function GET() {
  try {
    const actor = await account();
    const rows = await query<{ value: unknown }>(
      actor,
      "select kxra.business_admission_status() value",
    );
    return privateJson(rows[0].value);
  } catch (error) {
    return safeHttpError(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const actor = await account();
    const value = businessDeclaration.parse(await readJson(request, 4096));
    const rows = await query<{ value: unknown }>(
      actor,
      "select kxra.submit_business_declaration($1::jsonb) value",
      [JSON.stringify(value)],
    );
    return privateJson(rows[0].value, 201);
  } catch (error) {
    return safeHttpError(error);
  }
}
