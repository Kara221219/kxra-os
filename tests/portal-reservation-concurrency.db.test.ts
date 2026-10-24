import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";
// Automatic native SQL test SOURCE, not executed by this worker. No provider IO.
// Real independent transactions retain synthetic permanent intent/receipt history.
function configuration() {
  assert.ok(
    localModeConfiguration(process.env),
    "Explicit generated local fixture mode required",
  );
  assert.ok(!process.env.VERCEL_ENV && !process.env.VERCEL);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  for (const directory of [runtime, path.join(runtime, "socket")]) {
    const metadata = fs.statSync(directory);
    assert.equal(
      metadata.uid,
      process.getuid!(),
      "Private fixture must belong to current user",
    );
    assert.equal(
      metadata.mode & 0o077,
      0,
      "Private fixture directory must exclude group/other access",
    );
  }
  const cfg = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  assert.equal(fs.realpathSync(cfg.host), path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password, "No credentials permitted");
  assert.ok(Number.isInteger(cfg.port) && cfg.port > 0 && cfg.port <= 65535);
  assert.ok(typeof cfg.database === "string" && cfg.database.length > 0);
  // Whitelist connection fields: a receipt connectionString must never override
  // the socket we checked or silently introduce remote SSL/provider settings.
  return {
    host: path.join(runtime, "socket"),
    port: cfg.port as number,
    database: cfg.database as string,
    user: os.userInfo().username,
    password: "",
    ssl: false as const,
  };
}

test("all portal request wrappers serialize one unresolved intent; exact replay and known-consumed fresh operation", async () => {
  const cfg = configuration(),
    admin = new pg.Client(cfg);
  await admin.connect();
  const uuid = () => crypto.randomUUID(),
    org = uuid(),
    actor = uuid(),
    firstId = uuid(),
    secondId = uuid(),
    thirdId = uuid();
  assert.ok(
    [undefined, "LIVE", "STAGING_SANDBOX"].includes(
      process.env.KXRA_MODERN_BILLING_TEST_MODE,
    ),
  );
  const mode =
      process.env.KXRA_MODERN_BILLING_TEST_MODE === "STAGING_SANDBOX"
        ? "STAGING_SANDBOX"
        : "LIVE",
    prefix = mode === "LIVE" ? "" : "staging_sandbox_";
  const scopeHash = "a".repeat(64);
  let cleanup = false,
    revision = 0;
  async function start(db: pg.Client, worker = false) {
    await db.query("begin");
    await db.query("set local statement_timeout='10s'");
    if (worker) {
      await db.query("set local role kxra_billing_worker");
      return;
    }
    await db.query("set local session authorization kxra_app");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        actor,
        JSON.stringify({
          sub: actor,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
          email_verified: true,
        }),
        org,
      ],
    );
  }
  async function transaction(sql: string, values: unknown[], worker = false) {
    const db = new pg.Client(cfg);
    await db.connect();
    try {
      await start(db, worker);
      const r = await db.query(sql, values);
      await db.query("commit");
      return r.rows[0].value;
    } catch (e) {
      await db.query("rollback");
      throw e;
    } finally {
      await db.end();
    }
  }
  const requestSQL = `select kxra_private.${prefix}request_live_billing_intent($1,'PORTAL','KXRA_TEAM_V1') value`;
  try {
    const isolation = (
      await admin.query(
        "select current_setting('listen_addresses') listen,current_setting('unix_socket_directories') socket",
      )
    ).rows[0];
    assert.equal(isolation.listen, "");
    assert.equal(fs.realpathSync(isolation.socket), cfg.host);
    await admin.query("begin");
    const execution = await bindSyntheticModernScope(
        admin.query.bind(admin),
        mode,
      ),
      scope = execution.execution_scope,
      row = execution.catalogue.find((p) => p.offer_key === "KXRA_TEAM_V1")!;
    assert.equal(
      (
        await admin.query(
          "select enabled from kxra_private.live_billing_activation where singleton for update",
        )
      ).rows[0].enabled,
      false,
    );
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra_private.live_billing_mappings where enabled",
        )
      ).rows[0].n,
      0,
    );
    revision = (
      await admin.query(
        "select coalesce(max(revision),0)+1 n from kxra_private.live_billing_mappings where offer_key='KXRA_TEAM_V1'",
      )
    ).rows[0].n;
    await admin.query(
      "insert into kxra_private.live_billing_mappings(offer_key,revision,enabled,mode,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method) values('KXRA_TEAM_V1',$1,true,$2,$3,$4,$5,'bpc_syntheticportal',$6,$6,$6,'inclusive',false,'card')",
      [
        revision,
        scope.livemode ? "live" : "staging_sandbox",
        scope.account_id,
        row.price_id,
        row.product_id,
        scopeHash,
      ],
    );
    await admin.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1",
      [scopeHash],
    );
    await admin.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'Synthetic portal concurrency',$2,'CUSTOMER')",
      [org, `portal-${org}`],
    );
    await admin.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
      [actor, `synthetic-${actor}`],
    );
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic portal admin','LOCAL_PORTAL_TEST')",
      [org, actor],
    );
    await admin.query(
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,subscription_id,offer_key,mapping_revision) values($1,$2,$3,'KXRA_TEAM_V1',$4)",
      [
        org,
        `cus_${crypto.randomBytes(12).toString("hex")}`,
        `sub_${crypto.randomBytes(12).toString("hex")}`,
        revision,
      ],
    );
    await admin.query("commit");
    cleanup = true;
    const first = new pg.Client(cfg),
      second = new pg.Client(cfg);
    await Promise.all([first.connect(), second.connect()]);
    let pending:
      | Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }>
      | undefined;
    try {
      await start(first);
      await start(second);
      const secondPid = (await second.query("select pg_backend_pid() pid"))
        .rows[0].pid;
      const created = (await first.query(requestSQL, [firstId])).rows[0].value;
      assert.equal(created.state, "REQUESTED");
      pending = second.query(requestSQL, [secondId]).then(
        (r) => ({ ok: true as const, value: r.rows[0].value }),
        (error) => ({ ok: false as const, error }),
      );
      let waiting = false;
      const until = Date.now() + 5000;
      while (Date.now() < until) {
        if (
          (
            await admin.query(
              "select wait_event_type from pg_stat_activity where pid=$1",
              [secondPid],
            )
          ).rows[0]?.wait_event_type === "Lock"
        ) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      assert.equal(
        waiting,
        true,
        "Second independent portal request must contend on actual SQL lock",
      );
      await first.query("commit");
      const result = await pending;
      assert.equal(result.ok, false);
      if (!result.ok)
        assert.match(
          String((result.error as Error).message),
          /Original portal request requires reconciliation/,
        );
      await second.query("rollback");
    } finally {
      await first.query("rollback").catch(() => {});
      if (pending) await pending;
      await second.query("rollback").catch(() => {});
      await Promise.all([first.end(), second.end()]);
    }
    assert.equal((await transaction(requestSQL, [firstId])).state, "REQUESTED");
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra_private.live_billing_intents where org_id=$1 and kind='PORTAL'",
          [org],
        )
      ).rows[0].n,
      1,
    );
    // SQL worker capability test only. Runtime executor separately requires genuine
    // LOGIN runner identity; this local admin SET ROLE is not claimed as that proof.
    await transaction(
      `select kxra_private.${prefix}claim_live_billing_intent($1) value`,
      [firstId],
      true,
    );
    assert.equal((await transaction(requestSQL, [firstId])).state, "INFLIGHT");
    await assert.rejects(
      transaction(requestSQL, [secondId]),
      /Original portal request requires reconciliation/,
    );
    assert.equal(
      await transaction(
        `select kxra_private.${prefix}finish_live_billing_intent($1,'CONSUMED','bps_syntheticportal',$2) value`,
        [firstId, scopeHash],
        true,
      ),
      "CONSUMED",
    );
    assert.equal((await transaction(requestSQL, [firstId])).state, "CONSUMED");
    const consumedBefore = (
      await admin.query(
        "select to_jsonb(r) receipt from kxra_private.live_billing_intents r where id=$1",
        [firstId],
      )
    ).rows[0].receipt;
    // Synthetic committed non-quarantining event generation advance, in the exact
    // completion -> final authenticated delivery window. No provider is contacted.
    await admin.query(
      "update kxra_private.live_billing_bindings set version=version+1,reconcile_required=true where org_id=$1",
      [org],
    );
    await assert.rejects(
      transaction(requestSQL, [firstId]),
      /Consumed portal delivery no longer current/,
    );
    assert.deepEqual(
      (
        await admin.query(
          "select to_jsonb(r) receipt from kxra_private.live_billing_intents r where id=$1",
          [firstId],
        )
      ).rows[0].receipt,
      consumedBefore,
    );
    // Immutable worker completion replay stays stable even when delivery is stale.
    assert.equal(
      await transaction(
        `select kxra_private.${prefix}finish_live_billing_intent($1,'CONSUMED','bps_syntheticportal',$2) value`,
        [firstId, scopeHash],
        true,
      ),
      "CONSUMED",
    );
    assert.equal((await transaction(requestSQL, [thirdId])).state, "REQUESTED");
    await transaction(
      `select kxra_private.${prefix}claim_live_billing_intent($1) value`,
      [thirdId],
      true,
    );
    await admin.query(
      "update kxra_private.live_billing_activation set enabled=false where singleton",
    );
    assert.equal(
      await transaction(
        `select kxra_private.${prefix}finish_live_billing_intent($1,'CONSUMED','bps_syntheticlatekill',$2) value`,
        [thirdId, scopeHash],
        true,
      ),
      "UNCERTAIN",
    );
    await admin.query(
      "update kxra_private.live_billing_activation set enabled=true where singleton",
    );
    assert.equal((await transaction(requestSQL, [thirdId])).state, "UNCERTAIN");
    await assert.rejects(
      transaction(requestSQL, [uuid()]),
      /Original portal request requires reconciliation/,
    );
    const columns = (
      await admin.query(
        "select column_name from information_schema.columns where table_schema='kxra_private' and table_name='live_billing_intents' and column_name in ('url','redirect_url','bearer_url')",
      )
    ).rows;
    assert.equal(columns.length, 0);
  } finally {
    await admin.query("rollback").catch(() => {});
    try {
      if (cleanup) {
        await admin.query("begin");
        await admin.query(
          "update kxra_private.live_billing_activation set enabled=false where singleton",
        );
        await admin.query(
          "update kxra_private.live_billing_mappings set enabled=false where offer_key='KXRA_TEAM_V1' and revision=$1",
          [revision],
        );
        await admin.query("commit");
      }
    } finally {
      await admin.end();
    }
  }
});
