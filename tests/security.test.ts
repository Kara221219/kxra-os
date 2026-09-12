import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
const root = process.cwd();
const config = JSON.parse(
  fs.readFileSync(path.join(root, ".runtime/database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const org = "10000000-0000-4000-8000-000000000001";
const users = {
  owner: "20000000-0000-4000-8000-000000000001",
  partner: "20000000-0000-4000-8000-000000000002",
  viewer: "20000000-0000-4000-8000-000000000003",
  revoked: "20000000-0000-4000-8000-000000000004",
};
const p2 = "30000000-0000-4000-8000-000000000002",
  p3 = "30000000-0000-4000-8000-000000000003";
async function as(
  db: pg.PoolClient,
  user: keyof typeof users | null,
  aal = "aal2",
) {
  await db.query("reset role");
  await db.query(`set local role ${user ? "authenticated" : "anon"}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
    [
      user ? users[user] : "",
      JSON.stringify({ aal, sub: user ? users[user] : null }),
    ],
  );
}
async function tx(fn: (db: pg.PoolClient) => Promise<void>) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await fn(db);
  } finally {
    await db.query("rollback");
    db.release();
  }
}
async function denied(db: pg.PoolClient, sql: string, values: unknown[] = []) {
  await db.query("savepoint denied");
  await assert.rejects(() => db.query(sql, values));
  await db.query("rollback to savepoint denied");
}
async function record(
  db: pg.PoolClient,
  pid = p2,
  visibility = "project_shared",
) {
  await as(db, "owner");
  return (
    await db.query(
      "insert into kxra.records(org_id,project_id,kind,title,body,classification,visibility) values($1,$2,'note','Security fixture','uniqueisolationmarker','USER-SUPPLIED INFORMATION',$3) returning id",
      [org, pid, visibility],
    )
  ).rows[0].id;
}
after(() => admin.end());
test("owner can access all five projects; application login cannot bypass RLS", () =>
  tx(async (db) => {
    await as(db, "owner");
    assert.equal((await db.query("select * from kxra.projects")).rowCount, 5);
    const roles = await db.query(
      "select rolbypassrls,rolsuper from pg_roles where rolname='kxra_app'",
    );
    assert.equal(roles.rows[0].rolbypassrls, false);
    assert.equal(roles.rows[0].rolsuper, false);
  }));
test("anonymous database access returns no projects, records or files", () =>
  tx(async (db) => {
    await as(db, null);
    for (const table of [
      "projects",
      "records",
      "files",
      "members",
      "approvals",
    ])
      assert.equal((await db.query(`select * from kxra.${table}`)).rowCount, 0);
  }));
test("partner sees only active assigned project and shared evidence", () =>
  tx(async (db) => {
    const shared = await record(db),
      privateId = await record(db, p2, "owner_only"),
      other = await record(db, p3);
    await as(db, "partner");
    assert.deepEqual(
      (await db.query("select id from kxra.projects")).rows.map((x) => x.id),
      [p2],
    );
    assert.deepEqual(
      (
        await db.query("select id from kxra.records where id=any($1::uuid[])", [
          [shared, privateId, other],
        ])
      ).rows.map((x) => x.id),
      [shared],
    );
    assert.equal(
      (
        await db.query(
          "select * from kxra.record_versions where record_id=$1",
          [privateId],
        )
      ).rowCount,
      0,
    );
  }));
test("revoked and expired assignments lose access immediately", () =>
  tx(async (db) => {
    await as(db, "revoked");
    assert.equal((await db.query("select * from kxra.projects")).rowCount, 0);
    await db.query("reset role");
    await db.query(
      "update kxra.project_memberships set expires_at=now()-interval '1 second' where user_id=$1",
      [users.partner],
    );
    await as(db, "partner");
    assert.equal((await db.query("select * from kxra.projects")).rowCount, 0);
  }));
test("direct crafted project writes, forged author and viewer writes denied", () =>
  tx(async (db) => {
    const sql =
      "insert into kxra.records(org_id,project_id,kind,title,classification,visibility,created_by) values($1,$2,'note','crafted','FACT','project_shared',$3)";
    await as(db, "partner");
    await denied(db, sql, [org, p3, users.partner]);
    await denied(db, sql, [org, p2, users.owner]);
    await as(db, "viewer");
    await denied(db, sql, [org, p3, users.viewer]);
    await denied(db, "update kxra.members set role='owner' where id=$1", [
      users.viewer,
    ]);
  }));
test("cross-project files and search never return another project", () =>
  tx(async (db) => {
    const r2 = await record(db),
      r3 = await record(db, p3);
    for (const [pid, r] of [
      [p2, r2],
      [p3, r3],
    ])
      await db.query(
        "insert into kxra.files(org_id,project_id,record_id,filename,object_key,mime_type,size_bytes,sha256) values($1,$2,$3,'test.txt',$4,'text/plain',5,'test')",
        [org, pid, r, crypto.randomUUID()],
      );
    await as(db, "partner");
    const files = await db.query("select project_id from kxra.files");
    assert.ok(files.rows.length >= 1);
    assert.ok(files.rows.every((x) => x.project_id === p2));
    const rows = await db.query(
      "select project_id from kxra.records where to_tsvector('english',title||' '||body) @@ plainto_tsquery('english','uniqueisolationmarker')",
    );
    assert.deepEqual(
      rows.rows.map((x) => x.project_id),
      [p2],
    );
    await denied(
      db,
      "insert into kxra.files(org_id,project_id,record_id,filename,object_key,mime_type,size_bytes,sha256) values($1,$2,$3,'x','crafted','text/plain',1,'x')",
      [org, p2, r3],
    );
  }));
test("record identity and visibility immutable; draft updates create durable versions", () =>
  tx(async (db) => {
    const r = await record(db);
    await as(db, "partner");
    assert.equal(
      (
        await db.query(
          "update kxra.records set visibility='owner_only' where id=$1",
          [r],
        )
      ).rowCount,
      0,
    );
    await as(db, "owner");
    await denied(
      db,
      "update kxra.records set visibility='owner_only' where id=$1",
      [r],
    );
    await denied(db, "update kxra.records set id=$1 where id=$2", [
      crypto.randomUUID(),
      r,
    ]);
    await db.query("update kxra.records set body='new evidence' where id=$1", [
      r,
    ]);
    assert.equal(
      (
        await db.query(
          "select * from kxra.record_versions where record_id=$1",
          [r],
        )
      ).rowCount,
      2,
    );
  }));
test("owner acceptance requires MFA, exact hash and unconsumed approval", () =>
  tx(async (db) => {
    const r = await record(db);
    const hash = "a".repeat(64);
    const a = (
      await db.query(
        "insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,expires_at) values($1,$2,'record.accept',$3,$4,now()+interval '1 hour') returning id",
        [org, p2, { record_id: r, version: 1 }, hash],
      )
    ).rows[0].id;
    await as(db, "owner", "aal1");
    await denied(db, "select kxra.decide_approval($1,$2,true)", [a, hash]);
    await as(db, "partner");
    await denied(db, "select kxra.decide_approval($1,$2,true)", [a, hash]);
    await as(db, "owner");
    await denied(db, "select kxra.decide_approval($1,$2,true)", [
      a,
      "b".repeat(64),
    ]);
    await db.query("select kxra.decide_approval($1,$2,true)", [a, hash]);
    await db.query("select kxra.accept_record($1)", [a]);
    assert.equal(
      (await db.query("select status from kxra.records where id=$1", [r]))
        .rows[0].status,
      "accepted",
    );
    await denied(db, "select kxra.accept_record($1)", [a]);
  }));
test("stale and missing record versions cannot be approved for acceptance", () =>
  tx(async (db) => {
    const r = await record(db);
    await denied(
      db,
      "insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,expires_at) values($1,$2,'record.accept',$3,$4,now()+interval '1 hour')",
      [org, p2, { record_id: r }, "a".repeat(64)],
    );
    const a = (
      await db.query(
        "insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,expires_at) values($1,$2,'record.accept',$3,$4,now()+interval '1 hour') returning id",
        [org, p2, { record_id: r, version: 1 }, "a".repeat(64)],
      )
    ).rows[0].id;
    await db.query("select kxra.decide_approval($1,$2,true)", [
      a,
      "a".repeat(64),
    ]);
    await db.query("update kxra.records set title='changed' where id=$1", [r]);
    await denied(db, "select kxra.accept_record($1)", [a]);
  }));
test("membership revocation through approval invalidates existing principal", () =>
  tx(async (db) => {
    await as(db, "owner");
    const a = (
      await db.query(
        "insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,expires_at) values($1,$2,'membership.change',$3,$4,now()+interval '1 hour') returning id",
        [
          org,
          p2,
          { user_id: users.partner, role: "contributor", active: false },
          "a".repeat(64),
        ],
      )
    ).rows[0].id;
    await db.query("select kxra.decide_approval($1,$2,true)", [
      a,
      "a".repeat(64),
    ]);
    await db.query("select kxra.change_membership($1)", [a]);
    await as(db, "partner");
    assert.equal((await db.query("select * from kxra.projects")).rowCount, 0);
    assert.equal((await db.query("select * from kxra.records")).rowCount, 0);
    assert.equal((await db.query("select * from kxra.files")).rowCount, 0);
  }));
