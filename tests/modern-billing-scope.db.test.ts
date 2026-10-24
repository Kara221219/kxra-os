import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { modernBillingFixture } from "./support/modern-billing-scope";
import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";

const mode = process.env.KXRA_MODERN_BILLING_TEST_MODE ?? "LIVE";
assert.ok(mode === "LIVE" || mode === "STAGING_SANDBOX");
const prefix = mode === "LIVE" ? "" : "staging_sandbox_";
const oppositePrefix = mode === "LIVE" ? "staging_sandbox_" : "";
const expected = modernBillingFixture(mode).execution.execution_scope;
// SOURCE ONLY: OWNER executes sequentially in a FRESH isolated fixture after0107.
// Complements the full104 paid-access test in a second fresh STAGING_SANDBOX fixture.
// No provider call, real resource, legal approval or production activation is represented.
test("modern scope preserves actual mode, rejects opposite capabilities and cross-scope mutation", async () => {
  assert.ok(localModeConfiguration(process.env));
  assert.ok(!process.env.VERCEL_ENV && !process.env.DATABASE_URL);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  for (const directory of [runtime, path.join(runtime, "socket")]) {
    const m = fs.lstatSync(directory);
    assert.ok(m.isDirectory() && !m.isSymbolicLink());
    assert.equal(m.uid, process.getuid!());
    assert.equal(m.mode & 0o077, 0);
  }
  const file = path.join(runtime, "database.json"),
    meta = fs.lstatSync(file);
  assert.ok(meta.isFile() && !meta.isSymbolicLink());
  assert.equal(meta.uid, process.getuid!());
  assert.equal(meta.mode & 0o022, 0);
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(cfg.host, path.join(process.env.KXRA_RUNTIME!, "socket"));
  assert.equal(fs.realpathSync(cfg.host), path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  assert.ok(
    Number.isInteger(cfg.port) && cfg.port >= 1024 && cfg.port <= 65535,
  );
  assert.match(cfg.database, /^[A-Za-z0-9_-]+$/);
  const db = new pg.Client({
    host: path.join(runtime, "socket"),
    port: cfg.port,
    database: cfg.database,
    user: os.userInfo().username,
    password: "",
    ssl: false,
    options: "",
  });
  await db.connect();
  async function denied(sql: string, values: unknown[] = [], worker = true) {
    await db.query("savepoint scope_denial");
    try {
      if (worker) await db.query("set local role kxra_billing_worker");
      await assert.rejects(db.query(sql, values));
    } finally {
      await db.query("rollback to scope_denial");
      await db.query("release scope_denial");
    }
  }
  async function worker(sql: string, values: unknown[] = []) {
    await db.query("set local role kxra_billing_worker");
    try {
      return await db.query(sql, values);
    } finally {
      await db.query("reset role");
    }
  }
  try {
    await db.query("begin");
    const before = (
      await db.query(
        "select * from kxra_private.modern_billing_execution_identity where singleton",
      )
    ).rows[0];
    // Fresh-fixture bootstrap asserts the migration's real disabled/unbound state.
    // Integrated suites may retain only the exact SAME immutable scope from a committed race fixture.
    if (before.scope_id === null) {
      assert.equal(before.enabled, false);
      assert.equal(before.execution_mode, null);
      assert.equal(
        (
          await db.query(
            "select kxra_private.modern_billing_scope_ready() ready",
          )
        ).rows[0].ready,
        false,
      );
      await denied(
        `select kxra_private.${prefix}claim_live_customer_intent($1::uuid)`,
        [crypto.randomUUID()],
      );
    } else {
      assert.equal(before.scope_id, expected.scope_id);
      assert.equal(before.execution_mode, mode);
      assert.equal(before.enabled, true);
    }
    const execution = await bindSyntheticModernScope(db.query.bind(db), mode),
      tag = execution.execution_scope;
    assert.equal(tag.livemode, mode === "LIVE");
    assert.equal(tag.project_ref, expected.project_ref);
    assert.deepEqual(
      await bindSyntheticModernScope(db.query.bind(db), mode),
      execution,
    );
    await assert.rejects(
      bindSyntheticModernScope(
        db.query.bind(db),
        mode === "LIVE" ? "STAGING_SANDBOX" : "LIVE",
      ),
    );
    await denied(
      "update kxra_private.modern_billing_execution_identity set execution_mode=$1 where singleton",
      [mode === "LIVE" ? "STAGING_SANDBOX" : "LIVE"],
      false,
    );
    await denied(
      "update kxra_private.modern_billing_scope_catalogue set people=people where scope_id=$1",
      [tag.scope_id],
      false,
    );
    await db.query(
      "update kxra_private.live_webhook_endpoint_binding set enabled=true,project_ref=$1,review_sha256=$2 where singleton",
      [tag.project_ref, "a".repeat(64)],
    );
    const event = {
      execution_scope: tag,
      event_id: "evt_SYNTHETICsandboxScope",
      event_type: "invoice.paid",
      payload_sha256: "b".repeat(64),
      customer_id: "cus_SYNTHETICunknown",
      subscription_id: null,
      invoice_id: "in_SYNTHETICunknown",
      account_id: tag.account_id,
      project_ref: tag.project_ref,
      api_version: tag.api_version,
      livemode: tag.livemode,
    };
    assert.equal(
      (
        await worker(
          `select kxra_private.${prefix}record_live_billing_wakeup($1::jsonb) result`,
          [JSON.stringify(event)],
        )
      ).rows[0].result,
      "UNMATCHED",
    );
    assert.equal(
      (
        await worker(
          `select kxra_private.${prefix}record_live_billing_wakeup($1::jsonb) result`,
          [JSON.stringify(event)],
        )
      ).rows[0].result,
      "DUPLICATE",
    );
    const receipt = (
      await db.query(
        "select livemode,execution_mode,scope_id from kxra_private.live_webhook_receipts where event_id=$1",
        [event.event_id],
      )
    ).rows[0];
    assert.deepEqual(receipt, {
      livemode: tag.livemode,
      execution_mode: mode,
      scope_id: tag.scope_id,
    });
    assert.equal(
      (
        await db.query(
          "select state from kxra_private.live_webhook_queue where event_id=$1",
          [event.event_id],
        )
      ).rows[0].state,
      "HELD",
    );
    await denied(
      `select kxra_private.${oppositePrefix}record_live_billing_wakeup($1::jsonb)`,
      [JSON.stringify(event)],
    );
    await denied(
      `select kxra_private.${prefix}record_live_billing_wakeup($1::jsonb)`,
      [JSON.stringify({ ...event, livemode: !tag.livemode })],
    );
    await denied(
      `select kxra_private.${prefix}record_live_billing_wakeup($1::jsonb)`,
      [
        JSON.stringify({
          ...event,
          execution_scope: {
            ...tag,
            project_ref:
              mode === "LIVE" ? "jlebgsxcvhvpueuibekd" : "lhbgeucifxxcdoyrnesf",
          },
        }),
      ],
    );
    // Correct stage entrypoints remain fail-closed without canonical customer/session/readjob.
    for (const prefix of ["", "staging_sandbox_"]) {
      await denied(
        `select kxra_private.${prefix}claim_live_customer_intent($1::uuid)`,
        [crypto.randomUUID()],
      );
      await denied(
        `select kxra_private.${prefix}claim_live_billing_intent($1::uuid)`,
        [crypto.randomUUID()],
      );
    }
    assert.equal(
      (
        await worker(
          `select kxra_private.${prefix}live_paid_read_current($1::uuid) result`,
          [crypto.randomUUID()],
        )
      ).rows[0].result,
      false,
    );
    await denied(
      `select kxra_private.${oppositePrefix}live_paid_read_current($1::uuid)`,
      [crypto.randomUUID()],
    );
    await denied(
      "select kxra_private.modern_core_record_live_billing_wakeup($1::jsonb)",
      [JSON.stringify(event)],
    );
    const changed = { ...event, payload_sha256: "c".repeat(64) };
    for (let n = 0; n < 2; n++)
      assert.equal(
        (
          await worker(
            `select kxra_private.${prefix}record_live_billing_wakeup($1::jsonb) result`,
            [JSON.stringify(changed)],
          )
        ).rows[0].result,
        "CONFLICT",
      );
    assert.equal(
      (
        await db.query(
          "select count(*)::integer n from kxra_private.live_webhook_conflicts where event_id=$1",
          [event.event_id],
        )
      ).rows[0].n,
      1,
    );
    await db.query(
      "update kxra_private.modern_billing_execution_identity set enabled=false where singleton",
    );
    await denied(
      `select kxra_private.${prefix}record_live_billing_wakeup($1::jsonb)`,
      [JSON.stringify(event)],
    );
    assert.equal(
      (
        await worker(
          `select kxra_private.${prefix}live_paid_read_current($1::uuid) result`,
          [crypto.randomUUID()],
        )
      ).rows[0].result,
      false,
    );
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
