import crypto from "node:crypto";
import { z } from "zod";
import { githubConnection, type GithubConnection } from "./github-contracts";
import {
  fixtureGithubToken,
  requireGithubFixture,
  type CredentialBroker,
} from "./github";
const iso = z.string().datetime({ offset: true });
export type VaultControl = (
  action: string,
  input: Record<string, unknown>,
) => Promise<unknown>;
const challengeSchema = z
  .object({
    id: z.string().uuid(),
    connection_id: z.string().uuid(),
    grant_version: z.number().int().positive(),
    expires_at: iso,
  })
  .strict();
export type BindingChallenge = z.infer<typeof challengeSchema>;
const attestationSchema = z
  .object({
    mode: z.literal("synthetic"),
    challenge_id: z.string().uuid(),
    connection_id: z.string().uuid(),
    org_id: z.string().uuid(),
    user_id: z.string().uuid(),
    session_version: z.number().int().positive(),
    grant_version: z.number().int().positive(),
    binding: githubConnection.shape.binding,
    app_id: z.literal(501),
    client_id: z.literal("fixture-client"),
    repository_selection: z.literal("selected"),
    repository_ids: z.array(z.number().int().positive()).length(1),
    metadata: z.literal("read"),
    issues: z.enum(["read", "write"]),
    issue_id: z.literal(505),
    issue_is_pull_request: z.literal(false),
    verified_account_id: z.number().int().positive(),
    verified_author_id: z.number().int().positive(),
  })
  .strict();
export interface SyntheticInstallationObserver {
  observe(
    challenge: BindingChallenge,
    connection: GithubConnection,
  ): Promise<unknown>;
}
export class FixtureInstallationObserver implements SyntheticInstallationObserver {
  async observe(ch: BindingChallenge, c: GithubConnection) {
    requireGithubFixture();
    return {
      mode: "synthetic",
      challenge_id: ch.id,
      connection_id: c.id,
      org_id: c.org_id,
      user_id: c.user_id,
      session_version: c.session_version,
      grant_version: c.grant_version,
      binding: c.binding,
      app_id: 501,
      client_id: "fixture-client",
      repository_selection: "selected",
      repository_ids: [c.binding.repository_id],
      metadata: "read",
      issues: c.allow_write ? "write" : "read",
      issue_id: 505,
      issue_is_pull_request: false,
      verified_account_id: c.binding.account_id,
      verified_author_id: c.binding.author_id,
    };
  }
}
export function verifySyntheticInstallation(
  c: GithubConnection,
  ch: BindingChallenge,
  raw: unknown,
) {
  requireGithubFixture();
  c = githubConnection.parse(c);
  ch = challengeSchema.parse(ch);
  const parsed = attestationSchema.safeParse(raw);
  if (!parsed.success) throw Error("SYNTHETIC_BINDING_REJECTED");
  const a = parsed.data;
  if (
    Date.parse(ch.expires_at) <= Date.now() ||
    ch.connection_id !== c.id ||
    ch.grant_version !== c.grant_version ||
    a.challenge_id !== ch.id ||
    a.connection_id !== c.id ||
    a.org_id !== c.org_id ||
    a.user_id !== c.user_id ||
    a.session_version !== c.session_version ||
    a.grant_version !== c.grant_version ||
    JSON.stringify(a.binding) !== JSON.stringify(c.binding) ||
    a.repository_ids[0] !== c.binding.repository_id ||
    a.verified_account_id !== c.binding.account_id ||
    a.verified_author_id !== c.binding.author_id ||
    a.issues !== (c.allow_write ? "write" : "read")
  )
    throw Error("SYNTHETIC_BINDING_REJECTED");
  return a;
}
export type LeaseScope = "issues:read" | "issues:write";
export const envelopeSchema = z
  .object({
    key_id: z
      .string()
      .regex(
        /^(synthetic-memory-key-v1|synthetic-custody-key-v[1-9][0-9]{0,5})$/,
      ),
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
    tag: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
    ciphertext: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
  })
  .strict();
export type Envelope = z.infer<typeof envelopeSchema>;
export function syntheticLeaseAAD(
  c: GithubConnection,
  scope: LeaseScope,
  expiresAt: string,
) {
  const v = githubConnection.parse(c);
  return Buffer.from(
    JSON.stringify({
      purpose: "github-synthetic-lease-v1",
      org: v.org_id,
      user: v.user_id,
      connection: v.id,
      reference: v.credential_ref,
      version: v.grant_version,
      session: v.session_version,
      binding: v.binding,
      scope,
      expires: Date.parse(expiresAt),
    }),
  );
}
/** Test-only key material, supplied by the fixture. No filesystem/env/keychain/KMS reads. */
export class SyntheticVaultCipher {
  private key: Buffer;
  private disposed = false;
  constructor(key: Uint8Array) {
    requireGithubFixture();
    if (key.length !== 32) throw Error("SYNTHETIC_VAULT_KEY_REQUIRED");
    this.key = Buffer.from(key);
  }
  seal(c: GithubConnection, scope: LeaseScope, expiresAt: string): Envelope {
    requireGithubFixture();
    if (this.disposed) throw Error("SYNTHETIC_VAULT_CLOSED");
    const iv = crypto.randomBytes(12),
      cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(syntheticLeaseAAD(c, scope, expiresAt));
    const value = Buffer.concat([
      cipher.update(fixtureGithubToken, "utf8"),
      cipher.final(),
    ]);
    return {
      key_id: "synthetic-memory-key-v1",
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      ciphertext: value.toString("base64url"),
    };
  }
  open(
    c: GithubConnection,
    scope: LeaseScope,
    expiresAt: string,
    input: unknown,
  ): typeof fixtureGithubToken {
    requireGithubFixture();
    try {
      if (this.disposed) throw Error();
      const e = envelopeSchema.parse(input);
      if (e.key_id !== "synthetic-memory-key-v1") throw Error();
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        this.key,
        Buffer.from(e.iv, "base64url"),
      );
      decipher.setAAD(syntheticLeaseAAD(c, scope, expiresAt));
      decipher.setAuthTag(Buffer.from(e.tag, "base64url"));
      const value = Buffer.concat([
        decipher.update(Buffer.from(e.ciphertext, "base64url")),
        decipher.final(),
      ]);
      try {
        if (value.toString("utf8") !== fixtureGithubToken) throw Error();
        return fixtureGithubToken;
      } finally {
        value.fill(0);
      }
    } catch {
      throw Error("SYNTHETIC_VAULT_UNAVAILABLE");
    }
  }
  dispose() {
    this.key.fill(0);
    this.disposed = true;
  }
}
export interface SyntheticLeaseCipher {
  seal(
    c: GithubConnection,
    scope: LeaseScope,
    expiresAt: string,
  ): Envelope | Promise<Envelope>;
  open(
    c: GithubConnection,
    scope: LeaseScope,
    expiresAt: string,
    input: unknown,
  ): typeof fixtureGithubToken | Promise<typeof fixtureGithubToken>;
}
const leaseSchema = z
  .object({
    reference: z.string(),
    version: z.number().int().positive(),
    scope: z.enum(["issues:read", "issues:write"]),
    expires_at: iso,
    envelope: envelopeSchema,
  })
  .strict();
export class SyntheticVaultBroker implements CredentialBroker {
  constructor(
    private control: VaultControl,
    private cipher: SyntheticLeaseCipher,
    private observer: SyntheticInstallationObserver = new FixtureInstallationObserver(),
  ) {}
  async attest(input: GithubConnection) {
    const c = githubConnection.parse(input);
    requireGithubFixture();
    const ch = challengeSchema.parse(
      await this.control("begin", {
        connection_id: c.id,
        grant_version: c.grant_version,
      }),
    );
    const proof = verifySyntheticInstallation(
      c,
      ch,
      await this.observer.observe(ch, c),
    );
    return this.control("confirm", {
      connection_id: c.id,
      grant_version: c.grant_version,
      challenge_id: ch.id,
      attestation: proof,
    });
  }
  async provision(
    input: GithubConnection,
    scope: LeaseScope,
    expiresAt: string,
  ) {
    const c = githubConnection.parse(input);
    requireGithubFixture();
    if (
      !c.credential_ref ||
      !Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now() ||
      Date.parse(expiresAt) > Date.parse(c.expires_at) ||
      (scope === "issues:write" && !c.allow_write)
    )
      throw Error("SYNTHETIC_LEASE_REJECTED");
    const envelope = await this.cipher.seal(c, scope, expiresAt);
    return this.control("seal", {
      connection_id: c.id,
      grant_version: c.grant_version,
      scope,
      expires_at: expiresAt,
      envelope,
    });
  }
  async resolve(input: GithubConnection, scope: LeaseScope) {
    const c = githubConnection.parse(input);
    requireGithubFixture();
    if (
      c.state !== "ACTIVE" ||
      !c.credential_ref ||
      Date.parse(c.expires_at) <= Date.now() ||
      (scope === "issues:write" && !c.allow_write)
    )
      throw Error("GRANT_UNAVAILABLE");
    try {
      const lease = leaseSchema.parse(
        await this.control("resolve", {
          connection_id: c.id,
          grant_version: c.grant_version,
          scope,
        }),
      );
      if (
        lease.reference !== c.credential_ref ||
        lease.version !== c.grant_version ||
        lease.scope !== scope ||
        Date.parse(lease.expires_at) <= Date.now() ||
        Date.parse(lease.expires_at) > Date.parse(c.expires_at)
      )
        throw Error();
      const token = await this.cipher.open(
        c,
        scope,
        lease.expires_at,
        lease.envelope,
      );
      // Decryption can now cross a custody boundary. Recheck current database
      // authority and exact lease after that wait; do not release an obsolete token.
      const current = leaseSchema.parse(
        await this.control("resolve", {
          connection_id: c.id,
          grant_version: c.grant_version,
          scope,
        }),
      );
      if (
        JSON.stringify(current) !== JSON.stringify(lease) ||
        Date.parse(current.expires_at) <= Date.now()
      )
        throw Error();
      return {
        reference: lease.reference,
        version: lease.version,
        expiresAt: lease.expires_at,
        token,
      };
    } catch {
      throw Error("GRANT_UNAVAILABLE");
    }
  }
  async revoke(c: GithubConnection) {
    requireGithubFixture();
    c = githubConnection.parse(c);
    return this.control("revoke", {
      connection_id: c.id,
      grant_version: c.grant_version,
    });
  }
}
