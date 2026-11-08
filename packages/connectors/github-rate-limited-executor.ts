// Unwired, default-off admission around the existing reviewed installation transport.
// The observer's App-JWT/public-IP reads are NOT covered by this quota class.
import crypto from "node:crypto";
import {
  githubAuthorityAck,
  githubBindingDigest,
  githubOperationDigest,
  githubProductionBinding,
  githubProductionOperation,
  githubProductionLease,
  type GithubProductionBinding,
  type GithubProductionOperation,
} from "./github-production-contracts";
import {
  GithubProductionExecutor,
  type GithubExecutionPorts,
  type GithubExecutionResult,
} from "./github-production-transport";
import {
  githubRateReservation,
  githubRateCompletion,
  type GithubSharedRate,
  type GithubRateSubject,
  type GithubRateReservation,
} from "./github-rate-coordinator";
export type GithubRateLimitedResult = {
  /** Preserve historical execution evidence even when rate recording fails.
   * null means no result is available; see executor_invoked. */
  executor_invoked: boolean;
  execution: GithubExecutionResult | null;
  coordination: {
    state: "NOT_ADMITTED" | "RECORDED" | "HELD" | "UNCONFIRMED";
    reason:
      | "RATE_GATE_CLOSED"
      | "INVALID_EXECUTION_INPUT"
      | "EXECUTION_ALREADY_ACTIVE"
      | "RESERVATION_UNCONFIRMED"
      | "RATE_RECORDED"
      | "RATE_HELD"
      | "COMPLETION_UNCONFIRMED"
      | "EXECUTION_UNCONFIRMED";
  };
};
type Options = {
  /** Trusted backend/testing seam. Provider transport has its own independent gate. */
  enabled?: () => boolean;
  coordinationDeadlineMs?: number;
};
const fail = () => Error("GITHUB_SHARED_RATE_UNAVAILABLE");
const notAdmitted = (
  reason:
    "RATE_GATE_CLOSED" | "INVALID_EXECUTION_INPUT" | "EXECUTION_ALREADY_ACTIVE",
): GithubRateLimitedResult => ({
  execution: null,
  executor_invoked: false,
  coordination: { state: "NOT_ADMITTED", reason },
});
export class GithubRateLimitedExecutor {
  #binding: GithubProductionBinding;
  #executor: GithubProductionExecutor;
  #rate: GithubSharedRate;
  #ports: GithubExecutionPorts;
  #clock: () => number;
  #startedAt: number;
  #enabled: () => boolean;
  #deadline: number;
  #readLeaseExpires: number | null = null;
  #active = false;
  #halted = false;
  constructor(
    binding: unknown,
    ports: GithubExecutionPorts,
    rate: GithubSharedRate,
    options: Options = {},
  ) {
    try {
      this.#binding = Object.freeze(githubProductionBinding.parse(binding));
      this.#executor = new GithubProductionExecutor(this.#binding, {
        ...ports,
        broker: {
          resolve: async (input, signal) => {
            const raw = await ports.broker.resolve(input, signal);
            signal.throwIfAborted();
            if (input.scope === "issues:read") {
              const lease = githubProductionLease.safeParse(raw);
              this.#readLeaseExpires = lease.success
                ? Date.parse(lease.data.expires_at)
                : null;
            }
            return raw;
          },
        },
      });
      this.#deadline = options.coordinationDeadlineMs ?? 2000;
      if (
        !ports.broker?.resolve ||
        !rate?.reserve ||
        !rate?.complete ||
        !Number.isInteger(this.#deadline) ||
        this.#deadline < 1 ||
        this.#deadline > 2000
      )
        throw fail();
    } catch {
      throw fail();
    }
    this.#rate = rate;
    this.#ports = ports;
    this.#clock = ports.now ?? Date.now;
    try {
      this.#startedAt = this.#clock();
      if (!Number.isFinite(this.#startedAt)) throw fail();
    } catch {
      throw fail();
    }
    this.#enabled = () => {
      try {
        return options.enabled
          ? options.enabled() === true
          : process.env.KXRA_GITHUB_SHARED_RATE_ENABLED === "true";
      } catch {
        return false;
      }
    };
  }
  private async bounded<T>(
    work: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const controller = new AbortController();
    let reject!: (error: Error) => void;
    const cancelled = new Promise<never>((_, r) => {
      reject = r;
    });
    const abort = () => {
      controller.abort();
      reject(fail());
    };
    if (signal?.aborted) throw fail();
    const timer = setTimeout(abort, this.#deadline);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      return await Promise.race([work(controller.signal), cancelled]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      controller.abort();
    }
  }
  private async recheckRead(
    result: GithubExecutionResult,
    operation: GithubProductionOperation,
    signal?: AbortSignal,
  ): Promise<GithubExecutionResult> {
    if (result.outcome !== "READ") return result;
    const available = () => {
      const now = this.#clock();
      if (
        !Number.isFinite(now) ||
        now < this.#startedAt ||
        now - this.#startedAt >= 30000 ||
        now >= Date.parse(this.#binding.expires_at) ||
        this.#readLeaseExpires === null ||
        now >= this.#readLeaseExpires ||
        !this.#enabled() ||
        !(
          this.#ports.enabled?.() ??
          process.env.KXRA_GITHUB_PROVIDER_ENABLED === "true"
        ) ||
        signal?.aborted
      )
        throw fail();
    };
    try {
      available();
      const binding_sha256 = githubBindingDigest(this.#binding),
        operation_sha256 = githubOperationDigest(this.#binding, operation);
      const ack = githubAuthorityAck.parse(
        await this.bounded(
          (s) =>
            this.#ports.authority.current(
              Object.freeze({
                binding: this.#binding,
                operation,
                binding_sha256,
                operation_sha256,
                scope: "issues:read" as const,
              }),
              s,
            ),
          signal,
        ),
      );
      if (
        ack.state !== "ACTIVE" ||
        ack.binding_sha256 !== binding_sha256 ||
        ack.operation_sha256 !== operation_sha256
      )
        throw fail();
      available();
      return result;
    } catch {
      this.#halted = true;
      return {
        outcome: "UNAVAILABLE",
        evidence: { reason: "READ_AUTHORITY_RECHECK_UNAVAILABLE" },
        rate: result.rate,
      };
    }
  }
  async execute(
    raw: unknown,
    signal?: AbortSignal,
  ): Promise<GithubRateLimitedResult> {
    if (this.#active) return notAdmitted("EXECUTION_ALREADY_ACTIVE");
    if (this.#halted || signal?.aborted || !this.#enabled())
      return notAdmitted("RATE_GATE_CLOSED");
    const parsed = githubProductionOperation.safeParse(raw);
    if (!parsed.success) return notAdmitted("INVALID_EXECUTION_INPUT");
    const operation = Object.freeze(parsed.data),
      binding = this.#binding;
    const subject: GithubRateSubject = Object.freeze({
      reservation_id: crypto.randomUUID(),
      app_id: binding.app_id,
      installation_id: binding.installation_id,
      account_id: binding.account_id,
      binding_sha256: githubBindingDigest(binding),
      operation_sha256: githubOperationDigest(binding, operation),
      kind: operation.kind === "COMMENT" ? "COMMENT" : "READ",
    });
    this.#active = true;
    let reservation: GithubRateReservation;
    let execution: GithubExecutionResult | null = null;
    try {
      try {
        reservation = Object.freeze(
          githubRateReservation.parse(
            await this.bounded((s) => this.#rate.reserve(subject, s), signal),
          ),
        );
        if (
          Object.entries(subject).some(
            ([key, value]) =>
              reservation[key as keyof GithubRateReservation] !== value,
          )
        )
          throw fail();
      } catch {
        this.#halted = true;
        return {
          execution: null,
          executor_invoked: false,
          coordination: {
            state: "UNCONFIRMED",
            reason: "RESERVATION_UNCONFIRMED",
          },
        };
      }
      // A confirmed reservation is intentionally not auto-released if cancellation or
      // disable occurs here. The trusted reconciler must handle a stranded reservation.
      if (signal?.aborted || !this.#enabled()) {
        this.#halted = true;
        return {
          execution: null,
          executor_invoked: false,
          coordination: { state: "HELD", reason: "RATE_GATE_CLOSED" },
        };
      }
      try {
        if (operation.kind !== "COMMENT") this.#readLeaseExpires = null;
        execution = await this.#executor.execute(operation, signal);
      } catch {
        this.#halted = true;
        return {
          execution: null,
          executor_invoked: true,
          coordination: {
            state: "UNCONFIRMED",
            reason: "EXECUTION_UNCONFIRMED",
          },
        };
      }
      try {
        // Record after transport settlement even when the caller has cancelled. It has
        // its own bounded deadline and cannot issue a provider call or refund quota.
        const completed = githubRateCompletion.parse(
          await this.bounded((s) =>
            this.#rate.complete(
              reservation,
              {
                rate: Object.freeze({ ...execution!.rate }),
                settlement: ["UNCERTAIN", "UNAVAILABLE"].includes(
                  execution!.outcome,
                )
                  ? "UNCONFIRMED"
                  : "CONFIRMED",
              },
              s,
            ),
          ),
        );
        if (
          completed.realm !== reservation.realm ||
          completed.epoch !== reservation.epoch ||
          completed.reservation_id !== reservation.reservation_id
        )
          throw fail();
        if (
          ["UNCERTAIN", "UNAVAILABLE"].includes(execution.outcome) &&
          !completed.held
        )
          throw fail();
        if (completed.held || execution.rate.stop) this.#halted = true;
        return {
          execution: await this.recheckRead(execution, operation, signal),
          executor_invoked: true,
          coordination: {
            state: completed.held ? "HELD" : "RECORDED",
            reason: completed.held ? "RATE_HELD" : "RATE_RECORDED",
          },
        };
      } catch {
        this.#halted = true;
        return {
          execution: await this.recheckRead(execution, operation, signal),
          executor_invoked: true,
          coordination: {
            state: "UNCONFIRMED",
            reason: "COMPLETION_UNCONFIRMED",
          },
        };
      }
    } finally {
      this.#active = false;
    }
  }
  toJSON() {
    return {
      component: "GithubRateLimitedExecutor",
      configuration: "REDACTED",
    };
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toJSON();
  }
}
