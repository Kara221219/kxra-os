import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { runtimeFile } from "./support/runtime";
const root = process.cwd();
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
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
  p3 = "30000000-0000-4000-8000-000000000003",
  p4 = "30000000-0000-4000-8000-000000000004",
  p5 = "30000000-0000-4000-8000-000000000005";
async function as(
  db: pg.PoolClient,
  user: keyof typeof users | null,
  aal = "aal2",
) {
  await db.query("reset role");
  await db.query(`set local role ${user ? "authenticated" : "anon"}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      user ? users[user] : "",
      JSON.stringify({
        aal,
        sub: user ? users[user] : null,
        auth_time: Math.floor(Date.now() / 1000),
      }),
      user ? org : "",
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
async function committed<T>(
  user: keyof typeof users,
  fn: (db: pg.PoolClient) => Promise<T>,
) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await as(db, user);
    const value = await fn(db);
    await db.query("commit");
    return value;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
async function denied(db: pg.PoolClient, sql: string, values: unknown[] = []) {
  await db.query("savepoint denied");
  await assert.rejects(() => db.query(sql, values));
  await db.query("rollback to savepoint denied");
}
async function deniedWithCode(
  db: pg.PoolClient,
  code: string,
  sql: string,
  values: unknown[] = [],
) {
  await db.query("savepoint denied_code");
  let caught: unknown;
  try {
    await db.query(sql, values);
  } catch (error) {
    caught = error;
  }
  await db.query("rollback to savepoint denied_code");
  assert.equal(
    typeof caught === "object" && caught && "code" in caught
      ? String(caught.code)
      : null,
    code,
    sql,
  );
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
test("owner can access all seven projects; application login cannot bypass RLS", () =>
  tx(async (db) => {
    await as(db, "owner");
    assert.equal((await db.query("select * from kxra.projects")).rowCount, 7);
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
    await db.query("reset role");
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
async function requestApproval(
  db: pg.PoolClient,
  action: string,
  payload: unknown,
) {
  return (
    await db.query("select * from kxra.request_approval($1,$2,$3)", [
      action,
      p2,
      payload,
    ])
  ).rows[0];
}
test("owner acceptance requires MFA, exact hash and unconsumed approval", () =>
  tx(async (db) => {
    const r = await record(db);
    await denied(db, "update kxra.records set status='accepted' where id=$1", [
      r,
    ]);
    const a = await requestApproval(db, "record.accept", {
      record_id: r,
      version: 1,
    });
    await as(db, "owner", "aal1");
    await denied(db, "select kxra.decide_approval($1,$2,true)", [
      a.id,
      a.payload_hash,
    ]);
    await as(db, "partner");
    await denied(db, "select kxra.decide_approval($1,$2,true)", [
      a.id,
      a.payload_hash,
    ]);
    await as(db, "owner");
    await denied(db, "select kxra.decide_approval($1,$2,true)", [
      a.id,
      "b".repeat(64),
    ]);
    await db.query("select kxra.decide_approval($1,$2,true)", [
      a.id,
      a.payload_hash,
    ]);
    await db.query("select kxra.accept_record($1)", [a.id]);
    assert.equal(
      (await db.query("select status from kxra.records where id=$1", [r]))
        .rows[0].status,
      "accepted",
    );
    await denied(db, "select kxra.accept_record($1)", [a.id]);
  }));
test("stale and missing record versions cannot be accepted", () =>
  tx(async (db) => {
    const r = await record(db);
    await denied(db, "select kxra.request_approval($1,$2,$3)", [
      "record.accept",
      p2,
      { record_id: r },
    ]);
    const a = await requestApproval(db, "record.accept", {
      record_id: r,
      version: 1,
    });
    await db.query("select kxra.decide_approval($1,$2,true)", [
      a.id,
      a.payload_hash,
    ]);
    await db.query("update kxra.records set title='changed' where id=$1", [r]);
    await denied(db, "select kxra.accept_record($1)", [a.id]);
  }));
test("AT-02 old grant cannot undo a newer revocation; expiry and key order are bound", () =>
  tx(async (db) => {
    await as(db, "owner");
    const expiry = new Date(Date.now() + 3600000).toISOString();
    const g = await requestApproval(db, "membership.change", {
      user_id: users.partner,
      role: "contributor",
      active: true,
      expires_at: expiry,
    });
    const reordered = await requestApproval(db, "membership.change", {
      expires_at: expiry,
      active: true,
      role: "contributor",
      user_id: users.partner,
    });
    assert.equal(g.payload_hash, reordered.payload_hash);
    await db.query("select kxra.decide_approval($1,$2,true)", [
      g.id,
      g.payload_hash,
    ]);
    const r = await requestApproval(db, "membership.change", {
      user_id: users.partner,
      role: "contributor",
      active: false,
      expires_at: expiry,
    });
    await db.query("select kxra.decide_approval($1,$2,true)", [
      r.id,
      r.payload_hash,
    ]);
    await db.query("select kxra.change_membership($1)", [r.id]);
    await denied(db, "select kxra.change_membership($1)", [g.id]);
    const membership = (
      await db.query(
        "select * from kxra.project_memberships where project_id=$1 and user_id=$2",
        [p2, users.partner],
      )
    ).rows[0];
    assert.equal(membership.active, false);
    assert.equal(new Date(membership.expires_at).toISOString(), expiry);
    await as(db, "partner");
    for (const table of ["projects", "records", "files"])
      assert.equal((await db.query(`select * from kxra.${table}`)).rowCount, 0);
  }));
test("AT-02 approval envelope binds every field; rejected and expired requests fail", () =>
  tx(async (db) => {
    const r = await record(db);
    const requested = await requestApproval(db, "record.accept", {
      record_id: r,
      version: 1,
    });
    await denied(db, "update kxra.approvals set action='deploy' where id=$1", [
      requested.id,
    ]);
    await db.query("select kxra.decide_approval($1,$2,false)", [
      requested.id,
      requested.payload_hash,
    ]);
    await denied(db, "select kxra.accept_record($1)", [requested.id]);

    await db.query("reset role");
    const expiry = new Date(Date.now() + 60_000).toISOString();
    const baseArgs = [
      "spend",
      org,
      p2,
      { recipient: users.partner, cost: "10.0000", contents: "a" },
      "local",
      users.owner,
      expiry,
    ];
    const digest = async (args: unknown[]) =>
      (
        await db.query(
          "select kxra_private.approval_digest($1,$2,$3,$4,$5,$6,$7) as value",
          args,
        )
      ).rows[0].value;
    const original = await digest(baseArgs);
    for (const args of [
      ["deploy", ...baseArgs.slice(1)],
      [baseArgs[0], crypto.randomUUID(), ...baseArgs.slice(2)],
      [baseArgs[0], baseArgs[1], p3, ...baseArgs.slice(3)],
      [
        ...baseArgs.slice(0, 3),
        { recipient: users.viewer, cost: "10.0000", contents: "a" },
        ...baseArgs.slice(4),
      ],
      [
        ...baseArgs.slice(0, 3),
        { recipient: users.partner, cost: "11.0000", contents: "a" },
        ...baseArgs.slice(4),
      ],
      [
        ...baseArgs.slice(0, 3),
        { recipient: users.partner, cost: "10.0000", contents: "b" },
        ...baseArgs.slice(4),
      ],
      [...baseArgs.slice(0, 4), "preview", ...baseArgs.slice(5)],
      [...baseArgs.slice(0, 5), users.partner, ...baseArgs.slice(6)],
      [...baseArgs.slice(0, 6), new Date(Date.now() + 120_000).toISOString()],
    ])
      assert.notEqual(await digest(args), original);

    const past = new Date(Date.now() - 60_000).toISOString();
    const payload = { record_id: r, version: 1 };
    const expiredHash = await digest([
      "record.accept",
      org,
      p2,
      payload,
      "local",
      users.owner,
      past,
    ]);
    const expired = (
      await db.query(
        "insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,environment,requested_by,expires_at) values($1,$2,'record.accept',$3,$4,'local',$5,$6) returning id",
        [org, p2, payload, expiredHash, users.owner, past],
      )
    ).rows[0].id;
    await as(db, "owner");
    await denied(db, "select kxra.decide_approval($1,$2,true)", [
      expired,
      expiredHash,
    ]);
  }));
test("AT-02 concurrent approval execution produces one transition and audit", async () => {
  const r = await committed(
    "owner",
    async (db) =>
      (
        await db.query(
          "insert into kxra.records(org_id,project_id,kind,title,classification,visibility) values($1,$2,'note','Concurrent approval fixture','USER-SUPPLIED INFORMATION','owner_only') returning id,version",
          [org, p2],
        )
      ).rows[0],
  );
  const approval = await committed(
    "owner",
    async (db) =>
      (
        await db.query(
          "select * from kxra.request_approval('record.accept',$1,$2)",
          [p2, { record_id: r.id, version: r.version }],
        )
      ).rows[0],
  );
  await committed("owner", (db) =>
    db.query("select kxra.decide_approval($1,$2,true)", [
      approval.id,
      approval.payload_hash,
    ]),
  );
  const attempts = await Promise.allSettled([
    committed("owner", (db) =>
      db.query("select kxra.accept_record($1)", [approval.id]),
    ),
    committed("owner", (db) =>
      db.query("select kxra.accept_record($1)", [approval.id]),
    ),
  ]);
  assert.equal(
    attempts.filter((item) => item.status === "fulfilled").length,
    1,
  );
  assert.equal(attempts.filter((item) => item.status === "rejected").length, 1);
  await committed("owner", async (db) => {
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.audit_events where action='approval.executed' and resource_id=$1",
          [approval.id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await db.query("select status from kxra.records where id=$1", [r.id]))
        .rows[0].status,
      "accepted",
    );
  });
});
test("AT-03 invitation identity, expiry, reuse and recent-MFA boundaries fail closed", () =>
  tx(async (db) => {
    const token = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const invited = crypto.randomUUID();
    const wrong = crypto.randomUUID();
    const email = "synthetic-invitee@fixture.invalid";
    const claims = async (id: string, claimEmail: string, verified = true) => {
      await db.query("reset role");
      await db.query("set local role authenticated");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [
          id,
          JSON.stringify({
            sub: id,
            aal: "aal1",
            auth_time: Math.floor(Date.now() / 1000),
            email: claimEmail,
            email_verified: verified,
          }),
        ],
      );
    };

    await as(db, "owner");
    const invitation = (
      await db.query(
        "select * from kxra.create_invitation($1,$2,'viewer',$3,$4)",
        [p3, email, tokenHash, new Date(Date.now() + 3600_000)],
      )
    ).rows[0];
    assert.ok(invitation.id);

    await claims(wrong, "wrong@fixture.invalid");
    await denied(db, "select kxra.redeem_invitation($1)", [tokenHash]);
    await claims(invited, email, false);
    await denied(db, "select kxra.redeem_invitation($1)", [tokenHash]);
    await claims(invited, email);
    assert.equal(
      (
        await db.query("select kxra.redeem_invitation($1) as project_id", [
          tokenHash,
        ])
      ).rows[0].project_id,
      p3,
    );
    await denied(db, "select kxra.redeem_invitation($1)", [tokenHash]);
    await db.query("reset role");
    assert.deepEqual(
      (
        await db.query(
          "select project_id,role from kxra.project_memberships where user_id=$1",
          [invited],
        )
      ).rows,
      [{ project_id: p3, role: "viewer" }],
    );
    assert.deepEqual(
      (
        await db.query(
          "select account_state,onboarding_completed_at from kxra.profiles where user_id=$1",
          [invited],
        )
      ).rows,
      [{ account_state: "ONBOARDING", onboarding_completed_at: null }],
    );
    await claims(invited, email);
    assert.equal((await db.query("select id from kxra.projects")).rowCount, 0);
    assert.deepEqual(
      (
        await db.query(
          "select project_id,project_role from kxra.onboarding_project_access()",
        )
      ).rows,
      [{ project_id: p3, project_role: "viewer" }],
    );

    await as(db, "owner");
    await db.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({
        sub: users.owner,
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000) - 901,
      }),
    ]);
    await denied(
      db,
      "select * from kxra.create_invitation($1,$2,'viewer',$3,$4)",
      [
        p3,
        email,
        crypto.randomBytes(32).toString("hex"),
        new Date(Date.now() + 3600_000),
      ],
    );

    await db.query("reset role");
    const expiredToken = crypto.randomBytes(32).toString("base64url");
    const expiredHash = crypto
      .createHash("sha256")
      .update(expiredToken)
      .digest("hex");
    const emailHash = crypto.createHash("sha256").update(email).digest("hex");
    await db.query(
      "insert into kxra.invitations(org_id,project_id,email_digest,token_digest,role,approved_by,expires_at) values($1,$2,$3,$4,'viewer',$5,$6)",
      [
        org,
        p3,
        emailHash,
        expiredHash,
        users.owner,
        new Date(Date.now() - 1000),
      ],
    );
    await claims(crypto.randomUUID(), email);
    await denied(db, "select kxra.redeem_invitation($1)", [expiredHash]);
  }));
test("AT-19/20 exact grants, agreement versions and required-policy resume are database enforced", () =>
  tx(async (db) => {
    const accountId = crypto.randomUUID();
    const email = `db-onboarding-${crypto.randomUUID()}@fixture.invalid`;
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const identity = async (verified: boolean) => {
      await db.query("reset role");
      await db.query("set local role authenticated");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [
          accountId,
          JSON.stringify({
            sub: accountId,
            aal: "aal1",
            auth_time: Math.floor(Date.now() / 1000),
            email,
            email_verified: verified,
            session_version: 1,
          }),
        ],
      );
    };

    await as(db, "owner");
    const invitation = (
      await db.query(
        "select * from kxra.create_multi_project_invitation($1,$2,$3,$4,$5)",
        [
          email,
          JSON.stringify([
            { project_id: p2, role: "contributor" },
            { project_id: p3, role: "viewer" },
          ]),
          "Synthetic exact-grant database fixture",
          tokenHash,
          new Date(Date.now() + 3_600_000),
        ],
      )
    ).rows[0];
    assert.ok(invitation.id);
    await identity(false);
    assert.equal(
      (
        await db.query(
          "select kxra.register_invited_profile($1,1,$2) as state",
          [invitation.id, tokenHash],
        )
      ).rows[0].state,
      "REGISTERED",
    );
    await denied(db, "select kxra.redeem_invitation_version($1,1,$2)", [
      invitation.id,
      tokenHash,
    ]);
    await identity(true);
    const redeemed = (
      await db.query(
        "select kxra.redeem_invitation_version($1,1,$2) as result",
        [invitation.id, tokenHash],
      )
    ).rows[0].result;
    assert.deepEqual(redeemed.project_ids.sort(), [p2, p3]);
    assert.equal(redeemed.onboarding_required, true);
    await denied(db, "select kxra.redeem_invitation_version($1,1,$2)", [
      invitation.id,
      tokenHash,
    ]);

    await db.query("reset role");
    assert.deepEqual(
      (
        await db.query(
          `select project_id,role from kxra.project_memberships
           where user_id=$1 order by project_id`,
          [accountId],
        )
      ).rows,
      [
        { project_id: p2, role: "contributor" },
        { project_id: p3, role: "viewer" },
      ],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.invitations where id=$1 and token_digest=$2 and state='REDEEMED'",
          [invitation.id, tokenHash],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from information_schema.columns
           where table_schema='kxra' and table_name='invitations' and column_name in ('token','password')`,
        )
      ).rows[0].n,
      0,
    );

    await identity(true);
    await denied(db, "select kxra.complete_onboarding_step(2,$1)", [
      {
        first_name: "Out",
        last_name: "Of order",
        job_title: "",
        company: "",
        phone: "",
      },
    ]);
    const onboardingSteps: [number, Record<string, unknown>][] = [
      [1, { acknowledged: true }],
      [
        2,
        {
          first_name: "Database",
          last_name: "Partner",
          job_title: "Research partner",
          company: "Synthetic fixture",
          phone: "+44 7700 900789",
        },
      ],
      [3, { security_acknowledged: true }],
      [4, { access_acknowledged: true }],
      [5, { working_acknowledged: true }],
      [6, { whatsapp_choice: "SKIP" }],
      [
        7,
        {
          timezone: "Europe/London",
          email_notifications: true,
          whatsapp_notifications: false,
          display_density: "comfortable",
        },
      ],
    ];
    for (const [step, data] of onboardingSteps)
      await db.query("select kxra.complete_onboarding_step($1,$2)", [
        step,
        data,
      ]);
    const currentAgreements = (
      await db.query(
        `select id,version from kxra.agreement_documents
         where required and status in ('APPROVED','UNAPPROVED_PLACEHOLDER')
         order by document_key`,
      )
    ).rows;
    assert.equal(currentAgreements.length, 2);
    await denied(db, "select kxra.complete_onboarding_step(8,$1)", [
      {
        agreement_ids: [currentAgreements[0].id],
        placeholder_acknowledged: true,
      },
    ]);
    await db.query("select kxra.complete_onboarding_step(8,$1)", [
      {
        agreement_ids: currentAgreements.map((entry) => entry.id),
        placeholder_acknowledged: true,
      },
    ]);
    await db.query("select kxra.complete_onboarding_step(9,$1)", [
      { complete: true },
    ]);
    assert.deepEqual(
      (
        await db.query(
          `select account_state,onboarding_completed_at is not null as completed
           from kxra.profiles where user_id=$1`,
          [accountId],
        )
      ).rows,
      [{ account_state: "ACTIVE", completed: true }],
    );
    assert.deepEqual(
      (
        await db.query(
          `select agreement_id,agreement_version,accepted_at is not null as timestamped
           from kxra.agreement_acceptances where user_id=$1 order by agreement_id`,
          [accountId],
        )
      ).rows,
      currentAgreements
        .map((entry) => ({
          agreement_id: entry.id,
          agreement_version: entry.version,
          timestamped: true,
        }))
        .sort((a, b) => a.agreement_id.localeCompare(b.agreement_id)),
    );

    await db.query("reset role");
    const newTerms = crypto.randomUUID();
    await db.query(
      "update kxra.agreement_documents set status='RETIRED',required=false where org_id=$1 and document_key='terms' and version=1",
      [org],
    );
    await db.query(
      `insert into kxra.agreement_documents(
        id,org_id,document_key,version,title,body,status,required
       ) values($1,$2,'terms',2,'Terms placeholder v2 — unapproved',
        'Synthetic replacement placeholder requiring fresh acknowledgement.',
        'UNAPPROVED_PLACEHOLDER',true)`,
      [newTerms, org],
    );
    await identity(true);
    assert.equal(
      (await db.query("select kxra.resume_required_onboarding() as step"))
        .rows[0].step,
      8,
    );
    assert.equal((await db.query("select id from kxra.projects")).rowCount, 0);
    await db.query("select kxra.complete_onboarding_step(8,$1)", [
      { agreement_ids: [newTerms], placeholder_acknowledged: true },
    ]);
    await db.query("select kxra.complete_onboarding_step(9,$1)", [
      { complete: true },
    ]);
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from kxra.agreement_acceptances
           where user_id=$1 and agreement_id=$2 and agreement_version=2`,
          [accountId, newTerms],
        )
      ).rows[0].n,
      1,
    );
  }));
test("AT-21 protected account fields and suspended-account isolation fail closed in SQL", () =>
  tx(async (db) => {
    await as(db, "partner");
    await denied(db, "update kxra.members set role='owner' where id=$1", [
      users.partner,
    ]);
    await denied(
      db,
      "update kxra.profiles set account_state='ACTIVE' where user_id=$1",
      [users.partner],
    );
    await denied(db, "update kxra.profiles set org_id=$1 where user_id=$2", [
      crypto.randomUUID(),
      users.partner,
    ]);
    await denied(
      db,
      "insert into kxra.project_memberships(org_id,project_id,user_id,role) values($1,$2,$3,'contributor')",
      [org, p3, users.partner],
    );
    await denied(db, "select kxra.update_own_profile($1)", [
      {
        first_name: "Forged",
        last_name: "Owner",
        job_title: "",
        company: "",
        phone: "",
        role: "owner",
      },
    ]);
    await denied(db, "select kxra.update_own_preferences($1)", [
      {
        timezone: "Europe/London",
        email_notifications: true,
        whatsapp_notifications: false,
        display_density: "comfortable",
        security_alerts: false,
      },
    ]);

    await db.query("reset role");
    const pairingId = crypto.randomUUID();
    await db.query(
      `insert into kxra.whatsapp_pairings(
        id,org_id,user_id,phone_digest,verified_at
       ) values($1,$2,$3,$4,now())`,
      [
        pairingId,
        org,
        users.partner,
        crypto.createHash("sha256").update(pairingId).digest("hex"),
      ],
    );
    await as(db, "owner");
    const requested = (
      await db.query(
        "select * from kxra.request_account_lifecycle_approval($1,'SUSPENDED',$2)",
        [users.partner, "AT-21 database suspension fixture"],
      )
    ).rows[0];
    await db.query("select kxra.decide_approval($1,$2,true)", [
      requested.id,
      requested.payload_hash,
    ]);
    await db.query("select kxra.change_account_lifecycle($1)", [requested.id]);

    await as(db, "partner");
    const isolatedQueries: Array<[string, string, unknown[]]> = [
      ["profiles", "user_id=$1", [users.partner]],
      ["members", "id=$1", [users.partner]],
      ["project_memberships", "user_id=$1", [users.partner]],
      ["onboarding_progress", "user_id=$1", [users.partner]],
      ["user_preferences", "user_id=$1", [users.partner]],
      ["agreement_acceptances", "user_id=$1", [users.partner]],
      ["session_revocations", "user_id=$1", [users.partner]],
      ["account_security_events", "user_id=$1", [users.partner]],
      ["whatsapp_pairings", "user_id=$1", [users.partner]],
    ];
    for (const [table, predicate, values] of isolatedQueries)
      assert.equal(
        (
          await db.query(
            `select * from kxra.${table} where ${predicate}`,
            values,
          )
        ).rowCount,
        0,
        table,
      );
    for (const table of ["projects", "records", "files", "agreement_documents"])
      assert.equal(
        (await db.query(`select * from kxra.${table}`)).rowCount,
        0,
        table,
      );

    await db.query("reset role");
    const state = (
      await db.query(
        `select p.account_state,m.active,p.session_version,m.access_version
         from kxra.profiles p join kxra.members m on m.id=p.user_id
         where p.user_id=$1`,
        [users.partner],
      )
    ).rows[0];
    assert.equal(state.account_state, "SUSPENDED");
    assert.equal(state.active, false);
    assert.ok(state.session_version > 1);
    assert.ok(state.access_version > 1);
    assert.ok(
      (
        await db.query(
          "select revoked_at from kxra.whatsapp_pairings where id=$1",
          [pairingId],
        )
      ).rows[0].revoked_at,
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from kxra.account_security_events
           where user_id=$1 and event_type='ACCOUNT_SUSPENDED'
            and metadata->>'approval_id'=$2`,
          [users.partner, requested.id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          `select count(*)::int as n from kxra.audit_events
           where resource_id=$1 and action='account.lifecycle.changed'
            and metadata->>'approval_id'=$2`,
          [users.partner, requested.id],
        )
      ).rows[0].n,
      1,
    );
  }));
test("AT-07 aggregate includes 201 entries and rejects SQL JSON null/type defects", () =>
  tx(async (db) => {
    await as(db, "owner");
    const base = (
      await db.query(
        "select coalesce(sum(total),0)::text as n from kxra.finance_totals() where currency='GBP'",
      )
    ).rows[0].n;
    await db.query(
      'insert into kxra.records(org_id,kind,title,classification,data) select $1,\'finance\',\'Aggregate fixture\',\'USER-SUPPLIED INFORMATION\',\'{"amount":"1","currency":"GBP","entry_type":"actual","direction":"income"}\'::jsonb from generate_series(1,201)',
      [org],
    );
    const value = () =>
      db.query(
        "select total::text from kxra.finance_totals() where currency='GBP'",
      );
    assert.equal(Number((await value()).rows[0].total) - Number(base), 201);
    for (const [amount, currency, entry_type, direction] of [
      ["2", "GBP", "actual", "expense"],
      ["5", "USD", "actual", "income"],
      ["999", "GBP", "paper", "income"],
      ["999", "GBP", "estimate", "income"],
      ["999", "GBP", "commitment", "income"],
    ])
      await db.query(
        "insert into kxra.records(org_id,kind,title,classification,data) values($1,'finance','Aggregate fixture','ESTIMATE',$2)",
        [org, { amount, currency, entry_type, direction }],
      );
    assert.equal(Number((await value()).rows[0].total) - Number(base), 199);
    for (const key of ["amount", "currency", "entry_type", "direction"])
      for (const bad of [null, {}, [], true, 42, "invalid"]) {
        const d: Record<string, unknown> = {
          amount: "10",
          currency: "GBP",
          entry_type: "actual",
          direction: "income",
        };
        d[key] = bad;
        await denied(
          db,
          "insert into kxra.records(org_id,kind,title,classification,data) values($1,'finance','Invalid fixture','ESTIMATE',$2)",
          [org, d],
        );
      }
  }));
test("AT-07 decimal totals are exact and dashboard open-risk states are explicit", () =>
  tx(async (db) => {
    await as(db, "owner");
    const beforeMoney = (
      await db.query(
        "select coalesce((select total from kxra.finance_totals() where currency='EUR'),0)::text as total",
      )
    ).rows[0].total;
    for (const amount of ["0.1", "0.2"])
      await db.query(
        "insert into kxra.records(org_id,kind,title,classification,data) values($1,'finance','Decimal fixture','ESTIMATE',$2)",
        [
          org,
          {
            amount,
            currency: "EUR",
            entry_type: "actual",
            direction: "income",
          },
        ],
      );
    assert.equal(
      (
        await db.query(
          "select (total-$1::numeric)::numeric(30,4)::text as delta from kxra.finance_totals() where currency='EUR'",
          [beforeMoney],
        )
      ).rows[0].delta,
      "0.3000",
    );

    const beforeRisks = Number(
      (await db.query("select open_risks from kxra.dashboard_counts()")).rows[0]
        .open_risks,
    );
    await db.query("reset role");
    for (const status of [
      "draft",
      "submitted",
      "completed",
      "rejected",
      "archived",
    ])
      await db.query(
        "insert into kxra.records(org_id,project_id,kind,title,classification,visibility,status) values($1,$2,'risk',$3,'ASSUMPTION','owner_only',$4)",
        [org, p2, `Risk state ${status}`, status],
      );
    await as(db, "owner");
    const afterRisks = Number(
      (await db.query("select open_risks from kxra.dashboard_counts()")).rows[0]
        .open_risks,
    );
    assert.equal(afterRisks - beforeRisks, 2);
  }));
test("AT-06 classification promotion needs reviewed evidence and snapshots retain both states", () =>
  tx(async (db) => {
    await as(db, "partner");
    const r = (
      await db.query(
        "insert into kxra.records(org_id,project_id,kind,title,classification,visibility) values($1,$2,'note','Hypothesis fixture','HYPOTHESIS','project_shared') returning id",
        [org, p2],
      )
    ).rows[0].id;
    await denied(
      db,
      "update kxra.records set classification='FACT' where id=$1",
      [r],
    );
    const e = await record(db);
    const a = await requestApproval(db, "record.accept", {
      record_id: e,
      version: 1,
    });
    await db.query("select kxra.decide_approval($1,$2,true)", [
      a.id,
      a.payload_hash,
    ]);
    await db.query("select kxra.accept_record($1)", [a.id]);
    await db.query("select kxra.verify_record($1,1,$2,2,$3)", [
      r,
      e,
      "Compared to accepted evidence in synthetic test",
    ]);
    const rows = (
      await db.query(
        "select classification,status,editor_id from kxra.record_versions where record_id=$1 order by version",
        [r],
      )
    ).rows;
    assert.deepEqual(
      rows.map((x) => x.classification),
      ["HYPOTHESIS", "FACT"],
    );
    assert.equal(rows[0].editor_id, users.partner);
    assert.equal(rows[1].editor_id, users.owner);
  }));
test("AT-01 separate organisation and every private table enforce RLS", () =>
  tx(async (db) => {
    const x = crypto.randomUUID(),
      o = crypto.randomUUID(),
      p = crypto.randomUUID();
    await db.query("insert into kxra.organisations values($1,$2)", [
      o,
      "Other synthetic org",
    ]);
    await db.query(
      "insert into kxra.members(id,org_id,display_name,role) values($1,$2,'Other owner','owner')",
      [x, o],
    );
    await db.query(
      `insert into kxra.profiles(
        user_id,org_id,first_name,last_name,account_state,email_verified_at,
        onboarding_completed_at,mfa_state
       ) values($1,$2,'Other','Owner','ACTIVE',now(),now(),'ENROLLED')`,
      [x, o],
    );
    await db.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'X','Private marker','test','test','test')",
      [p, o],
    );
    await as(db, "owner");
    assert.equal(
      (await db.query("select * from kxra.projects where id=$1", [p])).rowCount,
      0,
    );
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true)",
      [x, o],
    );
    assert.deepEqual(
      (await db.query("select id from kxra.projects")).rows.map((x) => x.id),
      [p],
    );
    assert.equal((await db.query("select * from kxra.records")).rowCount, 0);
    await db.query("reset role");
    const tables = (
      await db.query(
        "select tablename,rowsecurity from pg_tables where schemaname='kxra'",
      )
    ).rows;
    assert.ok(tables.every((t) => t.rowsecurity));
    await as(db, null);
    for (const { tablename } of tables)
      assert.equal(
        (await db.query(`select * from kxra.${tablename}`)).rowCount,
        0,
        tablename,
      );
  }));
test("AT-01 every private table denies unauthorized DML", () =>
  tx(async (db) => {
    await db.query("reset role");
    const tables = (
      await db.query(
        `select c.table_name,c.column_name
         from information_schema.columns c
         join (
         select table_name,min(ordinal_position) as ordinal_position
          from information_schema.columns
          where table_schema='kxra' and is_identity='NO' and is_generated='NEVER'
          group by table_name
         ) first_column using(table_name,ordinal_position)
         where c.table_schema='kxra' order by c.table_name`,
      )
    ).rows as { table_name: string; column_name: string }[];
    assert.equal(tables.length, 143);

    for (const { table_name: table, column_name: column } of tables) {
      await as(db, null);
      await deniedWithCode(
        db,
        "42501",
        `insert into kxra.${table} default values`,
      );
      await deniedWithCode(
        db,
        "42501",
        `update kxra.${table} set "${column}"="${column}" where false`,
      );
      await deniedWithCode(db, "42501", `delete from kxra.${table}`);

      await as(db, "partner");
      await deniedWithCode(db, "42501", `delete from kxra.${table}`);
      if (!["records", "files", "approvals"].includes(table))
        await deniedWithCode(
          db,
          "42501",
          `insert into kxra.${table} default values`,
        );
      if (table !== "records")
        await deniedWithCode(
          db,
          "42501",
          `update kxra.${table} set "${column}"="${column}" where false`,
        );
    }
  }));
test("AT-01 anonymous can execute only the two bounded public RPCs", () =>
  tx(async (db) => {
    await db.query("reset role");
    const functions = (
      await db.query(
        `select p.oid::regprocedure::text as signature,
          format('select * from %I.%I(%s)',n.nspname,p.proname,
           coalesce((select string_agg('null::'||format_type(argument_type,null),',' order by position)
            from unnest(p.proargtypes) with ordinality as argument(argument_type,position)),'')
          ) as call,
          has_function_privilege('anon',p.oid,'execute') as anonymous_execute
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='kxra' order by signature`,
      )
    ).rows as {
      signature: string;
      call: string;
      anonymous_execute: boolean;
    }[];
    assert.equal(functions.length, 118);
    assert.deepEqual(
      functions
        .filter((entry) => entry.anonymous_execute)
        .map((entry) => entry.signature),
      [
        "kxra.consume_rate_limit(text,text,integer,integer)",
        "kxra.preview_invitation(text)",
      ],
    );
    await as(db, null);
    for (const entry of functions.filter((item) => !item.anonymous_execute))
      await deniedWithCode(db, "42501", entry.call);
    assert.equal(
      (
        await db.query("select * from kxra.preview_invitation($1)", [
          "a".repeat(64),
        ])
      ).rowCount,
      0,
    );
    const rateSubject = crypto.randomBytes(32).toString("hex");
    assert.equal(
      (
        await db.query(
          "select kxra.consume_rate_limit('at01-anon',$1,1,60) as allowed",
          [rateSubject],
        )
      ).rows[0].allowed,
      true,
    );
    assert.equal(
      (
        await db.query(
          "select kxra.consume_rate_limit('at01-anon',$1,1,60) as allowed",
          [rateSubject],
        )
      ).rows[0].allowed,
      false,
    );
  }));
test("AT-09 project gates block unknown evidence and authorize local-only scope", () =>
  tx(async (db) => {
    await as(db, "owner");
    await denied(
      db,
      "update kxra.projects set live_execution_enabled=true where id=$1",
      [p4],
    );
    await denied(
      db,
      "update kxra.projects set product_creation_enabled=true where id=$1",
      [p5],
    );
    await db.query("reset role");
    await denied(
      db,
      "update kxra.projects set live_execution_enabled=true where id=$1",
      [p4],
    );

    await as(db, "owner");
    const source = (
      await db.query(
        "select id,version from kxra.records where source_code='PROJECT-005-BRIEF'",
      )
    ).rows[0];
    const refs = JSON.stringify([
      { record_id: source.id, version: source.version },
    ]);
    await denied(
      db,
      "select kxra.create_gate_evidence_packet($1,'P005_LOCAL_PROTOTYPE','Invalid demand','Invalid',$2,$3)",
      [p5, { buyer_problem: "Synthetic buyer", demand_reviewed: false }, refs],
    );
    await denied(
      db,
      "select kxra.create_gate_evidence_packet($1,'P002_LISTING','Wrong gate','Wrong project',$2,$3)",
      [
        p5,
        {
          exact_sku: "SYNTHETIC-001",
          fitment_verified: true,
          safety_evidence_verified: true,
        },
        refs,
      ],
    );
    const packet = (
      await db.query(
        "select kxra.create_gate_evidence_packet($1,'P005_LOCAL_PROTOTYPE','Synthetic demand packet','Local fixture only',$2,$3) as id",
        [
          p5,
          { buyer_problem: "Synthetic buyer workflow", demand_reviewed: true },
          refs,
        ],
      )
    ).rows[0].id;
    await denied(
      db,
      "select * from kxra.request_project_gate_approval($1,$2)",
      [
        p5,
        {
          gate: "P005_LOCAL_PROTOTYPE",
          evidence_id: packet,
          evidence_version: 1,
        },
      ],
    );

    const acceptance = (
      await db.query(
        "select * from kxra.request_approval('record.accept',$1,$2)",
        [p5, { record_id: packet, version: 1 }],
      )
    ).rows[0];
    await db.query("select kxra.decide_approval($1,$2,true)", [
      acceptance.id,
      acceptance.payload_hash,
    ]);
    await db.query("select kxra.accept_record($1)", [acceptance.id]);
    const gateApproval = (
      await db.query(
        "select * from kxra.request_project_gate_approval($1,$2)",
        [
          p5,
          {
            gate: "P005_LOCAL_PROTOTYPE",
            evidence_id: packet,
            evidence_version: 2,
          },
        ],
      )
    ).rows[0];
    await db.query("select kxra.decide_approval($1,$2,true)", [
      gateApproval.id,
      gateApproval.payload_hash,
    ]);
    const authorization = (
      await db.query("select kxra.authorize_project_gate($1) as id", [
        gateApproval.id,
      ])
    ).rows[0].id;
    const saved = (
      await db.query(
        "select scope,gate_code,evidence_version from kxra.project_gate_authorizations where id=$1",
        [authorization],
      )
    ).rows[0];
    assert.deepEqual(saved, {
      scope: "local_only",
      gate_code: "P005_LOCAL_PROTOTYPE",
      evidence_version: 2,
    });
    const projectState = (
      await db.query(
        "select live_execution_enabled,product_creation_enabled from kxra.projects where id=$1",
        [p5],
      )
    ).rows[0];
    assert.deepEqual(projectState, {
      live_execution_enabled: false,
      product_creation_enabled: false,
    });
    assert.deepEqual(
      (
        await db.query(
          "select gate_code,threshold_state from kxra.project_gate_policies where project_id=$1",
          [p4],
        )
      ).rows,
      [
        {
          gate_code: "P004_PAPER_READINESS",
          threshold_state: "proposed_unset",
        },
      ],
    );
    await denied(
      db,
      "insert into kxra.project_gate_authorizations(org_id,project_id,gate_code,evidence_id,evidence_version,approval_id) values($1,$2,'P005_LOCAL_PROTOTYPE',$3,2,$4)",
      [org, p5, packet, gateApproval.id],
    );
  }));
test("AT-09 P002 and P003 gates require their exact reviewed claims", () =>
  tx(async (db) => {
    await as(db, "owner");
    const cases = [
      {
        project: p2,
        sourceCode: "PROJECT-002-BRIEF",
        gate: "P002_LISTING",
        validClaims: {
          exact_sku: "SYNTHETIC-SKU-AT09",
          fitment_verified: true,
          safety_evidence_verified: true,
        },
        invalidClaims: {
          exact_sku: "SYNTHETIC-SKU-AT09",
          fitment_verified: true,
          safety_evidence_verified: false,
        },
      },
      {
        project: p3,
        sourceCode: "PROJECT-003-BRIEF",
        gate: "P003_FAITHFUL_DELIVERY",
        validClaims: {
          rights_confirmed: true,
          geometry_qa_passed: true,
        },
        invalidClaims: {
          rights_confirmed: false,
          geometry_qa_passed: true,
        },
      },
    ];

    for (const item of cases) {
      const source = (
        await db.query(
          "select id,version from kxra.records where source_code=$1",
          [item.sourceCode],
        )
      ).rows[0];
      const evidence = JSON.stringify([
        { record_id: source.id, version: source.version },
      ]);
      await denied(
        db,
        "select kxra.create_gate_evidence_packet($1,$2,'Invalid exact claims','Must remain blocked',$3,$4)",
        [item.project, item.gate, item.invalidClaims, evidence],
      );
      const packet = (
        await db.query(
          "select kxra.create_gate_evidence_packet($1,$2,'Valid synthetic claims','Local fixture only',$3,$4) as id",
          [item.project, item.gate, item.validClaims, evidence],
        )
      ).rows[0].id;
      const acceptance = (
        await db.query(
          "select * from kxra.request_approval('record.accept',$1,$2)",
          [item.project, { record_id: packet, version: 1 }],
        )
      ).rows[0];
      await db.query("select kxra.decide_approval($1,$2,true)", [
        acceptance.id,
        acceptance.payload_hash,
      ]);
      await db.query("select kxra.accept_record($1)", [acceptance.id]);
      await denied(
        db,
        "select * from kxra.request_project_gate_approval($1,$2)",
        [
          item.project,
          { gate: item.gate, evidence_id: packet, evidence_version: 1 },
        ],
      );
      const gateApproval = (
        await db.query(
          "select * from kxra.request_project_gate_approval($1,$2)",
          [
            item.project,
            { gate: item.gate, evidence_id: packet, evidence_version: 2 },
          ],
        )
      ).rows[0];
      await db.query("select kxra.decide_approval($1,$2,true)", [
        gateApproval.id,
        gateApproval.payload_hash,
      ]);
      const authorization = (
        await db.query("select kxra.authorize_project_gate($1) as id", [
          gateApproval.id,
        ])
      ).rows[0].id;
      const saved = (
        await db.query(
          "select gate_code,scope,evidence_version from kxra.project_gate_authorizations where id=$1",
          [authorization],
        )
      ).rows[0];
      assert.deepEqual(saved, {
        gate_code: item.gate,
        scope: "local_only",
        evidence_version: 2,
      });
    }
  }));
