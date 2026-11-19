import { NextResponse } from "next/server";

export function GET() {
  const configured =
    process.env.KXRA_PRIVATE_APP_URL || "http://localhost:3210/login";
  const target = new URL(configured);
  if (!/^https?:$/.test(target.protocol))
    return NextResponse.json(
      { message: "Private application unavailable" },
      { status: 503 },
    );
  if (process.env.NODE_ENV === "production" && target.protocol !== "https:")
    return NextResponse.json(
      { message: "Private application unavailable" },
      { status: 503 },
    );
  target.pathname = "/signup";
  target.search = "";
  target.hash = "";
  return NextResponse.redirect(target, {
    status: 307,
    headers: { "Cache-Control": "no-store", Vary: "Host" },
  });
}
