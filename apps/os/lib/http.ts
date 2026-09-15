import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "./auth";

export function privateJson(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function readJson(request: Request, maximumBytes = 100_000) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "JSON required");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Body required");
  const decoder = new TextDecoder();
  let size = 0;
  let value = "";
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > maximumBytes) {
      await reader.cancel();
      throw new HttpError(413, "Request too large");
    }
    value += decoder.decode(next.value, { stream: true });
  }
  try {
    return JSON.parse(value + decoder.decode());
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

export function safeHttpError(error: unknown) {
  if (error instanceof HttpError)
    return privateJson({ error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return privateJson({ error: "Invalid request fields" }, 400);
  const code = (error as { code?: string }).code;
  if (code === "42501")
    return privateJson({ error: "Access unavailable" }, 403);
  if (["23503", "23505", "23514", "P0001", "22P02"].includes(code || ""))
    return privateJson(
      { error: "Action conflicts with current state or permissions" },
      409,
    );
  return privateJson({ error: "Request unavailable" }, 503);
}
