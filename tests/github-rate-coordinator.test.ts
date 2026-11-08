import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import util from "node:util";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type https from "node:https";
import {
  GithubPostgresRateCoordinator,
  githubRateSubject,
  type GithubSharedRate,
  type GithubRateReservation,
  type GithubRateSettlement,
} from "../packages/connectors/github-rate-coordinator";
import { GithubRateLimitedExecutor } from "../packages/connectors/github-rate-limited-executor";
import {
  githubProductionBinding,
  githubCommentApprovalDigest,
} from "../packages/connectors/github-production-contracts";
import type { GithubExecutionPorts } from "../packages/connectors/github-production-transport";
import { githubFake } from "./support/github-production-fake";

function setup() {
  let now = Date.now();
  const binding = githubProductionBinding.parse({
    provider: "github",
    api_version: "2026-03-10",
    org_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    connection_id: crypto.randomUUID(),
    session_version: 1,
    grant_version: 1,
    credential_ref: "vault:github:offline-rate-reference",
    credential_version: 1,
    app_id: 801,
    installation_id: 802,
    account_id: 803,
    repository_id: 804,
    issue_id: 805,
    issue_number: 8,
    author_id: 806,
    owner: "Offline-Org",
    repo: "rate-proof",
    expires_at: new Date(now + 600000).toISOString(),
  });
  const fake = githubFake(binding),
    realm = crypto.randomUUID();
  const state = {
    enabled: true,
    provider: true,
    authority: true,
    requests: 0,
    brokers: 0,
    authorityCalls: 0,
    reserves: 0,
    completes: 0,
    active: null as GithubRateReservation | null,
    held: false,
    advance: (n: number) => {
      now += n;
    },
    reserveHook: undefined as
      undefined | ((input: any, signal: AbortSignal) => Promise<unknown>),
    completeHook: undefined as
      | undefined
      | ((
          r: GithubRateReservation,
          s: GithubRateSettlement,
          signal: AbortSignal,
        ) => Promise<unknown>),
    authorityHook: undefined as undefined | (() => void),
    receipts: [] as GithubRateSettlement[],
  };
  const ports: GithubExecutionPorts = {
    enabled: () => state.provider,
    now: () => now,
    deadlineMs: 100,
    lookup: async () => [{ address: "8.8.8.8" }],
    request: ((...args: any[]) => {
      state.requests++;
      return (fake.request as any)(...args);
    }) as typeof https.request,
    broker: {
      resolve: async (input) => {
        state.brokers++;
        return fake.broker.resolve(input);
      },
    },
    rollbackFence: fake.rollbackFence,
    authority: {
      current: async (i) => {
        state.authorityCalls++;
        state.authorityHook?.();
        if (!state.authority) throw Error("offline-secret-authority-error");
        return {
          state: i.operation.kind === "COMMENT" ? "DISPATCHING" : "ACTIVE",
          binding_sha256: i.binding_sha256,
          operation_sha256: i.operation_sha256,
          ...(i.operation.kind === "COMMENT"
            ? {
                write_id: i.operation.write_id,
                attempt_id: i.operation.attempt_id,
              }
            : {}),
        };
      },
      consume: async (i) => {
        assert.equal(i.operation.kind, "COMMENT");
        if (i.operation.kind !== "COMMENT") throw Error("not comment");
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
  const ack = (input: any) => ({
    ...input,
    realm,
    epoch: 1,
    reserved: true as const,
  });
  const completion = (r: GithubRateReservation, held = false) => ({
    realm,
    epoch: 1,
    reservation_id: r.reservation_id,
    completed: true as const,
    held,
  });
  const rate: GithubSharedRate = {
    reserve: async (input, signal) => {
      state.reserves++;
      assert.ok(Object.isFrozen(input));
      if (state.reserveHook) return state.reserveHook(input, signal);
      if (state.active || state.held) throw Error("in flight or held");
      state.active = ack(input);
      return state.active;
    },
    complete: async (r, receipt, signal) => {
      state.completes++;
      state.receipts.push(structuredClone(receipt));
      if (state.completeHook) return state.completeHook(r, receipt, signal);
      state.held =
        receipt.settlement === "UNCONFIRMED" ||
        receipt.rate.reason === "RATE_CONTROL_INVALID";
      state.active = null;
      return completion(r, state.held);
    },
  };
  const make = (deadline = 100) =>
    new GithubRateLimitedExecutor(binding, ports, rate, {
      enabled: () => state.enabled,
      coordinationDeadlineMs: deadline,
    });
  const comment = () => {
    const fields = {
      write_id: crypto.randomUUID(),
      body: "Offline exact rate proof only",
      approved_at: new Date(now).toISOString(),
      expires_at: new Date(now + 60000).toISOString(),
    };
    return {
      kind: "COMMENT",
      ...fields,
      attempt_id: crypto.randomUUID(),
      approval_digest: githubCommentApprovalDigest(binding, fields),
    };
  };
  return {
    binding,
    fake,
    state,
    ports,
    realm,
    rate,
    ack,
    completion,
    make,
    comment,
  };
}

test("gate surrounds real executor preflight, preserves read evidence and records confirmation", async () => {
  const f = setup();
  f.state.reserveHook = async (i) => {
    assert.equal(
      f.state.authorityCalls + f.state.brokers + f.state.requests,
      0,
    );
    return f.ack(i);
  };
  const r = await f.make().execute({ kind: "REPOSITORY" });
  assert.equal(r.executor_invoked, true);
  assert.equal(r.execution?.outcome, "READ");
  assert.equal(r.coordination.state, "RECORDED");
  assert.equal(f.state.requests, 1);
  assert.equal(f.state.reserves, 1);
  assert.equal(f.state.completes, 1);
  assert.deepEqual(f.state.receipts[0], {
    settlement: "CONFIRMED",
    rate: { stop: false, not_before: null, reason: "NONE" },
  });
});

test("default-off, disabled, aborted and invalid command do not reserve or invoke", async () => {
  for (const mode of ["default", "disabled", "aborted", "invalid"]) {
    const f = setup(),
      controller = new AbortController();
    if (mode === "disabled") f.state.enabled = false;
    if (mode === "aborted") controller.abort();
    assert.notEqual(process.env.KXRA_GITHUB_SHARED_RATE_ENABLED, "true");
    const e =
      mode === "default"
        ? new GithubRateLimitedExecutor(f.binding, f.ports, f.rate)
        : f.make();
    const r = await e.execute(
      mode === "invalid"
        ? { kind: "REPOSITORY", url: "https://attacker.invalid" }
        : { kind: "REPOSITORY" },
      controller.signal,
    );
    assert.equal(r.execution, null);
    assert.equal(r.executor_invoked, false);
    assert.equal(r.coordination.state, "NOT_ADMITTED");
    assert.equal(f.state.reserves + f.state.requests + f.state.brokers, 0);
  }
});

test("provider transport gate remains independent", async () => {
  const f = setup();
  f.state.provider = false;
  const r = await f.make().execute({ kind: "REPOSITORY" });
  assert.equal(r.execution?.outcome, "NOT_EXECUTED");
  assert.equal(f.state.requests + f.state.brokers, 0);
  assert.equal(f.state.completes, 1);
});

test("reserve errors and lost acknowledgements never invoke or retry", async () => {
  const f = setup();
  f.state.reserveHook = async (i) => {
    f.state.active = f.ack(i);
    throw Error("offline-secret-reservation-error");
  };
  const e = f.make(),
    r = await e.execute({ kind: "REPOSITORY" });
  assert.equal(r.execution, null);
  assert.equal(r.executor_invoked, false);
  assert.equal(r.coordination.reason, "RESERVATION_UNCONFIRMED");
  assert.equal(
    (await e.execute({ kind: "REPOSITORY" })).coordination.state,
    "NOT_ADMITTED",
  );
  assert.equal(f.state.reserves, 1);
  assert.equal(
    f.state.requests +
      f.state.brokers +
      f.state.authorityCalls +
      f.state.completes,
    0,
  );
  assert.ok(!JSON.stringify(r).includes("offline-secret"));
});

for (const key of [
  "app_id",
  "installation_id",
  "account_id",
  "binding_sha256",
  "operation_sha256",
  "kind",
  "reservation_id",
  "reserved",
  "extra",
])
  test(`reserve ack rejects mismatched ${key}`, async () => {
    const f = setup();
    f.state.reserveHook = async (i) => ({
      ...f.ack(i),
      [key]: key.endsWith("sha256")
        ? "0".repeat(64)
        : key === "kind"
          ? "COMMENT"
          : key === "reservation_id"
            ? crypto.randomUUID()
            : key === "reserved"
              ? false
              : 999,
    });
    const r = await f.make().execute({ kind: "REPOSITORY" });
    assert.equal(r.executor_invoked, false);
    assert.equal(r.coordination.state, "UNCONFIRMED");
    assert.equal(f.state.requests, 0);
  });

test("late reserve resolution after timeout or abort cannot invoke and is not completed", async () => {
  for (const cancel of [false, true]) {
    const f = setup(),
      controller = new AbortController();
    let resolve!: (r: unknown) => void, input: any;
    f.state.reserveHook = async (i) => {
      input = i;
      return new Promise((r) => {
        resolve = r;
      });
    };
    const work = f.make(15).execute({ kind: "REPOSITORY" }, controller.signal);
    if (cancel) controller.abort();
    const r = await work;
    assert.equal(r.executor_invoked, false);
    resolve(f.ack(input));
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(f.state.requests + f.state.brokers + f.state.completes, 0);
  }
});

test("disable or abort after confirmed reserve strands it rather than silently releasing", async () => {
  for (const abort of [false, true]) {
    const f = setup(),
      controller = new AbortController();
    f.state.reserveHook = async (i) => {
      if (abort) controller.abort();
      else f.state.enabled = false;
      return f.ack(i);
    };
    const r = await f.make().execute({ kind: "REPOSITORY" }, controller.signal);
    assert.equal(r.executor_invoked, false);
    assert.ok(["HELD", "UNCONFIRMED"].includes(r.coordination.state));
    assert.equal(f.state.requests + f.state.completes, 0);
  }
});

test("same wrapper refuses concurrency and reconstructed workers share one active gate", async () => {
  const f = setup();
  let release!: () => void;
  f.state.completeHook = async (r) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    f.state.active = null;
    return f.completion(r);
  };
  const first = f.make(),
    pending = first.execute({ kind: "REPOSITORY" });
  while (!release) await new Promise((r) => setTimeout(r, 1));
  assert.equal(
    (await first.execute({ kind: "ISSUE" })).coordination.reason,
    "EXECUTION_ALREADY_ACTIVE",
  );
  const competing = await f.make().execute({ kind: "REPOSITORY" });
  assert.equal(competing.executor_invoked, false);
  assert.equal(f.state.requests, 1);
  release();
  assert.equal((await pending).execution?.outcome, "READ");
});

for (const mode of [
  "error",
  "timeout",
  "wrong-realm",
  "wrong-epoch",
  "wrong-id",
  "extra",
])
  test(`completion ${mode} preserves accepted write evidence without replay`, async () => {
    const f = setup(),
      e = f.make(15);
    assert.equal(
      (await e.execute({ kind: "REPOSITORY" })).execution?.outcome,
      "READ",
    );
    assert.equal(
      (await e.execute({ kind: "ISSUE" })).execution?.outcome,
      "READ",
    );
    f.state.completeHook = async (r) => {
      if (mode === "error") throw Error("offline-secret-completion-error");
      if (mode === "timeout") return new Promise(() => {});
      return {
        ...f.completion(r),
        ...(mode === "wrong-realm"
          ? { realm: crypto.randomUUID() }
          : mode === "wrong-epoch"
            ? { epoch: 2 }
            : mode === "wrong-id"
              ? { reservation_id: crypto.randomUUID() }
              : { extra: true }),
      };
    };
    const op = f.comment(),
      result = await e.execute(op);
    assert.equal(result.executor_invoked, true);
    assert.deepEqual(result.execution, {
      outcome: "ACCEPTED",
      evidence: {
        status: 201,
        reason: "MATCHING_ACKNOWLEDGEMENT",
        comment_id: f.fake.effects[0].id,
        body_sha256: crypto.createHash("sha256").update(op.body).digest("hex"),
        author_id: f.binding.author_id,
        issue_id: f.binding.issue_id,
      },
      rate: { stop: false, not_before: null, reason: "NONE" },
    });
    assert.equal(result.coordination.reason, "COMPLETION_UNCONFIRMED");
    assert.equal(f.fake.posts(), 1);
    assert.equal((await e.execute(op)).executor_invoked, false);
    assert.equal(f.fake.posts(), 1);
    assert.ok(!JSON.stringify(result).includes("offline-secret"));
  });

test("uncertain write forces durable hold, preserving uncertainty and forbidding later requests", async () => {
  const f = setup(),
    e = f.make();
  await e.execute({ kind: "REPOSITORY" });
  await e.execute({ kind: "ISSUE" });
  f.fake.setMode("drop");
  const result = await e.execute(f.comment());
  assert.equal(result.execution?.outcome, "UNCERTAIN");
  assert.equal(result.coordination.state, "HELD");
  assert.equal(f.state.receipts.at(-1)?.settlement, "UNCONFIRMED");
  assert.equal(
    (await f.make().execute({ kind: "REPOSITORY" })).executor_invoked,
    false,
  );
  assert.equal(f.fake.posts(), 1);
});

test("unconfirmed read holds rate state rather than automatically releasing remote uncertainty", async () => {
  const f = setup();
  f.ports.lookup = async () => {
    throw Error("offline DNS uncertainty");
  };
  const first = await f.make().execute({ kind: "REPOSITORY" });
  // Before request construction the original executor can prove NOT_EXECUTED.
  assert.equal(first.execution?.outcome, "NOT_EXECUTED");
  assert.equal(f.state.receipts[0].settlement, "CONFIRMED");
  const g = setup();
  g.ports.request = (() => {
    throw Error("offline transport uncertainty");
  }) as typeof https.request;
  const second = await g.make().execute({ kind: "REPOSITORY" });
  assert.equal(second.execution?.outcome, "UNAVAILABLE");
  assert.equal(g.state.receipts[0].settlement, "UNCONFIRMED");
  assert.equal(second.coordination.state, "HELD");
});

for (const change of [
  "withdraw",
  "disable",
  "provider-disable",
  "binding-expiry",
  "lease-expiry",
  "abort",
  "wrong-ack",
  "authority-timeout",
  "completion-failed-withdraw",
])
  test(`private read withheld after completion ${change}`, async () => {
    const f = setup(),
      controller = new AbortController(),
      e = f.make(15);
    if (change === "lease-expiry")
      f.ports.broker.resolve = async (i) => {
        f.state.brokers++;
        return {
          ...(await f.fake.broker.resolve(i)),
          expires_at: new Date(Date.now() + 1000).toISOString(),
        };
      };
    f.state.completeHook = async (r) => {
      if (change.includes("withdraw")) f.state.authority = false;
      if (change === "disable") f.state.enabled = false;
      if (change === "provider-disable") f.state.provider = false;
      if (change === "binding-expiry") f.state.advance(600000);
      if (change === "lease-expiry") f.state.advance(2000);
      if (change === "abort") controller.abort();
      if (change === "wrong-ack")
        f.ports.authority.current = async () => ({
          state: "ACTIVE",
          binding_sha256: "0".repeat(64),
          operation_sha256: "0".repeat(64),
        });
      if (change === "authority-timeout")
        f.ports.authority.current = () => new Promise(() => {});
      if (change === "completion-failed-withdraw")
        throw Error("offline-secret");
      return f.completion(r);
    };
    const r = await e.execute({ kind: "REPOSITORY" }, controller.signal);
    assert.equal(r.execution?.outcome, "UNAVAILABLE");
    assert.equal(r.execution?.data, undefined);
    assert.equal(
      r.execution?.evidence.reason,
      "READ_AUTHORITY_RECHECK_UNAVAILABLE",
    );
    assert.equal(f.state.brokers, 1);
  });

test("aborted caller after accepted write still records outcome but cannot erase acceptance", async () => {
  const f = setup(),
    controller = new AbortController(),
    e = f.make();
  await e.execute({ kind: "REPOSITORY" });
  await e.execute({ kind: "ISSUE" });
  f.state.completeHook = async (r) => {
    controller.abort();
    return f.completion(r);
  };
  const result = await e.execute(f.comment(), controller.signal);
  assert.equal(result.execution?.outcome, "ACCEPTED");
  assert.equal(result.coordination.state, "RECORDED");
});

test("actual executor throw is not falsely represented as never invoked", async () => {
  const f = setup();
  f.ports.enabled = () => {
    throw Error("offline-secret");
  };
  const result = await f.make().execute({ kind: "REPOSITORY" });
  assert.equal(result.execution, null);
  assert.equal(result.executor_invoked, true);
  assert.equal(result.coordination.reason, "EXECUTION_UNCONFIRMED");
  assert.equal(f.state.completes, 0);
  assert.ok(f.state.active);
});

test("normal JSON and inspection omit target configuration and pool secrets", () => {
  const f = setup(),
    value = f.make();
  assert.ok(!JSON.stringify(value).includes(f.binding.credential_ref));
  assert.ok(!util.inspect(value).includes(f.binding.owner));
  assert.throws(
    () =>
      new GithubRateLimitedExecutor(
        { ...f.binding, secret: "offline-secret" },
        f.ports,
        f.rate,
      ),
    /^Error: GITHUB_SHARED_RATE_UNAVAILABLE$/,
  );
  assert.throws(
    () =>
      new GithubRateLimitedExecutor(f.binding, f.ports, f.rate, {
        coordinationDeadlineMs: 2001,
      }),
    /^Error: GITHUB_SHARED_RATE_UNAVAILABLE$/,
  );
});

function sqlSetup() {
  const realm = crypto.randomUUID(),
    subject = githubRateSubject.parse({
      reservation_id: crypto.randomUUID(),
      app_id: 801,
      installation_id: 802,
      account_id: 803,
      binding_sha256: "a".repeat(64),
      operation_sha256: "b".repeat(64),
      kind: "READ",
    });
  const ack = { ...subject, realm, epoch: 1, reserved: true as const };
  const state = {
    queries: [] as { sql: string; values?: unknown[] }[],
    connects: 0,
    releases: 0,
    failAt: "",
    override: undefined as unknown,
    onQuery: undefined as undefined | ((sql: string) => void),
  };
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      state.queries.push({ sql, values });
      state.onQuery?.(sql);
      if (sql === state.failAt) throw Error("offline-private-pool-error");
      return {
        rows: sql.startsWith("select kxra_github_rate.runtime")
          ? [
              {
                value:
                  state.override ??
                  (values?.[2] === "RESERVE"
                    ? ack
                    : {
                        realm,
                        epoch: 1,
                        reservation_id: subject.reservation_id,
                        completed: true,
                        held: false,
                      }),
              },
            ]
          : [],
      };
    },
    release: () => {
      state.releases++;
    },
  };
  const pool = {
    connect: async () => {
      state.connects++;
      return client;
    },
  };
  const make = (after?: (action: "RESERVE" | "COMPLETE") => Promise<void>) =>
    new GithubPostgresRateCoordinator(pool, realm, 1, after);
  return { realm, subject, ack, state, client, pool, make };
}
const signal = () => new AbortController().signal;
const normal = {
  rate: { stop: false, not_before: null, reason: "NONE" as const },
  settlement: "CONFIRMED" as const,
};

test("SQL adapter parameterizes exact payload, commits durable acknowledgement and releases once", async () => {
  const f = sqlSetup(),
    adapter = f.make();
  assert.deepEqual(await adapter.reserve(f.subject, signal()), f.ack);
  const q = f.state.queries.find((q) => q.values)!;
  assert.equal(
    q.sql,
    "select kxra_github_rate.runtime($1::uuid,$2::bigint,$3,$4::jsonb) value",
  );
  assert.deepEqual(q.values, [
    f.realm,
    1,
    "RESERVE",
    JSON.stringify(f.subject),
  ]);
  assert.deepEqual(f.state.queries.map((q) => q.sql).slice(0, 4), [
    "begin",
    "set local statement_timeout='2s'",
    "set local lock_timeout='1s'",
    "set local synchronous_commit=on",
  ]);
  assert.equal(f.state.queries.at(-1)?.sql, "commit");
  assert.equal(f.state.releases, 1);
  assert.equal(
    (await adapter.complete(f.ack, normal, signal())).completed,
    true,
  );
  const complete = f.state.queries.filter((q) => q.values).at(-1)!;
  assert.deepEqual(JSON.parse(complete.values![3] as string), {
    reservation_id: f.subject.reservation_id,
    ...normal,
  });
  assert.equal(f.state.releases, 2);
});

for (const action of ["RESERVE", "COMPLETE"] as const)
  test(`lost ${action} commit acknowledgement is generic and never retried`, async () => {
    const f = sqlSetup(),
      adapter = f.make(async () => {
        throw Error("offline-private-pool-error");
      });
    await assert.rejects(
      action === "RESERVE"
        ? adapter.reserve(f.subject, signal())
        : adapter.complete(f.ack, normal, signal()),
      /^Error: GITHUB_RATE_HELD_OR_UNCONFIRMED$/,
    );
    assert.equal(f.state.queries.filter((q) => q.sql === "commit").length, 1);
    assert.equal(f.state.queries.filter((q) => q.values).length, 1);
    assert.equal(f.state.queries.at(-1)?.sql, "rollback");
    assert.equal(f.state.releases, 1);
  });

test("aborted connect or transaction cannot proceed and client is released after late connect", async () => {
  const f = sqlSetup(),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(f.make().reserve(f.subject, controller.signal));
  assert.equal(f.state.connects, 0);
  const g = sqlSetup(),
    c = new AbortController();
  let resolve!: (v: typeof g.client) => void;
  g.pool.connect = () =>
    new Promise((r) => {
      resolve = r;
    });
  const work = g.make().reserve(g.subject, c.signal);
  c.abort();
  resolve(g.client);
  await assert.rejects(work);
  assert.equal(g.state.queries.length, 1);
  assert.equal(g.state.queries[0].sql, "rollback");
  assert.equal(g.state.releases, 1);
  const h = sqlSetup(),
    d = new AbortController();
  h.state.onQuery = (sql) => {
    if (sql.startsWith("select")) d.abort();
  };
  await assert.rejects(h.make().reserve(h.subject, d.signal));
  assert.ok(!h.state.queries.some((q) => q.sql === "commit"));
  assert.equal(h.state.releases, 1);
});

for (const key of [
  "realm",
  "epoch",
  "reservation_id",
  "binding_sha256",
  "operation_sha256",
  "app_id",
  "installation_id",
  "account_id",
  "kind",
  "reserved",
])
  test(`SQL adapter refuses mismatched reserve ${key}`, async () => {
    const f = sqlSetup();
    f.state.override = {
      ...f.ack,
      [key]:
        key === "realm" || key === "reservation_id"
          ? crypto.randomUUID()
          : key.endsWith("sha256")
            ? "0".repeat(64)
            : key === "kind"
              ? "COMMENT"
              : key === "reserved"
                ? false
                : 999,
    };
    await assert.rejects(
      f.make().reserve(f.subject, signal()),
      /^Error: GITHUB_RATE_HELD_OR_UNCONFIRMED$/,
    );
  });

test("malformed subject, foreign realm and contradictory rate receipt never reach SQL", async () => {
  const f = sqlSetup(),
    a = f.make();
  await assert.rejects(
    a.reserve(
      { ...f.subject, url: "https://attacker.invalid" } as any,
      signal(),
    ),
  );
  await assert.rejects(
    a.complete({ ...f.ack, realm: crypto.randomUUID() }, normal, signal()),
  );
  await assert.rejects(
    a.complete(
      f.ack,
      {
        ...normal,
        rate: { stop: false, not_before: null, reason: "RATE_LIMIT" },
      },
      signal(),
    ),
  );
  await assert.rejects(
    a.complete(
      f.ack,
      { ...normal, settlement: "AUTORELEASE" } as any,
      signal(),
    ),
  );
  assert.equal(f.state.connects, 0);
  assert.ok(!util.inspect(a).includes(f.realm));
});

test("late aborted broker cannot replace a newer read lease expiry", async () => {
  const f = setup();
  f.ports.deadlineMs = 15;
  let releaseOld!: (v: unknown) => void,
    calls = 0;
  f.ports.broker.resolve = async (i) => {
    if (++calls === 1)
      return new Promise((resolve) => {
        releaseOld = resolve;
      });
    return {
      ...(await f.fake.broker.resolve(i)),
      expires_at: new Date(Date.now() + 1000).toISOString(),
    };
  };
  const e = f.make();
  assert.equal(
    (await e.execute({ kind: "REPOSITORY" })).execution?.outcome,
    "NOT_EXECUTED",
  );
  f.state.completeHook = async (r) => {
    releaseOld(await f.fake.broker.resolve({ scope: "issues:read" }));
    await new Promise((resolve) => setTimeout(resolve, 1));
    f.state.advance(2000);
    return f.completion(r);
  };
  const result = await e.execute({ kind: "REPOSITORY" });
  assert.equal(result.execution?.outcome, "UNAVAILABLE");
  assert.equal(result.execution?.data, undefined);
  assert.equal(calls, 2);
});

test("a contradictory no-hold acknowledgement cannot release uncertain execution", async () => {
  const f = setup(),
    e = f.make();
  await e.execute({ kind: "REPOSITORY" });
  await e.execute({ kind: "ISSUE" });
  f.fake.setMode("drop");
  f.state.completeHook = async (r) => f.completion(r, false);
  const result = await e.execute(f.comment());
  assert.equal(result.execution?.outcome, "UNCERTAIN");
  assert.equal(result.coordination.reason, "COMPLETION_UNCONFIRMED");
  assert.equal(
    (await e.execute({ kind: "REPOSITORY" })).executor_invoked,
    false,
  );
});

test("pool release errors cannot escape public adapter error redaction", async () => {
  const f = sqlSetup();
  f.client.release = () => {
    throw Error("offline-private-pool-error");
  };
  await assert.rejects(
    f.make().reserve(f.subject, signal()),
    /^Error: GITHUB_RATE_HELD_OR_UNCONFIRMED$/,
  );
  assert.equal(f.state.queries.filter((q) => q.sql === "commit").length, 1);
});

test("lost rate receipt preserves the exact uncertain provider outcome", async () => {
  const f = setup(),
    e = f.make();
  await e.execute({ kind: "REPOSITORY" });
  await e.execute({ kind: "ISSUE" });
  f.fake.setMode("drop");
  f.state.completeHook = async () => {
    throw Error("offline-private-store-error");
  };
  const result = await e.execute(f.comment());
  assert.deepEqual(result.execution, {
    outcome: "UNCERTAIN",
    evidence: { reason: "RESPONSE_UNCONFIRMED" },
    rate: { stop: false, not_before: null, reason: "NONE" },
  });
  assert.equal(result.coordination.reason, "COMPLETION_UNCONFIRMED");
  assert.equal(f.fake.posts(), 1);
});

test("lost rate receipt preserves a known provider rejection and drops raw provider text", async () => {
  const f = setup();
  let posts = 0;
  f.ports.request = ((url: any, options: any, cb: any) => {
    if (options.method !== "POST")
      return (f.fake.request as any)(url, options, cb);
    const req = new EventEmitter() as any;
    req.destroy = () => req;
    req.end = () => {
      posts++;
      queueMicrotask(() => {
        const r = Readable.from([
          Buffer.from(
            JSON.stringify({ message: "offline-private-provider-error" }),
          ),
        ]) as any;
        r.statusCode = 422;
        r.headers = { "content-type": "application/json" };
        cb(r);
      });
      return req;
    };
    return req;
  }) as typeof https.request;
  const e = f.make();
  await e.execute({ kind: "REPOSITORY" });
  await e.execute({ kind: "ISSUE" });
  f.state.completeHook = async () => {
    throw Error("offline-private-store-error");
  };
  const result = await e.execute(f.comment());
  assert.deepEqual(result.execution, {
    outcome: "REJECTED",
    evidence: { status: 422, reason: "PROVIDER_REJECTED" },
    rate: { stop: false, not_before: null, reason: "NONE" },
  });
  assert.equal(result.coordination.reason, "COMPLETION_UNCONFIRMED");
  assert.equal(posts, 1);
  assert.ok(!JSON.stringify(result).includes("offline-private"));
});

test("missing underlying broker and throwing trusted clock fail with redacted constructor errors", () => {
  const f = setup();
  assert.throws(
    () =>
      new GithubRateLimitedExecutor(
        f.binding,
        { ...f.ports, broker: undefined } as any,
        f.rate,
      ),
    /^Error: GITHUB_SHARED_RATE_UNAVAILABLE$/,
  );
  assert.throws(
    () =>
      new GithubRateLimitedExecutor(
        f.binding,
        {
          ...f.ports,
          now: () => {
            throw Error("offline-private-clock");
          },
        },
        f.rate,
      ),
    /^Error: GITHUB_SHARED_RATE_UNAVAILABLE$/,
  );
});
