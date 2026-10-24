import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";

const digest = (text: string) =>
  crypto.createHash("sha256").update(text).digest("hex");

/** Test source only until executed by the integration owner on a disposable fixture. */
function syntheticConfiguration() {
  assert.ok(
    localModeConfiguration(process.env),
    "Legal retirement regression requires explicit local fixture mode",
  );
  assert.ok(
    process.env.KXRA_RUNTIME,
    "Explicit isolated fixture runtime required",
  );
  const config = JSON.parse(
    fs.readFileSync(
      path.join(process.env.KXRA_RUNTIME!, "database.json"),
      "utf8",
    ),
  );
  assert.equal(config.host, path.join(process.env.KXRA_RUNTIME!, "socket"));
  assert.equal(config.user, "kxra_app");
  assert.ok(
    !config.password,
    "Only password-free isolated local fixture sockets are allowed",
  );
  return { ...config, user: os.userInfo().username, password: "" };
}

async function asCustomer(db: pg.Client, account: string, org: string) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      account,
      JSON.stringify({
        sub: account,
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000),
      }),
      org,
    ],
  );
}

async function assertPrivateAccess(
  db: pg.Client,
  org: string,
  project: string,
  allowed: boolean,
) {
  const gate = (
    await db.query(
      "select kxra_private.legal_requirements_satisfied($1) legal,kxra_private.private_access_allowed($1) private",
      [org],
    )
  ).rows[0];
  assert.deepEqual(gate, { legal: allowed, private: allowed });
  assert.deepEqual(
    (await db.query("select id from kxra.projects where id=$1", [project]))
      .rows,
    allowed ? [{ id: project }] : [],
  );
  const status = (
    await db.query(
      "select allowed,code,missing_count from kxra.legal_gate_status()",
    )
  ).rows[0];
  assert.deepEqual(status, {
    allowed,
    code: allowed ? "ALLOWED" : "AGREEMENT_REQUIRED",
    missing_count: allowed ? 0 : 1,
  });
}

test("ACTIVE mandatory requirements fail closed for retired documents and stale acceptance; explicit requirement retirement removes the obligation", async () => {
  const db = new pg.Client(syntheticConfiguration());
  await db.connect();
  try {
    await db.query("begin");
    const org = crypto.randomUUID();
    const account = crypto.randomUUID();
    const project = crypto.randomUUID();
    const document = crypto.randomUUID();
    const requirement = crypto.randomUUID();
    const content =
      "Synthetic mandatory terms; no customer legal offer or hosted data.";
    const wording = "I accept this exact synthetic document.";
    await db.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic legal retirement',$2)",
      [org, `synthetic-legal-${org}`],
    );
    await db.query(
      "insert into kxra.account_identities(account_id,auth_subject,state,email_verified_at) values($1,$1::uuid::text,'ACTIVE',now())",
      [account],
    );
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic customer','SYNTHETIC_FIXTURE')",
      [org, account],
    );
    await db.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'LEGAL-RETIREMENT','Synthetic private project','customer','active','verify legal gate')",
      [project, org],
    );
    await db.query(
      `insert into kxra.legal_documents(id,org_id,document_type,audience,version,title,rendered_content,content_sha256,immutable_object_key,status,effective_at,owner_approval_reference,owner_approved_at)
      values($1,$2,'TERMS','CUSTOMER',1,'Synthetic terms',$3,$4,$5,'APPROVED',now(),'SYNTHETIC_TEST_OWNER_APPROVAL',now())`,
      [
        document,
        org,
        content,
        digest(content),
        `synthetic://legal/${document}/1`,
      ],
    );
    await db.query(
      `insert into kxra.legal_document_requirements(id,org_id,relationship_type,document_id,document_version,document_sha256,mandatory,state,acceptance_wording,acceptance_wording_version,acceptance_wording_sha256,effective_at)
      values($1,$2,'CUSTOMER',$3,1,$4,true,'ACTIVE',$5,1,$6,now())`,
      [requirement, org, document, digest(content), wording, digest(wording)],
    );
    await asCustomer(db, account, org);
    await assertPrivateAccess(db, org, project, false);

    // No acceptance: document retirement must not erase the active obligation.
    await db.query("reset role");
    await db.query("savepoint before_unaccepted_retirement");
    await db.query(
      "update kxra.legal_documents set status='RETIRED',retired_at=now() where id=$1 and version=1",
      [document],
    );
    await asCustomer(db, account, org);
    await assertPrivateAccess(db, org, project, false);
    await db.query("reset role");
    await db.query("rollback to savepoint before_unaccepted_retirement");

    // Record evidence through the real presentation/response functions.
    await asCustomer(db, account, org);
    const presentations = await db.query(
      "select * from kxra.present_required_legal_documents(null,null)",
    );
    assert.equal(presentations.rowCount, 1);
    await db.query("select * from kxra.record_legal_response($1,true,$2)", [
      presentations.rows[0].presentation_id,
      crypto.randomUUID(),
    ]);
    await assertPrivateAccess(db, org, project, true);

    // Requirement wording can change independently: old evidence is not current.
    await db.query("reset role");
    await db.query("savepoint before_wording_change");
    const revisedWording = "I accept this revised synthetic wording.";
    await db.query(
      "update kxra.legal_document_requirements set acceptance_wording=$2,acceptance_wording_version=2,acceptance_wording_sha256=$3 where id=$1",
      [requirement, revisedWording, digest(revisedWording)],
    );
    await asCustomer(db, account, org);
    await assertPrivateAccess(db, org, project, false);
    await db.query("reset role");
    await db.query("rollback to savepoint before_wording_change");
    await asCustomer(db, account, org);
    await assertPrivateAccess(db, org, project, true);

    // 0078 allows retiring presented documents without deleting immutable evidence.
    await db.query("reset role");
    await db.query(
      "update kxra.legal_documents set status='RETIRED',retired_at=now() where id=$1 and version=1",
      [document],
    );
    await asCustomer(db, account, org);
    await assertPrivateAccess(db, org, project, false);
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra.legal_acceptances where account_id=$1",
          [account],
        )
      ).rows[0].n,
      1,
    );

    // Explicitly retiring the requirement removes the obligation, unlike doc retirement.
    await db.query("reset role");
    await db.query(
      "update kxra.legal_document_requirements set state='RETIRED',retired_at=now() where id=$1",
      [requirement],
    );
    await asCustomer(db, account, org);
    await assertPrivateAccess(db, org, project, true);
  } finally {
    try {
      await db.query("rollback");
    } finally {
      await db.end();
    }
  }
});
