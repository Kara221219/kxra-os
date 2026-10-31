import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { LIVE_WEBHOOK_API_VERSION } from "../packages/integrations/live-webhook";

import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";
import { modernBillingFixture } from "./support/modern-billing-scope";
import type {
  ModernExecutionMode,
  ModernScopeTag,
} from "../packages/integrations/modern-billing-scope";

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
  assert.ok(
    [undefined, "LIVE", "STAGING_SANDBOX"].includes(
      process.env.KXRA_MODERN_BILLING_TEST_MODE,
    ),
  );
  const mode: ModernExecutionMode =
    process.env.KXRA_MODERN_BILLING_TEST_MODE === "STAGING_SANDBOX"
      ? "STAGING_SANDBOX"
      : "LIVE";
  const scope = modernBillingFixture(mode).execution.execution_scope;
  const project = scope.project_ref;
  assert.equal(
    project,
    mode === "LIVE" ? "lhbgeucifxxcdoyrnesf" : "jlebgsxcvhvpueuibekd",
  );
  const scopedSQL = (sql: string) =>
    mode === "LIVE"
      ? sql
      : sql.replace(
          /kxra_private\.(record_live_billing_wakeup|claim_live_billing_wakeups|ack_live_billing_wakeup|list_unmatched_live_wakeups|resolve_unmatched_live_wakeup)\(/g,
          "kxra_private.staging_sandbox_$1(",
        );
  const org = crypto.randomUUID(),
    customer = `cus_${crypto.randomBytes(12).toString("hex")}`;
  const event = {
    execution_scope: scope,
    event_id: `evt_${crypto.randomBytes(12).toString("hex")}`,
    event_type: "invoice.payment_failed",
    payload_sha256: hash("synthetic-safe-wakeup"),
    customer_id: customer,
    subscription_id: null,
    invoice_id: "in_syntheticWebhook",
    account_id: scope.account_id,
    project_ref: project,
    api_version: LIVE_WEBHOOK_API_VERSION,
    livemode: scope.livemode,
  };
  async function call(sql: string, values: unknown[] = [], errorCode?: string) {
    await db.query("savepoint worker_call");
    try {
      await db.query("set local role kxra_billing_worker");
      if (errorCode) {
        await assert.rejects(db.query(scopedSQL(sql), values), {
          code: errorCode,
        });
        return;
      }
      return await db.query(scopedSQL(sql), values);
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
      const result = await db.query(scopedSQL(sql), values);
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
    assert.ok(
      (
        await db.query(
          "select to_regprocedure('kxra_private.webhook_reconciliation_scope_attestation()') installed",
        )
      ).rows[0].installed,
      "Install the reviewed unmatched-quarantine proposal before this composition test",
    );
    assert.equal(
      (
        await db.query(
          "select enabled from kxra_private.live_webhook_endpoint_binding where singleton",
        )
      ).rows[0].enabled,
      false,
    );
    const originalReceiptCount = (
      await db.query(
        "select count(*)::int n from kxra_private.live_webhook_receipts",
      )
    ).rows[0].n;
    await call(record, [JSON.stringify(event)], "P0001");
    const execution = await bindSyntheticModernScope(db.query.bind(db), mode);
    assert.deepEqual(execution.execution_scope, scope);
    const starter = execution.catalogue.find(
      (row) => row.offer_key === "KXRA_STARTER_V1",
    )!;
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra_private.live_webhook_receipts",
        )
      ).rows[0].n,
      originalReceiptCount,
    );
    await db.query(
      "update kxra_private.live_webhook_endpoint_binding set enabled=true,project_ref=$1,review_sha256=$2 where singleton",
      [project, hash("SYNTHETIC_ENDPOINT_REVIEW")],
    );
    // Scope/payload disagreement cannot enter the durable queue even on a reviewed endpoint.
    await call(
      record,
      [JSON.stringify({ ...event, livemode: !scope.livemode })],
      "P0001",
    );
    await call(
      record,
      [
        JSON.stringify({
          ...event,
          execution_scope: {
            ...scope,
            execution_mode: mode === "LIVE" ? "STAGING_SANDBOX" : "LIVE",
          },
        }),
      ],
      "P0001",
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
      `insert into kxra_private.live_billing_mappings(mode,offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method)
    values($3,'KXRA_STARTER_V1',$1,true,$4,$5,$6,'bpc_syntheticWakeup',$2,$2,$2,'inclusive',false,'card')`,
      [
        revision,
        hash("synthetic-review"),
        scope.livemode ? "live" : "staging_sandbox",
        scope.account_id,
        starter.price_id,
        starter.product_id,
      ],
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
    const receipt = (
      await db.query(
        "select scope_id,execution_mode,scope_project_ref,scope_account_id,scope_sha256,provider_livemode,livemode,account_id,project_ref from kxra_private.live_webhook_receipts where event_id=$1",
        [event.event_id],
      )
    ).rows[0];
    assert.deepEqual(receipt, {
      scope_id: scope.scope_id,
      execution_mode: mode,
      scope_project_ref: project,
      scope_account_id: scope.account_id,
      scope_sha256: scope.scope_sha256,
      provider_livemode: scope.livemode,
      livemode: scope.livemode,
      account_id: scope.account_id,
      project_ref: project,
    });
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
          execution_scope: ModernScopeTag;
        },
    );
    assert.ok(claimed.length >= 1 && claimed.length <= 20);
    const ownClaim = claimed.filter((row) => row.event_id === event.event_id);
    assert.equal(ownClaim.length, 1);
    assert.deepEqual(ownClaim[0].execution_scope, scope);
    assert.equal(Number(ownClaim[0].binding_version), 1);
    const nextClaims = (
      await worker("select * from kxra_private.claim_live_billing_wakeups(20)")
    ).rows.map((row) => Object.values(row)[0] as { event_id: string });
    assert.ok(nextClaims.length <= 20);
    const claimedIds = new Set(claimed.map((row) => row.event_id));
    assert.ok(
      nextClaims.every((row) => !claimedIds.has(row.event_id)),
      "An active claim must not replay",
    );
    await call(
      "select kxra_private.ack_live_billing_wakeup($1,$2,$3)",
      [event.event_id, ownClaim[0].claim_token, crypto.randomUUID()],
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
    ).rows.map(
      (row) =>
        Object.values(row)[0] as {
          event_id: string;
          execution_scope: ModernScopeTag;
        },
    );
    assert.equal(unknown[0].event_id, unmatched.event_id);
    assert.deepEqual(unknown[0].execution_scope, scope);
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
      "REVIEW_REQUIRED",
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
      "REVIEW_REQUIRED",
    );
    assert.equal(
      (
        await worker(
          "select kxra_private.resolve_unmatched_live_wakeup($1,$2) state",
          [unmatched.event_id, customer],
        )
      ).rows[0].state,
      "REVIEW_REQUIRED",
    );
    const held = (
      await db.query(
        "select state,org_id from kxra_private.live_webhook_queue where event_id=$1",
        [unmatched.event_id],
      )
    ).rows[0];
    assert.equal(held.state, "HELD");
    assert.equal(held.org_id, null);
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
      "An unmatched event/customer argument cannot assign ownership or invalidate another tenant",
    );
    assert.equal(
      (
        await worker(
          "select kxra_private.resolve_unmatched_live_wakeup($1,$2) state",
          [event.event_id, customer],
        )
      ).rows[0].state,
      "MATCHED",
      "Already server-associated event may be confirmed without a new assignment",
    );
    // Preserve stale-generation discovery coverage using a genuinely associated
    // new signed-ingress fixture event, not an arbitrary unmatched customer ID.
    assert.equal(
      (
        await worker(record, [
          JSON.stringify({
            ...event,
            event_id: `evt_${crypto.randomBytes(12).toString("hex")}`,
            payload_sha256: hash("synthetic-known-generation"),
          }),
        ])
      ).rows[0].state,
      "QUEUED",
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
          "select count(*)::int n from kxra_private.live_webhook_conflicts where event_id=$1",
          [event.event_id],
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
            scopedSQL(
              "select has_function_privilege($1,'kxra_private.record_live_billing_wakeup(jsonb)','EXECUTE') allowed",
            ),
            [role],
          )
        ).rows[0].allowed,
        false,
      );
      await db.query("savepoint denied_role");
      await db.query(`set local role ${role}`);
      await assert.rejects(
        db.query(scopedSQL(record), [JSON.stringify(event)]),
        {
          code: "42501",
        },
      );
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
