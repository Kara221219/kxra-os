import { openSafeDiagnostics } from "../../scripts/safe-ci-diagnostics-core.mjs";

export type SafeDiagnosticMetadata = {
  sourceSha: string;
  githubRunId: string;
  githubRunAttempt: string;
};
export type SafeOperation =
  | "CASE_PROPOSE"
  | "CASE_REVIEW"
  | "CASE_EXECUTE"
  | "DETACH"
  | "WORKSPACE_REFRESH";
export type SafeDiagnosticEvent =
  | {
      phase: "ACTION_BEGIN" | "ACTION_COMPLETE";
      elapsedMs: number;
      operation: SafeOperation;
      ordinal: number;
    }
  | {
      phase: "REQUEST_OBSERVED";
      elapsedMs: number;
      operation: SafeOperation;
      ordinal: number;
      matchesExpected: boolean;
    }
  | {
      phase: "RESPONSE_OBSERVED";
      elapsedMs: number;
      operation: SafeOperation;
      ordinal: number;
      status: number;
    }
  | { phase: "FIXTURE_READY"; elapsedMs: number; healthy: true; fresh: true }
  | {
      phase: "UI_STATE";
      elapsedMs: number;
      busy: boolean;
      buttonEnabled: boolean;
      reviewVisible: boolean;
      emptyVisible: boolean;
      matchingCards: number;
      detailsOpen: boolean;
      targetValid: boolean;
      noteValid: boolean;
      inViewport: boolean;
    }
  | {
      phase: "CANONICAL_STATE";
      elapsedMs: number;
      records: number;
      actions: number;
      matchingActions: number;
      expectedVersion: boolean;
      expectedStage: boolean;
    }
  | {
      phase: "RESOURCE_SNAPSHOT";
      elapsedMs: number;
      rssMiB: number;
      heapMiB: number;
      load1: number;
      cpuUserMs: number;
      cpuSystemMs: number;
      freeMiB: number;
      totalMiB: number;
      cpuCount: number;
    }
  | {
      phase: "TEST_RESULT";
      elapsedMs: number;
      outcome: "PASSED" | "FAILED" | "TIMED_OUT" | "INTERRUPTED" | "SKIPPED";
      sourceLine: number;
      expectedFailure: boolean;
    };
export type SafeFailureKind =
  | "NONE"
  | "ASSERTION"
  | "ACTION_TIMEOUT"
  | "REQUEST_TIMEOUT"
  | "RESPONSE_TIMEOUT"
  | "HARNESS_GUARD"
  | "UNKNOWN";
export type SafeDiagnosticOptions = {
  root: string;
  environment: NodeJS.ProcessEnv;
  health: { service: "kxra-os"; run_id: string };
  metadata: SafeDiagnosticMetadata;
  suite: "CASES" | "KNOWLEDGE" | "WORKSPACE" | "OTHER";
  viewport: "DESKTOP" | "MOBILE";
  ordinal: number;
};
export function createSafeDiagnostics(options: SafeDiagnosticOptions) {
  const writer = openSafeDiagnostics(options);
  return {
    record(event: SafeDiagnosticEvent) {
      writer.record(event);
    },
    finish(
      outcome: "PASSED" | "FAILED" | "INTERRUPTED",
      failureKind: SafeFailureKind = outcome === "PASSED" ? "NONE" : "UNKNOWN",
    ) {
      return writer.finish(outcome, failureKind);
    },
  };
}
