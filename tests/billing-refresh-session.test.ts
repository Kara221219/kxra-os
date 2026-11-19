import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import test from "node:test";
import { createBillingRefreshSession } from "../packages/integrations/billing-refresh-session";
import { billingHttpQuery } from "../packages/integrations/billing-http-runtime";
import type { LiveCustomerDatabaseClient } from "../packages/integrations/live-customer-worker";

function fixture() {
  const calls: string[] = [];
  let connects = 0,
    ends = 0,
    identities = 0,
    fail = false,
    role = "kxra_billing_worker";
  const client: LiveCustomerDatabaseClient = {
    connect: async () => {
      connects++;
    },
    end: async () => {
      ends++;
    },
    query: async (text) => {
      calls.push(text);
      if (text === "select session_user,current_user") {
        identities++;
        return {
          rows: [{ session_user: "kxra_billing_runner", current_user: role }],
        };
      }
      if (text === "select guarded()" && fail)
        throw Error("PRIVATE_SQL_OR_CREDENTIAL");
      return { rows: [{ result: true }] };
    },
  };
  return {
    client,
    calls,
    get connects() {
      return connects;
    },
    get ends() {
      return ends;
    },
    get identities() {
      return identities;
    },
    set fail(v: boolean) {
      fail = v;
    },
    set role(v: string) {
      role = v;
    },
  };
}
function session(f: ReturnType<typeof fixture>) {
  return createBillingRefreshSession({
    createClient: async () => f.client,
    stopAt: Date.now() + 1000,
  });
}
test("one invocation reuses one connection but commits and verifies identity per transaction", async () => {
  const f = fixture(),
    s = session(f);
  for (let i = 0; i < 20; i++) {
    await s.query("select guarded()");
    assert.equal(
      f.calls.at(-1),
      "commit",
      "No transaction remains open for provider work",
    );
  }
  assert.equal(f.connects, 1);
  assert.equal(f.identities, 20);
  assert.equal(f.calls.filter((c) => c === "begin").length, 20);
  assert.equal(f.ends, 0);
  await s.close();
  await s.close();
  assert.equal(f.ends, 1);
  await assert.rejects(s.query("select guarded()"));
});
test("separate invocations never share a connection or principal", async () => {
  const a = fixture(),
    b = fixture(),
    first = session(a),
    second = session(b);
  try {
    await first.query("select guarded()");
    await second.query("select guarded()");
  } finally {
    await first.close();
    await second.close();
  }
  assert.equal(a.connects, 1);
  assert.equal(b.connects, 1);
});
test("SQL failure rolls back, sanitizes and permanently closes rather than retrying", async () => {
  const f = fixture(),
    s = session(f);
  f.fail = true;
  await assert.rejects(
    s.query("select guarded()"),
    /^Error: BILLING_REFRESH_SESSION_UNAVAILABLE$/,
  );
  assert.ok(f.calls.includes("rollback"));
  const before = f.calls.length;
  await assert.rejects(s.query("select guarded()"));
  assert.equal(f.calls.length, before);
  await s.close();
  assert.equal(f.ends, 1);
});
test("identity is rechecked on reuse and a changed role denies before protected SQL", async () => {
  const f = fixture(),
    s = session(f);
  await s.query("select guarded()");
  f.role = "postgres";
  await assert.rejects(s.query("select guarded()"));
  assert.equal(f.calls.filter((c) => c === "select guarded()").length, 1);
  assert.ok(f.calls.includes("rollback"));
  await s.close();
});
test("overlap is refused immediately without queueing, reconnecting or mixing transactions", async () => {
  const f = fixture();
  let release!: () => void;
  const connect = new Promise<void>((r) => {
    release = r;
  });
  const s = createBillingRefreshSession({
    createClient: async () => ({ ...f.client, connect: () => connect }),
    stopAt: Date.now() + 1000,
  });
  const first = s.query("select guarded()");
  await assert.rejects(
    s.query("select other()"),
    /BILLING_REFRESH_SESSION_BUSY/,
  );
  release();
  await first;
  await s.close();
  assert.ok(!f.calls.includes("select other()"));
});
test("deadline aborts hung queries and never admits a later query", async () => {
  const f = fixture();
  const s = createBillingRefreshSession({
    createClient: async () => ({
      ...f.client,
      query: async () => new Promise(() => {}),
    }),
    stopAt: Date.now() + 15,
  });
  await assert.rejects(s.query("select guarded()"));
  await s.close();
  assert.equal(f.ends, 1);
  await assert.rejects(s.query("select guarded()"));
});
test("close before lazy creation touches nothing; late factory completion closes its client", async () => {
  const f = fixture();
  let factories = 0;
  const empty = createBillingRefreshSession({
    createClient: async () => {
      factories++;
      return f.client;
    },
    stopAt: Date.now() + 1000,
  });
  await empty.close();
  assert.equal(factories, 0);
  let resolve!: (v: LiveCustomerDatabaseClient) => void;
  const late = createBillingRefreshSession({
    createClient: () =>
      new Promise((r) => {
        resolve = r;
      }),
    stopAt: Date.now() + 15,
  });
  const work = late.query("select guarded()");
  await assert.rejects(work);
  await late.close();
  resolve(f.client);
  await new Promise((r) => setImmediate(r));
  assert.equal(f.connects, 0);
  assert.equal(f.ends, 1);
});
test("close failure or unresponsive cleanup is finite and never exposes driver errors", async () => {
  for (const end of [
    () => {
      throw Error("PRIVATE_SYNCHRONOUS_PASSWORD");
    },
    async () => {
      throw Error("PRIVATE_PASSWORD");
    },
    async () => new Promise<void>(() => {}),
  ]) {
    const f = fixture();
    const s = createBillingRefreshSession({
      createClient: async () => ({ ...f.client, end }),
      stopAt: Date.now() + 1000,
      cleanupMs: 5,
    });
    await s.query("select guarded()");
    await assert.rejects(
      s.close(),
      /^Error: BILLING_REFRESH_SESSION_CLOSE_UNCONFIRMED$/,
    );
    await assert.rejects(s.query("select guarded()"));
  }
});
test("invalid deadlines and unbounded cleanup are refused before creating clients", () => {
  for (const stopAt of [0, NaN, Infinity, Date.now() + 60000])
    assert.throws(() =>
      createBillingRefreshSession({
        createClient: async () => fixture().client,
        stopAt,
      }),
    );
  assert.throws(() =>
    createBillingRefreshSession({
      createClient: async () => fixture().client,
      stopAt: Date.now() + 100,
      cleanupMs: 1001,
    }),
  );
});
test("connection-setup count falls from twenty to one without fewer transaction identity checks", async () => {
  const before = fixture(),
    after = fixture();
  const oldQuery = billingHttpQuery({} as never, Date.now() + 1000, {
    clientFactory: async () => before.client,
  });
  const fresh = session(after);
  for (let i = 0; i < 20; i++) {
    await oldQuery("select guarded()");
    await fresh.query("select guarded()");
  }
  await fresh.close();
  assert.equal(before.connects, 20);
  assert.equal(after.connects, 1);
  assert.equal(before.identities, 20);
  assert.equal(after.identities, 20);
  assert.equal(before.ends, 20);
  assert.equal(after.ends, 1);
});

test("cleanup time is reserved within the receipt deadline, not appended to it", async () => {
  const f = fixture();
  let now = 0;
  const s = createBillingRefreshSession({
    stopAt: 100,
    cleanupMs: 10,
    nowMs: () => now,
    createClient: async () => ({
      ...f.client,
      query: async (text, values) => {
        if (text === "select guarded()") now = 90;
        return f.client.query(text, values);
      },
    }),
  });
  await assert.rejects(s.query("select guarded()"));
  assert.ok(f.calls.includes("rollback"));
  assert.ok(!f.calls.includes("commit"));
  await s.close();
  assert.equal(f.ends, 1);
});

test("idle driver errors are contained and invalidate reuse without exposing raw errors", async () => {
  const f = fixture(),
    events = new EventEmitter();
  const s = createBillingRefreshSession({
    stopAt: Date.now() + 1000,
    createClient: async () => ({
      ...f.client,
      on: (event, listener) => events.on(event, listener),
    }),
  });
  await s.query("select guarded()");
  assert.doesNotThrow(() =>
    events.emit("error", Error("PRIVATE_DRIVER_CREDENTIAL")),
  );
  await assert.rejects(
    s.query("select guarded()"),
    /^Error: BILLING_REFRESH_SESSION_EXPIRED$/,
  );
  await s.close();
  assert.equal(f.connects, 1);
  assert.equal(f.ends, 1);
});
