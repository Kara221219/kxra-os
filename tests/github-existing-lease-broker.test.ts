import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import util from "node:util";
import type https from "node:https";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  GithubExistingInstallationBroker,
  projectGithubIssuanceEvidence,
  githubLeaseCustodyContext,
  githubLeaseCustodyContextDigest,
  githubLeaseCustodyAAD,
  type GithubExistingLeasePorts,
  type GithubExistingLeaseRecord,
} from "../packages/connectors/github-existing-lease-broker";
import {
  githubProductionBinding,
  githubProductionLease,
  githubBindingDigest,
  githubCommentApprovalDigest,
} from "../packages/connectors/github-production-contracts";
import {
  GithubProductionExecutor,
  type GithubExecutionPorts,
} from "../packages/connectors/github-production-transport";
import { GithubInstallationObserver } from "../packages/connectors/github-installation-observer";
import { githubFake } from "./support/github-production-fake";
import { GithubRateLimitedExecutor } from "../packages/connectors/github-rate-limited-executor";
const failure = /^Error: GITHUB_EXISTING_LEASE_UNAVAILABLE$/;
const hash = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
type Scope = "issues:read" | "issues:write";
function setup() {
  let now = Math.floor(Date.now() / 1000) * 1000;
  const binding = githubProductionBinding.parse({
    provider: "github",
    api_version: "2026-03-10",
    org_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    connection_id: crypto.randomUUID(),
    session_version: 1,
    grant_version: 2,
    credential_ref: "vault:github:offline-existing-token",
    credential_version: 3,
    app_id: 901,
    installation_id: 902,
    account_id: 903,
    repository_id: 904,
    issue_id: 905,
    issue_number: 9,
    author_id: 906,
    owner: "Offline-Org",
    repo: "existing-lease",
    expires_at: new Date(now + 600000).toISOString(),
  });
  const key = crypto.randomBytes(32);
  const tokens: Record<Scope, string> = {
    "issues:read": `ghs_901_${crypto.randomBytes(80).toString("base64url")}.${crypto.randomBytes(32).toString("base64url")}`,
    "issues:write": `offline_write_${crypto.randomBytes(64).toString("hex")}`,
  };
  const wire = (scope: Scope) => ({
    issuance_id: crypto.randomUUID(),
    authenticated_app_id: binding.app_id,
    observed_at: new Date(now).toISOString(),
    request: {
      origin: "https://api.github.com",
      method: "POST",
      path: `/app/installations/${binding.installation_id}/access_tokens`,
      api_version: binding.api_version,
      body: {
        repository_ids: [binding.repository_id],
        permissions: {
          metadata: "read",
          issues: scope === "issues:read" ? "read" : "write",
        },
      },
    },
    response: {
      status: 201,
      body: {
        token: tokens[scope],
        expires_at: new Date(now + 3600000).toISOString(),
        permissions: {
          metadata: "read",
          issues: scope === "issues:read" ? "read" : "write",
        },
        repository_selection: "selected",
        repositories: [
          {
            id: binding.repository_id,
            name: binding.repo,
            full_name: `${binding.owner}/${binding.repo}`,
            owner: {
              id: binding.account_id,
              login: binding.owner,
              private_discard: "do-not-retain",
            },
            temp_clone_token: "provider-temporary-secret",
          },
        ],
        ignored_secret: "do-not-retain",
      },
    },
  });
  const records = {} as Record<Scope, GithubExistingLeaseRecord>;
  const objects = new Map<string, { version: number; bytes: string }>();
  let seals = 0;
  function install(
    scope: Scope,
    evidence = projectGithubIssuanceEvidence(binding, scope, wire(scope)),
  ) {
    const object = { object_id: crypto.randomUUID(), object_version: 1 };
    const context = githubLeaseCustodyContext(binding, scope, evidence, object),
      contextHash = githubLeaseCustodyContextDigest(context);
    const iv = crypto.randomBytes(12),
      cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(githubLeaseCustodyAAD(context));
    const ciphertext = Buffer.concat([
      cipher.update(tokens[scope], "utf8"),
      cipher.final(),
    ]);
    const bytes = JSON.stringify({
      iv: iv.toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
    });
    objects.set(object.object_id, { version: object.object_version, bytes });
    seals++;
    const record = {
      evidence: structuredClone(evidence),
      custody: {
        ...object,
        context_sha256: contextHash,
        envelope_sha256: hash(bytes),
      },
    };
    records[scope] = record;
    return record;
  }
  install("issues:read");
  install("issues:write");
  const state = {
    enabled: true,
    active: true,
    workload: true,
    reads: 0,
    opens: 0,
    advance: (n: number) => {
      now += n;
    },
    currentHook: undefined as
      undefined | ((n: number, scope: Scope, raw: any) => Promise<unknown>),
    openHook: undefined as
      | undefined
      | ((raw: any, input: any, signal: AbortSignal) => Promise<unknown>),
  };
  const ports: GithubExistingLeasePorts = {
    enabled: () => state.enabled,
    now: () => now,
    deadlineMs: 100,
    store: {
      current: async (subject, signal) => {
        signal.throwIfAborted();
        state.reads++;
        assert.ok(Object.isFrozen(subject.binding));
        if (!state.active) throw Error(tokens[subject.scope]);
        const raw = {
          purpose: subject.purpose,
          active: true,
          binding_sha256: githubBindingDigest(binding),
          scope: subject.scope,
          record: records[subject.scope],
        };
        return state.currentHook
          ? state.currentHook(state.reads, subject.scope, raw)
          : raw;
      },
    },
    custody: {
      open: async (input, signal) => {
        state.opens++;
        assert.ok(Object.isFrozen(input.context.binding));
        assert.ok(Object.isFrozen(input));
        if (!state.workload || signal.aborted)
          throw Error(tokens["issues:read"]);
        const object = objects.get(input.context.object_id);
        if (
          !object ||
          object.version !== input.context.object_version ||
          hash(object.bytes) !== input.envelope_sha256
        )
          throw Error("object unavailable");
        assert.equal(
          githubLeaseCustodyContextDigest(input.context),
          input.context_sha256,
        );
        const envelope = JSON.parse(object.bytes),
          decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            key,
            Buffer.from(envelope.iv, "base64url"),
          );
        decipher.setAAD(githubLeaseCustodyAAD(input.context));
        decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
        const token = Buffer.concat([
          decipher.update(Buffer.from(envelope.ciphertext, "base64url")),
          decipher.final(),
        ]).toString("utf8");
        const raw = {
          object_id: input.context.object_id,
          object_version: input.context.object_version,
          context_sha256: input.context_sha256,
          envelope_sha256: input.envelope_sha256,
          token,
        };
        return state.openHook ? state.openHook(raw, input, signal) : raw;
      },
    },
  };
  const make = () => new GithubExistingInstallationBroker(ports);
  const resolve = (
    scope: Scope = "issues:read",
    signal = new AbortController().signal,
  ) => make().resolve({ binding, scope }, signal);
  return {
    binding,
    tokens,
    key,
    wire,
    records,
    objects,
    install,
    seals: () => seals,
    state,
    ports,
    make,
    resolve,
    now: () => now,
  };
}

test("issuance projection narrows explicit request/201 metadata and drops every plaintext token", () => {
  const f = setup(),
    exchange = f.wire("issues:read"),
    e = projectGithubIssuanceEvidence(f.binding, "issues:read", exchange);
  assert.equal(e.token_sha256, hash(f.tokens["issues:read"]));
  assert.equal(e.lease_expires_at, f.binding.expires_at);
  assert.equal(e.response.expires_at, exchange.response.body.expires_at);
  const serialized = JSON.stringify(e);
  for (const secret of [
    f.tokens["issues:read"],
    "provider-temporary-secret",
    "do-not-retain",
  ])
    assert.ok(!serialized.includes(secret));
  assert.ok(Object.isFrozen(e.request.body.permissions));
  assert.ok(Object.isFrozen(e.response.repositories[0].owner));
});

test("real AES-GCM existing custody resolves read and write without refresh and redacts ordinary inspection", async () => {
  const f = setup();
  for (const scope of ["issues:read", "issues:write"] as const) {
    const lease = await f.resolve(scope);
    assert.equal(lease.token, f.tokens[scope]);
    assert.equal(lease.permissions.issues, scope.split(":")[1]);
    assert.deepEqual(githubProductionLease.parse(lease), {
      mode: "GITHUB_APP_INSTALLATION",
      binding_sha256: githubBindingDigest(f.binding),
      credential_ref: f.binding.credential_ref,
      credential_version: 3,
      app_id: 901,
      installation_id: 902,
      repository_ids: [904],
      permissions: { metadata: "read", issues: scope.split(":")[1] },
      expires_at: f.binding.expires_at,
      token: f.tokens[scope],
    });
    assert.ok(!JSON.stringify(lease).includes(lease.token));
    assert.ok(!util.inspect(lease).includes(lease.token));
    assert.ok(Object.isFrozen(lease.permissions));
  }
  assert.equal(f.state.reads, 4);
  assert.equal(f.state.opens, 2);
  assert.equal(f.seals(), 2);
  assert.ok(!util.inspect(f.make()).includes(f.binding.credential_ref));
});

const badExchanges: [string, (e: any) => void][] = [
  [
    "origin",
    (e) => {
      e.request.origin = "https://attacker.invalid";
    },
  ],
  [
    "method",
    (e) => {
      e.request.method = "GET";
    },
  ],
  [
    "endpoint",
    (e) => {
      e.request.path += "?all=true";
    },
  ],
  [
    "API version",
    (e) => {
      e.request.api_version = "2022-11-28";
    },
  ],
  [
    "App identity",
    (e) => {
      e.authenticated_app_id++;
    },
  ],
  [
    "installation",
    (e) => {
      e.request.path = "/app/installations/999/access_tokens";
    },
  ],
  [
    "request missing repository",
    (e) => {
      delete e.request.body.repository_ids;
    },
  ],
  [
    "request broad repositories",
    (e) => {
      e.request.body.repository_ids.push(999);
    },
  ],
  [
    "request wrong repository",
    (e) => {
      e.request.body.repository_ids = [999];
    },
  ],
  [
    "request missing permission",
    (e) => {
      delete e.request.body.permissions;
    },
  ],
  [
    "request extra permission",
    (e) => {
      e.request.body.permissions.contents = "read";
    },
  ],
  [
    "request broader scope",
    (e) => {
      e.request.body.permissions.issues = "write";
    },
  ],
  [
    "request token header",
    (e) => {
      e.request.authorization = "offline-private";
    },
  ],
  [
    "status",
    (e) => {
      e.response.status = 200;
    },
  ],
  [
    "response all repositories",
    (e) => {
      e.response.body.repository_selection = "all";
    },
  ],
  [
    "response missing repositories",
    (e) => {
      delete e.response.body.repositories;
    },
  ],
  [
    "response multiple repositories",
    (e) => {
      e.response.body.repositories.push(
        structuredClone(e.response.body.repositories[0]),
      );
    },
  ],
  [
    "response wrong repository",
    (e) => {
      e.response.body.repositories[0].id++;
    },
  ],
  [
    "response wrong owner",
    (e) => {
      e.response.body.repositories[0].owner.id++;
    },
  ],
  [
    "response owner rename",
    (e) => {
      e.response.body.repositories[0].owner.login += "x";
    },
  ],
  [
    "response repository rename",
    (e) => {
      e.response.body.repositories[0].name += "x";
    },
  ],
  [
    "response full name",
    (e) => {
      e.response.body.repositories[0].full_name += "x";
    },
  ],
  [
    "response broader permission",
    (e) => {
      e.response.body.permissions.issues = "write";
    },
  ],
  [
    "response missing metadata",
    (e) => {
      delete e.response.body.permissions.metadata;
    },
  ],
  [
    "response extra permission",
    (e) => {
      e.response.body.permissions.contents = "read";
    },
  ],
  [
    "invalid token",
    (e) => {
      e.response.body.token += "\r\n";
    },
  ],
  [
    "empty token",
    (e) => {
      e.response.body.token = "";
    },
  ],
  [
    "oversized token",
    (e) => {
      e.response.body.token = "x".repeat(8001);
    },
  ],
  [
    "expiry before issuance",
    (e) => {
      e.response.body.expires_at = e.observed_at;
    },
  ],
  [
    "excess token lifetime",
    (e) => {
      e.response.body.expires_at = new Date(
        Date.parse(e.observed_at) + 3660001,
      ).toISOString();
    },
  ],
  [
    "oversized raw exchange",
    (e) => {
      e.response.body.discard = "x".repeat(262145);
    },
  ],
];
for (const [name, mutate] of badExchanges)
  test(`issuance evidence refuses ${name}`, () => {
    const f = setup(),
      e = f.wire("issues:read");
    mutate(e);
    assert.throws(
      () => projectGithubIssuanceEvidence(f.binding, "issues:read", e),
      failure,
    );
  });

for (const mode of [
  "default",
  "disabled",
  "aborted",
  "expired",
  "future-issued",
  "clock-invalid",
])
  test(`${mode} denies before custody`, async () => {
    const f = setup(),
      controller = new AbortController();
    if (mode === "default") {
      delete f.ports.enabled;
      assert.notEqual(
        process.env.KXRA_GITHUB_EXISTING_LEASE_BROKER_ENABLED,
        "true",
      );
    }
    if (mode === "disabled") f.state.enabled = false;
    if (mode === "aborted") controller.abort();
    if (mode === "expired") f.state.advance(600000);
    if (mode === "future-issued")
      f.records["issues:read"].evidence.observed_at = new Date(
        f.now() + 1,
      ).toISOString();
    if (mode === "clock-invalid") f.ports.now = () => NaN;
    await assert.rejects(f.resolve("issues:read", controller.signal), failure);
    assert.equal(f.state.opens, 0);
  });

const recordMutations: [string, (f: ReturnType<typeof setup>) => void][] = [
  [
    "binding digest",
    (f) => {
      f.records["issues:read"].evidence.binding_sha256 = "0".repeat(64);
    },
  ],
  [
    "scope",
    (f) => {
      f.records["issues:read"].evidence.scope = "issues:write";
    },
  ],
  [
    "object context",
    (f) => {
      f.records["issues:read"].custody.context_sha256 = "0".repeat(64);
    },
  ],
  [
    "object alias",
    (f) => {
      (f.records["issues:read"].custody as any).object_version = "latest";
    },
  ],
  [
    "object changed",
    (f) => {
      f.records["issues:read"].custody.object_id = crypto.randomUUID();
    },
  ],
  [
    "envelope changed",
    (f) => {
      f.records["issues:read"].custody.envelope_sha256 = "0".repeat(64);
    },
  ],
  [
    "unrecorded plaintext",
    (f) => {
      (f.records["issues:read"] as any).token = f.tokens["issues:read"];
    },
  ],
];
for (const [name, mutate] of recordMutations)
  test(`existing record refuses ${name}`, async () => {
    const f = setup();
    mutate(f);
    await assert.rejects(f.resolve(), failure);
    assert.equal(f.seals(), 2);
  });

for (const key of ["purpose", "active", "binding_sha256", "scope"])
  test(`current authority rejects mismatched ${key}`, async () => {
    const f = setup();
    f.state.currentHook = async (_, __, raw) => ({
      ...raw,
      [key]:
        key === "active"
          ? false
          : key === "binding_sha256"
            ? "0".repeat(64)
            : "WRONG",
    });
    await assert.rejects(f.resolve(), failure);
    assert.equal(f.state.opens, 0);
  });

for (const key of [
  "object_id",
  "object_version",
  "context_sha256",
  "envelope_sha256",
  "token",
  "extra",
])
  test(`custody response rejects substituted ${key}`, async () => {
    const f = setup();
    f.state.openHook = async (raw) => ({
      ...raw,
      [key]:
        key === "object_id"
          ? crypto.randomUUID()
          : key === "object_version"
            ? 99
            : key === "token"
              ? f.tokens["issues:write"]
              : "0".repeat(64),
    });
    await assert.rejects(f.resolve(), failure);
    assert.equal(f.state.reads, 1);
  });

for (const mode of [
  "revoke",
  "rotation",
  "envelope",
  "expiry",
  "disable",
  "abort",
  "snapshot-mutation",
  "clock-regression",
])
  test(`custody wait ${mode} cannot release a stale token`, async () => {
    const f = setup(),
      controller = new AbortController();
    f.state.openHook = async (raw) => {
      if (mode === "revoke") f.state.active = false;
      if (mode === "rotation") f.install("issues:read");
      if (mode === "envelope")
        f.records["issues:read"].custody.envelope_sha256 = "0".repeat(64);
      if (mode === "expiry") f.state.advance(600000);
      if (mode === "disable") f.state.enabled = false;
      if (mode === "abort") controller.abort();
      if (mode === "snapshot-mutation")
        f.records["issues:read"].evidence.issuance_id = crypto.randomUUID();
      if (mode === "clock-regression") f.state.advance(-1);
      return raw;
    };
    await assert.rejects(f.resolve("issues:read", controller.signal), failure);
  });

test("scope/session/grant/credential/tenant substitutions change the exact custody context", async () => {
  const f = setup(),
    original = f.records["issues:read"],
    object = {
      object_id: original.custody.object_id,
      object_version: original.custody.object_version,
    };
  for (const field of [
    "org_id",
    "user_id",
    "connection_id",
    "session_version",
    "grant_version",
    "credential_version",
    "credential_ref",
    "expires_at",
  ] as const) {
    const modified = {
      ...f.binding,
      [field]: field.endsWith("_id")
        ? crypto.randomUUID()
        : field.endsWith("version")
          ? 9
          : field === "expires_at"
            ? new Date(f.now() + 300000).toISOString()
            : "vault:github:other",
    };
    assert.throws(
      () =>
        githubLeaseCustodyContext(
          modified,
          "issues:read",
          original.evidence,
          object,
        ),
      failure,
    );
    await assert.rejects(
      f
        .make()
        .resolve(
          { binding: modified, scope: "issues:read" },
          new AbortController().signal,
        ),
      failure,
    );
  }
  assert.throws(
    () =>
      githubLeaseCustodyContext(
        f.binding,
        "issues:write",
        original.evidence,
        object,
      ),
    failure,
  );
  assert.equal(f.state.opens, 0);
});

test("actual AES-GCM detects ciphertext/key loss and does not provision a replacement", async () => {
  for (const mode of ["ciphertext", "key", "workload"]) {
    const f = setup(),
      record = f.records["issues:read"];
    if (mode === "key") f.key.fill(0);
    if (mode === "workload") f.state.workload = false;
    if (mode === "ciphertext") {
      const object = f.objects.get(record.custody.object_id)!;
      const envelope = JSON.parse(object.bytes);
      envelope.tag = crypto.randomBytes(16).toString("base64url");
      object.bytes = JSON.stringify(envelope);
      record.custody.envelope_sha256 = hash(object.bytes);
    }
    await assert.rejects(f.resolve(), failure);
    assert.equal(f.seals(), 2);
  }
});

test("broker reconstruction has no token cache; intact custody opens again, loss denies", async () => {
  const f = setup();
  assert.equal((await f.resolve()).token, f.tokens["issues:read"]);
  assert.equal((await f.resolve()).token, f.tokens["issues:read"]);
  assert.equal(f.state.opens, 2);
  f.key.fill(0);
  await assert.rejects(f.resolve(), failure);
  assert.equal(f.state.opens, 3);
  assert.equal(f.seals(), 2);
});

for (const stage of ["first-store", "custody", "final-store"])
  test(`deadline at ${stage} ignores late resolution without token release`, async () => {
    const f = setup();
    f.ports.deadlineMs = 15;
    let release!: () => void;
    if (stage === "custody")
      f.state.openHook = async (raw) => {
        await new Promise<void>((r) => {
          release = r;
        });
        return raw;
      };
    else
      f.state.currentHook = async (n, _, raw) => {
        if (n === (stage === "first-store" ? 1 : 2))
          await new Promise<void>((r) => {
            release = r;
          });
        return raw;
      };
    await assert.rejects(f.resolve(), failure);
    assert.ok(release);
    release();
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(f.state.reads, stage === "final-store" ? 2 : 1);
    assert.equal(f.state.opens, stage === "first-store" ? 0 : 1);
  });

test("independent concurrent reads are scoped and cancellation cannot poison a surviving call", async () => {
  const f = setup(),
    broker = f.make(),
    cancelled = new AbortController();
  f.state.openHook = async (raw, input) => {
    if (input.context.scope === "issues:read") cancelled.abort();
    return raw;
  };
  const results = await Promise.allSettled([
    broker.resolve(
      { binding: f.binding, scope: "issues:read" },
      cancelled.signal,
    ),
    broker.resolve(
      { binding: f.binding, scope: "issues:write" },
      new AbortController().signal,
    ),
  ]);
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "fulfilled");
  if (results[1].status === "fulfilled")
    assert.equal(results[1].value.token, f.tokens["issues:write"]);
});

function executionPorts(f: ReturnType<typeof setup>) {
  const fake = githubFake(f.binding),
    seen: string[] = [];
  const ports: GithubExecutionPorts = {
    ...fake,
    enabled: () => true,
    now: f.now,
    broker: f.make(),
    lookup: async () => [{ address: "8.8.8.8" }],
    request: ((url: any, options: any, cb: any) => {
      seen.push(options.headers.authorization);
      return (fake.request as any)(url, options, cb);
    }) as typeof https.request,
    authority: {
      current: async (i) => ({
        state: i.operation.kind === "COMMENT" ? "DISPATCHING" : "ACTIVE",
        binding_sha256: i.binding_sha256,
        operation_sha256: i.operation_sha256,
        ...(i.operation.kind === "COMMENT"
          ? {
              write_id: i.operation.write_id,
              attempt_id: i.operation.attempt_id,
            }
          : {}),
      }),
      consume: async (i) => {
        if (i.operation.kind !== "COMMENT") throw Error("not write");
        return {
          consumed: true,
          binding_sha256: i.binding_sha256,
          operation_sha256: i.operation_sha256,
          write_id: i.operation.write_id,
          attempt_id: i.operation.attempt_id,
        };
      },
    },
  };
  return { fake, seen, ports };
}
test("existing executor composes actual evidence/AEAD broker with exact read and one approved write", async () => {
  const f = setup(),
    { fake, seen, ports } = executionPorts(f),
    e = new GithubProductionExecutor(f.binding, ports);
  assert.equal((await e.execute({ kind: "REPOSITORY" })).outcome, "READ");
  assert.equal((await e.execute({ kind: "ISSUE" })).outcome, "READ");
  const fields = {
    write_id: crypto.randomUUID(),
    body: "Offline broker composition only",
    approved_at: new Date(f.now()).toISOString(),
    expires_at: new Date(f.now() + 60000).toISOString(),
  };
  const op = {
    kind: "COMMENT",
    ...fields,
    attempt_id: crypto.randomUUID(),
    approval_digest: githubCommentApprovalDigest(f.binding, fields),
  };
  assert.equal((await e.execute(op)).outcome, "ACCEPTED");
  assert.equal((await e.execute(op)).outcome, "REFUSED");
  assert.equal(fake.posts(), 1);
  assert.deepEqual(seen, [
    `Bearer ${f.tokens["issues:read"]}`,
    `Bearer ${f.tokens["issues:read"]}`,
    `Bearer ${f.tokens["issues:write"]}`,
  ]);
  assert.equal(f.seals(), 2);
});

test("revocation during custody blocks existing executor before any DNS/HTTP", async () => {
  const f = setup(),
    { seen, ports } = executionPorts(f);
  let lookups = 0;
  ports.lookup = async () => {
    lookups++;
    return [{ address: "8.8.8.8" }];
  };
  f.state.openHook = async (raw) => {
    f.state.active = false;
    return raw;
  };
  assert.equal(
    (
      await new GithubProductionExecutor(f.binding, ports).execute({
        kind: "REPOSITORY",
      })
    ).outcome,
    "NOT_EXECUTED",
  );
  assert.equal(lookups + seen.length, 0);
});

test("existing observer consumes the same broker without exposing the installation token", async () => {
  const f = setup(),
    b = f.binding,
    app = {
      id: b.app_id,
      slug: "offline-app",
      client_id: "Iv1.offline",
      permissions: { metadata: "read", issues: "write" },
    },
    account = { id: b.account_id, login: b.owner, type: "Organization" };
  const installation = {
    id: b.installation_id,
    app_id: b.app_id,
    app_slug: app.slug,
    account,
    target_id: b.account_id,
    target_type: "Organization",
    repository_selection: "selected",
    permissions: app.permissions,
    suspended_at: null,
    suspended_by: null,
  };
  const replies = [
    app,
    installation,
    installation,
    {
      id: b.repository_id,
      name: b.repo,
      full_name: `${b.owner}/${b.repo}`,
      owner: account,
      archived: false,
      disabled: false,
    },
    { id: b.author_id, login: `${app.slug}[bot]`, type: "Bot" },
  ];
  const jwt = `${Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url")}.${Buffer.from(JSON.stringify({ iss: app.client_id, iat: f.now() / 1000 - 60, exp: f.now() / 1000 + 300 })).toString("base64url")}.${crypto.randomBytes(32).toString("base64url")}`;
  let calls = 0;
  const observer = new GithubInstallationObserver(b, {
    enabled: () => true,
    now: f.now,
    installationBroker: f.make(),
    appBroker: {
      resolve: async (s) => ({
        mode: "GITHUB_APP_JWT",
        binding_sha256: s.binding_sha256,
        app_id: b.app_id,
        client_id: app.client_id,
        expires_at: new Date(f.now() + 300000).toISOString(),
        jwt,
      }),
    },
    authority: {
      current: async (s) => ({
        purpose: s.purpose,
        active: true,
        binding_sha256: s.binding_sha256,
      }),
    },
    lookup: async () => [{ address: "8.8.8.8" }],
    request: ((_url: any, options: any, cb: any) => {
      const n = calls++;
      assert.equal(
        options.headers.authorization,
        n < 3
          ? `Bearer ${jwt}`
          : n === 3
            ? `Bearer ${f.tokens["issues:read"]}`
            : undefined,
      );
      const req = new EventEmitter() as any;
      req.destroy = () => req;
      req.end = () => {
        queueMicrotask(() => {
          const r = Readable.from([
            Buffer.from(JSON.stringify(replies[n])),
          ]) as any;
          r.statusCode = 200;
          r.complete = true;
          r.headers = { "content-type": "application/json" };
          cb(r);
        });
        return req;
      };
      return req;
    }) as typeof https.request,
  });
  const result = await observer.observe();
  assert.equal(result.outcome, "OBSERVED");
  assert.equal(calls, 5);
  assert.equal(f.state.opens, 1);
  assert.ok(!JSON.stringify(result).includes(f.tokens["issues:read"]));
});

test("valid metadata rebind with recomputed hash cannot decrypt ciphertext under a different AAD", async () => {
  const f = setup(),
    record = f.records["issues:read"];
  record.evidence.issuance_id = crypto.randomUUID();
  const context = githubLeaseCustodyContext(
    f.binding,
    "issues:read",
    record.evidence,
    {
      object_id: record.custody.object_id,
      object_version: record.custody.object_version,
    },
  );
  record.custody.context_sha256 = githubLeaseCustodyContextDigest(context);
  await assert.rejects(f.resolve(), failure);
  assert.equal(f.state.opens, 1);
  assert.equal(f.state.reads, 1);
  assert.equal(f.seals(), 2);
});

for (const stage of ["custody", "final-store"])
  test(`monotonic deadline in ${stage} rejects before timer dispatch`, async () => {
    const f = setup();
    let elapsed = 0;
    f.ports.monotonic = () => elapsed;
    if (stage === "custody")
      f.state.openHook = async (raw) => {
        elapsed = 101;
        return raw;
      };
    else
      f.state.currentHook = async (n, _, raw) => {
        if (n === 2) elapsed = 101;
        return raw;
      };
    await assert.rejects(f.resolve(), failure);
    assert.equal(f.state.opens, 1);
    assert.equal(f.state.reads, stage === "custody" ? 1 : 2);
  });

test("bounded store validation uses one captured JSON snapshot, not later original accessors", async () => {
  const f = setup();
  let accessed = 0;
  f.state.currentHook = async (_, __, raw) => {
    const value = { ...raw };
    Object.defineProperty(value, "record", {
      get: () => {
        accessed++;
        throw Error("original accessor must not be parsed");
      },
    });
    Object.defineProperty(value, "toJSON", {
      value: () => structuredClone(raw),
    });
    return value;
  };
  assert.equal((await f.resolve()).token, f.tokens["issues:read"]);
  assert.equal(accessed, 0);
});

test("context digest validation has generic errors and canonical order", () => {
  const f = setup(),
    r = f.records["issues:read"],
    c = githubLeaseCustodyContext(f.binding, "issues:read", r.evidence, {
      object_id: r.custody.object_id,
      object_version: r.custody.object_version,
    });
  assert.equal(
    githubLeaseCustodyContextDigest(
      Object.fromEntries(Object.entries(c).reverse()) as any,
    ),
    r.custody.context_sha256,
  );
  assert.throws(
    () =>
      githubLeaseCustodyContextDigest({
        ...c,
        get binding() {
          throw Error(f.tokens["issues:read"]);
        },
      } as any),
    failure,
  );
});

test("rate-gated executor uses the existing broker with no refresh or alternate token path", async () => {
  const f = setup(),
    { seen, fake, ports } = executionPorts(f),
    realm = crypto.randomUUID();
  let reserves = 0,
    completions = 0;
  const e = new GithubRateLimitedExecutor(
    f.binding,
    ports,
    {
      reserve: async (input) => {
        reserves++;
        return { ...input, realm, epoch: 1, reserved: true };
      },
      complete: async (r) => {
        completions++;
        return {
          realm,
          epoch: 1,
          reservation_id: r.reservation_id,
          completed: true,
          held: false,
        };
      },
    },
    { enabled: () => true },
  );
  assert.equal(
    (await e.execute({ kind: "REPOSITORY" })).execution?.outcome,
    "READ",
  );
  assert.equal((await e.execute({ kind: "ISSUE" })).execution?.outcome, "READ");
  const fields = {
    write_id: crypto.randomUUID(),
    body: "Offline combined broker and rate test",
    approved_at: new Date(f.now()).toISOString(),
    expires_at: new Date(f.now() + 60000).toISOString(),
  };
  assert.equal(
    (
      await e.execute({
        kind: "COMMENT",
        ...fields,
        attempt_id: crypto.randomUUID(),
        approval_digest: githubCommentApprovalDigest(f.binding, fields),
      })
    ).execution?.outcome,
    "ACCEPTED",
  );
  assert.equal(reserves, 3);
  assert.equal(completions, 3);
  assert.equal(f.state.opens, 3);
  assert.equal(f.seals(), 2);
  assert.equal(fake.posts(), 1);
  assert.equal(seen.at(-1), `Bearer ${f.tokens["issues:write"]}`);
});
