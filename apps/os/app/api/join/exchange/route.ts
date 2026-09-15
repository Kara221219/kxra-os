import crypto from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { query } from "../../../../../../packages/db";
import {
  joinIntentCookie,
  sealJoinIntent,
} from "../../../../../../packages/authz/join-intent";
import { sameOrigin } from "../../../../lib/auth";
import { privateJson, readJson, safeHttpError } from "../../../../lib/http";
import { joinSecret } from "#kxra/local-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InvitationPreview = {
  invitation_id: string;
  invitation_version: number;
  recipient_email: string;
  recipient_hint: string;
  expires_at: string;
};

const exchange = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{32,100}$/) })
  .strict();

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = exchange.parse(await readJson(request));
    const tokenDigest = crypto
      .createHash("sha256")
      .update(input.token)
      .digest("hex");
    const rate = await query<{ allowed: boolean }>(
      null,
      "select kxra.consume_rate_limit('join-exchange',$1,12,900) as allowed",
      [tokenDigest],
    );
    if (!rate[0]?.allowed)
      return privateJson({ error: "Invitation temporarily unavailable" }, 429);
    const rows = await query<InvitationPreview>(
      null,
      "select * from kxra.preview_invitation($1)",
      [tokenDigest],
    );
    if (!rows[0]) return privateJson({ error: "Invitation unavailable" }, 409);
    const sealed = sealJoinIntent(
      {
        invitationId: rows[0].invitation_id,
        invitationVersion: rows[0].invitation_version,
        tokenDigest,
        email: rows[0].recipient_email,
        recipientHint: rows[0].recipient_hint,
        invitationExpiresAt: rows[0].expires_at,
      },
      joinSecret(),
    );
    (await cookies()).set(joinIntentCookie, sealed, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 60,
    });
    return privateJson({ next: "/join/account" });
  } catch (error) {
    (await cookies()).delete(joinIntentCookie);
    if (error instanceof z.ZodError)
      return privateJson({ error: "Invitation unavailable" }, 400);
    return safeHttpError(error);
  }
}
