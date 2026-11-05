import { syntheticRollbackFence } from "./support/github-production-fake";
import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import https from "node:https";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  GithubProductionExecutor,
  type GithubExecutionPorts,
} from "../packages/connectors/github-production-transport";
import {
  githubProductionBinding,
  githubBindingDigest,
  githubCommentApprovalDigest,
  type GithubProductionOperation,
} from "../packages/connectors/github-production-contracts";
type Reply = {
  status: number;
  data?: unknown;
  bytes?: Buffer;
  headers?: Record<string, any>;
  hang?: boolean;
  error?: boolean;
};
const uuid = () => crypto.randomUUID();
function setup() {
  let now = Date.now();
  const binding = githubProductionBinding.parse({
    provider: "github",
    api_version: "2026-03-10",
    org_id: uuid(),
    user_id: uuid(),
    connection_id: uuid(),
    session_version: 1,
    grant_version: 3,
    credential_ref: "vault:github:approved-reference",
    credential_version: 2,
    app_id: 901,
    installation_id: 902,
    account_id: 903,
    repository_id: 904,
    issue_id: 905,
    issue_number: 7,
    author_id: 906,
    owner: "Example-Org",
    repo: "work-plans",
    expires_at: new Date(now + 600000).toISOString(),
  });
  const token = "offline_generated_" + crypto.randomBytes(16).toString("hex");
  const requests: any[] = [],
    consumed = new Set<string>();
  const state = {
    authorityCalls: 0,
    brokerCalls: 0,
    lookups: 0,
    posts: 0,
    invalid: false,
    enabled: true,
    authorityHook: undefined as undefined | ((input: any) => unknown),
    brokerHook: undefined as undefined | ((lease: any) => unknown),
    lookupHook: undefined as undefined | (() => Promise<{ address: string }[]>),
    responseHook: undefined as undefined | ((r: any) => unknown),
    consumeHook: undefined as undefined | ((input: any) => unknown),
    respond: undefined as
      | undefined
      | ((r: any) => {
          status: number;
          data?: unknown;
          bytes?: Buffer;
          headers?: Record<string, any>;
          hang?: boolean;
          error?: boolean;
        }),
    clock: () => now,
    advance: (n: number) => {
      now += n;
    },
  };
  const ack = (i: any) => ({
    state: i.operation.kind === "COMMENT" ? "DISPATCHING" : "ACTIVE",
    binding_sha256: i.binding_sha256,
    operation_sha256: i.operation_sha256,
    ...(i.operation.kind === "COMMENT"
      ? { write_id: i.operation.write_id, attempt_id: i.operation.attempt_id }
      : {}),
  });
  const ports: GithubExecutionPorts = {
    rollbackFence: syntheticRollbackFence(),
    enabled: () => state.enabled,
    now: state.clock,
    deadlineMs: 1000,
    authority: {
      current: async (i) => {
        state.authorityCalls++;
        if (state.invalid) throw Error("authority withdrawn");
        return state.authorityHook ? await state.authorityHook(i) : ack(i);
      },
      consume: async (i) => {
        if (state.consumeHook) return await state.consumeHook(i);
        const o = i.operation;
        if (o.kind !== "COMMENT" || consumed.has(o.attempt_id))
          throw Error("attempt consumed");
        consumed.add(o.attempt_id);
        return {
          consumed: true,
          binding_sha256: i.binding_sha256,
          operation_sha256: i.operation_sha256,
          write_id: o.write_id,
          attempt_id: o.attempt_id,
        };
      },
    },
    broker: {
      resolve: async ({ scope }) => {
        state.brokerCalls++;
        const lease = {
          mode: "GITHUB_APP_INSTALLATION",
          binding_sha256: githubBindingDigest(binding),
          credential_ref: binding.credential_ref,
          credential_version: binding.credential_version,
          app_id: binding.app_id,
          installation_id: binding.installation_id,
          repository_ids: [binding.repository_id],
          permissions: {
            metadata: "read",
            issues: scope === "issues:write" ? "write" : "read",
          },
          expires_at: new Date(now + 300000).toISOString(),
          token,
        };
        return state.brokerHook ? await state.brokerHook(lease) : lease;
      },
    },
    lookup: async (host) => {
      assert.equal(host, "api.github.com");
      state.lookups++;
      return state.lookupHook ? state.lookupHook() : [{ address: "8.8.8.8" }];
    },
    request: ((url: any, options: any, callback: any) => {
      const req = new EventEmitter() as any;
      req.destroyed = false;
      req.destroy = () => {
        req.destroyed = true;
        return req;
      };
      req.end = (body?: string) => {
        const record = { url: new URL(url), options, body };
        requests.push(record);
        if (options.method === "POST") state.posts++;
        queueMicrotask(() => {
          const reply = state.respond?.(record) ?? defaultReply(record);
          if (reply.error) {
            req.emit("error", Error(token));
            return;
          }
          if (reply.hang) return;
          const bytes = reply.bytes ?? Buffer.from(JSON.stringify(reply.data));
          const r = Readable.from([bytes]) as any;
          r.statusCode = reply.status;
          r.headers = { "content-type": "application/json", ...reply.headers };
          state.responseHook?.(record);
          callback(r);
        });
        return req;
      };
      return req;
    }) as typeof https.request,
  };
  const repoUrl = `https://api.github.com/repos/${binding.owner}/${binding.repo}`,
    issueUrl = `${repoUrl}/issues/${binding.issue_number}`;
  function defaultReply(r: any): Reply {
    return r.options.method === "POST"
      ? {
          status: 201,
          data: {
            id: 801,
            body: JSON.parse(r.body).body,
            user: { id: binding.author_id, type: "Bot" },
            issue_url: issueUrl,
            created_at: new Date(now).toISOString(),
          },
        }
      : r.url.pathname.endsWith("/comments")
        ? {
            status: 200,
            data: [
              {
                id: 802,
                body: "Untrusted external comment",
                user: { id: 707, type: "User" },
                issue_url: issueUrl,
                created_at: new Date(now).toISOString(),
              },
            ],
          }
        : r.url.pathname.includes("/issues/")
          ? {
              status: 200,
              data: {
                id: binding.issue_id,
                number: binding.issue_number,
                url: issueUrl,
                repository_url: repoUrl,
              },
            }
          : {
              status: 200,
              data: {
                id: binding.repository_id,
                owner: { id: binding.account_id, login: binding.owner },
                full_name: `${binding.owner}/${binding.repo}`,
                temp_clone_token: token,
              },
            };
  }
  const make = () => new GithubProductionExecutor(binding, ports);
  const approval = () => {
    const fields = {
      write_id: uuid(),
      body: "Exact approved offline comment",
      approved_at: new Date(now).toISOString(),
      expires_at: new Date(now + 60000).toISOString(),
    };
    return {
      kind: "COMMENT",
      ...fields,
      attempt_id: uuid(),
      approval_digest: githubCommentApprovalDigest(binding, fields),
    } as const;
  };
  const preflight = async (e: GithubProductionExecutor) => {
    assert.equal((await e.execute({ kind: "REPOSITORY" })).outcome, "READ");
    assert.equal((await e.execute({ kind: "ISSUE" })).outcome, "READ");
  };
  return {
    binding,
    token,
    requests,
    state,
    ports,
    make,
    approval,
    preflight,
    ack,
    defaultReply,
    consumed,
    repoUrl,
    issueUrl,
  };
}
test("production executor is default-off before authority, broker, DNS or sockets", async () => {
  const x = setup(),
    old = process.env.KXRA_GITHUB_PROVIDER_ENABLED;
  delete process.env.KXRA_GITHUB_PROVIDER_ENABLED;
  try {
    delete x.ports.enabled;
    const r = await x.make().execute({ kind: "REPOSITORY" });
    assert.equal(r.outcome, "NOT_EXECUTED");
    assert.equal(
      x.state.authorityCalls +
        x.state.brokerCalls +
        x.state.lookups +
        x.requests.length,
      0,
    );
  } finally {
    if (old === undefined) delete process.env.KXRA_GITHUB_PROVIDER_ENABLED;
    else process.env.KXRA_GITHUB_PROVIDER_ENABLED = old;
  }
});
test("only exact typed paths, fixed TLS/SNI and a public pinned address reach request construction", async () => {
  const x = setup(),
    e = x.make();
  await x.preflight(e);
  const r = await e.execute({ kind: "COMMENTS", page: 1 });
  assert.equal(r.outcome, "READ");
  assert.ok(!JSON.stringify(r).includes(x.token));
  assert.equal((r.data as any).untrusted_content, true);
  for (const q of x.requests) {
    assert.equal(q.url.origin, "https://api.github.com");
    assert.equal(q.options.port, 443);
    assert.equal(q.options.servername, "api.github.com");
    assert.equal(q.options.rejectUnauthorized, true);
    assert.equal(q.options.minVersion, "TLSv1.2");
    assert.equal(q.options.agent, false);
    assert.equal(q.options.family, 4);
    assert.equal(q.options.autoSelectFamily, false);
    assert.equal(q.options.maxHeaderSize, 16384);
    assert.equal(q.options.insecureHTTPParser, false);
    let pin: any;
    q.options.lookup("api.github.com", {}, (...v: any[]) => {
      pin = v;
    });
    assert.deepEqual(pin, [null, "8.8.8.8", 4]);
    assert.equal(q.options.headers["x-github-api-version"], "2026-03-10");
    assert.equal(q.options.headers["accept-encoding"], "identity");
  }
  assert.deepEqual(
    x.requests.map((q) => q.url.pathname),
    [
      new URL(x.repoUrl).pathname,
      new URL(x.issueUrl).pathname,
      new URL(x.issueUrl).pathname + "/comments",
    ],
  );
});
test("browser-style URL, headers, token and identity injection cannot invoke an operation", async () => {
  for (const field of [
    "url",
    "headers",
    "token",
    "org_id",
    "installation_id",
  ]) {
    const x = setup();
    assert.equal(
      (await x.make().execute({ kind: "REPOSITORY", [field]: "injected" }))
        .outcome,
      "REFUSED",
    );
    assert.equal(x.requests.length + x.state.brokerCalls + x.state.lookups, 0);
  }
  for (const bad of [
    "../owner",
    "owner/path",
    "owner@evil",
    "%2f",
    "owner?x=1",
  ]) {
    const x = setup();
    assert.throws(
      () => new GithubProductionExecutor({ ...x.binding, owner: bad }, x.ports),
    );
  }
});
test("successful exact comment returns only sanitized evidence and cannot be repeated in the same executor", async () => {
  const x = setup(),
    e = x.make();
  await x.preflight(e);
  const op = x.approval(),
    r = await e.execute(op);
  assert.equal(r.outcome, "ACCEPTED");
  assert.equal(r.evidence.comment_id, 801);
  assert.equal(r.evidence.issue_id, x.binding.issue_id);
  assert.ok(!JSON.stringify(r).includes(x.token));
  assert.equal((await e.execute(op)).outcome, "REFUSED");
  assert.equal(x.state.posts, 1);
});
test("two reconstructed executors sharing an atomic consumption port issue only one POST", async () => {
  const x = setup(),
    a = x.make(),
    b = x.make();
  await x.preflight(a);
  await x.preflight(b);
  const op = x.approval();
  const values = await Promise.all([a.execute(op), b.execute(op)]);
  assert.equal(values.filter((v) => v.outcome === "ACCEPTED").length, 1);
  assert.equal(values.filter((v) => v.outcome === "REFUSED").length, 1);
  assert.equal(x.state.posts, 1);
  assert.equal(x.consumed.size, 1);
});
test("lost atomic-consumption acknowledgement is held without a POST or reset under reconstruction", async () => {
  const x = setup(),
    op = x.approval();
  x.state.consumeHook = async (i) => {
    const a = i.operation.attempt_id;
    if (x.consumed.has(a)) throw Error("already consumed");
    x.consumed.add(a);
    throw Error("lost commit acknowledgement");
  };
  for (let n = 0; n < 2; n++) {
    const e = x.make();
    await x.preflight(e);
    const r = await e.execute(op);
    assert.equal(r.outcome, "REFUSED");
    assert.equal(r.evidence.reason, "DURABLE_ATTEMPT_UNCONFIRMED");
  }
  assert.equal(x.state.posts, 0);
  assert.equal(x.consumed.size, 1);
});
test("no write without recent matching repository/issue observations, exact approval and durable claim", async () => {
  for (const kind of [
    "no-preflight",
    "digest",
    "body",
    "attempt",
    "expiry",
    "future-approval",
    "stale-preflight",
  ]) {
    const x = setup(),
      e = x.make();
    if (kind !== "no-preflight") await x.preflight(e);
    const op: any = x.approval();
    if (kind === "digest") op.approval_digest = "a".repeat(64);
    if (kind === "body") op.body += "changed";
    if (kind === "attempt")
      x.state.authorityHook = (i) => ({ ...x.ack(i), attempt_id: uuid() });
    if (kind === "expiry") x.state.advance(60001);
    if (kind === "future-approval")
      op.approved_at = new Date(x.state.clock() + 1000).toISOString();
    if (kind === "stale-preflight") x.state.advance(10001);
    assert.equal((await e.execute(op)).outcome, "REFUSED", kind);
    assert.equal(x.state.posts, 0, kind);
  }
});
test("repository transfer/rename/ID drift and pull requests invalidate preflight", async () => {
  for (const change of [
    "repo-id",
    "account",
    "name",
    "pull-request",
    "issue-id",
    "issue-url",
  ]) {
    const x = setup(),
      e = x.make();
    x.state.respond = (r) => {
      const reply = x.defaultReply(r),
        v = reply.data as any;
      if (change === "repo-id" && !r.url.pathname.includes("/issues/")) v.id++;
      if (change === "account" && v.owner) v.owner.id++;
      if (change === "name" && v.full_name) v.full_name += "-renamed";
      if (change === "pull-request" && v.repository_url) v.pull_request = null;
      if (change === "issue-id" && v.repository_url) v.id++;
      if (change === "issue-url" && v.repository_url) v.url += "-wrong";
      return reply;
    };
    await e.execute({ kind: "REPOSITORY" });
    await e.execute({ kind: "ISSUE" });
    assert.equal((await e.execute(x.approval())).outcome, "REFUSED", change);
    assert.equal(x.state.posts, 0);
  }
});
test("fresh authority after broker/DNS and after the final authority wait prevents stale dispatch", async () => {
  for (const phase of ["broker", "dns", "final-await"]) {
    const x = setup(),
      e = x.make();
    await x.preflight(e);
    const op = x.approval();
    if (phase === "broker")
      x.state.brokerHook = (lease) => {
        x.state.invalid = true;
        return lease;
      };
    if (phase === "dns")
      x.state.lookupHook = async () => {
        x.state.invalid = true;
        return [{ address: "8.8.8.8" }];
      };
    if (phase === "final-await") {
      let n = 0;
      x.state.authorityHook = async (i) => {
        if (++n === 3) x.state.advance(60001);
        return x.ack(i);
      };
    }
    assert.equal((await e.execute(op)).outcome, "REFUSED", phase);
    assert.equal(x.state.posts, 0);
    assert.equal(x.consumed.size, 0);
  }
});
test("lease purpose, target, epoch, permission width and expiry mismatch cannot reach a socket", async () => {
  const changes: ((v: any) => void)[] = [
    (v) => (v.binding_sha256 = "f".repeat(64)),
    (v) => (v.credential_ref += "changed"),
    (v) => v.credential_version++,
    (v) => v.app_id++,
    (v) => v.installation_id++,
    (v) => v.repository_ids.push(1000),
    (v) => v.repository_ids[0]++,
    (v) => (v.permissions.contents = "read"),
    (v) => (v.permissions.issues = "write"),
    (v) => (v.expires_at = new Date(0).toISOString()),
    (v) => (v.expires_at = new Date(Date.now() + 9999999).toISOString()),
    (v) => (v.token = "kxra-local-github-fixture-only"),
  ];
  for (const change of changes) {
    const x = setup();
    x.state.brokerHook = (v) => {
      change(v);
      return v;
    };
    assert.equal(
      (await x.make().execute({ kind: "REPOSITORY" })).outcome,
      "NOT_EXECUTED",
    );
    assert.equal(x.requests.length, 0);
  }
});
test("private, reserved, mixed and empty DNS answers are denied without outbound construction", async () => {
  for (const addresses of [
    [],
    ["127.0.0.1"],
    ["10.1.2.3"],
    ["169.254.169.254"],
    ["::1"],
    ["203.0.113.1"],
    ["8.8.8.8", "192.168.1.1"],
  ]) {
    const x = setup();
    x.state.lookupHook = async () => addresses.map((address) => ({ address }));
    assert.equal(
      (await x.make().execute({ kind: "REPOSITORY" })).outcome,
      "NOT_EXECUTED",
    );
    assert.equal(x.requests.length, 0);
  }
});
test("read authority withdrawal during response withholds private output; historical write acknowledgement survives withdrawal", async () => {
  const x = setup(),
    e = x.make();
  x.state.responseHook = () => {
    x.state.invalid = true;
  };
  const denied = await e.execute({ kind: "REPOSITORY" });
  assert.equal(denied.outcome, "UNAVAILABLE");
  assert.equal(denied.data, undefined);
  const y = setup(),
    w = y.make();
  await y.preflight(w);
  y.state.responseHook = () => {
    y.state.invalid = true;
    y.state.advance(60001);
  };
  assert.equal((await w.execute(y.approval())).outcome, "ACCEPTED");
  assert.equal(y.state.posts, 1);
});
test("ambiguous write responses and transport errors remain uncertain with no retry", async () => {
  for (const kind of [
    "lost",
    "redirect",
    "server-error",
    "bad-json",
    "invalid-utf8",
    "wrong-body",
    "wrong-author",
    "wrong-issue",
    "wrong-status",
    "huge",
    "encoding",
  ]) {
    const x = setup(),
      e = x.make();
    await x.preflight(e);
    x.state.respond = (r) => {
      const v = x.defaultReply(r);
      if (kind === "lost") return { status: 0, error: true };
      if (kind === "redirect")
        return {
          status: 302,
          data: { message: "moved" },
          headers: { location: "https://other.invalid" },
        };
      if (kind === "server-error")
        return { status: 503, data: { message: x.token } };
      if (kind === "bad-json") return { status: 201, bytes: Buffer.from("{") };
      if (kind === "invalid-utf8")
        return { status: 201, bytes: Buffer.from([0xff]) };
      if (kind === "wrong-body") (v.data as any).body += "changed";
      if (kind === "wrong-author") (v.data as any).user.id++;
      if (kind === "wrong-issue") (v.data as any).issue_url += "wrong";
      if (kind === "wrong-status") v.status = 200;
      if (kind === "huge") return { status: 201, bytes: Buffer.alloc(262145) };
      if (kind === "encoding")
        return { ...v, headers: { "content-encoding": "gzip" } };
      return v;
    };
    const r = await e.execute(x.approval());
    assert.equal(r.outcome, "UNCERTAIN", kind);
    assert.ok(!JSON.stringify(r).includes(x.token));
    assert.equal(x.state.posts, 1);
    assert.equal((await e.execute(x.approval())).outcome, "REFUSED");
    assert.equal(x.state.posts, 1);
  }
});
test("documented JSON rejection is sanitized; rate headers stop future work without sleeping or retry", async () => {
  for (const status of [401, 403, 404, 410, 422, 429]) {
    const x = setup(),
      e = x.make();
    await x.preflight(e);
    x.state.respond = () => ({
      status,
      data: { message: x.token },
      headers: { "retry-after": "60" },
    });
    const r = await e.execute(x.approval());
    assert.equal(r.outcome, "REJECTED");
    assert.equal(r.rate.stop, true);
    assert.ok(!JSON.stringify(r).includes(x.token));
    assert.equal(
      (await e.execute({ kind: "REPOSITORY" })).outcome,
      "NOT_EXECUTED",
    );
    assert.equal(x.state.posts, 1);
  }
});
test("malformed rate-limited bodies still halt the window; malformed headers never return raw values", async () => {
  for (const headers of [
    { "retry-after": "60" },
    {
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60),
    },
    { "retry-after": "\r\nsecret" },
    { "x-ratelimit-remaining": ["0", "1"] },
  ]) {
    const x = setup(),
      e = x.make();
    x.state.respond = () => ({ status: 429, bytes: Buffer.from("{"), headers });
    const r = await e.execute({ kind: "REPOSITORY" });
    assert.equal(r.rate.stop, true);
    assert.equal(r.outcome, "UNAVAILABLE");
    assert.equal(
      (await e.execute({ kind: "REPOSITORY" })).outcome,
      "NOT_EXECUTED",
    );
    assert.equal(x.requests.length, 1);
  }
});
test("pagination never follows external links and bounded page3 remains incomplete when page4 exists", async () => {
  for (const invalid of [
    '<https://evil.invalid/?page=2>; rel="next"',
    "not a link",
    '<https://api.github.com/repos/Other/repo/issues/7/comments?per_page=100&page=2>; rel="next"',
  ]) {
    const x = setup();
    x.state.respond = (r) => ({
      ...x.defaultReply(r),
      headers: { link: invalid },
    });
    assert.equal(
      (await x.make().execute({ kind: "COMMENTS", page: 1 })).outcome,
      "UNAVAILABLE",
    );
    assert.equal(x.requests.length, 1);
  }
  const x = setup(),
    e = x.make();
  x.state.respond = (r) => ({
    ...x.defaultReply(r),
    headers: {
      link: `<${x.issueUrl}/comments?per_page=100&page=4>; rel="next"`,
    },
  });
  const r = await e.execute({ kind: "COMMENTS", page: 3 });
  assert.equal(r.outcome, "READ");
  assert.equal((r.data as any).complete, false);
  assert.equal(
    (await e.execute({ kind: "COMMENTS", page: 4 })).outcome,
    "REFUSED",
  );
  assert.equal(x.requests.length, 1);
});
test("whole-operation deadlines include hanging authority, broker, DNS and response, with no late send", async () => {
  for (const phase of ["authority", "broker", "dns", "response"]) {
    const x = setup();
    x.ports.deadlineMs = 30;
    let release: () => void = () => {};
    const wait = new Promise<void>((r) => {
      release = r;
    });
    if (phase === "authority")
      x.state.authorityHook = async (i) => {
        await wait;
        return x.ack(i);
      };
    if (phase === "broker")
      x.state.brokerHook = async (lease) => {
        await wait;
        return lease;
      };
    if (phase === "dns")
      x.state.lookupHook = async () => {
        await wait;
        return [{ address: "8.8.8.8" }];
      };
    if (phase === "response")
      x.state.respond = () => ({ status: 200, hang: true });
    const r = await x.make().execute({ kind: "REPOSITORY" });
    assert.equal(
      r.outcome,
      phase === "response" ? "UNAVAILABLE" : "NOT_EXECUTED",
    );
    release();
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(x.requests.length, phase === "response" ? 1 : 0);
  }
});
test("serial window rejects concurrent work and enforces its six-call lifetime budget", async () => {
  const x = setup();
  let release: () => void = () => {};
  const wait = new Promise<void>((r) => {
    release = r;
  });
  x.state.brokerHook = async (lease) => {
    await wait;
    return lease;
  };
  const e = x.make(),
    pending = e.execute({ kind: "REPOSITORY" });
  assert.equal((await e.execute({ kind: "REPOSITORY" })).outcome, "REFUSED");
  release();
  assert.equal((await pending).outcome, "READ");
  x.state.brokerHook = undefined;
  for (let n = 1; n < 6; n++)
    assert.equal((await e.execute({ kind: "REPOSITORY" })).outcome, "READ");
  assert.equal(
    (await e.execute({ kind: "REPOSITORY" })).outcome,
    "NOT_EXECUTED",
  );
  assert.equal(x.requests.length, 6);
});
test("timeout during irreversible consumption never claims non-execution or sends late", async () => {
  const x = setup();
  x.ports.deadlineMs = 30;
  const e = x.make();
  await x.preflight(e);
  let release: () => void = () => {};
  const wait = new Promise<void>((r) => {
    release = r;
  });
  x.state.consumeHook = async (i) => {
    x.consumed.add(i.operation.attempt_id);
    await wait;
    return {
      consumed: true,
      binding_sha256: i.binding_sha256,
      operation_sha256: i.operation_sha256,
      write_id: i.operation.write_id,
      attempt_id: i.operation.attempt_id,
    };
  };
  const r = await e.execute(x.approval());
  assert.equal(r.outcome, "REFUSED");
  assert.equal(r.evidence.reason, "DURABLE_ATTEMPT_UNCONFIRMED");
  release();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(x.state.posts, 0);
});
test("authority withdrawal during consumption prevents HTTP without resetting its consumed attempt", async () => {
  const x = setup(),
    e = x.make();
  await x.preflight(e);
  x.state.consumeHook = async (i) => {
    x.consumed.add(i.operation.attempt_id);
    x.state.invalid = true;
    return {
      consumed: true,
      binding_sha256: i.binding_sha256,
      operation_sha256: i.operation_sha256,
      write_id: i.operation.write_id,
      attempt_id: i.operation.attempt_id,
    };
  };
  assert.equal((await e.execute(x.approval())).outcome, "NOT_EXECUTED");
  assert.equal(x.state.posts, 0);
  assert.equal(x.consumed.size, 1);
});
test("standalone production bundle excludes fixture adapters, credentials, protocols and AI authority", async () => {
  const { build } = await import("esbuild");
  const out = await build({
    entryPoints: ["packages/connectors/github-production-transport.ts"],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    packages: "external",
  });
  const code = out.outputFiles[0].text;
  for (const marker of [
    "kxra-local-github-fixture-only",
    "fixture:github:",
    "LocalGithubAdapter",
    "SYNTHETIC_CUSTODY_UNAVAILABLE",
    "/v1/synthetic/leases/",
    "KXRA_AUTH_MODE",
    "KXRA_MODEL_VAULT_KEY",
    "KXRA_AI_ENABLED",
  ])
    assert.ok(!code.includes(marker), marker);
  assert.ok(code.includes("https://api.github.com"));
});
test("a reconstructed worker failing before consumption cannot overwrite another worker execution as not-executed", async () => {
  const x = setup(),
    a = x.make(),
    b = x.make();
  await x.preflight(a);
  await x.preflight(b);
  const op = x.approval();
  assert.equal((await a.execute(op)).outcome, "ACCEPTED");
  x.state.brokerHook = () => {
    throw Error("lease unavailable");
  };
  assert.equal((await b.execute(op)).outcome, "REFUSED");
  assert.equal(x.state.posts, 1);
});

test("DNS pin remains immutable if a cached resolver answer mutates during fresh authority wait", async () => {
  const x = setup(),
    records = [{ address: "8.8.8.8" }];
  x.state.lookupHook = async () => records;
  let n = 0;
  x.state.authorityHook = (i) => {
    if (++n === 3) records[0].address = "127.0.0.1";
    return x.ack(i);
  };
  assert.equal(
    (await x.make().execute({ kind: "REPOSITORY" })).outcome,
    "READ",
  );
  let pin: any;
  x.requests[0].options.lookup("api.github.com", {}, (...args: any[]) => {
    pin = args;
  });
  assert.deepEqual(pin, [null, "8.8.8.8", 4]);
});

test("a resolver record is captured once before validation and never reread for the socket pin", async () => {
  const x = setup();
  let reads = 0;
  x.state.lookupHook = async () => [
    {
      get address() {
        reads++;
        return reads === 1 ? "8.8.8.8" : "127.0.0.1";
      },
    },
  ];
  assert.equal(
    (await x.make().execute({ kind: "REPOSITORY" })).outcome,
    "READ",
  );
  let pin: any;
  x.requests[0].options.lookup("api.github.com", {}, (...args: any[]) => {
    pin = args;
  });
  assert.deepEqual(pin, [null, "8.8.8.8", 4]);
  assert.equal(reads, 1);
});

test("missing rollback fence cannot consume application authority or construct a POST", async () => {
  const x = setup();
  x.ports.rollbackFence = undefined;
  let consumed = 0;
  x.state.consumeHook = async () => {
    consumed++;
    throw Error("must not consume");
  };
  const e = x.make();
  await x.preflight(e);
  assert.equal((await e.execute(x.approval())).outcome, "REFUSED");
  assert.equal(consumed, 0);
  assert.equal(x.state.posts, 0);
});
test("monotonic expiry after external SEND prevents HTTP even before the timer callback runs", async () => {
  const x = setup();
  let mono = 0,
    burned = false;
  x.ports.monotonic = () => mono;
  const original = x.ports.rollbackFence!;
  x.ports.rollbackFence = {
    reserve: original.reserve.bind(original),
    send: async (...args) => {
      const r = await original.send(...args);
      burned = true;
      return r;
    },
  };
  x.state.authorityHook = (i: any) => {
    if (burned) mono = 2001;
    return {
      state: i.operation.kind === "COMMENT" ? "DISPATCHING" : "ACTIVE",
      binding_sha256: i.binding_sha256,
      operation_sha256: i.operation_sha256,
      ...(i.operation.kind === "COMMENT"
        ? { write_id: i.operation.write_id, attempt_id: i.operation.attempt_id }
        : {}),
    };
  };
  const e = x.make();
  await x.preflight(e);
  assert.equal((await e.execute(x.approval())).outcome, "NOT_EXECUTED");
  assert.equal(burned, true);
  assert.equal(x.state.posts, 0);
});
