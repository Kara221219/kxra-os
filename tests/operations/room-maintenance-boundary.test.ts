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
    options: { status?: number; origin?: string; response?: Response } = {},
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
        Buffer,
        setTimeout,
        clearTimeout,
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
          if (options.response) return options.response;
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
  for (const response of [
    new Response("x".repeat(16385)),
    new Response("[]"),
    new Response("invalid json"),
    new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < 65; i++) controller.enqueue(new Uint8Array());
        },
      }),
    ),
  ]) {
    const bounded = await run("--health", {}, { response });
    assert.equal(bounded.fetched, 1);
    assert.equal(bounded.exit, 1);
    assert.equal(bounded.output.length, 0);
    assert.ok(!JSON.stringify(bounded).includes(secret));
  }
  const timed = await run(
    "--health",
    {},
    { response: new Response(new ReadableStream({ start() {} })) },
  );
  assert.equal(timed.exit, 1);
  assert.equal(timed.output.length, 0);
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

test("maintenance composition retains the strict hosted grant fence and pre-grant admission split", () => {
  const base = fs.readFileSync("proposals/hosted-room-operations.sql", "utf8");
  const maintenance = fs.readFileSync(
    "proposals/hosted-room-maintenance.sql",
    "utf8",
  );
  const body = (sql: string, name: string) => {
    const start = sql.indexOf(`function kxra_private.${name}(`);
    assert.ok(start >= 0);
    return sql.slice(start, sql.indexOf("$$;", start) + 3);
  };
  const oldTarget = body(base, "team_worker_target");
  const newTarget = body(maintenance, "team_worker_target");
  // Cleanup selection retains the exact strict grant CASE, independent of funding.
  assert.equal(
    newTarget.slice(newTarget.indexOf("case when")),
    oldTarget.slice(oldTarget.indexOf("case when")),
  );
  assert.doesNotMatch(newTarget, /team_room_byok_allowed/);
  const newBase = body(maintenance, "team_job_base_context_active");
  assert.doesNotMatch(newBase, /team_worker_target/);
  assert.match(
    newBase,
    /team_room_byok_allowed\(j.room_id,agent.connection_id\)/,
  );
  assert.match(newTarget, /execution_mode',true\)='fixture'/);
  assert.match(
    newTarget,
    /hosted_room_jobs',true\) is distinct from 'on',false/,
  );
  assert.match(newTarget, /else session_user='kxra_app' and exists/);
  assert.doesNotMatch(newTarget, /is null then true/);
  const reducer = body(maintenance, "team_reduce_grant");
  assert.ok(
    reducer.indexOf("set_config('request.kxra.team_grant',g.id::text,true)") <
      reducer.indexOf("valid="),
  );
  assert.match(
    reducer,
    /valid=kxra_private.team_execution_grant_active\(g.id\) and kxra_private.team_job_base_context_active\(g.target_id\)\s+and kxra_private.team_worker_target\(g.target_id\);/,
  );
  // Full runtime context includes expiry/revocation/rollout/BYOK; admission
  // remains separate so fresh MFA can authorize a just-enqueued target atomically.
  assert.doesNotMatch(
    body(base, "team_job_base_context_active"),
    /team_worker_target/,
  );
  assert.match(
    body(base, "team_job_context_active"),
    /team_worker_target\(i\).*team_job_base_context_active\(i\)/,
  );
  const byok = body(maintenance, "team_room_byok_allowed");
  assert.match(byok, /revoked_at is null/);
  assert.match(byok, /expires_at>now\(\)/);
});

test("maintenance route budget accommodates bounded body, pool and SQL cleanup", () => {
  assert.match(
    fs.readFileSync(
      "apps/os/app/api/internal/room-jobs/maintenance/route.ts",
      "utf8",
    ),
    /maxDuration = 30/,
  );
  assert.match(
    fs.readFileSync("scripts/team-room-maintenance.ts", "utf8"),
    /AbortSignal.timeout\(35000\)/,
  );
  assert.match(
    fs.readFileSync("packages/workspace/room-maintenance.ts", "utf8"),
    /statement_timeout='5s'/,
  );
});

import type pg from "pg";
import {
  fixtureWorkerQuery,
  OperationsFixtureScope,
} from "./fixture-isolation";
const generatedOperationsEnvironment: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_ORIGIN: "http://127.0.0.1:3210",
  KXRA_RUNTIME: "/tmp/synthetic-operations-unit",
  KXRA_LOCAL_SECRET: "a".repeat(64),
};
test("fixture discovery uses transaction-local mode for success/failure and rejects hosted targets before connect", async () => {
  const calls: string[] = [];
  let fail = false;
  const db = {
    query: async (sql: string) => {
      calls.push(sql);
      if (fail && sql === "select synthetic_discovery")
        throw Error("synthetic");
      return { rows: [] };
    },
    release: () => calls.push("release"),
  };
  const pool = {
    connect: async () => {
      calls.push("connect");
      return db;
    },
  } as unknown as pg.Pool;
  const cfg = { host: "/tmp/synthetic-operations-socket" };
  await fixtureWorkerQuery(
    pool,
    cfg,
    "select synthetic_discovery",
    [],
    generatedOperationsEnvironment,
  );
  assert.deepEqual(calls, [
    "connect",
    "begin",
    "select set_config('request.kxra.execution_mode','fixture',true)",
    "select synthetic_discovery",
    "commit",
    "release",
  ]);
  calls.length = 0;
  fail = true;
  await assert.rejects(
    fixtureWorkerQuery(
      pool,
      cfg,
      "select synthetic_discovery",
      [],
      generatedOperationsEnvironment,
    ),
  );
  assert.deepEqual(calls.slice(-2), ["rollback", "release"]);
  calls.length = 0;
  await assert.rejects(
    fixtureWorkerQuery(pool, cfg, "select synthetic_discovery", [], {
      ...generatedOperationsEnvironment,
      VERCEL_ENV: "preview",
    }),
  );
  await assert.rejects(
    fixtureWorkerQuery(
      pool,
      { host: "remote.example" },
      "select synthetic_discovery",
      [],
      generatedOperationsEnvironment,
    ),
  );
  assert.equal(calls.length, 0);
});
test("test failure cleanup fences every mutation to registered rooms/tenants and revokes only added memberships", async () => {
  const room = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    tenant = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    actor = "20000000-0000-4000-8000-000000000001";
  const calls: { sql: string; values: unknown[] }[] = [];
  const db = {
    query: async (sql: string, values: unknown[] = []) => {
      calls.push({ sql, values });
      return {
        rows: sql.startsWith("select id,created_by")
          ? [{ id: room, created_by: actor }]
          : sql.startsWith("select (select count")
            ? [{ n: 0 }]
            : [],
      };
    },
    release: () => {},
  };
  const pool = { connect: async () => db } as unknown as pg.Pool;
  const scope = new OperationsFixtureScope(
    { host: "/tmp/synthetic-operations-socket" },
    generatedOperationsEnvironment,
  );
  scope.room(room);
  scope.tenant(tenant, actor);
  assert.throws(() =>
    scope.tenant("10000000-0000-4000-8000-000000000001", actor),
  );
  await assert.rejects(
    (async () => {
      try {
        throw Error("simulated failed test");
      } finally {
        await scope.cleanup(pool);
      }
    })(),
  );
  const mutations = calls.filter((call) => call.sql.startsWith("update"));
  assert.ok(mutations.length >= 5);
  for (const { sql, values } of mutations) {
    assert.match(
      sql,
      /where (?:room_id=\$1|org_id=\$1|job.room_id=\$1|id=\$1)/,
    );
    assert.equal(values[0], sql.includes("kxra.organisation") ? tenant : room);
    assert.doesNotMatch(sql, /delete|truncate/i);
  }
  const membership = mutations.find((call) =>
    call.sql.includes("organisation_memberships"),
  )!;
  assert.deepEqual(membership.values, [tenant, actor]);
  assert.match(membership.sql, /account_id=\$2/);
  const organisation = mutations.find((call) =>
    call.sql.startsWith("update kxra.organisations"),
  )!;
  assert.deepEqual(organisation.values, [tenant, "byok-" + tenant]);
  assert.match(organisation.sql, /organisation_kind='CUSTOMER' and slug=\$2/);
  const job = mutations.find((call) =>
    call.sql.startsWith("update kxra.team_jobs"),
  )!;
  assert.match(job.sql, /when state='DISPATCHED' then 'UNCERTAIN'/);
  assert.match(calls.at(-1)!.sql, /commit/);
  calls.length = 0;
  await scope.cleanup(pool);
  assert.equal(calls.length, 0);
});
test("native MFA fixture reaches issuance guard and discovery never bypasses local transaction helper", () => {
  const native = fs.readFileSync(
    "tests/operations/hosted-room-operations.test.ts",
    "utf8",
  );
  assert.doesNotMatch(native, /app.query\("select kxra_room_worker.next/);
  assert.match(
    native,
    /set_config\('request.kxra.execution_mode','fixture',true\)/,
  );
  assert.match(native, /assert.equal\(\s*reachedAuthorize,\s*true/);
  assert.match(
    native,
    /afterEach\(async \(\) => fixtureScope.cleanup\(admin\)\)/,
  );
  const maintenance = fs.readFileSync(
    "tests/operations/room-maintenance.test.ts",
    "utf8",
  );
  assert.ok(
    maintenance.indexOf("fixtureScope.tenant(tenant, actor)") <
      maintenance.indexOf("insert into kxra.organisations(id,name,slug)"),
  );
});
