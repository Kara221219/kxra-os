import crypto from "node:crypto";
import { z } from "zod";
import { githubConnection, type GithubConnection } from "./github-contracts";
import { requireGithubFixture, fixtureGithubToken } from "./github";
import {
  envelopeSchema,
  syntheticLeaseAAD,
  type Envelope,
  type LeaseScope,
  type SyntheticLeaseCipher,
} from "./github-vault-synthetic";
export const custodyContext = z
  .object({
    connection: githubConnection,
    scope: z.enum(["issues:read", "issues:write"]),
    expires_at: z.string().datetime({ offset: true }),
  })
  .strict();
export const custodyRequest = z
  .object({
    mode: z.literal("synthetic"),
    request_id: z.string().uuid(),
    context: custodyContext,
    envelope: envelopeSchema.optional(),
  })
  .strict();
export function checkedCustodyContext(
  c: GithubConnection,
  scope: LeaseScope,
  expiresAt: string,
) {
  requireGithubFixture();
  const v = custodyContext.parse({
      connection: c,
      scope,
      expires_at: expiresAt,
    }),
    n = Date.parse(v.expires_at);
  if (
    v.connection.state !== "ACTIVE" ||
    v.connection.credential_ref !==
      `fixture:github:${v.connection.id}:v${v.connection.grant_version}` ||
    !Number.isFinite(n) ||
    n <= Date.now() ||
    n > Date.parse(v.connection.expires_at) ||
    (v.scope === "issues:write" && !v.connection.allow_write)
  )
    throw Error("SYNTHETIC_CUSTODY_UNAVAILABLE");
  return v;
}
export function custodyContextDigest(
  c: GithubConnection,
  s: LeaseScope,
  e: string,
) {
  return crypto
    .createHash("sha256")
    .update(syntheticLeaseAAD(c, s, e))
    .digest("hex");
}
const failure = () => Error("SYNTHETIC_CUSTODY_UNAVAILABLE");
/** Local fake custody only; never accepts a managed-service or provider endpoint. */
export class LoopbackSyntheticCustody implements SyntheticLeaseCipher {
  private origin: string;
  constructor(
    origin: string,
    private authorization: string,
  ) {
    requireGithubFixture();
    const u = new URL(origin);
    if (
      u.protocol !== "http:" ||
      u.hostname !== "127.0.0.1" ||
      !u.port ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash ||
      !/^[A-Za-z0-9_-]{43}$/.test(authorization)
    )
      throw failure();
    this.origin = u.origin;
  }
  private async request(
    action: "seal" | "open",
    c: GithubConnection,
    scope: LeaseScope,
    expiresAt: string,
    envelope?: unknown,
  ) {
    requireGithubFixture();
    const context = checkedCustodyContext(c, scope, expiresAt);
    try {
      const request_id = crypto.randomUUID(),
        body = JSON.stringify({
          mode: "synthetic",
          request_id,
          context,
          ...(envelope === undefined
            ? {}
            : { envelope: envelopeSchema.parse(envelope) }),
        });
      if (Buffer.byteLength(body) > 8192) throw failure();
      const signal = AbortSignal.timeout(1500),
        response = await fetch(`${this.origin}/v1/synthetic/leases/${action}`, {
          method: "POST",
          redirect: "manual",
          signal,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.authorization}`,
          },
          body,
        });
      if (
        response.status !== 200 ||
        response.headers
          .get("content-type")
          ?.split(";")[0]
          .trim()
          .toLowerCase() !== "application/json" ||
        !response.body
      )
        throw failure();
      const reader = response.body.getReader();
      let length = 0,
        reads = 0;
      const chunks: Uint8Array[] = [];
      try {
        while (true) {
          if (++reads > 512) throw failure();
          const part = await reader.read();
          if (signal.aborted) throw failure();
          if (part.done) break;
          length += part.value.byteLength;
          if (length > 2048) throw failure();
          chunks.push(part.value.slice());
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const base = {
        mode: z.literal("synthetic"),
        request_id: z.literal(request_id),
        context_sha256: z.literal(custodyContextDigest(c, scope, expiresAt)),
      };
      if (action === "seal")
        return z
          .object({ ...base, envelope: envelopeSchema })
          .strict()
          .parse(raw);
      return z
        .object({ ...base, token: z.literal(fixtureGithubToken) })
        .strict()
        .parse(raw);
    } catch {
      throw failure();
    }
  }
  async seal(c: GithubConnection, s: LeaseScope, e: string): Promise<Envelope> {
    const r = await this.request("seal", c, s, e);
    if (!("envelope" in r)) throw failure();
    if (!/^synthetic-custody-key-v[1-9][0-9]{0,5}$/.test(r.envelope.key_id))
      throw failure();
    return r.envelope;
  }
  async open(
    c: GithubConnection,
    s: LeaseScope,
    e: string,
    input: unknown,
  ): Promise<typeof fixtureGithubToken> {
    const envelope = envelopeSchema.parse(input);
    if (!/^synthetic-custody-key-v[1-9][0-9]{0,5}$/.test(envelope.key_id))
      throw failure();
    const r = await this.request("open", c, s, e, envelope);
    if (!("token" in r)) throw failure();
    return r.token;
  }
}
