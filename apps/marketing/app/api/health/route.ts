import { NextResponse } from "next/server";

export function GET() {
  const runId = process.env.KXRA_CI_RUN_ID;
  return NextResponse.json(
    runId
      ? { service: "kxra-marketing", ok: true, run_id: runId }
      : { service: "kxra-marketing", ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
