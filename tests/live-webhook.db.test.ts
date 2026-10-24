import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import {
  LIVE_WEBHOOK_ACCOUNT,
  LIVE_WEBHOOK_API_VERSION,
  type LiveWakeup,
} from "../packages/integrations/live-webhook";

// SOURCE ONLY until owner executes after0104–0106. No provider calls; all writes roll back.
function configuration() {
  assert.ok(localModeConfiguration(process.env));
  assert.ok(!process.env.VERCEL_ENV);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  for (const directory of [runtime, path.join(runtime, "socket")]) {
    const stat = fs.statSync(directory);
    assert.equal(stat.uid, process.getuid!());
    assert.equal(stat.mode & 0o077, 0);
  }
  const cfg = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  assert.equal(fs.realpathSync(cfg.host), path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password);
  assert.ok(Number.isInteger(cfg.port) && cfg.port > 0 && cfg.port <= 65535);
  assert.equal(typeof cfg.database, "string");
  return {
    host: path.join(runtime, "socket"),
    port: cfg.port as number,
    database: cfg.database as string,
    user: os.userInfo().username,
    password: "",
    ssl: false as const,
  };
}
const hash = (text: string) =>
  crypto.createHash("sha256").update(text).digest("hex");

test("live wakeup SQL: immutable duplicate/conflict receipts, generation invalidation, unknown holding, claims and proof-only ACK", async () => {
  const db = new pg.Client(configuration());
  await db.connect();
  const project = "jlebgsxcvhvpueuibekd";
  const org = crypto.randomUUID(),
    customer = `cus_${crypto.randomBytes(12).toString("hex")}`;
  const event: LiveWakeup = {
    event_id: `evt_${crypto.randomBytes(12).toString("hex")}`,
    event_type: "invoice.payment_failed",
    payload_sha256: hash("synthetic-safe-wakeup"),
    customer_id: customer,
    subscription_id: null,
    invoice_id: "in_syntheticWebhook",
    account_id: LIVE_WEBHOOK_ACCOUNT,
    project_ref: project,
    api_version: LIVE_WEBHOOK_API_VERSION,
    livemode: true,
  };
  async function call(sql: string, values: unknown[] = [], errorCode?: string) {
    await db.query("savepoint worker_call");
    try {
      await db.query("set local role kxra_billing_worker");
      if (errorCode) {
        await assert.rejects(db.query(sql, values), { code: errorCode });
        return;
      }
      return await db.query(sql, values);
    } finally {
      await db.query("rollback to savepoint worker_call");
      await db.query("release savepoint worker_call");
    }
  }
  // Successful worker writes must remain in the enclosing rollback transaction.
  async function worker(sql: string, values: unknown[] = []) {
    await db.query("savepoint worker_success");
    try {
      await db.query("set local role kxra_billing_worker");
      const result = await db.query(sql, values);
      await db.query("reset role");
      await db.query("release savepoint worker_success");
      return result;
    } catch (error) {
      await db.query("rollback to savepoint worker_success");
      await db.query("release savepoint worker_success");
      throw error;
    }
  }
  const record =
    "select kxra_private.record_live_billing_wakeup($1::jsonb) state";
  try {
    await db.query("begin");
    await db.query("set local statement_timeout='10s'");
    assert.equal(
      (
        await db.query(
          "select enabled from kxra_private.live_webhook_endpoint_binding where singleton",
        )
      ).rows[0].enabled,
      false,
    );
    await call(record, [JSON.stringify(event)], "P0001");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra_private.live_webhook_receipts",
        )
      ).rows[0].n,
      0,
    );
    await db.query(
      "update kxra_private.live_webhook_endpoint_binding set enabled=true,project_ref=$1,review_sha256=$2 where singleton",
      [project, hash("SYNTHETIC_ENDPOINT_REVIEW")],
    );
    const revision = (
      await db.query(
        "select coalesce(max(revision),0)+1 revision from kxra_private.live_billing_mappings where offer_key='KXRA_STARTER_V1'",
      )
    ).rows[0].revision;
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra_private.live_billing_mappings where enabled",
        )
      ).rows[0].n,
      0,
    );
    await db.query(
      `insert into kxra_private.live_billing_mappings(offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method)
    values('KXRA_STARTER_V1',$1,true,'acct_1Rv3KdC84VkhhIRz','price_1UTbq7C84VkhhIRzkBHEHivV','prod_VUb2kv7rUiTeiu','bpc_syntheticWakeup',$2,$2,$2,'inclusive',false,'card')`,
      [revision, hash("synthetic-review")],
    );
    await db.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic wakeup tenant',$2)",
      [org, `synthetic-wakeup-${org}`],
    );
    await db.query(
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision) values($1,$2,'KXRA_STARTER_V1',$3)",
      [org, customer, revision],
    );
    assert.equal(
      (await worker(record, [JSON.stringify(event)])).rows[0].state,
      "QUEUED",
    );
    let binding = (
      await db.query(
        "select version,reconcile_required,quarantined,subscription_id from kxra_private.live_billing_bindings where org_id=$1",
        [org],
      )
    ).rows[0];
    assert.equal(Number(binding.version), 1);
    assert.equal(binding.reconcile_required, true);
    assert.equal(binding.subscription_id, null);
    assert.equal(
      (await worker(record, [JSON.stringify(event)])).rows[0].state,
      "DUPLICATE",
    );
    assert.equal(
      Number(
        (
          await db.query(
            "select version from kxra_private.live_billing_bindings where org_id=$1",
            [org],
          )
        ).rows[0].version,
      ),
      1,
    );
    const claimed = (
      await worker("select * from kxra_private.claim_live_billing_wakeups(20)")
    ).rows.map(
      (row) =>
        Object.values(row)[0] as {
          event_id: string;
          claim_token: string;
          binding_version: number;
        },
    );
    assert.equal(claimed.length, 1);
    assert.equal(claimed[0].event_id, event.event_id);
    assert.equal(Number(claimed[0].binding_version), 1);
    assert.equal(
      (
        await worker(
          "select * from kxra_private.claim_live_billing_wakeups(20)",
        )
      ).rowCount,
      0,
    );
    await call(
      "select kxra_private.ack_live_billing_wakeup($1,$2,$3)",
      [event.event_id, claimed[0].claim_token, crypto.randomUUID()],
      "P0001",
    );
    await call(
      "select * from kxra_private.claim_live_billing_wakeups(21)",
      [],
      "P0001",
    );
    await call(
      record,
      [JSON.stringify({ ...event, org_id: org, paid: true })],
      "P0001",
    );

    const unmatched = {
      ...event,
      event_id: `evt_${crypto.randomBytes(12).toString("hex")}`,
      customer_id: null,
      invoice_id: null,
      payload_sha256: hash("synthetic-unmatched"),
    };
    assert.equal(
      (await worker(record, [JSON.stringify(unmatched)])).rows[0].state,
      "UNMATCHED",
    );
    const unknown = (
      await worker("select * from kxra_private.list_unmatched_live_wakeups(20)")
    ).rows.map((row) => Object.values(row)[0] as { event_id: string });
    assert.equal(unknown[0].event_id, unmatched.event_id);
    const total = (
      await db.query(
        "select count(*)::int n from kxra_private.live_billing_bindings",
      )
    ).rows[0].n;
    assert.equal(
      (
        await worker(
          "select kxra_private.resolve_unmatched_live_wakeup($1,$2) state",
          [unmatched.event_id, "cus_unknownSynthetic"],
        )
      ).rows[0].state,
      "UNMATCHED",
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra_private.live_billing_bindings",
        )
      ).rows[0].n,
      total,
    );
    assert.equal(
      (
        await worker(
          "select kxra_private.resolve_unmatched_live_wakeup($1,$2) state",
          [unmatched.event_id, customer],
        )
      ).rows[0].state,
      "MATCHED",
    );
    assert.equal(
      (
        await worker(
          "select kxra_private.resolve_unmatched_live_wakeup($1,$2) state",
          [unmatched.event_id, customer],
        )
      ).rows[0].state,
      "MATCHED",
    );
    assert.equal(
      Number(
        (
          await db.query(
            "select version from kxra_private.live_billing_bindings where org_id=$1",
            [org],
          )
        ).rows[0].version,
      ),
      2,
    );
    await worker("select * from kxra_private.claim_live_billing_wakeups(20)");
    assert.equal(
      (
        await db.query(
          "select state from kxra_private.live_webhook_queue where event_id=$1",
          [event.event_id],
        )
      ).rows[0].state,
      "SUPERSEDED",
    );
    const conflict = {
      ...event,
      payload_sha256: hash("synthetic-changed-hash"),
    };
    assert.equal(
      (await worker(record, [JSON.stringify(conflict)])).rows[0].state,
      "CONFLICT",
    );
    binding = (
      await db.query(
        "select version,reconcile_required,quarantined,subscription_id from kxra_private.live_billing_bindings where org_id=$1",
        [org],
      )
    ).rows[0];
    assert.equal(Number(binding.version), 3);
    assert.equal(binding.quarantined, true);
    assert.equal(binding.reconcile_required, true);
    assert.equal(binding.subscription_id, null);
    assert.equal(
      (await worker(record, [JSON.stringify(conflict)])).rows[0].state,
      "CONFLICT",
    );
    assert.equal(
      Number(
        (
          await db.query(
            "select version from kxra_private.live_billing_bindings where org_id=$1",
            [org],
          )
        ).rows[0].version,
      ),
      3,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra_private.live_webhook_conflicts",
        )
      ).rows[0].n,
      1,
    );
    await db.query("savepoint immutable_receipt");
    await assert.rejects(
      db.query(
        "delete from kxra_private.live_webhook_receipts where event_id=$1",
        [event.event_id],
      ),
      /immutable/,
    );
    await db.query("rollback to savepoint immutable_receipt");
    for (const role of ["anon", "authenticated"]) {
      assert.equal(
        (
          await db.query(
            "select has_function_privilege($1,'kxra_private.record_live_billing_wakeup(jsonb)','EXECUTE') allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
      await db.query("savepoint denied_role");
      await db.query(`set local role ${role}`);
      await assert.rejects(db.query(record, [JSON.stringify(event)]), {
        code: "42501",
      });
      await db.query("rollback to savepoint denied_role");
    }
  } finally {
    try {
      await db.query("rollback");
    } finally {
      await db.end();
    }
  }
});
