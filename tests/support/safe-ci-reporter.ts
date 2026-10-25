import path from "node:path";
import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { createSafeDiagnostics } from "./safe-ci-diagnostics";
import { resourceSnapshot } from "./case-diagnostics";
import { diagnosticHealth } from "./diagnostic-health";

export function safeTestIdentity(file: string, project: string, line: number) {
  const basename = path.basename(file);
  const suite =
    basename === "cases.spec.ts"
      ? "CASES"
      : basename === "team-knowledge.spec.ts"
        ? "KNOWLEDGE"
        : basename === "team-workspace.spec.ts"
          ? "WORKSPACE"
          : "OTHER";
  const viewport =
    project === "desktop" ? "DESKTOP" : project === "mobile" ? "MOBILE" : null;
  if (!viewport || !Number.isSafeInteger(line) || line < 0 || line > 100000)
    throw Error("SAFE_REPORTER_IDENTITY_REJECTED");
  return { suite, viewport, sourceLine: line } as const;
}

export default class SafeCIReporter implements Reporter {
  private pending: Promise<void>[] = [];
  private ordinal = 48;
  onTestEnd(test: TestCase, result: TestResult) {
    if (
      process.env.KXRA_SAFE_DIAGNOSTICS_ENABLED !== "true" ||
      result.status === test.expectedStatus
    )
      return;
    const ordinal = this.ordinal++;
    if (ordinal > 63) {
      console.error("SAFE_DIAGNOSTICS_CAPTURE_REJECTED");
      return;
    }
    this.pending.push(
      this.capture(test, result, ordinal).catch(() => {
        // Fixed warning only. Never dump reporter objects, errors or raw artifacts.
        console.error("SAFE_DIAGNOSTICS_CAPTURE_REJECTED");
      }),
    );
  }
  private async capture(test: TestCase, result: TestResult, ordinal: number) {
    const identity = safeTestIdentity(
      test.location.file,
      test.parent.project()?.name || "",
      test.location.line,
    );
    const health = await diagnosticHealth(process.env);
    const writer = createSafeDiagnostics({
      root: process.cwd(),
      environment: process.env,
      health,
      metadata: {
        sourceSha: process.env.GITHUB_SHA || "",
        githubRunId: process.env.GITHUB_RUN_ID || "",
        githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || "",
      },
      suite: identity.suite,
      viewport: identity.viewport,
      ordinal,
    });
    const outcome =
      result.status === "timedOut"
        ? "TIMED_OUT"
        : result.status === "interrupted"
          ? "INTERRUPTED"
          : result.status === "skipped"
            ? "SKIPPED"
            : result.status === "passed"
              ? "PASSED"
              : "FAILED";
    const elapsedMs = Math.round(result.duration);
    writer.record({
      phase: "TEST_RESULT",
      elapsedMs,
      outcome,
      sourceLine: identity.sourceLine,
      expectedFailure: test.expectedStatus === "failed",
    });
    writer.record(resourceSnapshot(elapsedMs));
    writer.finish("FAILED", "UNKNOWN");
  }
  async onEnd() {
    await Promise.all(this.pending);
  }
}
