import test from "node:test";
import assert from "node:assert/strict";
import type { TestInfo } from "@playwright/test";
import { beginCaseDiagnostics } from "./support/case-diagnostics";
import type { createSafeDiagnostics } from "./support/safe-ci-diagnostics";

const info = {
  title: "remodeling scope synthetic",
  project: { name: "desktop" },
  repeatEachIndex: 0,
} as TestInfo;
const health = async () => ({
  service: "kxra-os" as const,
  run_id: "synthetic",
});
async function enabled(run: (warnings: unknown[][]) => Promise<void>) {
  const previous = process.env.KXRA_SAFE_DIAGNOSTICS_ENABLED;
  process.env.KXRA_SAFE_DIAGNOSTICS_ENABLED = "true";
  const warnings: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => warnings.push(args);
  try {
    await run(warnings);
  } finally {
    console.error = original;
    if (previous === undefined)
      delete process.env.KXRA_SAFE_DIAGNOSTICS_ENABLED;
    else process.env.KXRA_SAFE_DIAGNOSTICS_ENABLED = previous;
  }
}
const fixedWarnings = (warnings: unknown[][]) => {
  assert.deepEqual(warnings, [["SAFE_DIAGNOSTICS_CAPTURE_REJECTED"]]);
  assert.equal(JSON.stringify(warnings).includes("POISON_PRIVATE"), false);
};

test("health rejection disables capture without failing a passing test body or creating a writer", async () => {
  await enabled(async (warnings) => {
    let writes = 0;
    const capture = await beginCaseDiagnostics(info, {
      health: async () => {
        throw Error("POISON_PRIVATE_HEALTH_TIMEOUT");
      },
      createWriter: () => {
        writes++;
        throw Error("Must not create a writer");
      },
    });
    assert.equal(capture, null);
    assert.equal(writes, 0);
    let originalAssertionRan = false;
    originalAssertionRan = true;
    assert.equal(originalAssertionRan, true);
    fixedWarnings(warnings);
  });
});

test("capture initialization rejection preserves the original test exception", async () => {
  await enabled(async (warnings) => {
    const originalFailure = Error("Original substantive assertion");
    await assert.rejects(
      async () => {
        const capture = await beginCaseDiagnostics(info, {
          health,
          createWriter: () => {
            throw Error("POISON_PRIVATE_FILESYSTEM");
          },
        });
        assert.equal(capture, null);
        throw originalFailure;
      },
      (error) => error === originalFailure,
    );
    fixedWarnings(warnings);
  });
});

test("rejected record cannot persist evidence or replace a passing test result", async () => {
  await enabled(async (warnings) => {
    let commits = 0;
    const capture = await beginCaseDiagnostics(info, {
      health,
      createWriter: (() => ({
        record() {
          throw Error("POISON_PRIVATE_REJECTED_RECORD");
        },
        finish() {
          commits++;
          return "synthetic-test-only";
        },
      })) as typeof createSafeDiagnostics,
    });
    assert.ok(capture);
    assert.doesNotThrow(() => capture.finish(true));
    assert.equal(commits, 0);
    fixedWarnings(warnings);
  });
});

test("failed evidence persistence leaves both passing and failing outcomes authoritative", async () => {
  for (const passed of [true, false]) {
    await enabled(async (warnings) => {
      const outcomes: unknown[] = [];
      const capture = await beginCaseDiagnostics(info, {
        health,
        createWriter: (() => ({
          record() {},
          finish(outcome: unknown, kind: unknown) {
            outcomes.push([outcome, kind]);
            throw Error("POISON_PRIVATE_PERSISTENCE");
          },
        })) as typeof createSafeDiagnostics,
      });
      assert.ok(capture);
      assert.doesNotThrow(() => capture.finish(passed));
      assert.deepEqual(outcomes, [
        passed ? ["PASSED", "NONE"] : ["FAILED", "UNKNOWN"],
      ]);
      fixedWarnings(warnings);
    });
  }
});
