import assert from "node:assert/strict";
import { test } from "node:test";
import { runtimePoolOptions } from "../packages/db/index";

test("Vercel runtime uses one bounded short-lived database client", () => {
  assert.deepEqual(runtimePoolOptions({ VERCEL: "1" }), {
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  });
});

test("persistent non-Vercel runtime retains the bounded local pool", () => {
  assert.deepEqual(runtimePoolOptions({}), {
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: false,
  });
});
