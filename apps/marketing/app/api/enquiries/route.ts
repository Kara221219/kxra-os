import { sprintPackage } from "../../../lib/business-sprints";
import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  publicIngressConnectionDiagnostics,
  digest,
  storePublicEnquiry,
  trustedClientAddress,
} from "../../../lib/ingress";

const schema = z.object({
  kind: z.enum(["ENQUIRY", "CUSTOM_PROJECT", "CONTACT"]),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  company: z.string().trim().max(160).optional().default(""),
  message: z.string().trim().min(20).max(4000),
  sourcePath: z.enum(["/partner", "/submit-opportunity", "/contact"]),
  consent: z.union([z.literal(true), z.literal("true")]).transform(() => true),
  website: z.string().max(200).optional().default(""),
  sprintPackage: z
    .enum(["decision-review", "improvement-sprint", "implementation"])
    .optional(),
  desiredOutcome: z.string().trim().min(10).max(700).optional(),
  constraints: z.string().trim().max(700).optional(),
  budget: z.enum(["UNSURE", "UNDER_500", "500_1500", "1500_PLUS"]).optional(),
  deadline: z.string().trim().max(100).optional(),
});

function safeMessage(status: number) {
  if (status === 429)
    return "Too many requests. Please wait before trying again.";
  if (status === 400) return "Please check the form and try again.";
  return "Submission is temporarily unavailable. Please email info@kxra-group.com.";
}

export async function POST(request: Request) {
  const expectedOrigin = process.env.KXRA_MARKETING_ORIGIN;
  const origin = request.headers.get("origin");
  if (!expectedOrigin || origin !== expectedOrigin)
    return NextResponse.json({ message: safeMessage(403) }, { status: 403 });
  const size = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(size) || size > 12_000)
    return NextResponse.json({ message: safeMessage(400) }, { status: 413 });
  const secret = process.env.KXRA_PUBLIC_INGRESS_SECRET;
  if (!secret || secret.length < 64)
    return NextResponse.json({ message: safeMessage(503) }, { status: 503 });
  const idempotency = request.headers.get("idempotency-key");
  if (!idempotency || !z.string().uuid().safeParse(idempotency).success)
    return NextResponse.json({ message: safeMessage(400) }, { status: 400 });
  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ message: safeMessage(400) }, { status: 400 });
  }
  const routeKind = {
    "/partner": "ENQUIRY",
    "/submit-opportunity": "CUSTOM_PROJECT",
    "/contact": "CONTACT",
  } as const;
  if (routeKind[parsed.sourcePath] !== parsed.kind)
    return NextResponse.json({ message: safeMessage(400) }, { status: 400 });
  if (parsed.sprintPackage) {
    if (parsed.kind !== "CUSTOM_PROJECT" || !parsed.desiredOutcome)
      return NextResponse.json({ message: safeMessage(400) }, { status: 400 });
    parsed.message = [
      `KXRA sprint request: ${sprintPackage(parsed.sprintPackage)!.name}`,
      `Problem: ${parsed.message}`,
      `Desired outcome: ${parsed.desiredOutcome}`,
      `Constraints: ${parsed.constraints || "Not supplied"}`,
      `Budget band: ${parsed.budget || "UNSURE"}`,
      `Desired deadline: ${parsed.deadline || "To agree"}`,
      "Assessment request only; no accepted proposal or payment.",
    ].join("\n\n");
    if (parsed.message.length > 4000)
      return NextResponse.json({ message: safeMessage(400) }, { status: 400 });
  } else if (
    parsed.desiredOutcome !== undefined ||
    parsed.constraints !== undefined ||
    parsed.budget !== undefined ||
    parsed.deadline !== undefined
  ) {
    return NextResponse.json({ message: safeMessage(400) }, { status: 400 });
  }
  const clientAddress = trustedClientAddress(request.headers);
  if (!clientAddress)
    return NextResponse.json({ message: safeMessage(503) }, { status: 503 });
  const agent = request.headers.get("user-agent")?.slice(0, 160) || "unknown";
  const content = [
    parsed.kind,
    parsed.email.toLowerCase(),
    parsed.message,
  ].join("\u001f");
  try {
    const stored = await storePublicEnquiry({
      ...parsed,
      requestDigest: digest(secret, `${clientAddress}\u001f${agent}`),
      fingerprint: digest(secret, content),
      idempotencyKey: idempotency,
      botField: parsed.website,
    });
    return NextResponse.json(
      {
        receipt: stored.receipt_id,
        message: "Request received for private review.",
      },
      { status: 202 },
    );
  } catch (error) {
    const rawCode =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    const code = /^[A-Z0-9_]{1,40}$/.test(rawCode) ? rawCode : "UNKNOWN";
    const diagnostic =
      error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)
        ? error.message
        : code;
    console.error("[api/enquiries] storage failed", {
      code: diagnostic,
      database: publicIngressConnectionDiagnostics(),
    });
    const status = rawCode === "P0001" ? 429 : 503;
    return NextResponse.json(
      { message: safeMessage(status), request: crypto.randomUUID() },
      { status },
    );
  }
}
