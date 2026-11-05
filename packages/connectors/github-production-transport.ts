import {
  fenceAck,
  fenceSubject,
  type GithubRollbackFence,
} from "./github-production-fence";
// Unwired production transport boundary. Existing fixture adapters and 503 routes remain unchanged.
import https from "node:https";
import dns from "node:dns/promises";
import crypto from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { TcpSocketConnectOpts } from "node:net";
import { z } from "zod";
import { publicIpv4 } from "../net/public-address";
import {
  githubProductionBinding,
  githubProductionOperation,
  githubProductionLease,
  githubAuthorityAck,
  githubAttemptConsumptionAck,
  githubBindingDigest,
  githubCommentApprovalDigest,
  githubOperationDigest,
  githubProductionPath,
  GITHUB_PRODUCTION_ORIGIN,
  type GithubProductionBinding,
  type GithubProductionOperation,
} from "./github-production-contracts";
type Scope = "issues:read" | "issues:write";
export type GithubAuthorityInput = Readonly<{
  binding: GithubProductionBinding;
  operation: GithubProductionOperation;
  binding_sha256: string;
  operation_sha256: string;
  scope: Scope;
}>;
export type GithubExecutionAuthority = {
  /** Read fresh server-owned authority. COMMENT must already have an exact independently
   * committed durable claim. Never refresh, regrant, claim or mint a token here. */
  current(input: GithubAuthorityInput, signal: AbortSignal): Promise<unknown>;
  /** Atomically and IRREVERSIBLY consume the exact durable attempt before HTTP, checking
   * fresh ownership/authority in that same transaction. A previously consumed or uncertain
   * attempt must deny across all workers/restarts, never return another consumed:true.
   * Lost consumption acknowledgement means hold/reconcile, never retry or reset. */
  consume(input: GithubAuthorityInput, signal: AbortSignal): Promise<unknown>;
};
export type GithubExecutionBroker = {
  /** Resolve an existing, scoped lease; do not issue or refresh a token under an old approval. */
  resolve(
    input: Readonly<{ binding: GithubProductionBinding; scope: Scope }>,
    signal: AbortSignal,
  ): Promise<unknown>;
};
export type GithubRateEvidence = {
  stop: boolean;
  not_before: string | null;
  reason: "NONE" | "RATE_LIMIT" | "RATE_CONTROL_INVALID";
};
export type GithubExecutionResult = {
  outcome:
    | "READ"
    | "ACCEPTED"
    | "REJECTED"
    | "UNCERTAIN"
    | "NOT_EXECUTED"
    | "UNAVAILABLE"
    | "REFUSED";
  evidence: {
    reason: string;
    status?: number;
    comment_id?: number;
    body_sha256?: string;
    author_id?: number;
    issue_id?: number;
  };
  rate: GithubRateEvidence;
  data?: unknown;
};
export type GithubExecutionPorts = {
  authority: GithubExecutionAuthority;
  /** Mandatory for COMMENT; no local SQL-only fallback. Reads confer no send permission. */
  rollbackFence?: GithubRollbackFence;
  broker: GithubExecutionBroker;
  /** Trusted server/test seams, never request-body options. Defaults use real Node TLS and DNS. */
  request?: typeof https.request;
  lookup?: (host: string) => Promise<{ address: string }[]>;
  enabled?: () => boolean;
  now?: () => number;
  deadlineMs?: number;
};
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const comment = z.object({
  id: positive,
  body: z.string().max(65536),
  user: z.object({ id: positive, type: z.string() }),
  issue_url: z.string(),
  created_at: z.string().datetime({ offset: true }),
});
const emptyRate = (): GithubRateEvidence => ({
  stop: false,
  not_before: null,
  reason: "NONE",
});
const unavailable = () => Error("GITHUB_EXECUTION_UNAVAILABLE");
function freeze<T>(v: T): T {
  if (v && typeof v === "object") {
    Object.values(v).forEach(freeze);
    Object.freeze(v);
  }
  return v;
}
function rateEvidence(
  headers: IncomingMessage["headers"],
  status: number,
  now: number,
): GithubRateEvidence {
  const remaining = headers["x-ratelimit-remaining"],
    reset = headers["x-ratelimit-reset"],
    retry = headers["retry-after"];
  const invalid = (v: unknown) =>
    v !== undefined && (typeof v !== "string" || v.length > 80);
  if ([remaining, reset, retry].some(invalid))
    return { stop: true, not_before: null, reason: "RATE_CONTROL_INVALID" };
  let until = now,
    stop = status === 403 || status === 429;
  if (remaining !== undefined) {
    if (typeof remaining !== "string" || !/^\d{1,10}$/.test(remaining))
      return { stop: true, not_before: null, reason: "RATE_CONTROL_INVALID" };
    if (Number(remaining) === 0) {
      stop = true;
      if (typeof reset !== "string" || !/^\d{1,12}$/.test(reset))
        return { stop: true, not_before: null, reason: "RATE_CONTROL_INVALID" };
      until = Math.max(until, Number(reset) * 1000);
    }
  }
  if (retry !== undefined) {
    stop = true;
    const n =
      typeof retry === "string" && /^\d{1,9}$/.test(retry)
        ? now + Number(retry) * 1000
        : typeof retry === "string"
          ? Date.parse(retry)
          : NaN;
    if (!Number.isFinite(n))
      return { stop: true, not_before: null, reason: "RATE_CONTROL_INVALID" };
    until = Math.max(until, n);
  }
  return {
    stop,
    not_before: stop ? new Date(until).toISOString() : null,
    reason: stop ? "RATE_LIMIT" : "NONE",
  };
}
/** A bounded serial execution window for ONE exact connection and at most ONE comment attempt.
 * Object-local budgets do not replace the durable SQL claim or shared worker rate budget. */
export class GithubProductionExecutor {
  private binding: GithubProductionBinding;
  private calls = 0;
  private writeConsumed = false;
  private inFlight = false;
  private halted = false;
  private repoObserved: number | null = null;
  private issueObserved: number | null = null;
  private startedAt: number;
  private clock: () => number;
  private enabled: () => boolean;
  private deadlineMs: number;
  constructor(
    binding: unknown,
    private ports: GithubExecutionPorts,
  ) {
    this.binding = freeze(githubProductionBinding.parse(binding));
    this.clock = ports.now ?? Date.now;
    this.enabled =
      ports.enabled ??
      (() => process.env.KXRA_GITHUB_PROVIDER_ENABLED === "true");
    this.deadlineMs = ports.deadlineMs ?? 2000;
    if (
      !Number.isInteger(this.deadlineMs) ||
      this.deadlineMs < 1 ||
      this.deadlineMs > 2000 ||
      !ports.authority?.current ||
      !ports.authority?.consume ||
      !ports.broker?.resolve
    )
      throw unavailable();
    this.startedAt = this.clock();
  }
  async execute(
    raw: unknown,
    signal?: AbortSignal,
  ): Promise<GithubExecutionResult> {
    let started = false,
      consumptionPending = false,
      consumptionConfirmed = false,
      write = false,
      timer: ReturnType<typeof setTimeout> | undefined,
      request: ReturnType<typeof https.request> | undefined,
      response: IncomingMessage | undefined;
    let rate = emptyRate();
    const controller = new AbortController();
    const failure = (): GithubExecutionResult => ({
      outcome: write
        ? started
          ? "UNCERTAIN"
          : consumptionConfirmed
            ? "NOT_EXECUTED"
            : "REFUSED"
        : started
          ? "UNAVAILABLE"
          : "NOT_EXECUTED",
      evidence: {
        reason:
          consumptionPending && !started
            ? "DURABLE_ATTEMPT_UNCONFIRMED"
            : started
              ? "RESPONSE_UNCONFIRMED"
              : "AUTHORITY_OR_PREFLIGHT_UNAVAILABLE",
      },
      rate,
    });
    if (this.inFlight)
      return {
        outcome: "REFUSED",
        evidence: { reason: "EXECUTION_ALREADY_ACTIVE" },
        rate,
      };
    let operation: GithubProductionOperation;
    try {
      operation = freeze(githubProductionOperation.parse(raw));
      write = operation.kind === "COMMENT";
    } catch {
      return {
        outcome: "REFUSED",
        evidence: { reason: "INVALID_EXECUTION_INPUT" },
        rate,
      };
    }
    if (write && this.writeConsumed)
      return {
        outcome: "REFUSED",
        evidence: { reason: "ATTEMPT_ALREADY_CONSUMED" },
        rate,
      };
    if (
      !this.enabled() ||
      this.halted ||
      signal?.aborted ||
      this.calls >= 6 ||
      this.clock() - this.startedAt >= 30000 ||
      (write && this.writeConsumed)
    )
      return failure();
    if (write) this.writeConsumed = true;
    this.calls++;
    this.inFlight = true;
    const binding = this.binding,
      scope: Scope = write ? "issues:write" : "issues:read",
      bindingHash = githubBindingDigest(binding),
      operationHash = githubOperationDigest(binding, operation);
    let reject!: (e: unknown) => void;
    const cancelled = new Promise<never>((_, fail) => {
      reject = fail;
    });
    const abort = () => {
      controller.abort();
      response?.destroy();
      request?.destroy();
      reject(unavailable());
    };
    const available = () => {
      if (
        !this.enabled() ||
        signal?.aborted ||
        controller.signal.aborted ||
        this.clock() >= Date.parse(binding.expires_at) ||
        this.clock() - this.startedAt >= 30000
      )
        throw unavailable();
      if (operation.kind === "COMMENT") {
        const approved = Date.parse(operation.approved_at),
          expires = Date.parse(operation.expires_at);
        if (
          approved > this.clock() ||
          expires <= this.clock() ||
          expires > approved + 300000 ||
          expires > Date.parse(binding.expires_at) ||
          operation.approval_digest !==
            githubCommentApprovalDigest(binding, {
              write_id: operation.write_id,
              body: operation.body,
              approved_at: operation.approved_at,
              expires_at: operation.expires_at,
            }) ||
          this.repoObserved === null ||
          this.issueObserved === null ||
          this.clock() - Math.min(this.repoObserved, this.issueObserved) > 10000
        )
          throw unavailable();
      }
    };
    const current = async () => {
      available();
      const a = githubAuthorityAck.parse(
        await this.ports.authority.current(
          freeze({
            binding,
            operation,
            binding_sha256: bindingHash,
            operation_sha256: operationHash,
            scope,
          }),
          controller.signal,
        ),
      );
      if (
        a.binding_sha256 !== bindingHash ||
        a.operation_sha256 !== operationHash ||
        (operation.kind === "COMMENT"
          ? a.state !== "DISPATCHING" ||
            a.write_id !== operation.write_id ||
            a.attempt_id !== operation.attempt_id
          : a.state !== "ACTIVE")
      )
        throw unavailable();
      available();
    };
    timer = setTimeout(abort, this.deadlineMs);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const work = async (): Promise<GithubExecutionResult> => {
        await current();
        const lease = githubProductionLease.parse(
          await this.ports.broker.resolve(
            freeze({ binding, scope }),
            controller.signal,
          ),
        );
        const validLease = () => {
          if (
            controller.signal.aborted ||
            lease.binding_sha256 !== bindingHash ||
            lease.credential_ref !== binding.credential_ref ||
            lease.credential_version !== binding.credential_version ||
            lease.app_id !== binding.app_id ||
            lease.installation_id !== binding.installation_id ||
            lease.repository_ids[0] !== binding.repository_id ||
            lease.permissions.issues !== (write ? "write" : "read") ||
            Date.parse(lease.expires_at) <= this.clock() ||
            Date.parse(lease.expires_at) > Date.parse(binding.expires_at) ||
            crypto.createHash("sha256").update(lease.token).digest("hex") ===
              "d729ead2e34a7bff7462e2e0e6c916fe1ca5097260a5eb4bbce6aa2199443e77"
          )
            throw unavailable();
        };
        validLease();
        await current();
        const resolved = await (
          this.ports.lookup ??
          ((host) => dns.lookup(host, { all: true, family: 4 }))
        )("api.github.com");
        const addresses = resolved.map((a) => a.address);
        if (
          !addresses.length ||
          addresses.some((address) => !publicIpv4(address))
        )
          throw unavailable();
        const address = addresses[0];
        await current();
        validLease();
        if (operation.kind === "COMMENT") {
          consumptionPending = true;
          try {
            const fence = this.ports.rollbackFence;
            if (!fence) throw unavailable();
            const fenceInput = freeze({
              binding,
              operation,
              binding_sha256: bindingHash,
              operation_sha256: operationHash,
              scope,
            });
            fenceSubject(fenceInput);
            const reservation = fenceAck.parse(
              await fence.reserve(fenceInput, controller.signal),
            );
            if (
              reservation.write_id !== operation.write_id ||
              reservation.attempt_id !== operation.attempt_id ||
              reservation.binding_sha256 !== bindingHash ||
              reservation.operation_sha256 !== operationHash
            )
              throw unavailable();
            const consumed = githubAttemptConsumptionAck.parse(
              await this.ports.authority.consume(
                freeze({
                  binding,
                  operation,
                  binding_sha256: bindingHash,
                  operation_sha256: operationHash,
                  scope,
                }),
                controller.signal,
              ),
            );
            if (
              consumed.binding_sha256 !== bindingHash ||
              consumed.operation_sha256 !== operationHash ||
              consumed.write_id !== operation.write_id ||
              consumed.attempt_id !== operation.attempt_id
            )
              throw unavailable();
            consumptionPending = false;
            consumptionConfirmed = true;
            const sent = fenceAck.parse(
              await fence.send(fenceInput, reservation, controller.signal),
            );
            if (JSON.stringify(sent) !== JSON.stringify(reservation))
              throw unavailable();
          } catch {
            return {
              outcome: "REFUSED",
              evidence: { reason: "DURABLE_ATTEMPT_UNCONFIRMED" },
              rate,
            };
          }
          await current();
          validLease();
        }
        const target = new URL(
          GITHUB_PRODUCTION_ORIGIN + githubProductionPath(binding, operation),
        );
        const body =
          operation.kind === "COMMENT"
            ? JSON.stringify({ body: operation.body })
            : undefined;
        const ipv4Socket: Pick<TcpSocketConnectOpts, "autoSelectFamily"> = {
          autoSelectFamily: false,
        };
        const result = await new Promise<{
          status: number;
          headers: IncomingMessage["headers"];
          bytes: Buffer;
        }>((resolve, fail) => {
          // Conservatively classify every failure after request construction as possible send.
          started = true;
          request = (this.ports.request ?? https.request)(
            target,
            {
              method: write ? "POST" : "GET",
              port: 443,
              servername: "api.github.com",
              rejectUnauthorized: true,
              minVersion: "TLSv1.2",
              agent: false,
              family: 4,
              ...ipv4Socket,
              maxHeaderSize: 16384,
              insecureHTTPParser: false,
              signal: controller.signal,
              lookup: (_host, options, cb) => {
                if (_host !== "api.github.com") {
                  cb(unavailable(), "", 4);
                  return;
                }
                if (options.all) cb(null, [{ address, family: 4 }]);
                else cb(null, address, 4);
              },
              headers: {
                accept: "application/vnd.github+json",
                authorization: `Bearer ${lease.token}`,
                "x-github-api-version": binding.api_version,
                "user-agent": "KXRA-GitHub-Connector",
                "accept-encoding": "identity",
                ...(body
                  ? {
                      "content-type": "application/json",
                      "content-length": String(Buffer.byteLength(body)),
                    }
                  : {}),
              },
            },
            (r) => {
              response = r;
              r.once("error", () => fail(unavailable()));
              r.once("aborted", () => fail(unavailable()));
              rate = rateEvidence(r.headers, r.statusCode ?? 0, this.clock());
              if (rate.stop) this.halted = true;
              const length = r.headers["content-length"],
                media = r.headers["content-type"],
                encoding = r.headers["content-encoding"];
              if (
                controller.signal.aborted ||
                !r.statusCode ||
                typeof media !== "string" ||
                !["application/json", "application/vnd.github+json"].includes(
                  media.split(";")[0].trim().toLowerCase(),
                ) ||
                (encoding !== undefined && encoding !== "identity") ||
                (length !== undefined &&
                  (typeof length !== "string" ||
                    !/^\d+$/.test(length) ||
                    Number(length) > 262144))
              ) {
                r.destroy();
                fail(unavailable());
                return;
              }
              let size = 0,
                reads = 0;
              const chunks: Buffer[] = [];
              r.on("data", (chunk: Buffer) => {
                size += chunk.length;
                if (
                  ++reads > 512 ||
                  size > 262144 ||
                  controller.signal.aborted
                ) {
                  r.destroy();
                  fail(unavailable());
                } else chunks.push(Buffer.from(chunk));
              });

              r.once("end", () =>
                resolve({
                  status: r.statusCode!,
                  headers: r.headers,
                  bytes: Buffer.concat(chunks),
                }),
              );
            },
          );
          request.once("error", () => fail(unavailable()));
          request.once("upgrade", (_r, socket) => {
            socket.destroy();
            fail(unavailable());
          });
          request.end(body);
        });
        if (controller.signal.aborted || signal?.aborted) throw unavailable();
        rate = rateEvidence(result.headers, result.status, this.clock());
        if (rate.stop) this.halted = true;
        let data: unknown;
        try {
          data = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(result.bytes),
          );
        } catch {
          throw unavailable();
        }
        if (!write) {
          await current();
          validLease();
        }
        const error = z.object({ message: z.string() }).safeParse(data);
        if (write) {
          if (
            [401, 403, 404, 410, 422, 429].includes(result.status) &&
            error.success
          )
            return {
              outcome: "REJECTED",
              evidence: { status: result.status, reason: "PROVIDER_REJECTED" },
              rate,
            };
          if (operation.kind !== "COMMENT" || result.status !== 201)
            throw unavailable();
          const v = comment.parse(data);
          if (
            v.body !== operation.body ||
            v.user.id !== binding.author_id ||
            v.user.type !== "Bot" ||
            v.issue_url !==
              `${GITHUB_PRODUCTION_ORIGIN}/repos/${binding.owner}/${binding.repo}/issues/${binding.issue_number}`
          )
            throw unavailable();
          return {
            outcome: "ACCEPTED",
            evidence: {
              status: 201,
              reason: "MATCHING_ACKNOWLEDGEMENT",
              comment_id: v.id,
              body_sha256: crypto
                .createHash("sha256")
                .update(v.body)
                .digest("hex"),
              author_id: v.user.id,
              issue_id: binding.issue_id,
            },
            rate,
          };
        }
        if (result.status !== 200) throw unavailable();
        const repoUrl = `${GITHUB_PRODUCTION_ORIGIN}/repos/${binding.owner}/${binding.repo}`,
          issueUrl = `${repoUrl}/issues/${binding.issue_number}`;
        if (operation.kind === "REPOSITORY") {
          const v = z
            .object({
              id: positive,
              full_name: z.string(),
              owner: z.object({ id: positive, login: z.string() }),
            })
            .parse(data);
          if (
            v.id !== binding.repository_id ||
            v.owner.id !== binding.account_id ||
            v.owner.login !== binding.owner ||
            v.full_name !== `${binding.owner}/${binding.repo}`
          )
            throw unavailable();
          this.repoObserved = this.clock();
          return {
            outcome: "READ",
            data: {
              repository_id: v.id,
              account_id: v.owner.id,
              full_name: v.full_name,
            },
            evidence: { status: 200, reason: "MATCHING_REPOSITORY" },
            rate,
          };
        }
        if (operation.kind === "ISSUE") {
          const v = z
            .object({
              id: positive,
              number: positive,
              url: z.string(),
              repository_url: z.string(),
            })
            .passthrough()
            .parse(data);
          if (
            "pull_request" in v ||
            v.id !== binding.issue_id ||
            v.number !== binding.issue_number ||
            v.url !== issueUrl ||
            v.repository_url !== repoUrl
          )
            throw unavailable();
          this.issueObserved = this.clock();
          return {
            outcome: "READ",
            data: { issue_id: v.id, issue_number: v.number },
            evidence: { status: 200, reason: "MATCHING_ISSUE" },
            rate,
          };
        }
        const values = z.array(comment).max(100).parse(data);
        if (values.some((v) => v.issue_url !== issueUrl)) throw unavailable();
        // Never follow provider Link URLs. Expose only bounded numeric page availability.
        const link = result.headers.link;
        let next = false;
        if (link !== undefined) {
          if (
            typeof link !== "string" ||
            !link ||
            link.length > 4096 ||
            operation.kind !== "COMMENTS"
          )
            throw unavailable();
          const relations = new Set<string>();
          for (const part of link.split(",")) {
            const m = part
              .trim()
              .match(/^<([^>]+)>;\s*rel="(next|prev|first|last)"$/);
            if (!m || relations.has(m[2])) throw unavailable();
            relations.add(m[2]);
            const url = new URL(m[1]);
            if (
              url.origin !== GITHUB_PRODUCTION_ORIGIN ||
              url.username ||
              url.password ||
              url.hash ||
              url.pathname !== `${new URL(issueUrl).pathname}/comments` ||
              [...url.searchParams].length !== 2 ||
              url.searchParams.getAll("page").length !== 1 ||
              url.searchParams.getAll("per_page").length !== 1 ||
              url.searchParams.get("per_page") !== "100" ||
              !/^[1-9][0-9]{0,5}$/.test(url.searchParams.get("page") ?? "")
            )
              throw unavailable();
            if (m[2] === "next") {
              if (Number(url.searchParams.get("page")) !== operation.page + 1)
                throw unavailable();
              next = true;
            }
          }
        }
        return {
          outcome: "READ",
          data: {
            comments: values.map((v) => ({
              id: v.id,
              body: v.body,
              author_id: v.user.id,
              created_at: v.created_at,
            })),
            has_next_page: next,
            complete: !next,
            untrusted_content: true,
          },
          evidence: { status: 200, reason: "SCOPED_COMMENTS" },
          rate,
        };
      };
      return await Promise.race([work(), cancelled]);
    } catch {
      if (!write) {
        this.repoObserved = null;
        this.issueObserved = null;
      }
      return failure();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      controller.abort();
      response?.destroy();
      request?.destroy();
      this.inFlight = false;
    }
  }
}
