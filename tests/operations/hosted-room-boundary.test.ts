import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";
import { z } from "zod";
const require = createRequire(import.meta.url);
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function load(file: string, enabled = false) {
  const operations: string[] = [];
  const module = {
    exports: {} as Record<string, (...args: any[]) => Promise<any>>,
  };
  const deps: Record<string, unknown> = {
    "../../../packages/db": {
      localMode: () => false,
      query: async () => [],
      scoped: async (_a: unknown, work: any) =>
        work({
          query: async (sql: string) => {
            operations.push(sql);
            return { rows: [] };
          },
        }),
    },
    "../../../packages/workspace/hosted-operations": {
      hostedRoomOperations: () => enabled,
    },
    "./auth": { HttpError },
    "./team-room": { teamRoom: async () => ({}) },
    "./team-workspace": {
      teamRunInput: z.object({ request_id: z.string().uuid() }),
      prepareTeamAgent: () => {
        throw Error("provider work");
      },
    },
    "./team-catalog": {
      catalogAnchor: async () => null,
      jobBand: "0",
      scheduleBand: "0",
    },
  };
  vm.runInNewContext(
    transformSync(fs.readFileSync(file, "utf8"), {
      loader: "ts",
      format: "cjs",
    }).code,
    {
      module,
      exports: module.exports,
      process: { env: { VERCEL_ENV: "production" } },
      require: (name: string) => (name in deps ? deps[name] : require(name)),
    },
  );
  return { api: module.exports, operations };
}
test("disabled hosted admission and drain reject; authorized pause and revoke reach existing SQL", async () => {
  const jobs = load("apps/os/lib/team-jobs.ts"),
    schedules = load("apps/os/lib/team-schedules.ts");
  for (const method of ["enqueueTeamJob", "drainTeamJobs"])
    await assert.rejects(
      jobs.api[method]({}, {}),
      (e: unknown) => e instanceof HttpError && e.status === 503,
    );
  await assert.rejects(
    schedules.api.proposeTeamSchedule({}, "room", {}),
    (e: unknown) => e instanceof HttpError && e.status === 503,
  );
  const value = { schedule_id: crypto.randomUUID(), version: 1 };
  await assert.rejects(
    schedules.api.reviewTeamSchedule({}, "room", {
      ...value,
      action: "ACTIVATE",
    }),
    (e: unknown) => e instanceof HttpError && e.status === 503,
  );
  for (const action of ["PAUSE", "REVOKE"])
    await schedules.api.reviewTeamSchedule({}, "room", { ...value, action });
  assert.equal(schedules.operations.length, 2);
  assert.ok(
    schedules.operations.every((sql) => sql.includes("team_schedule_review")),
  );
  assert.equal(jobs.operations.length, 0);
  const hostedJobs = load("apps/os/lib/team-jobs.ts", true);
  await assert.rejects(
    hostedJobs.api.drainTeamJobs({}, { request_id: crypto.randomUUID() }),
    (e: unknown) => e instanceof HttpError && e.status === 503,
  );
  assert.equal(hostedJobs.operations.length, 0);
  const ui = fs.readFileSync("apps/os/components/RoomJobs.tsx", "utf8");
  assert.ok(
    ui.includes(
      '{local && canWrite && (\n        <ActionForm\n          path="/jobs/drain"',
    ),
  );
  const enabled = load("apps/os/lib/team-schedules.ts", true);
  await enabled.api.reviewTeamSchedule({}, "room", {
    ...value,
    action: "PAUSE",
  });
  assert.ok(enabled.operations[0].includes("team_execution_revoke"));
  assert.ok(enabled.operations[1].includes("team_schedule_review"));
});

test("private wakeups reject missing authority and caller-selected scope before any delivery", async () => {
  let authorized = false,
    delivered = 0;
  const module = {
    exports: {} as { POST: (req: Request) => Promise<Response> },
  };
  vm.runInNewContext(
    transformSync(
      fs.readFileSync(
        "apps/os/app/api/internal/room-jobs/drain/route.ts",
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
      require: (name: string) =>
        name.endsWith("/room-worker-auth")
          ? { roomWorkerAuthorized: () => authorized }
          : {
              runHostedRoomDelivery: async () => {
                delivered++;
                return { processed: false };
              },
            },
    },
  );
  const call = (body: unknown) =>
    module.exports.POST(
      new Request("https://example.test/api/internal/room-jobs/drain", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    );
  assert.equal((await call({ request_id: crypto.randomUUID() })).status, 404);
  authorized = true;
  for (const extra of [
    { actor_id: crypto.randomUUID() },
    { organisation_id: crypto.randomUUID() },
    { room_id: crypto.randomUUID() },
    { grant_id: crypto.randomUUID() },
  ])
    assert.equal(
      (await call({ request_id: crypto.randomUUID(), ...extra })).status,
      400,
    );
  assert.equal((await call({ request_id: "x".repeat(500) })).status, 400);
  assert.equal(delivered, 0);
  const response = await call({ request_id: crypto.randomUUID() });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(delivered, 1);
});

test("hosted delivery resolves identity only from the stored scope and bounds discovery in a transaction", async () => {
  const calls: string[] = [],
    resolvedActor = {
      id: crypto.randomUUID(),
      organisation_id: crypto.randomUUID(),
      room_worker_grant: crypto.randomUUID(),
    };
  const room = crypto.randomUUID(),
    request = crypto.randomUUID();
  let next: unknown = { actor: resolvedActor, room_id: room },
    fail = false;
  const module = {
    exports: {} as {
      runHostedRoomDelivery: (value: unknown) => Promise<unknown>;
    },
  };
  const db = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes("kxra_room_worker.next")) {
        if (fail) throw Error("fixture failure");
        return { rows: [{ scope: next }] };
      }
      return { rows: [] };
    },
    release: () => {
      calls.push("release");
    },
  };
  vm.runInNewContext(
    transformSync(
      fs.readFileSync("apps/os/lib/team-hosted-worker.ts", "utf8"),
      { loader: "ts", format: "cjs" },
    ).code,
    {
      module,
      exports: module.exports,
      require: (name: string) => {
        if (name === "zod") return { z };
        if (name.endsWith("/db"))
          return {
            localMode: () => false,
            getPool: () => ({ connect: async () => db }),
          };
        if (name.endsWith("/hosted-operations"))
          return { hostedRoomOperations: () => true };
        if (name === "./team-jobs")
          return {
            drainTeamJobs: async (
              actor: unknown,
              input: { request_id: string; room_id: string },
            ) => {
              assert.equal(actor, resolvedActor);
              assert.equal(input.request_id, request);
              assert.equal(input.room_id, room);
              calls.push("drain");
              return { processed: true, job: { state: "SUCCEEDED" } };
            },
          };
        throw Error("Unexpected import");
      },
    },
  );
  await assert.rejects(
    module.exports.runHostedRoomDelivery({
      request_id: request,
      actor_id: crypto.randomUUID(),
    }),
  );
  assert.equal(calls.length, 0);
  await module.exports.runHostedRoomDelivery({ request_id: request });
  assert.equal(calls[0], "begin");
  assert.ok(calls[1].includes("statement_timeout"));
  assert.equal(calls.at(-3), "commit");
  assert.equal(calls.at(-2), "release");
  assert.equal(calls.at(-1), "drain");
  calls.length = 0;
  next = null;
  await module.exports.runHostedRoomDelivery({ request_id: request });
  assert.ok(!calls.includes("drain"));
  calls.length = 0;
  fail = true;
  await assert.rejects(
    module.exports.runHostedRoomDelivery({ request_id: request }),
  );
  assert.equal(calls.at(-2), "rollback");
  assert.equal(calls.at(-1), "release");
  assert.ok(!calls.includes("drain"));
});
