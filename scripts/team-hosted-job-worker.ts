import crypto from "node:crypto";
/** Bounded wakeup only: no customer cookies, account IDs or direct DB credentials. */
async function main() {
  if (process.argv.slice(2).join(" ") !== "--once")
    throw Error("Use --once; schedule externally after approval");
  const raw = process.env.KXRA_ORIGIN,
    key = process.env.KXRA_ROOM_WORKER_SECRET;
  if (!raw || !key || !/^[a-f0-9]{64}$/i.test(key))
    throw Error("Room wakeup configuration unavailable");
  const origin = new URL(raw);
  if (
    origin.protocol !== "https:" ||
    origin.origin !== raw ||
    origin.username ||
    origin.password
  )
    throw Error("An exact HTTPS application origin is required");
  const response = await fetch(origin.origin + "/api/internal/room-jobs/drain", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(55_000),
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ request_id: crypto.randomUUID() }),
  });
  if (!response.ok) throw Error(`Room delivery failed (${response.status})`);
  const body = await response.json();
  console.log(
    JSON.stringify({
      processed: body.processed === true,
      state:
        typeof body.state === "string" && /^[A-Z_]{1,20}$/.test(body.state)
          ? body.state
          : null,
    }),
  );
}
main().catch(() => {
  console.error("Room delivery failed; inspect private bounded diagnostics");
  process.exitCode = 1;
});
