import crypto from "node:crypto";
import { z } from "zod";
import {
  boundedDraft,
  leasedDraftSchema,
  type LeasedDraft,
} from "./paired-runtime";
import { codexTextConfiguration } from "./codex-text-policy";
const id = z.uuid(),
  sha = z.string().regex(/^[a-f0-9]{64}$/),
  time = z.iso.datetime({ offset: true });
export const pairedExecutionRequest = z
  .object({ task_id: id, fence: id, attempt_id: id })
  .strict();
const contextSchema = z
  .object({
    organization_id: id,
    account_id: id,
    session_revision: z.number().int().nonnegative(),
  })
  .strict();
const runtimeSchema = z
  .object({
    executable_sha256: sha,
    protocol_schema_sha256: sha,
    configuration_sha256: sha,
    tool_policy_sha256: sha,
    isolation_receipt_sha256: sha,
    host_identity_sha256: sha,
    auth_binding_sha256: sha,
    model_sha256: sha,
  })
  .strict();
const authoritySchema = z
  .object({
    purpose: z.literal("PAIRED_TEXT_EXECUTION_V1"),
    revision: id,
    context: contextSchema,
    device_id: id,
    device_session_id: id,
    realm_id: id,
    continuity_epoch: id,
    membership: z
      .object({
        organization_id: id,
        account_id: id,
        room_id: id,
        state: z.literal("ACTIVE"),
        revision: z.number().int().positive(),
      })
      .strict(),
    task: leasedDraftSchema,
    approval: z
      .object({ id, content_hash: sha, state: z.literal("APPROVED") })
      .strict(),
    runtime: runtimeSchema,
    runtime_review: z
      .object({
        id,
        reviewer_id: id,
        subject_sha256: sha,
        state: z.literal("ACCEPTED"),
        evidence_sha256: sha,
        expires_at: time,
      })
      .strict(),
    auth_review: z
      .object({
        id,
        state: z.literal("ACCEPTED"),
        scope: z.literal("CUSTOMER_OWNED_PAIRED_TEXT"),
        binding_sha256: sha,
        evidence_sha256: sha,
        expires_at: time,
      })
      .strict(),
  })
  .strict();
export type PairedExecutionContext = z.infer<typeof contextSchema>;
export type PairedRuntimeMeasurement = z.infer<typeof runtimeSchema>;
export type PairedExecutionAuthority = z.infer<typeof authoritySchema>;
const canonical = (v: unknown): string => {
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, value]) => JSON.stringify(k) + ":" + canonical(value))
        .join(",") +
      "}"
    );
  return JSON.stringify(v) ?? "undefined";
};
export const pairedAdmissionDigest = (v: unknown) =>
  crypto.createHash("sha256").update(canonical(v)).digest("hex");
export const pairedTextPolicyDigest = () =>
  pairedAdmissionDigest(codexTextConfiguration);
export function pairedRuntimeSubject(value: PairedExecutionAuthority) {
  return pairedAdmissionDigest({
    purpose: value.purpose,
    context: value.context,
    device_id: value.device_id,
    device_session_id: value.device_session_id,
    realm_id: value.realm_id,
    continuity_epoch: value.continuity_epoch,
    runtime: value.runtime,
    auth_review: value.auth_review,
  });
}
function freeze<T>(v: T): Readonly<T> {
  if (v && typeof v === "object") {
    for (const child of Object.values(v)) freeze(child);
    Object.freeze(v);
  }
  return v;
}
const consumedSchema = z
  .object({
    state: z.literal("CONSUMED"),
    permit_id: id,
    snapshot_sha256: sha,
    realm_id: id,
    continuity_epoch: id,
    expires_at: time,
  })
  .strict();
type Consumed = z.infer<typeof consumedSchema>;
/** Trusted server/device boundary, not request-body callbacks or a browser DTO.
 * Production implementations must authenticate measurements and reviews, use
 * verified identity + authenticated transactional RLS, and atomically recheck
 * current authority in consume/publish. Consumption must survive restore and
 * be unique per task/fence across attempt IDs. execute must recheck current
 * authority at its launch boundary and launch the SAME immutable image/config/
 * policy/schema measured above (pinned handles or immutable artifact identity,
 * never reopening a mutable pathname). It must refuse if that cannot be proven,
 * honor abort/expiry and own process cleanup. No production ports exist here. */
export interface PairedAdmissionPorts {
  readonly context: PairedExecutionContext;
  readCurrent(
    request: z.infer<typeof pairedExecutionRequest>,
  ): Promise<unknown>;
  measureRuntime(
    binding: Readonly<PairedRuntimeMeasurement>,
    signal?: AbortSignal,
  ): Promise<unknown>;
  consume(
    input: Readonly<{
      request: z.infer<typeof pairedExecutionRequest>;
      snapshot_sha256: string;
      authority: PairedExecutionAuthority;
    }>,
    signal?: AbortSignal,
  ): Promise<unknown>;
  execute(
    input: Readonly<{
      task: LeasedDraft;
      runtime: PairedRuntimeMeasurement;
      permit: Consumed;
      snapshot_sha256: string;
    }>,
    signal?: AbortSignal,
  ): Promise<string>;
  publish(
    input: Readonly<{
      permit: Consumed;
      request: z.infer<typeof pairedExecutionRequest>;
      snapshot_sha256: string;
      draft_text: string;
    }>,
    signal?: AbortSignal,
  ): Promise<unknown>;
}
function validate(
  raw: unknown,
  request: z.infer<typeof pairedExecutionRequest>,
  context: PairedExecutionContext,
  now: number,
) {
  const a = authoritySchema.parse(raw);
  if (
    canonical(a.context) !== canonical(context) ||
    a.task.id !== request.task_id ||
    a.task.fence !== request.fence ||
    a.membership.organization_id !== context.organization_id ||
    a.membership.account_id !== context.account_id ||
    a.membership.room_id !== a.task.room_id ||
    a.approval.content_hash !== a.task.content_hash ||
    a.runtime.tool_policy_sha256 !== pairedTextPolicyDigest() ||
    a.runtime.auth_binding_sha256 !== a.auth_review.binding_sha256 ||
    a.runtime_review.reviewer_id === context.account_id ||
    a.runtime_review.subject_sha256 !== pairedRuntimeSubject(a) ||
    a.task.sources.some((s) => s.thread !== a.task.thread_id) ||
    Buffer.byteLength(JSON.stringify(a.task.sources)) > 24000 ||
    [
      a.task.lease_until,
      a.runtime_review.expires_at,
      a.auth_review.expires_at,
    ].some((t) => Date.parse(t) <= now)
  )
    throw Error("PAIRED_ADMISSION_DENIED");
  return freeze(a) as PairedExecutionAuthority;
}
export type PairedAdmissionResult =
  | { state: "BLOCKED"; reason: "ADMISSION_UNAVAILABLE" | "ADMISSION_DENIED" }
  | { state: "ALREADY_CONSUMED"; replayed: false }
  | { state: "DONE"; message_id: string }
  | { state: "UNCERTAIN"; replayed: false };
/** No default authority, measurements, durable consumption or executor. One
 * invocation never retries consumption, provider dispatch or publication. */
export async function executeAdmittedPairedText(
  raw: unknown,
  ports?: PairedAdmissionPorts,
  signal?: AbortSignal,
  now = Date.now,
  timeoutMs = 25000,
): Promise<PairedAdmissionResult> {
  if (!ports) return { state: "BLOCKED", reason: "ADMISSION_UNAVAILABLE" };
  let consumedAttempt = false;
  const controller = new AbortController();
  const effectiveSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let deadlineAt = Infinity;
  let validUntil = Infinity;
  const check = () => {
    if (performance.now() >= deadlineAt || now() >= validUntil)
      controller.abort();
    effectiveSignal.throwIfAborted();
  };
  const tighten = (until: number) => {
    validUntil = Math.min(validUntil, until);
    deadlineAt = Math.min(
      deadlineAt,
      performance.now() + Math.max(0, validUntil - now()),
    );
    if (deadline) clearTimeout(deadline);
    const remaining = deadlineAt - performance.now();
    if (remaining <= 0) controller.abort();
    else deadline = setTimeout(() => controller.abort(), remaining);
    check();
  };
  const wait = <T>(work: Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const abort = () => reject(Error("PAIRED_ADMISSION_INTERRUPTED"));
      effectiveSignal.addEventListener("abort", abort, { once: true });
      work.then(
        (value) => {
          effectiveSignal.removeEventListener("abort", abort);
          try {
            check();
            resolve(value);
          } catch {
            reject(Error("PAIRED_ADMISSION_INTERRUPTED"));
          }
        },
        () => {
          effectiveSignal.removeEventListener("abort", abort);
          reject(Error("PAIRED_ADMISSION_PORT_FAILED"));
        },
      );
      if (effectiveSignal.aborted) abort();
    });
  try {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 25000)
      throw Error("PAIRED_ADMISSION_DEADLINE_INVALID");
    deadlineAt = performance.now() + timeoutMs;
    deadline = setTimeout(() => controller.abort(), timeoutMs);
    const request = freeze(pairedExecutionRequest.parse(raw));
    const context = freeze(contextSchema.parse(ports.context));
    check();
    const authority = validate(
      await wait(ports.readCurrent(request)),
      request,
      context,
      now(),
    );
    tighten(
      Math.min(
        ...[
          authority.task.lease_until,
          authority.runtime_review.expires_at,
          authority.auth_review.expires_at,
        ].map(Date.parse),
      ),
    );
    const digest = pairedAdmissionDigest(authority);
    const measurement = runtimeSchema.parse(
      await wait(
        ports.measureRuntime(
          freeze(structuredClone(authority.runtime)),
          effectiveSignal,
        ),
      ),
    );
    if (canonical(measurement) !== canonical(authority.runtime))
      throw Error("PAIRED_MEASUREMENT_MISMATCH");
    check();
    const current = validate(
      await wait(ports.readCurrent(request)),
      request,
      context,
      now(),
    );
    if (pairedAdmissionDigest(current) !== digest)
      throw Error("PAIRED_AUTHORITY_CHANGED");
    check();
    consumedAttempt = true;
    const receipt = await wait(
      ports.consume(
        freeze({ request, snapshot_sha256: digest, authority }),
        effectiveSignal,
      ),
    );
    if (
      z
        .object({ state: z.literal("ALREADY_CONSUMED") })
        .strict()
        .safeParse(receipt).success
    )
      return { state: "ALREADY_CONSUMED", replayed: false };
    const permit = freeze(consumedSchema.parse(receipt));
    if (
      permit.snapshot_sha256 !== digest ||
      permit.realm_id !== authority.realm_id ||
      permit.continuity_epoch !== authority.continuity_epoch ||
      Date.parse(permit.expires_at) <= now() ||
      Date.parse(permit.expires_at) >
        Math.min(
          ...[
            authority.task.lease_until,
            authority.runtime_review.expires_at,
            authority.auth_review.expires_at,
          ].map(Date.parse),
        )
    )
      throw Error("PAIRED_PERMIT_MISMATCH");
    tighten(Date.parse(permit.expires_at));
    check();
    // A lost/withdrawn consume acknowledgment never authorizes a dispatch.
    const dispatch = validate(
      await wait(ports.readCurrent(request)),
      request,
      context,
      now(),
    );
    if (
      pairedAdmissionDigest(dispatch) !== digest ||
      Date.parse(permit.expires_at) <= now()
    )
      throw Error("PAIRED_AUTHORITY_CHANGED");
    const measuredAgain = runtimeSchema.parse(
      await wait(
        ports.measureRuntime(
          freeze(structuredClone(authority.runtime)),
          effectiveSignal,
        ),
      ),
    );
    if (
      canonical(measuredAgain) !== canonical(authority.runtime) ||
      Date.parse(permit.expires_at) <= now()
    )
      throw Error("PAIRED_MEASUREMENT_MISMATCH");
    check();
    const launchAuthority = validate(
      await wait(ports.readCurrent(request)),
      request,
      context,
      now(),
    );
    if (
      pairedAdmissionDigest(launchAuthority) !== digest ||
      Date.parse(permit.expires_at) <= now()
    )
      throw Error("PAIRED_AUTHORITY_CHANGED");
    check();
    const draft = boundedDraft.parse(
      await wait(
        ports.execute(
          freeze({
            task: structuredClone(authority.task),
            runtime: structuredClone(authority.runtime),
            permit,
            snapshot_sha256: digest,
          }),
          effectiveSignal,
        ),
      ),
    );
    check();
    const publication = validate(
      await wait(ports.readCurrent(request)),
      request,
      context,
      now(),
    );
    if (
      pairedAdmissionDigest(publication) !== digest ||
      Date.parse(permit.expires_at) <= now()
    )
      throw Error("PAIRED_AUTHORITY_CHANGED");
    // Atomic publish must recheck scope, sources, permit and current authority;
    // this read is not a replacement for its transactional race fence.
    check();
    const result = z
      .object({
        state: z.literal("DONE"),
        message_id: id,
        snapshot_sha256: sha,
        permit_id: id,
      })
      .strict()
      .parse(
        await wait(
          ports.publish(
            freeze({
              permit,
              request,
              snapshot_sha256: digest,
              draft_text: draft,
            }),
            effectiveSignal,
          ),
        ),
      );
    if (
      result.snapshot_sha256 !== digest ||
      result.permit_id !== permit.permit_id
    )
      throw Error("PAIRED_PUBLICATION_MISMATCH");
    return { state: "DONE", message_id: result.message_id };
  } catch {
    return consumedAttempt
      ? { state: "UNCERTAIN", replayed: false }
      : { state: "BLOCKED", reason: "ADMISSION_DENIED" };
  } finally {
    if (deadline) clearTimeout(deadline);
    controller.abort();
  }
}
