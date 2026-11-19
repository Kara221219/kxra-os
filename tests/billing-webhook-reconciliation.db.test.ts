import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { readPrivateFixtureJson } from "./support/private-fixture-json";
import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";
import { webhookReconciliationPresentation } from "../packages/integrations/billing-webhook-reconciliation";

// PREPARED, NOT RUN: release owns the native window and migration integration.
// Requires billing-unmatched-quarantine.sql installed; never skip that gate.
test("native operator status is truly READ ONLY and unresolved events cannot be assigned by customer argument", async () => {
  assert.ok(localModeConfiguration(process.env));
  assert.ok(!process.env.DATABASE_URL && !process.env.VERCEL_ENV);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!),
    cfg = readPrivateFixtureJson(path.join(runtime, "database.json"));
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.equal(fs.realpathSync(cfg.host), cfg.host);
  for (const dir of [runtime, cfg.host]) {
    assert.equal(fs.statSync(dir).mode & 0o077, 0);
    assert.equal(fs.statSync(dir).uid, process.getuid!());
  }
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.ssl && !cfg.connectionString);
  const mode = process.env.KXRA_MODERN_BILLING_TEST_MODE ?? "LIVE";
  assert.ok(mode === "LIVE" || mode === "STAGING_SANDBOX");
  const conn = {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    password: "",
    ssl: false as const,
  };
  const admin = new pg.Client({ ...conn, user: os.userInfo().username });
  const worker = new pg.Client({ ...conn, user: "kxra_billing_runner" });
  let ownedRole = false,
    connected = false;
  await admin.connect();
  try {
    const identity = (
      await admin.query(
        "select session_user,current_user,current_database() db,current_setting('listen_addresses') listen,current_setting('unix_socket_directories') socket",
      )
    ).rows[0];
    assert.equal(identity.session_user, os.userInfo().username);
    assert.equal(identity.current_user, identity.session_user);
    assert.equal(identity.db, cfg.database);
    assert.equal(identity.listen, "");
    assert.equal(fs.realpathSync(identity.socket), cfg.host);
    assert.ok(
      (
        await admin.query(
          "select to_regprocedure('kxra_private.webhook_reconciliation_scope_attestation()') installed",
        )
      ).rows[0].installed,
      "Install the reviewed quarantine/status proposal; no legacy bypass",
    );
    assert.equal(
      (
        await admin.query(
          "select count(*)::integer n from pg_roles where rolname='kxra_billing_runner'",
        )
      ).rows[0].n,
      0,
      "Run serially with no other task's runner role present",
    );
    await admin.query("begin");
    const execution = await bindSyntheticModernScope(
        admin.query.bind(admin),
        mode,
      ),
      scope = execution.execution_scope;
    const before = (
      await admin.query(
        "select count(*)::integer n from kxra_private.live_webhook_queue where scope_id=$1 and org_id is null and state<>'QUARANTINED'",
        [scope.scope_id],
      )
    ).rows[0].n;
    const id = `evt_${crypto.randomBytes(12).toString("hex")}`,
      sha = crypto
        .createHash("sha256")
        .update("SYNTHETIC_QUARANTINE_ONLY")
        .digest("hex");
    const org = crypto.randomUUID(),
      customer = `cus_${crypto.randomBytes(12).toString("hex")}`;
    const plan = execution.catalogue.find(
      (r) => r.offer_key === "KXRA_STARTER_V1",
    )!;
    const revision = (
      await admin.query(
        "select coalesce(max(revision),0)+1 n from kxra_private.live_billing_mappings where offer_key=$1",
        [plan.offer_key],
      )
    ).rows[0].n;
    await admin.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic quarantine owner',$2)",
      [org, `quarantine-${org}`],
    );
    // Disabled synthetic mapping only; no billing/endpoint/financial activation.
    await admin.query(
      "insert into kxra_private.live_billing_mappings(offer_key,revision,enabled,mode,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method) values($1,$2,false,$3,$4,$5,$6,'bpc_syntheticQuarantine',$7,$7,$7,'inclusive',false,'card')",
      [
        plan.offer_key,
        revision,
        scope.livemode ? "live" : "staging_sandbox",
        scope.account_id,
        plan.price_id,
        plan.product_id,
        sha,
      ],
    );
    await admin.query(
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision) values($1,$2,$3,$4)",
      [org, customer, plan.offer_key, revision],
    );
    await admin.query(
      "insert into kxra_private.live_webhook_receipts(event_id,event_type,payload_sha256,customer_id,subscription_id,invoice_id,account_id,project_ref,api_version,livemode) values($1,'refund.created',$2,null,null,null,$3,$4,$5,$6)",
      [
        id,
        sha,
        scope.account_id,
        scope.project_ref,
        scope.api_version,
        scope.livemode,
      ],
    );
    await admin.query(
      "insert into kxra_private.live_webhook_queue(event_id,state) values($1,'HELD')",
      [id],
    );
    await admin.query(
      "create role kxra_billing_runner login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 3",
    );
    await admin.query("grant kxra_billing_worker to kxra_billing_runner");
    await admin.query("commit");
    ownedRole = true;
    await worker.connect();
    connected = true;
    await worker.query("begin read only");
    await worker.query("set local role kxra_billing_worker");
    const prefix = mode === "LIVE" ? "" : "staging_sandbox_";
    const attestation = (
      await worker.query(
        "select kxra_private.webhook_reconciliation_scope_attestation() value",
      )
    ).rows[0].value;
    assert.deepEqual(attestation, execution);
    const presentation = webhookReconciliationPresentation(
      (
        await worker.query(
          `select kxra_private.${prefix}webhook_reconciliation_summary() value`,
        )
      ).rows[0].value,
      scope,
    );
    assert.equal(presentation.unmatched_quarantined, before + 1);
    assert.equal(presentation.state, "REVIEW_REQUIRED");
    assert.equal(presentation.automatic_resolution, false);
    assert.equal(presentation.entitlement_authority, false);
    assert.doesNotMatch(
      JSON.stringify(presentation),
      /evt_|cus_|sub_|acct_|org_id|scope_id/,
    );
    await worker.query("commit");
    await worker.query("begin");
    await worker.query("set local role kxra_billing_worker");
    const baseline = (
      await admin.query(
        "select count(*)::integer n,coalesce(sum(version),0)::text versions from kxra_private.live_billing_bindings",
      )
    ).rows[0];
    const known = customer;
    assert.equal(
      (
        await worker.query(
          `select kxra_private.${prefix}resolve_unmatched_live_wakeup($1,$2) value`,
          [id, known],
        )
      ).rows[0].value,
      "REVIEW_REQUIRED",
    );
    await worker.query("commit");
    assert.deepEqual(
      (
        await admin.query(
          "select state,org_id,binding_version from kxra_private.live_webhook_queue where event_id=$1",
          [id],
        )
      ).rows[0],
      { state: "HELD", org_id: null, binding_version: null },
    );
    assert.deepEqual(
      (
        await admin.query(
          "select count(*)::integer n,coalesce(sum(version),0)::text versions from kxra_private.live_billing_bindings",
        )
      ).rows[0],
      baseline,
    );
    // Simulate an old/untrusted candidate pointer. The BEFORE trigger must
    // quarantine it, not let state=PENDING make it claimable or proven.
    await admin.query(
      "update kxra_private.live_webhook_queue set org_id=$2,binding_version=0,state='PENDING' where event_id=$1",
      [id, org],
    );
    assert.equal(
      (
        await admin.query(
          "select state from kxra_private.live_webhook_queue where event_id=$1",
          [id],
        )
      ).rows[0].state,
      "QUARANTINED",
    );
    await worker.query("begin read only");
    await worker.query("set local role kxra_billing_worker");
    const reviewed = webhookReconciliationPresentation(
      (
        await worker.query(
          `select kxra_private.${prefix}webhook_reconciliation_summary() value`,
        )
      ).rows[0].value,
      scope,
    );
    assert.equal(reviewed.state, "REVIEW_REQUIRED");
    assert.equal(reviewed.quarantined, presentation.quarantined + 1);
    assert.equal(
      reviewed.unproven_associations,
      presentation.unproven_associations + 1,
    );
    await worker.query("commit");
    await worker.query("begin");
    await worker.query("set local role kxra_billing_worker");
    assert.equal(
      (
        await worker.query(
          `select kxra_private.${prefix}resolve_unmatched_live_wakeup($1,$2) value`,
          [id, customer],
        )
      ).rows[0].value,
      "REVIEW_REQUIRED",
    );
    await worker.query("commit");
    await worker.query("begin read only");
    await worker.query("set local role kxra_billing_worker");
    await assert.rejects(
      worker.query(
        `select kxra_private.${mode === "LIVE" ? "staging_sandbox_" : ""}webhook_reconciliation_summary()`,
      ),
    );
    await worker.query("rollback");
    await worker.query("begin read only");
    await worker.query("set local role kxra_billing_worker");
    await assert.rejects(
      worker.query("select * from kxra_private.live_webhook_queue"),
      { code: "42501" },
    );
    await worker.query("rollback");
  } finally {
    if (connected) {
      await worker.query("rollback").catch(() => {});
      await worker.end().catch(() => {});
    }
    try {
      await admin.query("rollback").catch(() => {});
      if (ownedRole) await admin.query("drop role kxra_billing_runner");
    } finally {
      await admin.end();
    }
  }
});
