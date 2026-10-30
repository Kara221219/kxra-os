import crypto from "node:crypto";
/** Finite reduction/health command. No provider credentials or database access. */
async function main() {
  const mode = process.argv.slice(2).join(" ");
  if (!["--once", "--health"].includes(mode))
    throw Error("Use --once or --health");
  const raw = process.env.KXRA_ORIGIN,
    key = process.env.KXRA_ROOM_WORKER_SECRET;
  if (!raw || !key || !/^[a-f0-9]{64}$/i.test(key))
    throw Error("Room maintenance configuration unavailable");
  const origin = new URL(raw);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== raw ||
    origin.username ||
    origin.password
  )
    throw Error("An exact HTTPS application origin is required");
  const health = mode === "--health",
    response = await fetch(
      origin.origin + "/api/internal/room-jobs/maintenance",
      {
        method: health ? "GET" : "POST",
        redirect: "error",
        signal: AbortSignal.timeout(12000),
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        ...(!health
          ? { body: JSON.stringify({ request_id: crypto.randomUUID() }) }
          : {}),
      },
    );
  if (!response.ok) throw Error("Room maintenance unavailable");
  const body = await response.json(),
    summary: Record<string, string | number | boolean> = {};
  for (const field of [
    "scopes",
    "cancelled",
    "quarantined",
    "opened_cases",
    "reconciled",
    "paused",
    "pruned",
    "busy_skipped",
    "maintenance_age_seconds",
    "queued_due",
    "oldest_due_seconds",
    "retention_due",
    "expired_leases",
    "open_uncertain",
  ])
    if (
      typeof body[field] === "number" &&
      Number.isSafeInteger(body[field]) &&
      body[field] >= 0
    )
      summary[field] = body[field];
  if (["OK", "STALE", "ATTENTION", "BACKLOG"].includes(body.status))
    summary.status = body.status;
  if (typeof body.replayed === "boolean") summary.replayed = body.replayed;
  const attention =
    (health && summary.status !== "OK") || Number(summary.quarantined || 0) > 0;
  summary.attention = attention;
  console.log(JSON.stringify(summary));
  if (attention) process.exitCode = 2;
}
main().catch(() => {
  console.error(
    "Room maintenance failed; inspect authorized private operational diagnostics",
  );
  process.exitCode = 1;
});
