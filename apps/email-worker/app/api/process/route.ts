import crypto from "node:crypto";
import { processTransactionalEmails } from "../../../../../packages/integrations/email-worker";
import {
  authorizeWorkerRequest,
  hasProhibitedRequestBody,
} from "../../../../../packages/integrations/worker-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  try {
    if (!authorizeWorkerRequest(request))
      return json({ error: "Access unavailable" }, 401);
    if (await hasProhibitedRequestBody(request))
      return json({ error: "Request body prohibited" }, 400);
    const results = await processTransactionalEmails({
      maximumJobs: 10,
      workerReference: `vercel-${crypto.randomUUID()}`,
    });
    return json({
      processed: results.length,
      states: results.map((result) => result.state || "UNKNOWN"),
    });
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z][A-Z0-9_]{2,80}$/.test(error.message)
        ? error.message
        : "EMAIL_WORKER_FAILED";
    console.error("KXRA email worker rejected", { code });
    return json({ error: "Worker unavailable" }, 503);
  }
}
