import crypto from "node:crypto";
import { localModeConfiguration } from "../packages/authz/local-guard";
class WorkerAccessDenied extends Error {}

async function main() {
  const args = process.argv.slice(2),
    mode = args.shift();
  if (!["--once", "--watch"].includes(mode || ""))
    throw Error("Use --once or --watch with --identity owner|partner");
  let identity = "",
    organisation = "";
  while (args.length) {
    const flag = args.shift(),
      value = args.shift();
    if (flag === "--identity" && !identity) identity = value || "";
    else if (flag === "--organisation" && !organisation)
      organisation = value || "";
    else throw Error("Unsupported or duplicate worker argument");
  }
  if (!["owner", "partner"].includes(identity))
    throw Error(
      "An explicit existing synthetic identity owner|partner is required",
    );
  if (
    organisation &&
    !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(
      organisation,
    )
  )
    throw Error("Invalid organisation resource identifier");
  if (!localModeConfiguration(process.env) || process.env.VERCEL_ENV)
    throw Error(
      "Job worker requires the guarded local fixture runtime; hosted execution is not activated",
    );
  const origin = process.env.KXRA_ORIGIN!,
    jar = new Map<string, string>();
  const deadline = Date.now() + 45000;
  let ready = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin + "/api/health", {
          signal: AbortSignal.timeout(1000),
        }),
        health = await response.json();
      if (
        response.ok &&
        health.service === "kxra-os" &&
        (!process.env.KXRA_CI_RUN_ID ||
          health.run_id === process.env.KXRA_CI_RUN_ID)
      ) {
        ready = true;
        break;
      }
    } catch {
      /* The explicitly started local server may still be booting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  if (!ready)
    throw Error("Expected local fixture application did not become ready");
  const merge = (response: Response) => {
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(";", 1)[0],
        n = pair.indexOf("=");
      jar.set(pair.slice(0, n), pair.slice(n + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => k + "=" + v).join("; ");
  const login = await fetch(origin + "/api/auth", {
    method: "POST",
    headers: { origin },
    body: new URLSearchParams({ fixture: identity }),
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });
  if (login.status !== 303) throw Error("Synthetic worker sign-in unavailable");
  merge(login);
  if (organisation) {
    const selected = await fetch(origin + "/api/context", {
      method: "POST",
      headers: { origin, cookie: cookie(), "content-type": "application/json" },
      body: JSON.stringify({ organisation_id: organisation }),
      signal: AbortSignal.timeout(10000),
    });
    if (!selected.ok) throw Error("Worker organisation context unavailable");
    merge(selected);
  }
  let stopping = false,
    failures = 0;
  for (const signal of ["SIGTERM", "SIGINT"] as const)
    process.on(signal, () => {
      stopping = true;
    });
  do {
    try {
      const response = await fetch(origin + "/api/team-space/jobs/drain", {
        method: "POST",
        headers: {
          origin,
          cookie: cookie(),
          "content-type": "application/json",
        },
        body: JSON.stringify({ request_id: crypto.randomUUID() }),
        signal: AbortSignal.timeout(55000),
      });
      if ([401, 403, 404, 428].includes(response.status))
        throw new WorkerAccessDenied(
          `Fixture worker access unavailable (${response.status})`,
        );
      if (!response.ok)
        throw Error(`Fixture job drain unavailable (${response.status})`);
      const result = await response.json();
      failures = 0;
      if (result.processed || mode === "--once")
        console.log(
          JSON.stringify({
            processed: result.processed,
            state: result.job?.state || null,
          }),
        );
    } catch (error) {
      failures++;
      if (
        error instanceof WorkerAccessDenied ||
        mode === "--once" ||
        failures >= 3
      )
        throw error;
      console.error("Fixture job tick failed; retrying bounded polling");
    }
    if (mode === "--watch" && !stopping)
      await new Promise((resolve) => setTimeout(resolve, 1000));
  } while (mode === "--watch" && !stopping);
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Fixture job worker failed",
  );
  process.exitCode = 1;
});
