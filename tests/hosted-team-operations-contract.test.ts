import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";
import { z } from "zod";
import crypto from "node:crypto";

const require = createRequire(import.meta.url);
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function load(file: string, fixture: boolean, hosted: boolean) {
  let downstream = 0;
  const unexpected = () => {
    downstream++;
    throw Error("UNEXPECTED_DOWNSTREAM_WORK");
  };
  const module = {
    exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
  };
  const dependencies: Record<string, unknown> = {
    "../../../packages/db": {
      localMode: () => fixture,
      query: unexpected,
      scoped: unexpected,
    },
    "./auth": { HttpError },
    "./team-room": { teamRoom: async () => ({}) },
    "../../../packages/workspace/hosted-operations": {
      hostedRoomOperations: () => false,
    },
    "./team-workspace": {
      teamRunInput: z.object({ request_id: z.string().uuid() }),
      prepareTeamAgent: unexpected,
      executePreparedTeamAgent: unexpected,
    },
    "./team-catalog": {
      catalogAnchor: unexpected,
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
      process: { env: hosted ? { VERCEL_ENV: "production" } : {} },
      require: (name: string) =>
        name in dependencies ? dependencies[name] : require(name),
    },
  );
  return { api: module.exports, downstream: () => downstream };
}
for (const [fixture, hosted] of [
  [false, false],
  [false, true],
  [true, true],
]) {
  test(`unactivated hosted jobs/schedules reject before database or provider work: fixture=${fixture}, hosted=${hosted}`, async () => {
    for (const [file, methods] of [
      ["apps/os/lib/team-jobs.ts", ["enqueueTeamJob", "drainTeamJobs"]],
      [
        "apps/os/lib/team-schedules.ts",
        ["proposeTeamSchedule", "reviewTeamSchedule"],
      ],
    ] as const) {
      const loaded = load(file, fixture, hosted);
      for (const method of methods)
        await assert.rejects(
          loaded.api[method](
            {},
            "not-a-resource",
            method === "reviewTeamSchedule"
              ? {
                  schedule_id: crypto.randomUUID(),
                  version: 1,
                  action: "ACTIVATE",
                }
              : {},
          ),
          (error: unknown) =>
            error instanceof HttpError &&
            error.status === 503 &&
            error.message === "Hosted scheduled execution is not activated",
        );
      assert.equal(loaded.downstream(), 0);
    }
  });
}
