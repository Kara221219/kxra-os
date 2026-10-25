import { freemem, loadavg } from "node:os";

const phases = [
  "HOME",
  "MENU",
  "DEMO",
  "INVOICES",
  "HIRING",
  "SALES",
  "OPERATIONS",
  "FAQ",
  "RESPONSIVE",
  "SCREENSHOT",
  "INTEGRATIONS",
  "CATALOG",
  "ERRORS",
] as const;
type Phase = (typeof phases)[number];
type Snapshot = { rssMiB: number; freeMiB: number; load1: number };
type Ports = {
  now: () => number;
  snapshot: () => Snapshot;
  emit: (line: string) => void;
};

// Fixed enum/numeric stdout only: no URL, page content, error text, environment,
// cookies, headers, identifiers or raw browser artifacts are captured.
export function createMarketingTiming(ports: Partial<Ports> = {}) {
  const now = ports.now ?? (() => performance.now());
  const snapshot =
    ports.snapshot ??
    (() => ({
      rssMiB: process.memoryUsage().rss / 1048576,
      freeMiB: freemem() / 1048576,
      load1: loadavg()[0] ?? 0,
    }));
  const emit = ports.emit ?? ((line: string) => console.info(line));
  let started: number | undefined;
  try {
    started = now();
  } catch {
    /* Optional capture must not fail a test. */
  }
  let records = 0;
  function record(
    phase: Phase,
    state: "BEGIN" | "PASS" | "FAIL",
    ordinal: number,
  ) {
    if (records >= 60) return;
    records++;
    try {
      const raw = snapshot();
      const numeric = (n: number, max: number) =>
        Number.isFinite(n) && n >= 0 && n <= max
          ? Math.round(n * 100) / 100
          : null;
      const line = JSON.stringify({
        kind: "MARKETING_PHASE_TIMING_V1",
        phase,
        state,
        ordinal,
        elapsedMs:
          started === undefined ? null : numeric(now() - started, 120000),
        rssMiB: numeric(raw.rssMiB, 1048576),
        freeMiB: numeric(raw.freeMiB, 1048576),
        load1: numeric(raw.load1, 4096),
      });
      emit(line);
    } catch {
      /* Capture failure never replaces the action result or exception. */
    }
  }
  return async function timed<T>(
    phase: Phase,
    action: () => Promise<T>,
    ordinal = 0,
  ): Promise<T> {
    if (
      !phases.includes(phase) ||
      !Number.isInteger(ordinal) ||
      ordinal < 0 ||
      ordinal > 9
    )
      throw new Error("INVALID_MARKETING_TIMING_PHASE");
    record(phase, "BEGIN", ordinal);
    try {
      const value = await action();
      record(phase, "PASS", ordinal);
      return value;
    } catch (error) {
      record(phase, "FAIL", ordinal);
      throw error;
    }
  };
}
