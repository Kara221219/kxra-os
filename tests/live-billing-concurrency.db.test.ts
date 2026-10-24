import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";

// SOURCE ONLY until integration owner runs sequentially on disposable local PG.
// Committed synthetic tenants/intents remain; no immutable receipt is deleted.
const offer = "KXRA_STARTER_V1";
const hash = crypto
  .createHash("sha256")
  .update("synthetic-concurrency-review")
  .digest("hex");
type Tenant = { org: string; actor: string; intent: string };
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

async function begin(client: pg.Client, tenant?: Tenant) {
  await client.query("begin");
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
    assert.ok(Number(context.auth_time) >= Math.floor(Date.now() / 1000) - 5);
  } else await client.query("set local role kxra_billing_worker");
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

// First transaction retains its lock while the second SQL is actually submitted.
// Observe PG lock contention, then commit first and inspect second's real outcome.
async function contend(
  admin: pg.Client,
  cfg: pg.ClientConfig,
  sql: string,
  firstValues: unknown[],
  secondValues: unknown[],
  tenant?: Tenant,
) {
  const first = new pg.Client(cfg),
    second = new pg.Client(cfg);
  let pending: Promise<Outcome> | undefined;
  await Promise.all([first.connect(), second.connect()]);
  try {
    await Promise.all([begin(first, tenant), begin(second, tenant)]);
    const pid1 = (await first.query("select pg_backend_pid() pid")).rows[0].pid;
    const pid2 = (await second.query("select pg_backend_pid() pid")).rows[0]
      .pid;
    assert.notEqual(pid1, pid2);
    const result = await first.query(sql, firstValues);
    pending = second.query(sql, secondValues).then(
      (result) => ({ ok: true as const, result }),
      (error) => ({ ok: false as const, error }),
    );
    await blocked(admin, pid2);
    await first.query("commit");
    const other = await pending;
    await second.query(other.ok ? "commit" : "rollback");
    return { first: result, second: other };
  } finally {
    // Release locks even when the contention assertion fails; retain failed evidence.
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
  const client = new pg.Client(cfg);
  await client.connect();
  try {
    await begin(client, tenant);
    const result = await client.query(sql, values);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

function denied(outcome: Outcome, message: RegExp) {
  assert.equal(outcome.ok, false);
  if (!outcome.ok)
    assert.match(String((outcome.error as Error).message), message);
}

test("live billing: separate transactions serialize checkout, claim and uncertain completion; queued gates recheck", async () => {
  const cfg = configuration();
  const admin = new pg.Client(cfg);
  await admin.connect();
  let cleanup = false;
  let revision = 0;
  const tenants: Tenant[] = Array.from({ length: 4 }, () => ({
    org: crypto.randomUUID(),
    actor: crypto.randomUUID(),
    intent: crypto.randomUUID(),
  }));
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
      "Do not reuse an active fixture mapping",
    );
    revision = (
      await admin.query(
        "select coalesce(max(revision),0)+1 revision from kxra_private.live_billing_mappings where offer_key=$1",
        [offer],
      )
    ).rows[0].revision;
    await admin.query(
      `insert into kxra_private.live_billing_mappings(offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method)
      values($1,$2,true,'acct_1Rv3KdC84VkhhIRz','price_1UTbq7C84VkhhIRzkBHEHivV','prod_VUb2kv7rUiTeiu','bpc_syntheticConcurrent',$3,$3,$3,'inclusive',false,'card')`,
      [offer, revision, hash],
    );
    for (const tenant of tenants) {
      await admin.query(
        "insert into kxra.organisations(id,name,slug) values($1,'Synthetic ledger concurrency',$2)",
        [tenant.org, `synthetic-concurrent-${tenant.org}`],
      );
      await admin.query(
        "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'FIXTURE',$2,'ACTIVE',now())",
        [tenant.actor, `synthetic-${tenant.actor}`],
      );
      await admin.query(
        "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic concurrency admin','LOCAL_CONCURRENCY_TEST')",
        [tenant.org, tenant.actor],
      );
      await admin.query(
        "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision) values($1,$2,$3,$4)",
        [
          tenant.org,
          `cus_${crypto.randomBytes(12).toString("hex")}`,
          offer,
          revision,
        ],
      );
    }
    await admin.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1 where singleton",
      [hash],
    );
    cleanup = true;
    await admin.query("commit");

    const tenant = tenants[0];
    const request =
      "select kxra_private.request_live_billing_intent($1,'CHECKOUT',$2) value";
    const reserved = await contend(
      admin,
      cfg,
      request,
      [tenant.intent, offer],
      [crypto.randomUUID(), offer],
      tenant,
    );
    assert.deepEqual(reserved.first.rows[0].value, {
      id: tenant.intent,
      state: "REQUESTED",
      entitlement_authority: false,
    });
    denied(
      reserved.second,
      /Live intent unavailable; reconcile original request/,
    );
    const canonical = await transaction(cfg, tenant, request, [
      tenant.intent,
      offer,
    ]);
    assert.deepEqual(canonical.rows[0].value, reserved.first.rows[0].value);
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra_private.live_billing_intents where org_id=$1 and kind='CHECKOUT'",
          [tenant.org],
        )
      ).rows[0].n,
      1,
    );

    const claim = "select kxra_private.claim_live_billing_intent($1) value";
    const claimed = await contend(
      admin,
      cfg,
      claim,
      [tenant.intent],
      [tenant.intent],
    );
    assert.equal(claimed.first.rows[0].value.intent.id, tenant.intent);
    assert.equal(claimed.first.rows[0].value.entitlement_authority, false);
    denied(claimed.second, /Live intent changed, consumed or expired/);
    const before = (
      await admin.query(
        "select state,consumed_at from kxra_private.live_billing_intents where id=$1",
        [tenant.intent],
      )
    ).rows[0];
    assert.equal(before.state, "INFLIGHT");
    assert.ok(before.consumed_at);

    const finish =
      "select kxra_private.finish_live_billing_intent($1,'UNCERTAIN',null,$2) value";
    const finished = await contend(
      admin,
      cfg,
      finish,
      [tenant.intent, hash],
      [tenant.intent, hash],
    );
    assert.equal(finished.first.rows[0].value, "UNCERTAIN");
    assert.equal(finished.second.ok, true);
    if (finished.second.ok)
      assert.equal(finished.second.result.rows[0].value, "UNCERTAIN");
    const after = (
      await admin.query(
        "select state,consumed_at,provider_session_id,result_sha256 from kxra_private.live_billing_intents where id=$1",
        [tenant.intent],
      )
    ).rows[0];
    assert.equal(after.state, "UNCERTAIN");
    assert.equal(after.consumed_at.getTime(), before.consumed_at.getTime());
    assert.equal(after.provider_session_id, null);
    assert.equal(after.result_sha256, hash);
    await assert.rejects(
      transaction(cfg, tenant, request, [crypto.randomUUID(), offer]),
      /reconcile original request/,
    );

    // Prepare queued requests while authorization/mapping are valid.
    for (const queued of tenants.slice(1))
      await transaction(cfg, queued, request, [queued.intent, offer]);
    await admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1 and account_id=$2",
      [tenants[1].org, tenants[1].actor],
    );
    await assert.rejects(
      transaction(cfg, undefined, claim, [tenants[1].intent]),
      { code: "42501" },
    );
    // Simulated elapsed queue time only: preserve expiry CHECK constraints and fresh MFA.
    await admin.query(
      "update kxra_private.live_billing_intents set created_at=now()-interval '21 minutes',expires_at=now()-interval '1 minute' where id=$1",
      [tenants[2].intent],
    );
    await assert.rejects(
      transaction(cfg, undefined, claim, [tenants[2].intent]),
      /Live intent changed, consumed or expired/,
    );
    await admin.query(
      "update kxra_private.live_billing_mappings set enabled=false where offer_key=$1 and revision=$2",
      [offer, revision],
    );
    await assert.rejects(
      transaction(cfg, undefined, claim, [tenants[3].intent]),
      /Live intent changed, consumed or expired/,
    );
    const queuedStates = await admin.query(
      "select state,consumed_at from kxra_private.live_billing_intents where id=any($1::uuid[])",
      [tenants.slice(1).map((value) => value.intent)],
    );
    assert.equal(queuedStates.rowCount, 3);
    assert.ok(
      queuedStates.rows.every(
        (row) => row.state === "REQUESTED" && row.consumed_at === null,
      ),
    );
    const binding = (
      await admin.query(
        "select subscription_id,version,reconcile_required from kxra_private.live_billing_bindings where org_id=$1",
        [tenant.org],
      )
    ).rows[0];
    assert.deepEqual(binding, {
      subscription_id: null,
      version: "0",
      reconcile_required: true,
    });
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
        assert.equal(
          (
            await admin.query(
              "select enabled from kxra_private.live_billing_mappings where offer_key=$1 and revision=$2",
              [offer, revision],
            )
          ).rows[0]?.enabled ?? false,
          false,
        );
      }
    } finally {
      await admin.end();
    }
  }
});
