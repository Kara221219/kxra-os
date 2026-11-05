import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import pg from "pg";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import { createBillingRefreshSession } from "../../packages/integrations/billing-refresh-session";
import { billingHttpQuery } from "../../packages/integrations/billing-http-runtime";
assert.ok(
  localModeConfiguration(process.env),
  "Explicit synthetic fixture required",
);
const root = fs.realpathSync(process.env.KXRA_RUNTIME!);
assert.ok(
  root.startsWith("/tmp/kxra-rs-") || root.startsWith("/private/tmp/kxra-rs-"),
);
assert.equal(fs.statSync(root).mode & 0o077, 0);
const cfg = JSON.parse(
  fs.readFileSync(path.join(root, "fixture.json"), "utf8"),
);
assert.equal(fs.realpathSync(cfg.host), path.join(root, "socket"));
assert.equal(cfg.database, "postgres");
assert.equal(cfg.user, "kxra_billing_runner");
assert.ok(!cfg.password && !cfg.ssl && !cfg.connectionString);
const admin = new pg.Client({ ...cfg, user: os.userInfo().username });
test.before(async () => {
  await admin.connect();
  const row = (await admin.query("show data_directory")).rows[0];
  assert.equal(
    fs.realpathSync(row.data_directory),
    path.join(root, "postgres"),
  );
});
function fixture(user = cfg.user, duration = 2000) {
  let connections = 0,
    ends = 0;
  const createClient = async () => {
    const c = new pg.Client({ ...cfg, user, query_timeout: 2000 });
    return {
      on: (event: "error", listener: () => void) => c.on(event, listener),
      connect: async () => {
        connections++;
        await c.connect();
      },
      query: async (text: string, values: unknown[] = []) =>
        c.query(text, values),
      end: async () => {
        ends++;
        await c.end();
      },
    };
  };
  return {
    session: createBillingRefreshSession({
      createClient,
      stopAt: Date.now() + duration,
    }),
    createClient,
    get connections() {
      return connections;
    },
    get ends() {
      return ends;
    },
  };
}
test.after(async () => {
  await admin.end();
});
test("native runner reuses one socket for twenty separately committed verified transactions", async () => {
  const f = fixture(),
    pids = new Set();
  try {
    for (let i = 0; i < 20; i++) {
      const r = await f.session.query(
        "select pg_backend_pid() pid,session_user,current_user",
      );
      const v = r.rows[0];
      pids.add(v.pid);
      assert.equal(v.session_user, "kxra_billing_runner");
      assert.equal(v.current_user, "kxra_billing_worker");
      const activity = (
        await admin.query(
          "select state,xact_start from pg_stat_activity where pid=$1",
          [v.pid],
        )
      ).rows[0];
      assert.equal(activity.state, "idle");
      assert.equal(activity.xact_start, null);
    }
  } finally {
    await f.session.close();
  }
  assert.equal(pids.size, 1);
  assert.equal(f.connections, 1);
  assert.equal(f.ends, 1);
  const old = fixture();
  const oldPids = new Set();
  const before = billingHttpQuery({} as never, Date.now() + 3000, {
    clientFactory: old.createClient,
  });
  for (let i = 0; i < 20; i++)
    oldPids.add((await before("select pg_backend_pid() pid")).rows[0].pid);
  await old.session.close();
  assert.equal(oldPids.size, 20);
  assert.equal(old.connections, 20);
  assert.equal(old.ends, 20);
});
test("native transaction-local RLS scope and role do not leak between reuse or sessions", async () => {
  const f = fixture(),
    other = fixture();
  try {
    assert.deepEqual(
      (await f.session.query("select * from public.fixture_scope_read()")).rows,
      [{ scope: "A" }],
    );
    assert.deepEqual(
      (await f.session.query("select scope from public.fixture_scope_probe"))
        .rows,
      [],
    );
    assert.deepEqual(
      (
        await other.session.query(
          "select scope from public.fixture_scope_probe",
        )
      ).rows,
      [],
    );
  } finally {
    await f.session.close();
    await other.session.close();
  }
});
test("native admin identity cannot impersonate genuine login runner", async () => {
  const f = fixture(os.userInfo().username);
  await assert.rejects(f.session.query("select 1"), /SESSION_UNAVAILABLE/);
  await f.session.close();
  assert.equal(f.ends, 1);
});
test("native SQL errors close and deny subsequent dispatch rather than reconnecting", async () => {
  const f = fixture();
  await assert.rejects(
    f.session.query("select * from public.does_not_exist"),
    /^Error: BILLING_REFRESH_SESSION_UNAVAILABLE$/,
  );
  await assert.rejects(f.session.query("select 1"));
  await f.session.close();
  assert.equal(f.connections, 1);
  assert.equal(f.ends, 1);
});
test("native overlap rejects work without queueing behind a held transaction", async () => {
  const f = fixture();
  const first = f.session.query("select pg_sleep(0.1)");
  await assert.rejects(f.session.query("select 2"), /SESSION_BUSY/);
  await first;
  await f.session.close();
  assert.equal(f.connections, 1);
});
test("native hung statement is bounded by invocation expiry and cannot extend the session", async () => {
  const f = fixture(cfg.user, 150);
  await assert.rejects(f.session.query("select pg_sleep(10)"));
  await f.session.close();
  await assert.rejects(f.session.query("select 1"));
  assert.equal(f.connections, 1);
  assert.equal(f.ends, 1);
});

test("native worker membership withdrawal is rechecked on an already connected session", async () => {
  const f = fixture();
  try {
    await f.session.query("select 1");
    await admin.query("revoke kxra_billing_worker from kxra_billing_runner");
    await assert.rejects(f.session.query("select 1"), /SESSION_UNAVAILABLE/);
    await assert.rejects(f.session.query("select 1"));
  } finally {
    await f.session.close();
    await admin.query("grant kxra_billing_worker to kxra_billing_runner");
  }
  assert.equal(f.connections, 1);
  assert.equal(f.ends, 1);
});

test("native idle socket loss is handled without process crash or silent reconnection", async () => {
  const f = fixture();
  const pid = (await f.session.query("select pg_backend_pid() pid")).rows[0]
    .pid;
  const owned = (
    await admin.query(
      "select usename,datname from pg_stat_activity where pid=$1",
      [pid],
    )
  ).rows[0];
  assert.equal(owned.usename, "kxra_billing_runner");
  assert.equal(owned.datname, "postgres");
  assert.equal(
    (await admin.query("select pg_terminate_backend($1) stopped", [pid]))
      .rows[0].stopped,
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  await assert.rejects(f.session.query("select 1"));
  await f.session.close();
  assert.equal(f.connections, 1);
  assert.equal(f.ends, 1);
});
