import { test } from "node:test";
import assert from "node:assert/strict";
import { roomMaintenanceAuthorized } from "../../packages/workspace/room-maintenance";
test("reduction-only maintenance is separately default off and can operate while admissions are suspended", () => {
  const secret = "a".repeat(64),
    env = {
      KXRA_AUTH_MODE: "supabase",
      KXRA_ROOM_WORKER_SECRET: secret,
      KXRA_ROOM_MAINTENANCE_ENABLED: "true",
      KXRA_HOSTED_ROOM_JOBS: "false",
    };
  assert.equal(roomMaintenanceAuthorized("Bearer " + secret, env), true);
  for (const bad of [
    {},
    { ...env, KXRA_ROOM_MAINTENANCE_ENABLED: "false" },
    { ...env, KXRA_AUTH_MODE: "fixture" },
  ])
    assert.equal(roomMaintenanceAuthorized("Bearer " + secret, bad), false);
  for (const header of [null, "", secret, "Bearer " + "b".repeat(64)])
    assert.equal(roomMaintenanceAuthorized(header, env), false);
});

import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";
import { roomMaintenanceInput } from "../../packages/workspace/room-maintenance";
const require = createRequire(import.meta.url);
test("private maintenance bodies never choose identity, scope or SQL; health is read-only", async () => {
  let authorized = false,
    calls = 0,
    healthCalls = 0;
  const module = {
    exports: {} as {
      POST: (req: Request) => Promise<Response>;
      GET: (req: Request) => Promise<Response>;
    },
  };
  vm.runInNewContext(
    transformSync(
      fs.readFileSync(
        "apps/os/app/api/internal/room-jobs/maintenance/route.ts",
        "utf8",
      ),
      { loader: "ts", format: "cjs" },
    ).code,
    {
      module,
      exports: module.exports,
      Response,
      Buffer,
      setTimeout,
      clearTimeout,
      require: () => ({
        roomMaintenanceAuthorized: () => authorized,
        roomMaintenanceInput,
        roomMaintenanceCommand: async (value: unknown, health = false) => {
          if (health) {
            healthCalls++;
            return { status: "OK" };
          }
          roomMaintenanceInput.parse(value);
          calls++;
          return { cancelled: 0 };
        },
      }),
    },
  );
  const request = (body: unknown) =>
    new Request("https://example.test/api/internal/room-jobs/maintenance", {
      method: "POST",
      body: JSON.stringify(body),
    });
  assert.equal(
    (await module.exports.POST(request({ request_id: crypto.randomUUID() })))
      .status,
    404,
  );
  assert.equal(
    (await module.exports.GET(new Request("https://example.test"))).status,
    404,
  );
  authorized = true;
  for (const extra of [
    { actor_id: crypto.randomUUID() },
    { organisation_id: crypto.randomUUID() },
    { grant_id: crypto.randomUUID() },
    { room_id: crypto.randomUUID() },
    { sql: "select secret" },
  ])
    assert.equal(
      (
        await module.exports.POST(
          request({ request_id: crypto.randomUUID(), ...extra }),
        )
      ).status,
      400,
    );
  assert.equal(
    (await module.exports.POST(request({ request_id: "a".repeat(500) })))
      .status,
    400,
  );
  assert.equal(calls, 0);
  assert.equal(healthCalls, 0);
  assert.equal(
    (await module.exports.POST(request({ request_id: crypto.randomUUID() })))
      .status,
    200,
  );
  assert.equal(calls, 1);
  const health = await module.exports.GET(new Request("https://example.test"));
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("cache-control"), "private, no-store");
  assert.equal(healthCalls, 1);
  assert.equal(calls, 1);
});
test("maintenance uses only fixed private reducer/health RPCs, bounds transaction and rolls back failures", async () => {
  const calls: string[] = [],
    module = {
      exports: {} as {
        roomMaintenanceCommand: (
          value: unknown,
          health?: boolean,
        ) => Promise<unknown>;
      },
    };
  let fail = false;
  const db = {
    query: async (sql: string) => {
      calls.push(sql);
      if (fail && sql.includes("kxra_room_worker"))
        throw Error("synthetic failure");
      return { rows: [{ result: { status: "OK" } }] };
    },
    release: () => calls.push("release"),
  };
  vm.runInNewContext(
    transformSync(
      fs.readFileSync("packages/workspace/room-maintenance.ts", "utf8"),
      { loader: "ts", format: "cjs" },
    ).code,
    {
      module,
      exports: module.exports,
      process: { env: {} },
      Buffer,
      require: (name: string) =>
        name === "../db"
          ? { getPool: () => ({ connect: async () => db }) }
          : require(name),
    },
  );
  await assert.rejects(
    module.exports.roomMaintenanceCommand({
      request_id: crypto.randomUUID(),
      actor_id: crypto.randomUUID(),
    }),
  );
  assert.equal(calls.length, 0);
  await module.exports.roomMaintenanceCommand({
    request_id: crypto.randomUUID(),
  });
  assert.equal(calls[0], "begin");
  assert.ok(calls[1].includes("statement_timeout"));
  assert.ok(calls[2].includes("maintain($1)"));
  assert.equal(calls.at(-2), "commit");
  assert.equal(calls.at(-1), "release");
  calls.length = 0;
  await module.exports.roomMaintenanceCommand(null, true);
  assert.ok(calls[2].includes("health()"));
  assert.ok(!calls.some((c) => c.includes("maintain(")));
  calls.length = 0;
  fail = true;
  await assert.rejects(
    module.exports.roomMaintenanceCommand({ request_id: crypto.randomUUID() }),
  );
  assert.equal(calls.at(-2), "rollback");
  assert.equal(calls.at(-1), "release");
});

test("maintenance CLI is finite, targets exact HTTPS, distinguishes attention and never logs response secrets", async () => {
  async function run(
    mode: string,
    body: unknown,
    options: { status?: number; origin?: string } = {},
  ) {
    let fetched = 0;
    const output: string[] = [],
      errors: string[] = [],
      processState = {
        argv: ["node", "maintenance", mode],
        env: {
          KXRA_ORIGIN: options.origin ?? "https://approved.example",
          KXRA_ROOM_WORKER_SECRET: "a".repeat(64),
        },
        exitCode: 0,
      };
    await vm.runInNewContext(
      transformSync(
        fs.readFileSync("scripts/team-room-maintenance.ts", "utf8"),
        { loader: "ts", format: "cjs" },
      ).code,
      {
        process: processState,
        URL,
        AbortSignal,
        console: {
          log: (v: string) => output.push(v),
          error: (v: string) => errors.push(v),
        },
        require,
        fetch: async (url: string, init: RequestInit) => {
          fetched++;
          assert.equal(
            url,
            "https://approved.example/api/internal/room-jobs/maintenance",
          );
          assert.equal(init.redirect, "error");
          assert.equal(init.method, mode === "--health" ? "GET" : "POST");
          if (mode === "--once")
            assert.deepEqual(Object.keys(JSON.parse(String(init.body))), [
              "request_id",
            ]);
          return new Response(JSON.stringify(body), {
            status: options.status ?? 200,
          });
        },
      },
    );
    return { fetched, output, errors, exit: processState.exitCode };
  }
  const secret = "PRIVATE_PROVIDER_DETAIL_NEVER_LOG";
  const healthy = await run("--health", {
    status: "OK",
    queued_due: 0,
    secret,
  });
  assert.equal(healthy.fetched, 1);
  assert.equal(healthy.exit, 0);
  assert.ok(!JSON.stringify(healthy).includes(secret));
  const attention = await run("--health", {
    status: "ATTENTION",
    open_uncertain: 1,
    secret,
  });
  assert.equal(attention.exit, 2);
  assert.equal(attention.fetched, 1);
  const reduced = await run("--once", { quarantined: 1, scopes: 1, secret });
  assert.equal(reduced.exit, 2);
  assert.equal(reduced.fetched, 1);
  assert.ok(!JSON.stringify(reduced).includes(secret));
  const rejected = await run("--once", { error: secret }, { status: 503 });
  assert.equal(rejected.exit, 1);
  assert.equal(rejected.fetched, 1);
  assert.ok(!JSON.stringify(rejected).includes(secret));
  for (const origin of [
    "http://approved.example",
    "https://approved.example/path",
    "https://user:pass@approved.example",
  ]) {
    const invalid = await run("--once", {}, { origin });
    assert.equal(invalid.fetched, 0);
    assert.equal(invalid.exit, 1);
  }
});
