import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";
import { readPrivateFixtureJson } from "./support/private-fixture-json";

test("durable scheduler budget is scoped, default-off, atomic across genuine runners and never reset by restart", async () => {
  assert.ok(localModeConfiguration(process.env));
  assert.ok(!process.env.DATABASE_URL && !process.env.VERCEL_ENV);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  assert.equal(fs.statSync(runtime).mode & 0o077, 0);
  const cfg = readPrivateFixtureJson(path.join(runtime, "database.json"));
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  assert.ok(
    Number.isInteger(cfg.port) && cfg.port >= 1024 && cfg.port <= 65535,
  );
  assert.match(cfg.database, /^[A-Za-z0-9_-]+$/);
  assert.equal(fs.realpathSync(cfg.host), cfg.host);
  assert.equal(fs.statSync(cfg.host).mode & 0o077, 0);
  assert.equal(fs.statSync(cfg.host).uid, process.getuid!());
  const mode = process.env.KXRA_MODERN_BILLING_TEST_MODE ?? "LIVE";
  assert.ok(mode === "LIVE" || mode === "STAGING_SANDBOX");
  const configuration = {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    password: "",
    ssl: false as const,
  };
  const admin = new pg.Client({
    ...configuration,
    user: os.userInfo().username,
  });
  let one = new pg.Client({ ...configuration, user: "kxra_billing_runner" });
  const two = new pg.Client({ ...configuration, user: "kxra_billing_runner" });
  const review = crypto.randomBytes(32).toString("hex");
  let ownedRole = false,
    scope: string | undefined;
  await admin.connect();
  const isolation = (
    await admin.query(
      "select current_setting('listen_addresses') listen,current_setting('unix_socket_directories') socket,current_database() db",
    )
  ).rows[0];
  assert.equal(isolation.listen, "");
  assert.equal(fs.realpathSync(isolation.socket), cfg.host);
  assert.equal(isolation.db, cfg.database);
  async function call(client = one, hash = review, ceiling = 64) {
    await client.query("begin");
    try {
      await client.query("set local role kxra_billing_worker");
      await client.query("set local statement_timeout='2s'");
      await client.query("set local lock_timeout='500ms'");
      const result = (
        await client.query(
          "select kxra_private.reserve_modern_scheduler_reads($1::text,$2::bigint) value",
          [hash, ceiling],
        )
      ).rows[0].value;
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
  try {
    await admin.query(
      "select pg_advisory_lock(hashtext('local-fixture-billing-runner-identity'))",
    );
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from pg_roles where rolname='kxra_billing_runner'",
        )
      ).rows[0].n,
      0,
    );
    await admin.query("begin");
    scope = (await bindSyntheticModernScope(admin.query.bind(admin), mode))
      .execution_scope.scope_id;
    await admin.query(
      "create role kxra_billing_runner login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 3",
    );
    await admin.query("grant kxra_billing_worker to kxra_billing_runner");
    ownedRole = true;
    await admin.query("commit");
    await one.connect();
    await two.connect();
    assert.equal(
      (await call()).state,
      "UNAVAILABLE",
      "missing budget is not auto-provisioned",
    );
    assert.equal(
      (
        await admin.query(
          "select relrowsecurity from pg_class where oid='kxra_private.modern_scheduler_read_budgets'::regclass",
        )
      ).rows[0].relrowsecurity,
      true,
    );
    for (const role of ["anon", "authenticated", "kxra_billing_worker"]) {
      assert.equal(
        (
          await admin.query(
            "select has_table_privilege($1,'kxra_private.modern_scheduler_read_budgets','select,insert,update,delete') allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
      if (role !== "kxra_billing_worker")
        assert.equal(
          (
            await admin.query(
              "select has_function_privilege($1,'kxra_private.reserve_modern_scheduler_reads(text,bigint)','execute') allowed",
              [role],
            )
          ).rows[0].allowed,
          false,
        );
    }
    await admin.query(
      "insert into kxra_private.modern_scheduler_read_budgets(scope_id,period_start,review_sha256,limit_reads,expires_at) values($1,date_trunc('month',clock_timestamp() at time zone 'UTC')::date,$2,64,(date_trunc('month',clock_timestamp() at time zone 'UTC')+interval '1 month') at time zone 'UTC')",
      [scope, review],
    );
    assert.equal((await call()).state, "UNAVAILABLE", "disabled by default");
    await admin.query(
      "update kxra_private.modern_scheduler_read_budgets set enabled=true where scope_id=$1",
      [scope],
    );
    await admin.query(
      "update kxra_private.modern_scheduler_read_budgets set expires_at=(period_start::timestamp at time zone 'UTC')+interval '1 microsecond' where scope_id=$1",
      [scope],
    );
    assert.equal(
      (await call()).state,
      "UNAVAILABLE",
      "expired approval cannot authorize a read",
    );
    await admin.query(
      "update kxra_private.modern_scheduler_read_budgets set expires_at=((period_start+interval '1 month')::timestamp at time zone 'UTC') where scope_id=$1",
      [scope],
    );
    assert.equal(
      (await call(one, "f".repeat(64))).state,
      "UNAVAILABLE",
      "review cannot be substituted",
    );
    assert.equal(
      (await call(one, review, 63)).state,
      "UNAVAILABLE",
      "smaller operator ceiling cannot authorize a larger database budget",
    );
    await one.query("begin");
    await one.query("set local role kxra_billing_worker");
    await assert.rejects(
      one.query(
        "update kxra_private.modern_scheduler_read_budgets set used_reads=0",
      ),
    );
    await one.query("rollback");
    const racers = await Promise.all([call(one), call(two)]);
    assert.equal(racers.filter((r) => r.state === "GRANTED").length, 2);
    assert.deepEqual(
      racers.map((r) => Number(r.remaining_reads)).sort((a, b) => a - b),
      [0, 32],
    );
    assert.ok(racers.every((r) => r.reserved_reads === 32));
    assert.equal((await call()).state, "UNAVAILABLE");
    await one.end();
    one = new pg.Client({ ...configuration, user: "kxra_billing_runner" });
    await one.connect();
    assert.equal(
      (await call()).state,
      "UNAVAILABLE",
      "new connection/process has no fresh budget",
    );
    assert.equal(
      Number(
        (
          await admin.query(
            "select used_reads from kxra_private.modern_scheduler_read_budgets where scope_id=$1",
            [scope],
          )
        ).rows[0].used_reads,
      ),
      64,
    );
    await admin.query(
      "update kxra_private.modern_scheduler_read_budgets set limit_reads=95 where scope_id=$1",
      [scope],
    );
    assert.equal(
      (await call(one, review, 95)).state,
      "UNAVAILABLE",
      "partial final block cannot overrun the limit",
    );
    // Simulate replacement/reset of a monthly operator counter without erasing
    // the actual rolling day ledger. A fresh month must not double the allowance.
    await admin.query(
      "update kxra_private.modern_scheduler_read_budgets set used_reads=0,limit_reads=64 where scope_id=$1",
      [scope],
    );
    assert.equal(
      (await call()).state,
      "UNAVAILABLE",
      "rolling ledger fences a reset monthly counter",
    );
    assert.equal(
      Number(
        (
          await admin.query(
            "select sum(used_reads) used from kxra_private.modern_scheduler_read_days where scope_id=$1",
            [scope],
          )
        ).rows[0].used,
      ),
      64,
    );
    await admin.query(
      "update kxra_private.modern_billing_execution_identity set enabled=false where singleton",
    );
    await assert.rejects(call());
    await admin.query(
      "update kxra_private.modern_billing_execution_identity set enabled=true where singleton",
    );
  } finally {
    await one.end().catch(() => {});
    await two.end().catch(() => {});
    await admin.query("rollback").catch(() => {});
    if (scope) {
      await admin.query(
        "update kxra_private.modern_scheduler_read_budgets set enabled=false where scope_id=$1",
        [scope],
      );
      await admin.query(
        "update kxra_private.modern_billing_execution_identity set enabled=true where singleton",
      );
    }
    if (ownedRole) {
      await admin.query("revoke kxra_billing_worker from kxra_billing_runner");
      await admin.query("drop role kxra_billing_runner");
    }
    await admin.query(
      "select pg_advisory_unlock(hashtext('local-fixture-billing-runner-identity'))",
    );
    await admin.end();
  }
});
