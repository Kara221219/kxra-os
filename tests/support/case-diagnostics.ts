import os from "node:os";
import type { Page, TestInfo } from "@playwright/test";
import {
  createSafeDiagnostics,
  type SafeDiagnosticEvent,
  type SafeFailureKind,
} from "./safe-ci-diagnostics";
import { testOrigin } from "./runtime";
import { diagnosticHealth } from "./diagnostic-health";
import {
  syntheticCaseReviewNote,
  type CaseProposalScope,
} from "./case-proposal";

export function resourceSnapshot(elapsedMs: number): SafeDiagnosticEvent {
  const memory = process.memoryUsage(),
    cpu = process.resourceUsage();
  return {
    phase: "RESOURCE_SNAPSHOT",
    elapsedMs,
    rssMiB: memory.rss / 1048576,
    heapMiB: memory.heapUsed / 1048576,
    load1: os.loadavg()[0],
    cpuUserMs: cpu.userCPUTime / 1000,
    cpuSystemMs: cpu.systemCPUTime / 1000,
    freeMiB: os.freemem() / 1048576,
    totalMiB: os.totalmem() / 1048576,
    cpuCount: os.cpus().length,
  };
}

type DiagnosticDependencies = {
  health: typeof diagnosticHealth;
  createWriter: typeof createSafeDiagnostics;
};
const captureRejected = () =>
  console.error("SAFE_DIAGNOSTICS_CAPTURE_REJECTED");

export async function beginCaseDiagnostics(
  info: TestInfo,
  overrides: Partial<DiagnosticDependencies> = {},
) {
  if (process.env.KXRA_SAFE_DIAGNOSTICS_ENABLED !== "true") return null;
  try {
    return await createCaseDiagnostics(info, {
      health: diagnosticHealth,
      createWriter: createSafeDiagnostics,
      ...overrides,
    });
  } catch {
    // Capture stays closed. Its availability must not replace the test result.
    captureRejected();
    return null;
  }
}

async function createCaseDiagnostics(
  info: TestInfo,
  dependencies: DiagnosticDependencies,
) {
  const health = await dependencies.health(process.env);
  const caseIndex = info.title.startsWith("remodeling scope")
    ? 0
    : info.title.startsWith("private recruiting")
      ? 1
      : info.title.startsWith("travel validates")
        ? 2
        : -1;
  const viewport =
    info.project.name === "desktop"
      ? "DESKTOP"
      : info.project.name === "mobile"
        ? "MOBILE"
        : null;
  if (caseIndex < 0 || !viewport) throw Error("SAFE_CASE_DIAGNOSTICS_GUARD");
  const writer = dependencies.createWriter({
    root: process.cwd(),
    environment: process.env,
    health,
    metadata: {
      sourceSha: process.env.GITHUB_SHA || "",
      githubRunId: process.env.GITHUB_RUN_ID || "",
      githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT || "",
    },
    suite: "CASES",
    viewport,
    ordinal: caseIndex + info.repeatEachIndex * 3,
  });
  const started = performance.now();
  let rejected = false,
    closed = false,
    operation = 0;
  let last:
    { scope: CaseProposalScope; cookie: string; title: string } | undefined;
  let failureKind: SafeFailureKind = "UNKNOWN";
  const elapsed = () => Math.round(performance.now() - started);
  const record = (event: SafeDiagnosticEvent) => {
    if (closed || rejected) return;
    try {
      writer.record(event);
    } catch {
      rejected = true;
    }
  };
  record({
    phase: "FIXTURE_READY",
    elapsedMs: elapsed(),
    healthy: true,
    fresh: true,
  });
  record(resourceSnapshot(elapsed()));
  async function sample(page: Page) {
    if (!last || closed) return;
    const context = last;
    const card = page.getByRole("article", {
      name: context.title,
      exact: true,
    });
    try {
      const matchingCards = await card.count();
      if (matchingCards === 1) {
        const state = await card.evaluate(
          (element, expected) => {
            const select = element.querySelector<HTMLSelectElement>(
              'select[name="target_stage"]',
            );
            const form = select?.closest("form"),
              details = select?.closest("details");
            const button = form?.querySelector<HTMLButtonElement>(
              'button[type="submit"]',
            );
            const note = form?.querySelector<HTMLTextAreaElement>(
              'textarea[name="note"]',
            );
            const box = button?.getBoundingClientRect();
            return {
              busy: button?.textContent === "Working…",
              buttonEnabled:
                !!button &&
                !button.disabled &&
                !button.closest("fieldset[disabled]"),
              detailsOpen: !!details?.open,
              targetValid: select?.value === expected.target,
              noteValid: note?.value === expected.note,
              inViewport:
                !!box &&
                box.width > 0 &&
                box.height > 0 &&
                box.bottom > 0 &&
                box.right > 0 &&
                box.top < innerHeight &&
                box.left < innerWidth,
            };
          },
          { target: context.scope.target, note: syntheticCaseReviewNote },
          { timeout: 500 },
        );
        record({
          phase: "UI_STATE",
          elapsedMs: elapsed(),
          ...state,
          matchingCards,
          reviewVisible: await page
            .getByRole("article", {
              name: "Review " + context.title,
              exact: true,
            })
            .first()
            .isVisible(),
          emptyVisible: false,
        });
      }
      const read = async (collection: "records" | "actions") => {
        const url = new URL(
          `/api/team-space/${context.scope.room}/${context.scope.prefix}-${collection}`,
          testOrigin,
        );
        const r = await fetch(url, {
          redirect: "error",
          signal: AbortSignal.timeout(1000),
          headers: { cookie: context.cookie, origin: testOrigin },
        });
        if (!r.ok) throw Error("SAFE_CASE_CANONICAL_UNAVAILABLE");
        return r.json();
      };
      const [records, actions] = await Promise.all([
        read("records"),
        read("actions"),
      ]);
      const source = records.records.find(
        (r: { id: string }) => r.id === context.scope.sourceId,
      );
      record({
        phase: "CANONICAL_STATE",
        elapsedMs: elapsed(),
        records: records.records.length,
        actions: actions.actions.length,
        matchingActions: actions.actions.filter(
          (a: {
            source_id: string;
            source_version: number;
            target_stage: string;
          }) =>
            a.source_id === context.scope.sourceId &&
            a.source_version === context.scope.sourceVersion &&
            a.target_stage === context.scope.target,
        ).length,
        expectedVersion: source?.version === context.scope.sourceVersion,
        expectedStage: source?.stage === context.scope.target,
      });
    } catch {
      /* No raw errors, content or fallback capture. Original test result is authoritative. */
    }
  }
  return {
    elapsed,
    record,
    context(scope: CaseProposalScope, cookie: string, title: string) {
      last = { scope, cookie, title };
      return operation++;
    },
    failure(kind: SafeFailureKind) {
      failureKind = kind;
    },
    async sample(page: Page) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          sample(page),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 1500);
          }),
        ]);
      } catch {
        captureRejected();
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    finish(passed: boolean) {
      try {
        record(resourceSnapshot(elapsed()));
        closed = true;
        if (rejected) throw Error("SAFE_CASE_DIAGNOSTICS_REJECTED");
        writer.finish(
          passed ? "PASSED" : "FAILED",
          passed ? "NONE" : failureKind,
        );
      } catch {
        captureRejected();
      } finally {
        closed = true;
      }
    },
  };
}
