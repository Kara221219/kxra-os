// Unwired, default-off provider identity observations. This is not custody, token
// issuance, permission attestation, connection approval or execution authority.
import crypto from "node:crypto";
import dns from "node:dns/promises";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import type { TcpSocketConnectOpts } from "node:net";
import { z } from "zod";
import { publicIpv4 } from "../net/public-address";
import {
  GITHUB_PRODUCTION_ORIGIN,
  githubBindingDigest,
  githubProductionBinding,
  githubProductionLease,
  type GithubProductionBinding,
} from "./github-production-contracts";
import type { GithubExecutionBroker } from "./github-production-transport";

const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const slug = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/);
const permissions = z
  .object({ metadata: z.literal("read"), issues: z.literal("write") })
  .strict();
const appLeaseSchema = z
  .object({
    mode: z.literal("GITHUB_APP_JWT"),
    binding_sha256: hash,
    app_id: positive,
    client_id: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/),
    expires_at: z.string().datetime({ offset: true }),
    jwt: z
      .string()
      .min(1)
      .max(8000)
      .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
  })
  .strict();
const authoritySchema = z
  .object({
    purpose: z.literal("GITHUB_IDENTITY_OBSERVATION"),
    active: z.literal(true),
    binding_sha256: hash,
  })
  .strict();
const installationSchema = z.object({
  id: positive,
  app_id: positive,
  app_slug: slug,
  account: z.object({
    id: positive,
    login: z.string(),
    type: z.enum(["User", "Organization"]),
  }),
  target_id: positive,
  target_type: z.enum(["User", "Organization"]),
  repository_selection: z.literal("selected"),
  permissions,
  suspended_at: z.null(),
  suspended_by: z.null(),
});

type Subject = Readonly<{
  binding: GithubProductionBinding;
  binding_sha256: string;
  purpose: "GITHUB_IDENTITY_OBSERVATION";
}>;
export type GithubInstallationObservationPorts = {
  /** Explicit, fresh server-owned consent to inspect this App/installation/target.
   * An ordinary repository-read acknowledgement does not authorize App observations. */
  authority: { current(input: Subject, signal: AbortSignal): Promise<unknown> };
  /** Resolve only an existing purpose-bound JWT. Never sign, refresh, issue or
   * persist credentials here. A production signer/custody adapter is still required. */
  appBroker: { resolve(input: Subject, signal: AbortSignal): Promise<unknown> };
  /** Existing exact-repository read lease. Its provenance/scope remain broker testimony. */
  installationBroker: GithubExecutionBroker;
  /** Trusted backend/testing seams only. Never supplied by a browser or model. */
  request?: typeof https.request;
  lookup?: (host: string) => Promise<{ address: string }[]>;
  enabled?: () => boolean;
  now?: () => number;
  monotonic?: () => number;
  deadlineMs?: number;
};
export type GithubInstallationObservationResult =
  | { outcome: "UNAVAILABLE"; reason: "IDENTITY_OBSERVATION_UNAVAILABLE" }
  | {
      outcome: "OBSERVED";
      purpose: "IDENTITY_OBSERVATION_ONLY";
      binding_sha256: string;
      observed_at: string;
      app_id: number;
      app_slug: string;
      installation_id: number;
      account_id: number;
      account_type: "User" | "Organization";
      repository_id: number;
      owner: string;
      repo: string;
      author_id: number;
      bot_login: string;
      repository_selection: "selected";
      installation_permissions: { metadata: "read"; issues: "write" };
    };
const unavailable = () => Error("GITHUB_IDENTITY_OBSERVATION_UNAVAILABLE");
const failed = (): GithubInstallationObservationResult => ({
  outcome: "UNAVAILABLE",
  reason: "IDENTITY_OBSERVATION_UNAVAILABLE",
});
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function jwtClaims(jwt: string) {
  const parts = jwt.split(".");
  const decode = (part: string) => {
    const bytes = Buffer.from(part, "base64url");
    if (bytes.toString("base64url") !== part) throw unavailable();
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  };
  z.object({ alg: z.literal("RS256"), typ: z.literal("JWT").optional() })
    .strict()
    .parse(decode(parts[0]));
  return z
    .object({
      iss: z.union([positive, z.string().min(1).max(100)]),
      iat: positive,
      exp: positive,
    })
    .strict()
    .parse(decode(parts[1]));
}
/** One bounded, serial, read-only observation. The result describes historical
 * provider responses, not durable consent, exact installation-token scope or
 * permission to dispatch. All five responses and final authority must agree. */
export class GithubInstallationObserver {
  #used = false;
  #binding: GithubProductionBinding;
  #ports: GithubInstallationObservationPorts;
  constructor(binding: unknown, ports: GithubInstallationObservationPorts) {
    // Avoid Zod errors exposing input fields through a caller's generic logger.
    try {
      this.#binding = freeze(githubProductionBinding.parse(binding));
    } catch {
      throw unavailable();
    }
    this.#ports = ports;
    if (
      !ports.authority?.current ||
      !ports.appBroker?.resolve ||
      !ports.installationBroker?.resolve ||
      (ports.deadlineMs !== undefined &&
        (!Number.isInteger(ports.deadlineMs) ||
          ports.deadlineMs < 1 ||
          ports.deadlineMs > 10000))
    )
      throw unavailable();
  }
  async observe(
    signal?: AbortSignal,
  ): Promise<GithubInstallationObservationResult> {
    if (this.#used) return failed();
    this.#used = true;
    const ports = this.#ports;
    const now = ports.now ?? Date.now;
    const monotonic = ports.monotonic ?? (() => performance.now());
    const enabled =
      ports.enabled ??
      (() => process.env.KXRA_GITHUB_IDENTITY_OBSERVATION_ENABLED === "true");
    const deadline = ports.deadlineMs ?? 10000;
    const binding = this.#binding;
    const subject: Subject = freeze({
      binding,
      binding_sha256: githubBindingDigest(binding),
      purpose: "GITHUB_IDENTITY_OBSERVATION" as const,
    });
    const controller = new AbortController();
    let request: ReturnType<typeof https.request> | undefined;
    let response: IncomingMessage | undefined;
    let reject!: (reason: Error) => void;
    const cancelled = new Promise<never>((_, fail) => {
      reject = fail;
    });
    const abort = () => {
      controller.abort();
      response?.destroy();
      request?.destroy();
      reject(unavailable());
    };
    let start = 0;
    const available = () => {
      const elapsed = monotonic() - start;
      const clock = now();
      if (
        !Number.isFinite(clock) ||
        !Number.isFinite(elapsed) ||
        elapsed < 0 ||
        elapsed >= deadline ||
        !enabled() ||
        signal?.aborted ||
        controller.signal.aborted ||
        clock >= Date.parse(binding.expires_at)
      )
        throw unavailable();
    };
    const current = async () => {
      available();
      const ack = authoritySchema.parse(
        await ports.authority.current(subject, controller.signal),
      );
      if (ack.binding_sha256 !== subject.binding_sha256) throw unavailable();
      available();
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      start = monotonic();
      available();
      timer = setTimeout(abort, deadline);
      signal?.addEventListener("abort", abort, { once: true });
      const work = async (): Promise<GithubInstallationObservationResult> => {
        await current();
        const appLease = appLeaseSchema.parse(
          await ports.appBroker.resolve(subject, controller.signal),
        );
        const claims = jwtClaims(appLease.jwt);
        const validApp = () => {
          available();
          if (
            appLease.binding_sha256 !== subject.binding_sha256 ||
            appLease.app_id !== binding.app_id ||
            ![String(binding.app_id), appLease.client_id].includes(
              String(claims.iss),
            ) ||
            claims.iat * 1000 > now() ||
            claims.iat * 1000 < now() - 660000 ||
            claims.exp <= claims.iat ||
            claims.exp * 1000 <= now() ||
            claims.exp * 1000 > now() + 600000 ||
            Date.parse(appLease.expires_at) !== claims.exp * 1000 ||
            claims.exp * 1000 > Date.parse(binding.expires_at)
          )
            throw unavailable();
        };
        validApp();
        await current();
        const lease = githubProductionLease.parse(
          await ports.installationBroker.resolve(
            freeze({ binding, scope: "issues:read" as const }),
            controller.signal,
          ),
        );
        const validLeases = () => {
          validApp();
          if (
            lease.binding_sha256 !== subject.binding_sha256 ||
            lease.app_id !== binding.app_id ||
            lease.installation_id !== binding.installation_id ||
            lease.credential_ref !== binding.credential_ref ||
            lease.credential_version !== binding.credential_version ||
            lease.repository_ids[0] !== binding.repository_id ||
            lease.permissions.issues !== "read" ||
            Date.parse(lease.expires_at) <= now() ||
            Date.parse(lease.expires_at) > Date.parse(binding.expires_at) ||
            crypto.createHash("sha256").update(lease.token).digest("hex") ===
              "d729ead2e34a7bff7462e2e0e6c916fe1ca5097260a5eb4bbce6aa2199443e77"
          )
            throw unavailable();
        };
        validLeases();
        const get = async (path: string, token?: string): Promise<unknown> => {
          await current();
          validLeases();
          const addresses = await (
            ports.lookup ??
            ((host) => dns.lookup(host, { all: true, family: 4 }))
          )("api.github.com");
          if (
            !addresses.length ||
            addresses.some(({ address }) => !publicIpv4(address))
          )
            throw unavailable();
          const address = addresses[0].address;
          await current();
          validLeases();
          const ipv4Socket: Pick<TcpSocketConnectOpts, "autoSelectFamily"> = {
            autoSelectFamily: false,
          };
          const bytes = await new Promise<Buffer>((resolve, fail) => {
            available();
            request = (ports.request ?? https.request)(
              new URL(GITHUB_PRODUCTION_ORIGIN + path),
              {
                method: "GET",
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
                lookup: (host, options, cb) => {
                  if (host !== "api.github.com") {
                    cb(unavailable(), "", 4);
                    return;
                  }
                  if (options.all) cb(null, [{ address, family: 4 }]);
                  else cb(null, address, 4);
                },
                headers: {
                  accept: "application/vnd.github+json",
                  "accept-encoding": "identity",
                  "x-github-api-version": binding.api_version,
                  "user-agent": "KXRA-GitHub-Identity-Observer",
                  ...(token ? { authorization: `Bearer ${token}` } : {}),
                },
              },
              (r) => {
                response = r;
                r.once("error", () => fail(unavailable()));
                r.once("aborted", () => fail(unavailable()));
                const length = r.headers["content-length"],
                  media = r.headers["content-type"],
                  encoding = r.headers["content-encoding"];
                const remaining = r.headers["x-ratelimit-remaining"];
                // A rate signal ends the whole window, even when the body is otherwise valid.
                if (
                  controller.signal.aborted ||
                  r.statusCode !== 200 ||
                  r.headers["retry-after"] !== undefined ||
                  (remaining !== undefined &&
                    (typeof remaining !== "string" ||
                      !/^\d{1,10}$/.test(remaining) ||
                      Number(remaining) === 0)) ||
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
                  count = 0;
                const chunks: Buffer[] = [];
                r.on("data", (chunk: Buffer) => {
                  size += chunk.length;
                  if (
                    ++count > 512 ||
                    size > 262144 ||
                    controller.signal.aborted
                  ) {
                    r.destroy();
                    fail(unavailable());
                  } else chunks.push(Buffer.from(chunk));
                });
                r.once("end", () => {
                  if (
                    !r.complete ||
                    (length !== undefined && size !== Number(length))
                  ) {
                    fail(unavailable());
                    return;
                  }
                  resolve(Buffer.concat(chunks));
                });
                r.once("close", () => {
                  if (!r.complete) fail(unavailable());
                });
              },
            );
            request.once("error", () => fail(unavailable()));
            request.once("upgrade", (_r, socket) => {
              socket.destroy();
              fail(unavailable());
            });
            request.end();
          });
          await current();
          validLeases();
          return JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(bytes),
          );
        };
        const app = z
          .object({ id: positive, slug, client_id: z.string(), permissions })
          .parse(await get("/app", appLease.jwt));
        if (app.id !== binding.app_id || app.client_id !== appLease.client_id)
          throw unavailable();
        const checkInstallation = (raw: unknown) => {
          const install = installationSchema.parse(raw);
          if (
            install.id !== binding.installation_id ||
            install.app_id !== app.id ||
            install.app_slug !== app.slug ||
            install.account.id !== binding.account_id ||
            install.account.login !== binding.owner ||
            install.target_id !== binding.account_id ||
            install.target_type !== install.account.type
          )
            throw unavailable();
          return install;
        };
        const installation = checkInstallation(
          await get(
            `/app/installations/${binding.installation_id}`,
            appLease.jwt,
          ),
        );
        const repositoryPath = `/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repo)}`;
        const repositoryInstallation = checkInstallation(
          await get(`${repositoryPath}/installation`, appLease.jwt),
        );
        if (repositoryInstallation.account.type !== installation.account.type)
          throw unavailable();
        const repository = z
          .object({
            id: positive,
            name: z.string(),
            full_name: z.string(),
            owner: z.object({
              id: positive,
              login: z.string(),
              type: z.string(),
            }),
            archived: z.literal(false),
            disabled: z.literal(false),
          })
          .parse(await get(repositoryPath, lease.token));
        if (
          repository.id !== binding.repository_id ||
          repository.name !== binding.repo ||
          repository.full_name !== `${binding.owner}/${binding.repo}` ||
          repository.owner.id !== binding.account_id ||
          repository.owner.login !== binding.owner ||
          repository.owner.type !== installation.account.type
        )
          throw unavailable();
        const botLogin = `${app.slug}[bot]`;
        const bot = z
          .object({ id: positive, login: z.string(), type: z.literal("Bot") })
          .parse(await get(`/users/${encodeURIComponent(botLogin)}`));
        if (bot.id !== binding.author_id || bot.login !== botLogin)
          throw unavailable();
        await current();
        validLeases();
        return freeze({
          outcome: "OBSERVED",
          purpose: "IDENTITY_OBSERVATION_ONLY",
          binding_sha256: subject.binding_sha256,
          observed_at: new Date(now()).toISOString(),
          app_id: app.id,
          app_slug: app.slug,
          installation_id: installation.id,
          account_id: installation.account.id,
          account_type: installation.account.type,
          repository_id: repository.id,
          owner: repository.owner.login,
          repo: repository.name,
          author_id: bot.id,
          bot_login: bot.login,
          repository_selection: "selected",
          installation_permissions: { metadata: "read", issues: "write" },
        });
      };
      return await Promise.race([work(), cancelled]);
    } catch {
      return failed();
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      controller.abort();
      response?.destroy();
      request?.destroy();
    }
  }
}
