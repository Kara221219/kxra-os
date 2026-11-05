import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { PairedSetupStore } from "../../../packages/workspace/paired-setup";
import { pairedSetupHttp } from "../../../packages/workspace/paired-setup-http";
import {
  pairedSetupFixtureBoundary,
  pairedSetupFixtureIdentity,
} from "../../../packages/workspace/paired-setup-fixture";
import { headers } from "next/headers";
let cached: { runtime: string; pool: pg.Pool } | undefined;
function setupPool(runtime: string) {
  if (cached && cached.runtime !== runtime)
    throw Error("FIXTURE_RUNTIME_CHANGED");
  if (!cached)
    cached = {
      runtime,
      pool: new pg.Pool({
        ...JSON.parse(
          fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
        ),
        max: 2,
        connectionTimeoutMillis: 2000,
        idleTimeoutMillis: 5000,
        allowExitOnIdle: true,
      }),
    };
  return cached.pool;
}
export async function pairedSetupRoute(request: Request) {
  try {
    const fixtureBoundary = pairedSetupFixtureBoundary();
    return await pairedSetupHttp(request, {
      enabled: true,
      fixtureBoundary,
      origin: process.env.KXRA_ORIGIN!,
      verifyIdentity: async (r) => pairedSetupFixtureIdentity(r),
      store: (actor) =>
        new PairedSetupStore(
          setupPool(fixtureBoundary.runtime),
          actor,
          true,
          fixtureBoundary,
        ),
    });
  } catch {
    return Response.json(
      { error: "PAIRED_SETUP_DISABLED" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export async function pairedSetupPageData() {
  try {
    const boundary = pairedSetupFixtureBoundary(),
      h = await headers(),
      request = new Request(process.env.KXRA_ORIGIN! + "/os/paired-setup", {
        headers: { cookie: h.get("cookie") ?? "" },
      }),
      actor = pairedSetupFixtureIdentity(request);
    if (!actor) return null;
    return await new PairedSetupStore(
      setupPool(boundary.runtime),
      actor,
      true,
      boundary,
    ).options();
  } catch {
    return null;
  }
}
