import test from "node:test";
import assert from "node:assert/strict";
import { createMarketingTiming } from "./support/marketing-phase-timing";

test("timing emits only fixed enums and bounded numbers, never action/error data", async () => {
  const lines: string[] = [];
  let tick = 100;
  const timed = createMarketingTiming({
    now: () => tick++,
    snapshot: () => ({
      rssMiB: 128,
      freeMiB: 2048,
      load1: 2.5,
      secret: "DO_NOT_EMIT",
    }),
    emit: (line) => lines.push(line),
  });
  assert.equal(
    await timed("HOME", async () => "PRIVATE_RESULT"),
    "PRIVATE_RESULT",
  );
  const sentinel = new Error("PRIVATE_ERROR_VALUE");
  await assert.rejects(
    timed(
      "CATALOG",
      async () => {
        throw sentinel;
      },
      9,
    ),
    (e) => e === sentinel,
  );
  assert.equal(lines.length, 4);
  for (const line of lines) {
    assert.equal(/PRIVATE|DO_NOT_EMIT|secret/.test(line), false);
    assert.deepEqual(Object.keys(JSON.parse(line)), [
      "kind",
      "phase",
      "state",
      "ordinal",
      "elapsedMs",
      "rssMiB",
      "freeMiB",
      "load1",
    ]);
  }
  assert.deepEqual(
    lines.map((line) => JSON.parse(line).state),
    ["BEGIN", "PASS", "BEGIN", "FAIL"],
  );
});

for (const failingPort of ["now", "snapshot", "emit"] as const) {
  test(`${failingPort} capture failure preserves successful and failed action results`, async () => {
    const timed = createMarketingTiming({
      now: () => 1,
      snapshot: () => ({ rssMiB: 1, freeMiB: 1, load1: 1 }),
      emit: () => {},
      [failingPort]: () => {
        throw new Error("CAPTURE_FAILURE");
      },
    });
    assert.equal(await timed("MENU", async () => 42), 42);
    const sentinel = new Error("ACTION_FAILURE");
    await assert.rejects(
      timed("MENU", async () => {
        throw sentinel;
      }),
      (e) => e === sentinel,
    );
  });
}

test("unknown phase and invalid ordinal reject before running the action", async () => {
  let actions = 0;
  const timed = createMarketingTiming({ emit: () => {} });
  const action = async () => {
    actions++;
  };
  await assert.rejects(
    timed("PRIVATE_URL" as "HOME", action),
    /INVALID_MARKETING_TIMING_PHASE/,
  );
  for (const ordinal of [-1, 10, NaN, Infinity, 0.5])
    await assert.rejects(
      timed("CATALOG", action, ordinal),
      /INVALID_MARKETING_TIMING_PHASE/,
    );
  assert.equal(actions, 0);
});

test("invalid resource readings produce nulls and output is capped without skipping actions", async () => {
  const lines: string[] = [];
  let actions = 0;
  const timed = createMarketingTiming({
    now: () => NaN,
    snapshot: () => ({ rssMiB: Infinity, freeMiB: -1, load1: 999999 }),
    emit: (line) => lines.push(line),
  });
  for (let i = 0; i < 40; i++)
    await timed("HOME", async () => {
      actions++;
    });
  assert.equal(actions, 40);
  assert.equal(lines.length, 60);
  for (const line of lines) {
    const data = JSON.parse(line);
    for (const key of ["elapsedMs", "rssMiB", "freeMiB", "load1"])
      assert.equal(data[key], null);
  }
});

test("exhausted capture cap still preserves the original failing action", async () => {
  const timed = createMarketingTiming({ emit: () => {} });
  for (let i = 0; i < 30; i++) await timed("HOME", async () => undefined);
  const sentinel = new Error("ACTION_AFTER_CAPTURE_CAP");
  await assert.rejects(
    timed("HOME", async () => {
      throw sentinel;
    }),
    (e) => e === sentinel,
  );
});

test("initial clock failure produces unknown elapsed time even when readings recover", async () => {
  const lines: string[] = [];
  let first = true;
  const timed = createMarketingTiming({
    now: () => {
      if (first) {
        first = false;
        throw new Error("CLOCK");
      }
      return 12345;
    },
    emit: (line) => lines.push(line),
  });
  await timed("HOME", async () => 1);
  assert.equal(lines.length, 2);
  for (const line of lines) assert.equal(JSON.parse(line).elapsedMs, null);
});
