import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const owner = "20000000-0000-4000-8000-000000000001";
const partner = "20000000-0000-4000-8000-000000000002";
const p4 = "30000000-0000-4000-8000-000000000004";
const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");

after(() => admin.end());

async function as(db: pg.PoolClient, user: string | null) {
  await db.query("reset role");
  await db.query(`set local role ${user ? "authenticated" : "anon"}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      user || "",
      JSON.stringify({
        sub: user,
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000),
      }),
      user ? org : "",
    ],
  );
}

async function worker(db: pg.PoolClient) {
  await db.query("reset role");
  await db.query("set local role kxra_routine_worker");
}

async function tx(work: (db: pg.PoolClient) => Promise<void>) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await work(db);
  } finally {
    await db.query("rollback");
    db.release();
  }
}

async function denied(db: pg.PoolClient, sql: string, values: unknown[] = []) {
  await db.query("savepoint expected_denial");
  await assert.rejects(() => db.query(sql, values));
  await db.query("rollback to savepoint expected_denial");
}

async function approveEnable(db: pg.PoolClient, code: string) {
  await as(db, owner);
  const version = (
    await db.query(
      `select version.id,version.version_sha256,manifest.id as routine_id
       from kxra.routine_manifests manifest
       join kxra.routine_manifest_versions version
        on version.routine_id=manifest.id and version.version=manifest.current_version
       where manifest.code=$1`,
      [code],
    )
  ).rows[0];
  await db.query(
    "select result.* from kxra.approve_routine_version($1,$2,'Synthetic exact routine approval',$3) result",
    [version.id, version.version_sha256, crypto.randomUUID()],
  );
  await db.query(
    "select result.* from kxra.set_routine_enabled($1,$2,true,$3) result",
    [version.id, version.version_sha256, crypto.randomUUID()],
  );
  return version;
}

async function plan(
  db: pg.PoolClient,
  versionId: string,
  date: string,
  projectId: string | null = null,
) {
  return (
    await db.query("select * from kxra.plan_routine_slot($1,$2,$3,$4)", [
      versionId,
      date,
      projectId,
      crypto.randomUUID(),
    ])
  ).rows[0];
}

test("AT-14 typed routine seed remains exact, disabled and owner-only", () =>
  tx(async (db) => {
    await as(db, owner);
    assert.equal(
      (await db.query("select * from kxra.routine_manifests")).rowCount,
      9,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra.routine_manifests where not enabled",
        )
      ).rows[0].n,
      9,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra.routine_manifest_versions where status='DRAFT' and notification_policy->>'adapter'='DISABLED'",
        )
      ).rows[0].n,
      9,
    );
    assert.equal(
      (await db.query("select * from kxra.routine_version_projects")).rowCount,
      9,
    );
    await denied(
      db,
      "update kxra.routine_manifests set enabled=true where code='RTN-001'",
    );

    await as(db, partner);
    for (const table of [
      "routine_service_identities",
      "routine_manifests",
      "routine_manifest_versions",
      "routine_version_projects",
      "routine_calendar_days",
      "routine_runs",
      "routine_run_checkpoints",
      "routine_notification_intents",
    ])
      assert.equal((await db.query(`select * from kxra.${table}`)).rowCount, 0);
    await denied(
      db,
      "select * from kxra.approve_routine_version(gen_random_uuid(),$1,'forged',$2)",
      [hash("forged"), crypto.randomUUID()],
    );

    await as(db, null);
    assert.equal(
      (await db.query("select * from kxra.routine_manifests")).rowCount,
      0,
    );
  }));

test("AT-14 fake clock produces one DST-safe slot and honors exact calendars", () =>
  tx(async (db) => {
    const morning = await approveEnable(db, "RTN-001");
    const before = await plan(db, morning.id, "2026-03-27");
    const afterDst = await plan(db, morning.id, "2026-03-30");
    const duplicate = await plan(db, morning.id, "2026-03-30");
    const weekend = await plan(db, morning.id, "2026-03-29");
    assert.equal(before.created, true);
    assert.equal(
      new Date(before.scheduled_for).toISOString(),
      "2026-03-27T08:00:00.000Z",
    );
    assert.equal(
      new Date(afterDst.scheduled_for).toISOString(),
      "2026-03-30T07:00:00.000Z",
    );
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.run_id, afterDst.run_id);
    assert.equal(weekend.disposition, "SKIPPED_WEEKDAY");

    const exchange = await approveEnable(db, "RTN-005");
    await db.query(
      "select result.* from kxra.record_routine_calendar_day('XNYS','2026-03-30',true,'Regular session','Synthetic calendar fixture',$1,$2) result",
      [hash("xnys-2026-03-30"), crypto.randomUUID()],
    );
    const open = await plan(db, exchange.id, "2026-03-30", p4);
    const missing = await plan(db, exchange.id, "2026-03-31", p4);
    assert.equal(open.disposition, "QUEUED");
    assert.equal(
      new Date(open.scheduled_for).toISOString(),
      "2026-03-30T13:00:00.000Z",
    );
    assert.equal(missing.disposition, "SKIPPED_CALENDAR");
    await denied(
      db,
      "select * from kxra.plan_routine_slot($1,'2026-03-30',null,$2)",
      [exchange.id, crypto.randomUUID()],
    );
  }));

test("AT-14 lease recovery resumes checkpoints, stays quiet when unchanged and cancels revoked retry", () =>
  tx(async (db) => {
    const version = await approveEnable(db, "RTN-001");
    const first = await plan(db, version.id, "2026-03-27");
    const base = new Date();

    await worker(db);
    const claimed = (
      await db.query(
        "select result.* from kxra_private.claim_routine_run('fixture-worker',$1) result",
        [base],
      )
    ).rows[0];
    assert.equal(claimed.id, first.run_id);
    await db.query(
      "select result.* from kxra_private.record_routine_checkpoint($1,'fixture-worker',1,1,'read.complete',$2) result",
      [claimed.id, hash("checkpoint-one")],
    );
    const recovered = (
      await db.query("select * from kxra_private.recover_routine_runs($1)", [
        new Date(base.getTime() + 120_000),
      ])
    ).rows[0];
    assert.equal(recovered.state, "RETRY_WAIT");
    await db.query("select * from kxra_private.requeue_routine_runs($1)", [
      new Date(base.getTime() + 500_000),
    ]);
    const reclaimed = (
      await db.query(
        "select result.* from kxra_private.claim_routine_run('fixture-worker-2',$1) result",
        [new Date(base.getTime() + 501_000)],
      )
    ).rows[0];
    assert.equal(reclaimed.id, first.run_id);
    assert.equal(reclaimed.attempt_count, 2);
    await as(db, owner);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra.routine_run_checkpoints where run_id=$1",
          [first.run_id],
        )
      ).rows[0].n,
      1,
    );
    await worker(db);
    const completed = (
      await db.query(
        "select result.* from kxra_private.complete_routine_run($1,'fixture-worker-2',2,$2,false,'Synthetic completion',$3) result",
        [
          first.run_id,
          hash("stable-outcome"),
          new Date(base.getTime() + 502_000),
        ],
      )
    ).rows[0];
    assert.equal(completed.state, "SUCCEEDED");
    assert.equal(completed.outcome_disposition, "CHANGED");

    await as(db, owner);
    const second = await plan(db, version.id, "2026-03-30");
    await worker(db);
    const claimTwo = (
      await db.query(
        "select result.* from kxra_private.claim_routine_run('fixture-worker',$1) result",
        [new Date(base.getTime() + 600_000)],
      )
    ).rows[0];
    assert.equal(claimTwo.id, second.run_id);
    const quiet = (
      await db.query(
        "select result.* from kxra_private.complete_routine_run($1,'fixture-worker',1,$2,true,'Unchanged synthetic completion',$3) result",
        [
          second.run_id,
          hash("stable-outcome"),
          new Date(base.getTime() + 601_000),
        ],
      )
    ).rows[0];
    assert.equal(quiet.outcome_disposition, "UNCHANGED");
    await as(db, owner);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra.routine_notification_intents where run_id=$1",
          [second.run_id],
        )
      ).rows[0].n,
      0,
    );

    await as(db, owner);
    const third = await plan(db, version.id, "2026-03-31");
    await worker(db);
    await db.query(
      "select result.* from kxra_private.claim_routine_run('fixture-worker',$1) result",
      [new Date(base.getTime() + 700_000)],
    );
    const retry = (
      await db.query(
        "select result.* from kxra_private.fail_routine_run($1,'fixture-worker',1,'TRANSIENT_FIXTURE',true,'Synthetic retryable failure',$2) result",
        [third.run_id, new Date(base.getTime() + 701_000)],
      )
    ).rows[0];
    assert.equal(retry.state, "RETRY_WAIT");

    await as(db, owner);
    await db.query(
      "select result.* from kxra.set_routine_enabled($1,$2,false,$3) result",
      [version.id, version.version_sha256, crypto.randomUUID()],
    );
    await worker(db);
    const cancelled = (
      await db.query("select * from kxra_private.requeue_routine_runs($1)", [
        new Date(base.getTime() + 2_000_000),
      ])
    ).rows.find((row) => row.run_id === third.run_id);
    assert.equal(cancelled?.state, "CANCELLED");

    await as(db, owner);
    await db.query(
      "select result.* from kxra.set_routine_enabled($1,$2,true,$3) result",
      [version.id, version.version_sha256, crypto.randomUUID()],
    );
    const fourth = await plan(db, version.id, "2026-04-01");
    await worker(db);
    await db.query(
      "select result.* from kxra_private.claim_routine_run('fixture-worker',$1) result",
      [new Date(base.getTime() + 2_100_000)],
    );
    const failed = (
      await db.query(
        "select result.* from kxra_private.fail_routine_run($1,'fixture-worker',1,'FINAL_FIXTURE',false,'Synthetic actionable failure',$2) result",
        [fourth.run_id, new Date(base.getTime() + 2_101_000)],
      )
    ).rows[0];
    assert.equal(failed.state, "FAILED");
    await as(db, owner);
    const intent = (
      await db.query(
        "select adapter,delivery_state from kxra.routine_notification_intents where run_id=$1",
        [fourth.run_id],
      )
    ).rows[0];
    assert.deepEqual(intent, {
      adapter: "DISABLED",
      delivery_state: "NOT_SENT",
    });
  }));
