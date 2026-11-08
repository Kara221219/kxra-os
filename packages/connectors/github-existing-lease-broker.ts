// Existing-token resolution only. No provider call, signing, issuance, refresh,
// secret discovery, encryption implementation or managed-custody provisioning.
import crypto from "node:crypto";
import { z } from "zod";
import {
  githubBindingDigest,
  githubProductionBinding,
  githubProductionLease,
  type GithubProductionBinding,
  type GithubProductionLease,
} from "./github-production-contracts";
import type { GithubExecutionBroker } from "./github-production-transport";
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const date = z.string().datetime({ offset: true });
const scopeSchema = z.enum(["issues:read", "issues:write"]);
type Scope = z.infer<typeof scopeSchema>;
const permissions = z
  .object({ metadata: z.literal("read"), issues: z.enum(["read", "write"]) })
  .strict();
const requestSchema = z
  .object({
    origin: z.literal("https://api.github.com"),
    method: z.literal("POST"),
    path: z.string().max(100),
    api_version: z.literal("2026-03-10"),
    body: z
      .object({ repository_ids: z.tuple([positive]), permissions })
      .strict(),
  })
  .strict();
const repository = z
  .object({
    id: positive,
    name: z.string().max(100),
    full_name: z.string().max(200),
    owner: z.object({ id: positive, login: z.string().max(39) }).strict(),
  })
  .strict();
const responseSchema = z
  .object({
    status: z.literal(201),
    expires_at: date,
    permissions,
    repository_selection: z.literal("selected"),
    repositories: z.tuple([repository]),
  })
  .strict();
export const githubIssuanceEvidence = z
  .object({
    purpose: z.literal("GITHUB_INSTALLATION_ISSUANCE_V1"),
    issuance_id: z.uuid(),
    binding_sha256: hash,
    scope: scopeSchema,
    authenticated_app_id: positive,
    observed_at: date,
    request: requestSchema,
    response: responseSchema,
    token_sha256: hash,
    lease_expires_at: date,
  })
  .strict();
export type GithubIssuanceEvidence = z.infer<typeof githubIssuanceEvidence>;
const custodyObject = z
  .object({ object_id: z.uuid(), object_version: positive })
  .strict();
export const githubExistingLeaseRecord = z
  .object({
    evidence: githubIssuanceEvidence,
    custody: custodyObject
      .extend({ context_sha256: hash, envelope_sha256: hash })
      .strict(),
  })
  .strict();
export type GithubExistingLeaseRecord = z.infer<
  typeof githubExistingLeaseRecord
>;
const legacyFixtureDigest =
  "d729ead2e34a7bff7462e2e0e6c916fe1ca5097260a5eb4bbce6aa2199443e77";
const fail = () => Error("GITHUB_EXISTING_LEASE_UNAVAILABLE");
const digest = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function bounded<T>(schema: z.ZodType<T>, raw: unknown, max = 16384): T {
  const bytes = JSON.stringify(raw);
  if (typeof bytes !== "string" || Buffer.byteLength(bytes, "utf8") > max)
    throw fail();
  return schema.parse(JSON.parse(bytes));
}
function evidenceFor(
  binding: GithubProductionBinding,
  scope: Scope,
  raw: unknown,
) {
  const e = bounded(githubIssuanceEvidence, raw);
  const repository = e.response.repositories[0],
    issues = scope === "issues:write" ? "write" : "read";
  const issued = Date.parse(e.observed_at),
    providerEnd = Date.parse(e.response.expires_at),
    leaseEnd = Date.parse(e.lease_expires_at);
  if (
    e.binding_sha256 !== githubBindingDigest(binding) ||
    e.scope !== scope ||
    e.authenticated_app_id !== binding.app_id ||
    e.request.path !==
      `/app/installations/${binding.installation_id}/access_tokens` ||
    e.request.api_version !== binding.api_version ||
    e.request.body.repository_ids[0] !== binding.repository_id ||
    e.request.body.permissions.issues !== issues ||
    e.response.permissions.issues !== issues ||
    repository.id !== binding.repository_id ||
    repository.name !== binding.repo ||
    repository.full_name !== `${binding.owner}/${binding.repo}` ||
    repository.owner.id !== binding.account_id ||
    repository.owner.login !== binding.owner ||
    ![issued, providerEnd, leaseEnd].every(Number.isFinite) ||
    providerEnd <= issued ||
    providerEnd > issued + 3660000 ||
    leaseEnd <= issued ||
    leaseEnd > providerEnd ||
    leaseEnd > Date.parse(binding.expires_at) ||
    e.token_sha256 === legacyFixtureDigest
  )
    throw fail();
  return e;
}
/** Project a response already captured by an independently trusted, authorized issuer.
 * This function performs no issuance and cannot authenticate a caller's alleged
 * exchange. App identity and authenticated request provenance remain issuer testimony. */
export function projectGithubIssuanceEvidence(
  bindingInput: unknown,
  scopeInput: unknown,
  rawExchange: unknown,
): GithubIssuanceEvidence {
  try {
    const binding = githubProductionBinding.parse(bindingInput),
      scope = scopeSchema.parse(scopeInput);
    // Provider repository objects contain many unrelated fields, including possible
    // temporary clone tokens. Project only the checked metadata; never retain them.
    const wireRepository = z.object({
      id: positive,
      name: z.string().max(100),
      full_name: z.string().max(200),
      owner: z.object({ id: positive, login: z.string().max(39) }),
    });
    const exchange = bounded(
      z
        .object({
          issuance_id: z.uuid(),
          authenticated_app_id: positive,
          observed_at: date,
          request: requestSchema,
          response: z
            .object({
              status: z.literal(201),
              body: z.object({
                token: githubProductionLease.shape.token,
                expires_at: date,
                permissions,
                repository_selection: z.literal("selected"),
                repositories: z.tuple([wireRepository]),
              }),
            })
            .strict(),
        })
        .strict(),
      rawExchange,
      262144,
    );
    const { token, ...metadata } = exchange.response.body;
    return freeze(
      evidenceFor(binding, scope, {
        purpose: "GITHUB_INSTALLATION_ISSUANCE_V1",
        issuance_id: exchange.issuance_id,
        binding_sha256: githubBindingDigest(binding),
        scope,
        authenticated_app_id: exchange.authenticated_app_id,
        observed_at: new Date(exchange.observed_at).toISOString(),
        request: exchange.request,
        response: {
          status: exchange.response.status,
          ...metadata,
          expires_at: new Date(metadata.expires_at).toISOString(),
        },
        token_sha256: crypto
          .createHash("sha256")
          .update(token, "utf8")
          .digest("hex"),
        lease_expires_at: new Date(
          Math.min(
            Date.parse(metadata.expires_at),
            Date.parse(binding.expires_at),
          ),
        ).toISOString(),
      }),
    );
  } catch {
    throw fail();
  }
}
/** Canonical authenticated-encryption context for an immutable existing object.
 * A real custodian must independently enforce workload/tenant policy and bind this
 * context when sealing/opening. Hash comparison is not a replacement for AEAD. */
export function githubLeaseCustodyContext(
  bindingInput: unknown,
  scopeInput: unknown,
  evidenceInput: unknown,
  objectInput: unknown,
) {
  try {
    const binding = githubProductionBinding.parse(bindingInput),
      scope = scopeSchema.parse(scopeInput),
      evidence = evidenceFor(binding, scope, evidenceInput),
      object = custodyObject.parse(objectInput);
    return freeze({
      purpose: "GITHUB_EXISTING_INSTALLATION_TOKEN_V1" as const,
      binding,
      scope,
      issuance_sha256: digest(evidence),
      ...object,
    });
  } catch {
    throw fail();
  }
}
/** Exact canonical bytes for a real custodian's AEAD additional authenticated data. */
export function githubLeaseCustodyAAD(
  context: ReturnType<typeof githubLeaseCustodyContext>,
): Buffer {
  try {
    const value = bounded(
      z
        .object({
          purpose: z.literal("GITHUB_EXISTING_INSTALLATION_TOKEN_V1"),
          binding: githubProductionBinding,
          scope: scopeSchema,
          issuance_sha256: hash,
          object_id: z.uuid(),
          object_version: positive,
        })
        .strict(),
      context,
    );
    return Buffer.from(JSON.stringify(value), "utf8");
  } catch {
    throw fail();
  }
}
export function githubLeaseCustodyContextDigest(
  context: ReturnType<typeof githubLeaseCustodyContext>,
) {
  return crypto
    .createHash("sha256")
    .update(githubLeaseCustodyAAD(context))
    .digest("hex");
}

type Subject = Readonly<{
  purpose: "GITHUB_EXISTING_INSTALLATION_LEASE";
  binding: GithubProductionBinding;
  scope: Scope;
}>;
export type GithubExistingLeasePorts = {
  /** Resolve only the current exact stored record under verified server/workload,
   * tenant/session/grant/credential authority. Enforce that authority on EVERY call.
   * No create, refresh, regrant, overwrite or caller-provided record fallback. */
  store: { current(subject: Subject, signal: AbortSignal): Promise<unknown> };
  /** Open only this immutable object with exact AEAD context and envelope hash.
   * The service must verify caller/workload policy and current key/object validity.
   * It must never substitute latest aliases, reseal, issue, rotate or refresh here. */
  custody: {
    open(
      input: Readonly<{
        context: ReturnType<typeof githubLeaseCustodyContext>;
        context_sha256: string;
        envelope_sha256: string;
      }>,
      signal: AbortSignal,
    ): Promise<unknown>;
  };
  enabled?: () => boolean;
  now?: () => number;
  monotonic?: () => number;
  deadlineMs?: number;
};
const currentSchema = z
  .object({
    purpose: z.literal("GITHUB_EXISTING_INSTALLATION_LEASE"),
    active: z.literal(true),
    binding_sha256: hash,
    scope: scopeSchema,
    record: githubExistingLeaseRecord,
  })
  .strict();
const openSchema = custodyObject
  .extend({
    context_sha256: hash,
    envelope_sha256: hash,
    token: githubProductionLease.shape.token,
  })
  .strict();
/** Existing-token broker compatible with both the executor and observer. It verifies
 * content binding to trusted retained issuance evidence, NOT GitHub signatures or
 * actual token scope independently of that issuer. No resolved-token cache exists. */
export class GithubExistingInstallationBroker implements GithubExecutionBroker {
  #ports: GithubExistingLeasePorts;
  #deadline: number;
  constructor(ports: GithubExistingLeasePorts) {
    this.#ports = ports;
    this.#deadline = ports?.deadlineMs ?? 1500;
    if (
      !ports?.store?.current ||
      !ports.custody?.open ||
      !Number.isInteger(this.#deadline) ||
      this.#deadline < 1 ||
      this.#deadline > 1500
    )
      throw fail();
  }
  toJSON() {
    return {
      component: "GithubExistingInstallationBroker",
      configuration: "REDACTED",
    };
  }
  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toJSON();
  }
  async resolve(
    input: Readonly<{ binding: GithubProductionBinding; scope: Scope }>,
    signal: AbortSignal,
  ): Promise<GithubProductionLease> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reject!: (reason: Error) => void;
    const cancelled = new Promise<never>((_, r) => {
      reject = r;
    });
    const abort = () => {
      controller.abort();
      reject(fail());
    };
    try {
      const parsed = z
        .object({ binding: githubProductionBinding, scope: scopeSchema })
        .strict()
        .parse(input);
      const binding = freeze(parsed.binding),
        scope = parsed.scope,
        subject: Subject = freeze({
          purpose: "GITHUB_EXISTING_INSTALLATION_LEASE",
          binding,
          scope,
        });
      const clock = this.#ports.now ?? Date.now,
        monotonic = this.#ports.monotonic ?? (() => performance.now());
      const started = monotonic(),
        firstClock = clock();
      const available = (evidence?: GithubIssuanceEvidence) => {
        const now = clock(),
          elapsed = monotonic() - started;
        if (
          !(
            this.#ports.enabled?.() ??
            process.env.KXRA_GITHUB_EXISTING_LEASE_BROKER_ENABLED === "true"
          ) ||
          signal.aborted ||
          controller.signal.aborted ||
          !Number.isFinite(firstClock) ||
          !Number.isFinite(now) ||
          now < firstClock ||
          !Number.isFinite(elapsed) ||
          elapsed < 0 ||
          elapsed >= this.#deadline ||
          now >= Date.parse(binding.expires_at) ||
          (evidence &&
            (now < Date.parse(evidence.observed_at) ||
              now >= Date.parse(evidence.lease_expires_at) ||
              now >= Date.parse(evidence.response.expires_at)))
        )
          throw fail();
      };
      available();
      timer = setTimeout(abort, this.#deadline);
      signal.addEventListener("abort", abort, { once: true });
      const current = async () => {
        available();
        const value = bounded(
          currentSchema,
          await this.#ports.store.current(subject, controller.signal),
        );
        available();
        if (
          value.binding_sha256 !== githubBindingDigest(binding) ||
          value.scope !== scope
        )
          throw fail();
        const evidence = evidenceFor(binding, scope, value.record.evidence);
        available(evidence);
        const context = githubLeaseCustodyContext(binding, scope, evidence, {
          object_id: value.record.custody.object_id,
          object_version: value.record.custody.object_version,
        });
        if (
          githubLeaseCustodyContextDigest(context) !==
          value.record.custody.context_sha256
        )
          throw fail();
        return freeze({ record: value.record, context });
      };
      const work = async () => {
        const original = await current();
        available(original.record.evidence);
        const opened = bounded(
          openSchema,
          await this.#ports.custody.open(
            freeze({
              context: original.context,
              context_sha256: original.record.custody.context_sha256,
              envelope_sha256: original.record.custody.envelope_sha256,
            }),
            controller.signal,
          ),
        );
        available(original.record.evidence);
        if (
          opened.object_id !== original.record.custody.object_id ||
          opened.object_version !== original.record.custody.object_version ||
          opened.context_sha256 !== original.record.custody.context_sha256 ||
          opened.envelope_sha256 !== original.record.custody.envelope_sha256 ||
          crypto
            .createHash("sha256")
            .update(opened.token, "utf8")
            .digest("hex") !== original.record.evidence.token_sha256
        )
          throw fail();
        const currentRecord = await current();
        if (digest(currentRecord.record) !== digest(original.record))
          throw fail();
        available(original.record.evidence);
        const result = githubProductionLease.parse({
          mode: "GITHUB_APP_INSTALLATION",
          binding_sha256: githubBindingDigest(binding),
          credential_ref: binding.credential_ref,
          credential_version: binding.credential_version,
          app_id: binding.app_id,
          installation_id: binding.installation_id,
          repository_ids: [binding.repository_id],
          permissions: original.record.evidence.response.permissions,
          expires_at: original.record.evidence.lease_expires_at,
          token: opened.token,
        });
        // The trusted transport still requires plaintext; ordinary inspection is redacted.
        // Copying/spreading/extracting the token can bypass this convenience protection.
        Object.defineProperties(result, {
          toJSON: {
            value: () => ({
              mode: result.mode,
              binding_sha256: result.binding_sha256,
              token: "REDACTED",
            }),
          },
          [Symbol.for("nodejs.util.inspect.custom")]: {
            value: () => ({ mode: result.mode, token: "REDACTED" }),
          },
        });
        return freeze(result);
      };
      return await Promise.race([work(), cancelled]);
    } catch {
      throw fail();
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      controller.abort();
    }
  }
}
