import { z } from "zod";
import { billingHttpSummary } from "./billing-http-controller";
import { assessBillingRefreshCapacity } from "./billing-refresh-capacity";
import { assessBillingReadAllowance } from "./billing-read-allowance";

export const refreshScheduleSchema = z
  .object({
    maximum_due_workspaces: z.number().int().min(1).max(16),
    concurrency: z.number().int().min(1).max(16),
    poll_interval_ms: z.number().int().min(100).max(60_000),
    scheduler_jitter_ms: z.number().int().min(0).max(60_000),
    proof_ttl_seconds: z.number().int().min(1).max(300),
    provider_reads_per_second: z.number().int().min(1).max(16),
    maximum_provider_reads: z.number().int().min(32).max(1_000_000),
    maximum_invocations: z.number().int().min(1).max(1_000_000),
    duration_ms: z.number().int().min(1_000).max(3_600_000),
    reviewed_monthly_read_allocation: z
      .number()
      .int()
      .min(1)
      .max(1_000_000_000),
    other_monthly_read_reserve: z.number().int().min(0).max(1_000_000_000),
    read_allowance_review_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type RefreshSchedule = z.infer<typeof refreshScheduleSchema>;

function assertReadAllowance(plan: RefreshSchedule) {
  const result = assessBillingReadAllowance({
    workspaces: plan.maximum_due_workspaces,
    proof_ttl_seconds: plan.proof_ttl_seconds,
    reviewed_monthly_read_allocation: plan.reviewed_monthly_read_allocation,
    other_monthly_read_reserve: plan.other_monthly_read_reserve,
    maximum_provider_reads: plan.maximum_provider_reads,
    duration_ms: plan.duration_ms,
  });
  if (result.state !== "WITHIN_REVIEWED_ALLOWANCE")
    throw Error("BILLING_REFRESH_READ_ALLOWANCE_INSUFFICIENT");
}

/** No settings are enumerated or read before the separate default-off gate. */
export function billingRefreshSchedulerConfiguration(
  source: Record<string, string | undefined>,
) {
  if (source.KXRA_BILLING_REFRESH_SCHEDULER_ENABLED !== "true") return null;
  try {
    const plan = refreshScheduleSchema.parse(
      JSON.parse(source.KXRA_BILLING_REFRESH_SCHEDULE ?? ""),
    );
    const capacity = assessBillingRefreshCapacity({
      maximum_due_workspaces: plan.maximum_due_workspaces,
      parallel_invocations: plan.concurrency,
      schedule_interval_ms: plan.poll_interval_ms,
      scheduler_jitter_ms: plan.scheduler_jitter_ms,
      proof_ttl_seconds: plan.proof_ttl_seconds,
    });
    if (capacity.state !== "PROJECTED_HEADROOM") throw Error();
    assertReadAllowance(plan);
    if (
      source.KXRA_BILLING_HTTP_ENABLED !== "true" ||
      source.KXRA_PAID_PROOF_REFRESH_ENABLED !== "true"
    )
      throw Error();
    return plan;
  } catch {
    throw Error("BILLING_REFRESH_SCHEDULE_INVALID");
  }
}

export function schedulerWait(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(Error("BILLING_SCHEDULER_ABORTED"));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(Error("BILLING_SCHEDULER_ABORTED"));
    };
    const timer = setTimeout(
      () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      },
      Math.max(0, milliseconds),
    );
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** One process-wide, paced GET-only provider budget. The existing per-invocation
 * destination/key/version/body/deadline policies still run BEFORE this adapter.
 * A queued read keeps its original abort signal; it can never execute later
 * after its job deadline. No retry, redirect, POST or raw-error output. */
export function pacedBillingReads(
  plan: Pick<
    RefreshSchedule,
    "provider_reads_per_second" | "maximum_provider_reads"
  >,
  ports: {
    fetch: typeof fetch;
    now?: () => number;
    wait?: typeof schedulerWait;
    exhausted?: () => void;
    /** Mandatory in the packaged runtime: atomic existing-worker database budget. */
    authorizeRead?: () => Promise<boolean>;
  },
) {
  if (
    !Number.isInteger(plan.provider_reads_per_second) ||
    plan.provider_reads_per_second < 1 ||
    plan.provider_reads_per_second > 16 ||
    !Number.isInteger(plan.maximum_provider_reads) ||
    plan.maximum_provider_reads < 1 ||
    plan.maximum_provider_reads > 1_000_000
  )
    throw Error("BILLING_SCHEDULER_READ_BUDGET_INVALID");
  const now = ports.now ?? Date.now,
    wait = ports.wait ?? schedulerWait;
  let nextStart = now(),
    reserved = 0,
    started = 0;
  let admission = Promise.resolve();
  const fetcher: typeof fetch = async (input, init = {}) => {
    if (
      typeof input !== "string" ||
      (init.method ?? "GET") !== "GET" ||
      init.body
    )
      throw Error("BILLING_SCHEDULER_READ_SCOPE");
    const url = new URL(input);
    if (
      url.origin !== "https://api.stripe.com" ||
      url.username ||
      url.password ||
      url.hash
    )
      throw Error("BILLING_SCHEDULER_READ_SCOPE");
    if (init.signal?.aborted) throw Error("BILLING_SCHEDULER_ABORTED");
    if (reserved >= plan.maximum_provider_reads) {
      ports.exhausted?.();
      throw Error("BILLING_SCHEDULER_READ_BUDGET");
    }
    reserved++;
    // Serialize START admission, not response completion. Base the next slot on
    // actual time after waiting so an event-loop stall cannot release a burst.
    const preceding = admission;
    let release!: () => void;
    admission = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await preceding;
      await wait(Math.max(0, nextStart - now()), init.signal ?? undefined);
      if (init.signal?.aborted) throw Error("BILLING_SCHEDULER_ABORTED");
      if (ports.authorizeRead && !(await ports.authorizeRead())) {
        ports.exhausted?.();
        throw Error("BILLING_SCHEDULER_DURABLE_READ_BUDGET");
      }
      if (init.signal?.aborted) throw Error("BILLING_SCHEDULER_ABORTED");
      nextStart = now() + Math.ceil(1000 / plan.provider_reads_per_second);
      started++;
    } finally {
      release();
    }
    return ports.fetch(input, { ...init, redirect: "error" });
  };
  return { fetch: fetcher, counts: () => ({ reserved, started }) };
}

export type RefreshSchedulerSummary = {
  state: "STOPPED" | "DURATION_LIMIT" | "INVOCATION_LIMIT" | "READ_LIMIT";
  invocations: number;
  empty_probes: number;
  eligible: number;
  denied: number;
  unverified: number;
  unavailable: number;
  circuit_pauses: number;
  maximum_active: number;
  overrun_ticks: number;
  entitlement_authority: false;
};

/** Bounded scheduler owner: starts one cheap probe per poll, expands ONLY after
 * canonical DB discovery actually claims work, and drains existing55s jobs on
 * shutdown. Cross-process/tenant admission remains in durable SQL leases/CAS.
 * An operational failure pauses NEW work for2min; existing jobs finish normally.
 * Payment DENIED is a valid authoritative result, not a retry/circuit failure.
 */
export async function runBillingRefreshScheduler(
  input: unknown,
  ports: {
    invoke: (onClaimCount: (count: number) => void) => Promise<unknown>;
    now?: () => number;
    wait?: typeof schedulerWait;
    signal?: AbortSignal;
    readBudgetExhausted?: () => boolean;
    progress?: (summary: Readonly<RefreshSchedulerSummary>) => void;
  },
) {
  const plan = refreshScheduleSchema.parse(input),
    clock = ports.now ?? Date.now,
    wait = ports.wait ?? schedulerWait,
    start = clock(),
    deadline = start + plan.duration_ms;
  // Validate the same conservative capacity even for injected/local callers.
  const capacity = assessBillingRefreshCapacity({
    maximum_due_workspaces: plan.maximum_due_workspaces,
    parallel_invocations: plan.concurrency,
    schedule_interval_ms: plan.poll_interval_ms,
    scheduler_jitter_ms: plan.scheduler_jitter_ms,
    proof_ttl_seconds: plan.proof_ttl_seconds,
  });
  assertReadAllowance(plan);
  if (capacity.state !== "PROJECTED_HEADROOM")
    throw Error("BILLING_REFRESH_SCHEDULE_INVALID");
  const summary: RefreshSchedulerSummary = {
    state: "STOPPED",
    invocations: 0,
    empty_probes: 0,
    eligible: 0,
    denied: 0,
    unverified: 0,
    unavailable: 0,
    circuit_pauses: 0,
    maximum_active: 0,
    overrun_ticks: 0,
    entitlement_authority: false,
  };
  const active = new Set<Promise<void>>();
  let pausedUntil = 0,
    nextProbe = start,
    nextProgress = start + 10_000;
  const canAdmit = () =>
    !ports.signal?.aborted &&
    clock() < deadline &&
    clock() >= pausedUntil &&
    summary.invocations < plan.maximum_invocations &&
    !ports.readBudgetExhausted?.();
  const pause = () => {
    if (clock() >= pausedUntil) summary.circuit_pauses++;
    pausedUntil = Math.max(pausedUntil, clock() + 120_000);
  };
  const publish = () => {
    // Observability cannot change admission or leak an injected error.
    try {
      ports.progress?.(Object.freeze({ ...summary }));
    } catch {}
  };
  function launch() {
    if (!canAdmit() || active.size >= plan.concurrency) return;
    summary.invocations++;
    let notified = false,
      claimed = 0;
    const task = Promise.resolve()
      .then(async () => {
        try {
          const raw = await ports.invoke((count) => {
            if (notified || (count !== 0 && count !== 1))
              throw Error("BILLING_SCHEDULER_CLAIM_INVALID");
            notified = true;
            claimed = count;
            // This is a scheduling hint only. Each new job must independently
            // attest scope, claim its own tenant and pass every existing gate.
            if (count === 1)
              while (canAdmit() && active.size < plan.concurrency) launch();
          });
          const safe = billingHttpSummary("refresh", raw) as {
            processed: number;
            outcomes: { ELIGIBLE: number; DENIED: number; UNVERIFIED: number };
          };
          if (!notified) throw Error("BILLING_SCHEDULER_CLAIM_MISSING");
          if (
            safe.processed !== claimed ||
            Object.values(safe.outcomes).reduce((a, b) => a + b, 0) !==
              safe.processed
          )
            throw Error("BILLING_SCHEDULER_RESULT_INVALID");
          if (safe.processed === 0) summary.empty_probes++;
          summary.eligible += safe.outcomes.ELIGIBLE;
          summary.denied += safe.outcomes.DENIED;
          summary.unverified += safe.outcomes.UNVERIFIED;
          if (safe.outcomes.UNVERIFIED) pause();
        } catch {
          summary.unavailable++;
          pause();
        }
      })
      .finally(() => {
        active.delete(task);
      });
    active.add(task);
    summary.maximum_active = Math.max(summary.maximum_active, active.size);
  }
  while (
    clock() < deadline &&
    !ports.signal?.aborted &&
    summary.invocations < plan.maximum_invocations &&
    !ports.readBudgetExhausted?.()
  ) {
    if (clock() >= nextProbe) {
      if (clock() - nextProbe > plan.scheduler_jitter_ms)
        summary.overrun_ticks++;
      if (active.size === 0 && canAdmit()) launch();
      // Never catch up missed ticks with an unbounded burst.
      nextProbe = clock() + plan.poll_interval_ms;
    }
    if (clock() >= nextProgress) {
      publish();
      nextProgress = clock() + 10_000;
    }
    try {
      await wait(
        Math.min(plan.poll_interval_ms, Math.max(1, deadline - clock())),
        ports.signal,
      );
    } catch {
      if (!ports.signal?.aborted) {
        pause();
        break;
      }
    }
  }
  summary.state = ports.signal?.aborted
    ? "STOPPED"
    : ports.readBudgetExhausted?.()
      ? "READ_LIMIT"
      : summary.invocations >= plan.maximum_invocations
        ? "INVOCATION_LIMIT"
        : "DURATION_LIMIT";
  await Promise.allSettled(active);
  publish();
  return Object.freeze({ ...summary });
}
