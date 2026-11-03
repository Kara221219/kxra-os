import crypto from "node:crypto";
import { z } from "zod";
import { localModeConfiguration } from "../authz/local-guard";

import {
  githubConnection,
  githubWrite,
  githubCommand,
  type GithubConnection,
  type GithubWrite,
} from "./github-contracts";
const date = z.string().datetime({ offset: true });
export {
  githubConnection,
  githubWrite,
  githubCommand,
} from "./github-contracts";
export type { GithubConnection, GithubWrite } from "./github-contracts";
export const fixtureGithubToken = "kxra-local-github-fixture-only";
export interface CredentialBroker {
  resolve(
    binding: GithubConnection,
    scope: "issues:read" | "issues:write",
  ): Promise<{
    reference: string;
    version: number;
    expiresAt: string;
    token: typeof fixtureGithubToken;
  }>;
}
export class FixtureCredentialBroker implements CredentialBroker {
  async resolve(
    input: GithubConnection,
    scope: "issues:read" | "issues:write",
  ) {
    const c = githubConnection.parse(input);
    if (
      !localModeConfiguration(process.env) ||
      process.env.VERCEL_ENV ||
      c.state !== "ACTIVE" ||
      Date.parse(c.expires_at) <= Date.now() ||
      !c.credential_ref ||
      c.credential_ref !== `fixture:github:${c.id}:v${c.grant_version}` ||
      (scope === "issues:write" && !c.allow_write)
    )
      throw Error("GRANT_UNAVAILABLE");
    return {
      reference: c.credential_ref,
      version: c.grant_version,
      expiresAt: c.expires_at,
      token: fixtureGithubToken as typeof fixtureGithubToken,
    };
  }
}
const comment = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  body: z.string().max(65536),
  user: z.object({ id: z.number().int().positive() }),
  issue_url: z.string(),
  created_at: date,
});
export type Comment = z.infer<typeof comment>;
export type Evidence = {
  status?: number;
  comment_id?: number;
  body_sha256?: string;
  author_id?: number;
  issue_url?: string;
  reason?: string;
};
export type ScopeCall = (
  kind: "human" | "worker",
  action: string,
  input: Record<string, unknown>,
) => Promise<unknown>;
export function requireGithubFixture() {
  if (!localModeConfiguration(process.env) || process.env.VERCEL_ENV)
    throw Error("GITHUB_LOCAL_ONLY");
}
export class LocalGithubAdapter {
  private origin: string;
  constructor(
    origin: string,
    private broker: CredentialBroker = new FixtureCredentialBroker(),
  ) {
    requireGithubFixture();
    const url = new URL(origin);
    if (
      url.protocol !== "http:" ||
      url.hostname !== "127.0.0.1" ||
      !url.port ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      throw Error("GITHUB_EXTERNAL_ACCESS_DISABLED");
    this.origin = url.origin;
  }
  private async lease(c: GithubConnection, write = false) {
    const value = await this.broker.resolve(
      c,
      write ? "issues:write" : "issues:read",
    );
    const lease = z
      .object({
        reference: z.string(),
        version: z.number().int().positive(),
        expiresAt: date,
        token: z.literal(fixtureGithubToken),
      })
      .strict()
      .safeParse(value);
    if (
      !lease.success ||
      lease.data.reference !== c.credential_ref ||
      lease.data.version !== c.grant_version ||
      Date.parse(lease.data.expiresAt) <= Date.now() ||
      Date.parse(lease.data.expiresAt) > Date.parse(c.expires_at)
    )
      throw Error("GRANT_UNAVAILABLE");
    return lease.data;
  }
  private path(c: GithubConnection) {
    return `/repos/${c.binding.owner}/${c.binding.repo}/issues/${c.binding.issue_number}/comments`;
  }
  private async request(
    path: string,
    token: typeof fixtureGithubToken,
    method = "GET",
    body?: string,
  ) {
    requireGithubFixture();
    if (token !== fixtureGithubToken)
      throw Error("GITHUB_FIXTURE_CREDENTIAL_REQUIRED");
    const response = await fetch(this.origin + path, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2026-03-10",
        "user-agent": "KXRA-local-github-fixture",
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify({ body }) : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(2000),
    });
    const reader = response.body?.getReader();
    let bytes = 0,
      text = "";
    const decoder = new TextDecoder();
    if (reader)
      while (true) {
        const value = await reader.read();
        if (value.done) break;
        bytes += value.value.length;
        if (bytes > 262144) {
          await reader.cancel();
          throw Error("PROVIDER_RESPONSE_LIMIT");
        }
        text += decoder.decode(value.value, { stream: true });
      }
    let data: unknown;
    try {
      data = JSON.parse(text + decoder.decode());
    } catch {
      throw Error("PROVIDER_RESPONSE_INVALID");
    }
    return {
      status: response.status,
      data,
      next: response.headers.get("link")?.includes('rel="next"') === true,
    };
  }
  async preflight(c: GithubConnection, write = false) {
    const credential = await this.lease(c, write);
    const r = await this.request(
      `/repos/${c.binding.owner}/${c.binding.repo}`,
      credential.token,
    );
    if ([401, 403, 404, 410].includes(r.status))
      throw Error("PROVIDER_PREFLIGHT_REJECTED");
    const repo = z
      .object({
        id: z.number(),
        owner: z.object({ id: z.number() }),
        full_name: z.string(),
      })
      .parse(r.data);
    if (
      r.status !== 200 ||
      repo.id !== c.binding.repository_id ||
      repo.owner.id !== c.binding.account_id ||
      repo.full_name !== `${c.binding.owner}/${c.binding.repo}`
    )
      throw Error("PROVIDER_BINDING_MISMATCH");
    return credential;
  }
  async read(c: GithubConnection) {
    const credential = await this.preflight(c);
    const values: Comment[] = [];
    let complete = false;
    for (let page = 1; page <= 3; page++) {
      const r = await this.request(
        `${this.path(c)}?per_page=100&page=${page}`,
        credential.token,
      );
      if (r.status !== 200) throw Error("PROVIDER_READ_UNAVAILABLE");
      const batch = z.array(comment).max(100).parse(r.data);
      const issue = `https://api.github.com/repos/${c.binding.owner}/${c.binding.repo}/issues/${c.binding.issue_number}`;
      if (batch.some((x) => x.issue_url !== issue))
        throw Error("PROVIDER_SCOPE_MISMATCH");
      values.push(...batch);
      if (!r.next) {
        complete = true;
        break;
      }
    }
    return { comments: values, complete };
  }
  async send(
    c: GithubConnection,
    w: GithubWrite,
  ): Promise<{
    outcome: "ACCEPTED" | "REJECTED" | "UNCERTAIN" | "NOT_EXECUTED";
    evidence: Evidence;
  }> {
    let started = false;
    try {
      const credential = await this.lease(c, true);
      if (Date.parse(w.expires_at) <= Date.now())
        throw Error("APPROVAL_EXPIRED_BEFORE_HTTP");
      started = true;
      const r = await this.request(
        this.path(c),
        credential.token,
        "POST",
        w.payload.body,
      );
      if (
        [401, 403, 404, 410, 422].includes(r.status) &&
        z.object({ message: z.string() }).safeParse(r.data).success
      )
        return {
          outcome: "REJECTED",
          evidence: { status: r.status, reason: "PROVIDER_REJECTED" },
        };
      const value = comment.parse(r.data);
      if (
        r.status !== 201 ||
        value.body !== w.payload.body ||
        value.user.id !== c.binding.author_id ||
        value.issue_url !==
          `https://api.github.com/repos/${c.binding.owner}/${c.binding.repo}/issues/${c.binding.issue_number}`
      )
        throw Error("PROVIDER_ACK_INVALID");
      return { outcome: "ACCEPTED", evidence: this.evidence(value, r.status) };
    } catch {
      return {
        outcome: started ? "UNCERTAIN" : "NOT_EXECUTED",
        evidence: { reason: "ACKNOWLEDGEMENT_LOST_OR_INVALID" },
      };
    }
  }
  evidence(value: Comment, status = 200): Evidence {
    return {
      status,
      comment_id: value.id,
      body_sha256: crypto.createHash("sha256").update(value.body).digest("hex"),
      author_id: value.user.id,
      issue_url: value.issue_url,
    };
  }
}
export class GithubConnectorService {
  constructor(
    private scope: ScopeCall,
    private provider: LocalGithubAdapter,
  ) {}
  async list() {
    return this.scope("human", "list", {});
  }
  async command(raw: unknown) {
    const input = githubCommand.parse(raw);
    const { action, ...args } = input;
    if (action === "read") {
      const c = githubConnection.parse(
        await this.scope("worker", "context", args),
      );
      const read = await this.provider.read(c);
      const receipt = await this.scope("worker", "record_read", {
        ...args,
        grant_version: c.grant_version,
      });
      return {
        receipt,
        comments: read.comments.slice(-50),
        complete: read.complete,
        untrusted_content: true,
      };
    }
    if (action !== "dispatch" && action !== "reconcile")
      return this.scope("human", action, args);
    const context = z
      .object({ connection: githubConnection, write: githubWrite })
      .parse(await this.scope("worker", "dispatch_context", args));
    let w = context.write;
    const c = context.connection;
    if (
      w.payload.org_id !== c.org_id ||
      w.payload.user_id !== c.user_id ||
      w.payload.connection_id !== c.id
    )
      throw Error("SCOPED_WRITE_BINDING_MISMATCH");
    if (action === "reconcile") {
      if (w.state !== "UNCERTAIN") return w;
      // No token refresh, POST or state-as-nonexecution inference in reconciliation.
      let evidence: Evidence = { reason: "READ_FAILED" };
      let outcome = "INCONCLUSIVE";
      try {
        const current = githubConnection.parse(
          await this.scope("worker", "context", { connection_id: c.id }),
        );
        const values = await this.provider.read(current);
        const matches = values.comments.filter(
          (v) =>
            v.body === w.payload.body &&
            v.user.id === w.payload.binding.author_id,
        );
        if (matches.length === 1) {
          evidence = this.provider.evidence(matches[0]);
          outcome = "RECONCILED_ACCEPTED";
        } else
          evidence = {
            reason:
              matches.length > 1
                ? "DUPLICATE_MATCHES"
                : values.complete
                  ? "NOT_FOUND_IS_NOT_PROOF"
                  : "BOUNDED_SCAN_INCOMPLETE",
          };
      } catch {
        /* Keep uncertainty, and make no provider writes. */
      }
      return this.scope("worker", "record_outcome", {
        ...args,
        attempt_id: w.attempt_id,
        digest: w.digest,
        outcome,
        evidence,
      });
    }
    if (w.state !== "QUEUED") return w;
    try {
      await this.provider.preflight(c, true);
    } catch (error) {
      return this.scope("worker", "not_sent", {
        ...args,
        reason:
          error instanceof Error &&
          error.message === "PROVIDER_PREFLIGHT_REJECTED"
            ? "PROVIDER_PREFLIGHT_REJECTED"
            : error instanceof Error && error.message === "GRANT_UNAVAILABLE"
              ? "GRANT_UNAVAILABLE"
              : "PREFLIGHT_UNAVAILABLE",
      });
    }
    const claim = z
      .object({ write: githubWrite, claimed: z.boolean() })
      .parse(
        await this.scope("worker", "claim", { ...args, digest: w.digest }),
      );
    w = claim.write;
    if (!claim.claimed) return w;
    const result = await this.provider.send(c, w);
    return this.scope("worker", "record_outcome", {
      ...args,
      attempt_id: w.attempt_id,
      digest: w.digest,
      ...result,
    });
  }
}
