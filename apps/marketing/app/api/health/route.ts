import { NextResponse } from "next/server";

export function GET() {
  const runId = process.env.KXRA_CI_RUN_ID;
  if (!runId) return new NextResponse(null, { status: 404 });
  return NextResponse.json(
    { service: "kxra-marketing", run_id: runId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
