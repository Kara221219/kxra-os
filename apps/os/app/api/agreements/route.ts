import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { account, sameOrigin } from "../../../lib/auth";
import { privateJson, safeHttpError } from "../../../lib/http";
import { query } from "../../../../../packages/db";

type Presentation = {
  presentation_id: string;
  requirement_id: string;
  document_id: string;
  document_version: number;
  document_sha256: string;
  title: string;
  rendered_content: string;
  acceptance_wording: string;
  acceptance_wording_version: number;
  acceptance_wording_sha256: string;
  presented_at: string;
};

const responseInput = z
  .object({
    presentation_id: z.string().uuid(),
    response: z.enum(["ACCEPTED", "DECLINED"]),
    request_id: z.string().uuid(),
  })
  .strict();

function digest(value: string | null) {
  return value
    ? crypto.createHash("sha256").update(value.slice(0, 2000)).digest("hex")
    : null;
}

async function presentations(request: Request) {
  const a = await account();
  return query<Presentation>(
    a,
    "select * from kxra.present_required_legal_documents($1,$2)",
    [
      digest(request.headers.get("user-agent")),
      digest(request.headers.get("x-forwarded-for")),
    ],
  );
}

export async function GET(request: Request) {
  try {
    const a = await account();
    const documents = await presentations(request);
    const gate = await query<{
      allowed: boolean;
      code: string;
      missing_count: number;
    }>(a, "select * from kxra.legal_gate_status()");
    return privateJson({ documents, gate: gate[0] });
  } catch (error) {
    return safeHttpError(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const contentType = request.headers.get("content-type") || "";
    const input = responseInput.parse(
      contentType.startsWith("application/json")
        ? await request.json()
        : Object.fromEntries(await request.formData()),
    );
    const a = await account();
    const result = await query<{ response: string; responded_at: string }>(
      a,
      "select * from kxra.record_legal_response($1,$2,$3)",
      [input.presentation_id, input.response === "ACCEPTED", input.request_id],
    );
    const gate = await query<{
      allowed: boolean;
      code: string;
      missing_count: number;
    }>(a, "select * from kxra.legal_gate_status()");
    if (contentType.startsWith("application/json"))
      return privateJson({ result: result[0], gate: gate[0] });
    return NextResponse.redirect(
      new URL(
        gate[0]?.allowed ? "/os" : "/agreements",
        process.env.KXRA_ORIGIN || request.url,
      ),
      303,
    );
  } catch (error) {
    return safeHttpError(error);
  }
}
