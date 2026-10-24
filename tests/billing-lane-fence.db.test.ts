import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";

// SOURCE ONLY until owner runs sequentially with migrations0100–0103 on disposable local PG.
// Committed synthetic tenants/intents remain; no immutable receipt is deleted.
const offer = "KXRA_STARTER_V1";
const hash = crypto
  .createHash("sha256")
  .update("synthetic-concurrency-review")
  .digest("hex");
type Tenant = { org: string; actor: string; intent: string };
type Isolation = "read committed" | "repeatable read";
type Outcome =
  { ok: true; result: pg.QueryResult } | { ok: false; error: unknown };

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

async function begin(
  client: pg.Client,
  tenant?: Tenant,
  isolation: Isolation = "read committed",
) {
  await client.query(`begin isolation level ${isolation}`);
  await client.query("set local statement_timeout='10s'");
  if (tenant) {
    // Local superuser impersonation only; no role/grant/credential creation.
    await client.query("set local session authorization kxra_app");
    await client.query("set local role authenticated");
    await client.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        tenant.actor,
        JSON.stringify({
          sub: tenant.actor,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
          email_verified: true,
        }),
        tenant.org,
      ],
    );
    const context = (
      await client.query(
        "select session_user,current_user,auth.uid() actor,auth.jwt()->>'aal' aal,auth.jwt()->>'auth_time' auth_time",
      )
    ).rows[0];
    assert.equal(context.session_user, "kxra_app");
    assert.equal(context.current_user, "authenticated");
    assert.equal(context.actor, tenant.actor);
    assert.equal(context.aal, "aal2");
    assert.equal(
      (
        await client.query(
          "select count(*)::int n from kxra.organisation_memberships where account_id=$1",
          [tenant.actor],
        )
      ).rows[0].n,
      1,
    );
    assert.ok(Number(context.auth_time) >= Math.floor(Date.now() / 1000) - 5);
  }
}

async function blocked(admin: pg.Client, pid: number) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const row = (
      await admin.query(
        "select wait_event_type from pg_stat_activity where pid=$1",
        [pid],
      )
    ).rows[0];
    if (row?.wait_event_type === "Lock") return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail("Second independent transaction never reached lock contention");
}

async function contend(
  admin: pg.Client,
  cfg: pg.ClientConfig,
  tenant: Tenant,
  isolation: Isolation,
  firstSql: string,
  firstValues: unknown[],
  secondSql: string,
  secondValues: unknown[],
  firstAdmin = false,
) {
  const first = new pg.Client(cfg),
    second = new pg.Client(cfg);
  let pending: Promise<Outcome> | undefined;
  await Promise.all([first.connect(), second.connect()]);
  try {
    await Promise.all([
      begin(first, firstAdmin ? undefined : tenant, isolation),
      begin(second, tenant, isolation),
    ]);
    const pid1 = (await first.query("select pg_backend_pid() pid")).rows[0].pid;
    const pid2 = (await second.query("select pg_backend_pid() pid")).rows[0]
      .pid;
    assert.notEqual(pid1, pid2);
    const result = await first.query(firstSql, firstValues);
    pending = second.query(secondSql, secondValues).then(
      (result) => ({ ok: true as const, result }),
      (error) => ({ ok: false as const, error }),
    );
    await blocked(admin, pid2);
    await first.query("commit");
    const other = await pending;
    await second.query(other.ok ? "commit" : "rollback");
    return { first: result, second: other };
  } finally {
    await first.query("rollback").catch(() => {});
    if (pending) await pending;
    await second.query("rollback").catch(() => {});
    await Promise.all([first.end(), second.end()]);
  }
}

async function transaction(
  cfg: pg.ClientConfig,
  tenant: Tenant | undefined,
  sql: string,
  values: unknown[],
) {
  const db = new pg.Client(cfg);
  await db.connect();
  try {
    await begin(db, tenant);
    const result = await db.query(sql, values);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    await db.end();
  }
}

function assertLoser(outcome: Outcome, isolation: Isolation) {
  assert.equal(
    outcome.ok,
    false,
    "Opposite billing lanes must never both commit",
  );
  if (!outcome.ok) {
    const error = outcome.error as { code: string; message: string };
    if (isolation === "repeatable read")
      assert.equal(
        error.code,
        "40001",
        "A stale snapshot must serialize-fail, never admit both lanes",
      );
    else {
      assert.ok(["42501", "P0001"].includes(error.code));
      assert.match(
        error.message,
        /another billing lane|Existing billing state cannot become a fresh live customer/,
      );
    }
  }
}

async function denied(db: pg.Client, sql: string, values: unknown[] = []) {
  await db.query("savepoint lane_denial");
  try {
    await assert.rejects(db.query(sql, values), { code: "42501" });
  } finally {
    await db.query("rollback to savepoint lane_denial");
    await db.query("release savepoint lane_denial");
  }
}

test("reciprocal billing lanes: both concurrency winners, stale snapshots, tenant scope, legacy preservation and no grants", async () => {
  const cfg = configuration();
  const admin = new pg.Client(cfg);
  await admin.connect();
  let cleanup = false;
  let revision = 0;
  const tenants: Tenant[] = Array.from({ length: 9 }, () => ({
    org: crypto.randomUUID(),
    actor: crypto.randomUUID(),
    intent: crypto.randomUUID(),
  }));
  const legacySql = "select * from kxra.request_billing_customer($1)";
  const liveSql =
    "select kxra_private.request_live_customer_intent($1,$2) value";
  try {
    await admin.query("begin");
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
        "select coalesce(max(revision),0)+1 revision from kxra_private.live_billing_mappings where offer_key=$1",
        [offer],
      )
    ).rows[0].revision;
    await admin.query(
      `insert into kxra_private.live_billing_mappings(offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method)
      values($1,$2,true,'acct_1Rv3KdC84VkhhIRz','price_1UTbq7C84VkhhIRzkBHEHivV','prod_VUb2kv7rUiTeiu','bpc_syntheticLaneFence',$3,$3,$3,'inclusive',false,'card')`,
      [offer, revision, hash],
    );
    for (const tenant of tenants) {
      await admin.query(
        "insert into kxra.organisations(id,name,slug) values($1,'Synthetic billing lane fence',$2)",
        [tenant.org, `synthetic-lane-${tenant.org}`],
      );
      await admin.query(
        "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
        [tenant.actor, `synthetic-${tenant.actor}`],
      );
      await admin.query(
        "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic customer admin','LOCAL_LANE_FENCE_TEST')",
        [tenant.org, tenant.actor],
      );
    }
    await admin.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1 where singleton",
      [hash],
    );
    cleanup = true;
    await admin.query("commit");

    let n = 0;
    for (const isolation of ["read committed", "repeatable read"] as const) {
      for (const winner of ["LEGACY", "LIVE"] as const) {
        const tenant = tenants[n++];
        const requestId = crypto.randomUUID();
        const firstSql = winner === "LEGACY" ? legacySql : liveSql;
        const secondSql = winner === "LEGACY" ? liveSql : legacySql;
        const firstValues =
          winner === "LEGACY" ? [requestId] : [tenant.intent, offer];
        const secondValues =
          winner === "LEGACY" ? [tenant.intent, offer] : [requestId];
        const result = await contend(
          admin,
          cfg,
          tenant,
          isolation,
          firstSql,
          firstValues,
          secondSql,
          secondValues,
        );
        assert.equal(result.first.rowCount, 1);
        assertLoser(result.second, isolation);
        const counts = (
          await admin.query(
            `select
          (select count(*)::int from kxra.billing_customer_intents where org_id=$1) legacy,
          (select count(*)::int from kxra_private.live_customer_intents where org_id=$1) live,
          (select lane from kxra_private.billing_admission_lanes where org_id=$1) lane`,
            [tenant.org],
          )
        ).rows[0];
        assert.deepEqual(counts, {
          legacy: winner === "LEGACY" ? 1 : 0,
          live: winner === "LIVE" ? 1 : 0,
          lane: winner,
        });
      }
    }

    // A reviewed binding may already hold live-billing only: no reverse pilot lock.
    const bound = tenants[4];
    const boundCustomer = `cus_${crypto.randomBytes(12).toString("hex")}`;
    const bindingRace = await contend(
      admin,
      cfg,
      bound,
      "read committed",
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision) values($1,$2,$3,$4) returning customer_id",
      [bound.org, boundCustomer, offer, revision],
      legacySql,
      [crypto.randomUUID()],
      true,
    );
    assert.equal(bindingRace.first.rows[0].customer_id, boundCustomer);
    assertLoser(bindingRace.second, "read committed");

    // Tenant-local locks: an unrelated legacy request completes while LIVE holds its org.
    const holding = new pg.Client(cfg);
    await holding.connect();
    try {
      await begin(holding, tenants[5]);
      await holding.query(liveSql, [tenants[5].intent, offer]);
      const unrelated = await transaction(cfg, tenants[6], legacySql, [
        crypto.randomUUID(),
      ]);
      assert.equal(unrelated.rowCount, 1);
      await holding.query("commit");
    } finally {
      await holding.query("rollback").catch(() => {});
      await holding.end();
    }

    // Existing legacy customer/intent behavior remains unchanged and never converts.
    const old = tenants[6];
    const oldIntent = (
      await admin.query(
        "select * from kxra.billing_customer_intents where org_id=$1",
        [old.org],
      )
    ).rows[0];
    const oldCustomer = `cus_${crypto.randomBytes(12).toString("hex")}`;
    const recorded = new pg.Client(cfg);
    await recorded.connect();
    try {
      await recorded.query("begin");
      await recorded.query("set local role kxra_billing_worker");
      assert.equal(
        (
          await recorded.query(
            "select kxra_private.record_stripe_billing_customer($1,$2,now(),false) value",
            [oldIntent.id, oldCustomer],
          )
        ).rows[0].value,
        "READY",
      );
      await recorded.query("commit");
    } finally {
      await recorded.query("rollback").catch(() => {});
      await recorded.end();
    }
    const before = (
      await admin.query(
        "select to_jsonb(c) row from kxra.billing_customers c where org_id=$1",
        [old.org],
      )
    ).rows[0].row;
    const replay = await transaction(cfg, old, legacySql, [
      crypto.randomUUID(),
    ]);
    assert.equal(replay.rows[0].provider_customer_id, oldCustomer);
    await assert.rejects(
      transaction(cfg, old, liveSql, [old.intent, offer]),
      /Existing billing state cannot become a fresh live customer/,
    );
    assert.deepEqual(
      (
        await admin.query(
          "select to_jsonb(c) row from kxra.billing_customers c where org_id=$1",
          [old.org],
        )
      ).rows[0].row,
      before,
    );

    // NULL provider receipts gain a lane only when assigned; live assignment is denied.
    const receipt = crypto.randomUUID();
    await admin.query(
      `insert into kxra.billing_provider_events(id,provider_event_id,event_type,provider_created_at,livemode,provider_customer_id,provider_subscription_id,provider_price_id,payload_hash)
      values($1,$2,'customer.subscription.created',now(),false,'cus_syntheticReceipt','sub_syntheticReceipt','price_syntheticReceipt',$3)`,
      [receipt, `evt_${crypto.randomBytes(12).toString("hex")}`, hash],
    );
    await admin.query("begin");
    await denied(
      admin,
      "update kxra.billing_provider_events set org_id=$2 where id=$1",
      [receipt, bound.org],
    );
    assert.equal(
      (
        await admin.query(
          "select org_id from kxra.billing_provider_events where id=$1",
          [receipt],
        )
      ).rows[0].org_id,
      null,
    );
    await admin.query(
      "update kxra.billing_provider_events set org_id=$2 where id=$1",
      [receipt, tenants[7].org],
    );
    assert.equal(
      (
        await admin.query(
          "select lane from kxra_private.billing_admission_lanes where org_id=$1",
          [tenants[7].org],
        )
      ).rows[0].lane,
      "LEGACY",
    );
    await admin.query("commit");
    await assert.rejects(
      transaction(cfg, tenants[7], liveSql, [tenants[7].intent, offer]),
      /Existing billing state cannot become a fresh live customer/,
    );

    // Permanent reservations cannot be relabelled/deleted, even by test admin.
    await admin.query("begin");
    await denied(
      admin,
      "update kxra_private.billing_admission_lanes set lane='LEGACY' where org_id=$1",
      [bound.org],
    );
    await denied(
      admin,
      "delete from kxra_private.billing_admission_lanes where org_id=$1",
      [bound.org],
    );
    await admin.query("rollback");
    for (const role of ["anon", "authenticated", "kxra_billing_worker"]) {
      const privileges = (
        await admin.query(
          `select has_table_privilege($1,'kxra_private.billing_admission_lanes','SELECT,INSERT,UPDATE,DELETE') table_access,
        has_function_privilege($1,'kxra_private.guard_billing_admission_lane()','EXECUTE') guard_access,
        has_function_privilege($1,'kxra_private.guard_billing_admission_lane_identity()','EXECUTE') identity_access`,
          [role],
        )
      ).rows[0];
      assert.deepEqual(privileges, {
        table_access: false,
        guard_access: false,
        identity_access: false,
      });
      await admin.query("begin");
      await admin.query(`set local role ${role}`);
      await denied(admin, "select * from kxra_private.billing_admission_lanes");
      await admin.query("rollback");
    }
  } finally {
    await admin.query("rollback").catch(() => {});
    try {
      if (cleanup) {
        await admin.query("begin");
        await admin.query(
          "update kxra_private.live_billing_activation set enabled=false where singleton",
        );
        await admin.query(
          "update kxra_private.live_billing_mappings set enabled=false where offer_key=$1 and revision=$2",
          [offer, revision],
        );
        await admin.query("commit");
        assert.equal(
          (
            await admin.query(
              "select enabled from kxra_private.live_billing_activation where singleton",
            )
          ).rows[0].enabled,
          false,
        );
      }
    } finally {
      await admin.end();
    }
  }
});
