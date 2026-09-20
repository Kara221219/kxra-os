import { NextResponse } from "next/server";
import { z } from "zod";
import {
  availableOrganisations,
  principal,
  sameOrigin,
  selectOrganisationContext,
  HttpError,
} from "../../../lib/auth";
import { privateJson, safeHttpError } from "../../../lib/http";

const input = z.object({ organisation_id: z.string().uuid() }).strict();

export async function GET() {
  try {
    return privateJson({ organisations: await availableOrganisations() });
  } catch (error) {
    return safeHttpError(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const p = await principal();
    if (!p) throw new HttpError(401, "Sign in required", "AUTH_REQUIRED");
    const contentType = request.headers.get("content-type") || "";
    const value = input.parse(
      contentType.startsWith("application/json")
        ? await request.json()
        : Object.fromEntries(await request.formData()),
    );
    const selected = await selectOrganisationContext(
      p,
      value.organisation_id,
      "USER_SELECTION",
    );
    if (contentType.startsWith("application/json"))
      return privateJson({ organisation: selected });
    return NextResponse.redirect(
      new URL("/os", process.env.KXRA_ORIGIN || request.url),
      303,
    );
  } catch (error) {
    return safeHttpError(error);
  }
}
