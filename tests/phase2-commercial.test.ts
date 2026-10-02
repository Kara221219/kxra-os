import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "./support/runtime";
import {
  signFakeBillingWebhook,
  verifyBillingWebhook,
} from "../packages/integrations/billing";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const kxraOrg = "10000000-0000-4000-8000-000000000001";
const ownerId = "20000000-0000-4000-8000-000000000001";
const partnerId = "20000000-0000-4000-8000-000000000002";
const p2 = "30000000-0000-4000-8000-000000000002";

after(() => admin.end());

async function as(
  db: pg.PoolClient,
  accountId: string | null,
  organisationId = "",
  aal = "aal2",
  extraClaims: Record<string, unknown> = {},
) {
  await db.query("reset role");
  await db.query(`set local role ${accountId ? "authenticated" : "anon"}`);
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      accountId || "",
      JSON.stringify({
        sub: accountId,
        aal,
        auth_time: Math.floor(Date.now() / 1000),
        ...extraClaims,
      }),
      organisationId,
    ],
  );
}

async function denied(db: pg.PoolClient, sql: string, values: unknown[] = []) {
  await db.query("savepoint expected_denial");
  await assert.rejects(() => db.query(sql, values));
  await db.query("rollback to savepoint expected_denial");
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

function digest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function addAccount(
  db: pg.PoolClient,
  accountId: string,
  organisationId: string,
  role: "KXRA_OWNER" | "KXRA_STAFF" | "ORG_ADMIN" | "ORG_MEMBER",
  relationship: "INTERNAL" | "PARTNER" | "CUSTOMER" | "CLIENT" = "CUSTOMER",
  name = "Synthetic account",
) {
  await db.query(
    `insert into kxra.account_identities(account_id,auth_subject,state,email_verified_at)
     values($1::uuid,$1::uuid::text,'ACTIVE',now()) on conflict(account_id) do nothing`,
    [accountId],
  );
  return (
    await db.query<{ id: string }>(
      `insert into kxra.organisation_memberships(
        org_id,account_id,security_role,relationship_type,state,display_name,grant_source
       ) values($1,$2,$3,$4,'ACTIVE',$5,'AT_FIXTURE') returning id`,
      [organisationId, accountId, role, relationship, name],
    )
  ).rows[0].id;
}

async function addApprovedLegalDocument(
  db: pg.PoolClient,
  organisationId: string,
  version: number,
  type:
    | "NDA"
    | "TERMS"
    | "PRIVACY"
    | "COOKIE"
    | "DATA_PROCESSING"
    | "CUSTOM_PROJECT" = "NDA",
) {
  const id = crypto.randomUUID();
  const content = `Synthetic approved ${type} version ${version}; local acceptance fixture only.`;
  const hash = digest(content);
  await db.query(
    `insert into kxra.legal_documents(
      id,org_id,document_type,audience,jurisdiction,version,title,
      rendered_content,content_sha256,immutable_object_key,status,effective_at,
      owner_approval_reference,owner_approved_at
     ) values($1,$2,$3,'ALL','GB',$4,$5,$6,$7,$8,'APPROVED',now(),$9,now())`,
    [
      id,
      organisationId,
      type,
      version,
      `Synthetic ${type} v${version}`,
      content,
      hash,
      `synthetic://legal/${id}/${version}`,
      "SYNTHETIC_TEST_OWNER_APPROVAL",
    ],
  );
  return { id, version, hash, content };
}

test("AT-31 one identity uses an explicit tenant and never inherits another tenant's role or data", () =>
  tx(async (db) => {
    const customerOne = crypto.randomUUID();
    const customerTwo = crypto.randomUUID();
    const customerOneMember = crypto.randomUUID();
    const customerTwoAdmin = crypto.randomUUID();
    const projectOne = crypto.randomUUID();
    const projectTwo = crypto.randomUUID();
    await db.query(
      `insert into kxra.organisations(id,name,slug,organisation_kind,relationship_type)
       values($1,'Customer One',$3,'CUSTOMER','CUSTOMER'),
             ($2,'Customer Two',$4,'CUSTOMER','CUSTOMER')`,
      [
        customerOne,
        customerTwo,
        `customer-one-${crypto.randomUUID().slice(0, 8)}`,
        `customer-two-${crypto.randomUUID().slice(0, 8)}`,
      ],
    );
    await addAccount(
      db,
      partnerId,
      customerOne,
      "ORG_ADMIN",
      "PARTNER",
      "Dual account",
    );
    await addAccount(db, customerOneMember, customerOne, "ORG_MEMBER");
    await addAccount(db, customerTwoAdmin, customerTwo, "ORG_ADMIN");
    await db.query(
      `insert into kxra.projects(id,org_id,code,name,stage,status,next_action)
       values($1,$2,'C1-PRIVATE','Customer One private project','customer','active','test isolation'),
             ($3,$4,'C2-PRIVATE','Customer Two private project','customer','active','test isolation')`,
      [projectOne, customerOne, projectTwo, customerTwo],
    );
    await db.query(
      `insert into kxra.project_memberships(org_id,project_id,user_id,role,active)
       values($1,$2,$3,'contributor',true),($4,$5,$6,'contributor',true)`,
      [
        customerOne,
        projectOne,
        customerOneMember,
        customerTwo,
        projectTwo,
        customerTwoAdmin,
      ],
    );

    await as(db, partnerId, customerOne, "aal2", {
      org_id: customerTwo,
      role: "KXRA_OWNER",
    });
    assert.deepEqual(
      (await db.query("select id from kxra.projects order by id")).rows.map(
        (row) => row.id,
      ),
      [projectOne],
    );
    assert.equal(
      (
        await db.query(
          "select security_role from kxra.organisation_memberships where account_id=$1",
          [partnerId],
        )
      ).rows[0].security_role,
      "ORG_ADMIN",
    );

    await as(db, partnerId, kxraOrg);
    assert.deepEqual(
      (await db.query("select id from kxra.projects")).rows.map(
        (row) => row.id,
      ),
      [p2],
    );
    assert.equal(
      (
        await db.query(
          "select security_role from kxra.organisation_memberships where account_id=$1",
          [partnerId],
        )
      ).rows[0].security_role,
      "ORG_MEMBER",
    );

    await as(db, partnerId, customerTwo);
    assert.equal((await db.query("select * from kxra.projects")).rowCount, 0);
    assert.deepEqual(
      (await db.query("select * from kxra.legal_gate_status()")).rows[0],
      {
        allowed: false,
        code: "ACCESS_UNAVAILABLE",
        missing_count: 0,
      },
    );

    await db.query("reset role");
    await db.query(
      `update kxra.organisation_memberships set state='REVOKED',revoked_at=now(),version=version+1
       where account_id=$1 and org_id=$2`,
      [partnerId, customerOne],
    );
    await as(db, partnerId, customerOne);
    assert.equal((await db.query("select * from kxra.projects")).rowCount, 0);
    await as(db, partnerId, kxraOrg);
    assert.deepEqual(
      (await db.query("select id from kxra.projects")).rows.map(
        (row) => row.id,
      ),
      [p2],
    );
  }));

test("AT-32 approved exact legal versions gate every private table and preserve immutable evidence", () =>
  tx(async (db) => {
    const organisationId = crypto.randomUUID();
    const accountId = crypto.randomUUID();
    const secondAccount = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    await db.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Legal gate customer',$2)",
      [organisationId, `legal-${crypto.randomUUID().slice(0, 8)}`],
    );
    const membershipId = await addAccount(
      db,
      accountId,
      organisationId,
      "ORG_ADMIN",
    );
    await addAccount(db, secondAccount, organisationId, "ORG_MEMBER");
    await db.query(
      `insert into kxra.projects(id,org_id,code,name,stage,status,next_action)
       values($1,$2,'LEGAL-PRIVATE','Legal gated project','customer','active','accept exact NDA')`,
      [projectId, organisationId],
    );
    const unapprovedContent = "Synthetic document without owner approval";
    await db.query("savepoint missing_owner_approval");
    await assert.rejects(
      () =>
        db.query(
          `insert into kxra.legal_documents(
          id,org_id,document_type,audience,jurisdiction,version,title,
          rendered_content,content_sha256,immutable_object_key,status,effective_at
         ) values($1,$2,'NDA','ALL','GB',999,'Missing owner approval',$3,$4,$5,
          'APPROVED',now())`,
          [
            crypto.randomUUID(),
            organisationId,
            unapprovedContent,
            digest(unapprovedContent),
            `synthetic://legal/missing-owner/${crypto.randomUUID()}`,
          ],
        ),
      /Explicit owner approval evidence is required/,
    );
    await db.query("rollback to savepoint missing_owner_approval");
    const first = await addApprovedLegalDocument(db, organisationId, 1);
    const wording =
      "I accept this exact synthetic NDA version for local testing.";
    const requirementId = crypto.randomUUID();
    await db.query(
      `insert into kxra.legal_document_requirements(
        id,org_id,document_id,document_version,document_sha256,mandatory,state,
        acceptance_wording,acceptance_wording_version,acceptance_wording_sha256,effective_at
       ) values($1,$2,$3,$4,$5,true,'ACTIVE',$6,1,$7,now())`,
      [
        requirementId,
        organisationId,
        first.id,
        first.version,
        first.hash,
        wording,
        digest(wording),
      ],
    );

    const placeholderContent = "Synthetic unapproved placeholder";
    const placeholderId = crypto.randomUUID();
    await db.query(
      `insert into kxra.legal_documents(
        id,org_id,document_type,audience,version,title,rendered_content,
        content_sha256,status
       ) values($1,$2,'NDA','ALL',99,'Unapproved placeholder',$3,$4,'UNAPPROVED_PLACEHOLDER')`,
      [
        placeholderId,
        organisationId,
        placeholderContent,
        digest(placeholderContent),
      ],
    );
    await denied(
      db,
      `insert into kxra.legal_document_requirements(
        org_id,document_id,document_version,document_sha256,state,
        acceptance_wording,acceptance_wording_version,acceptance_wording_sha256,effective_at
       ) values($1,$2,99,$3,'ACTIVE',$4,1,$5,now())`,
      [
        organisationId,
        placeholderId,
        digest(placeholderContent),
        wording,
        digest(wording),
      ],
    );

    await as(db, accountId, organisationId);
    assert.deepEqual(
      (await db.query("select * from kxra.legal_gate_status()")).rows[0],
      {
        allowed: false,
        code: "AGREEMENT_REQUIRED",
        missing_count: 1,
      },
    );
    assert.equal((await db.query("select * from kxra.projects")).rowCount, 0);
    const presentations = await db.query(
      "select * from kxra.present_required_legal_documents($1,$2)",
      [digest("synthetic-agent"), digest("127.0.0.1")],
    );
    assert.equal(presentations.rowCount, 1);
    assert.equal(presentations.rows[0].document_sha256, first.hash);
    assert.equal(presentations.rows[0].rendered_content, first.content);
    assert.equal(presentations.rows[0].acceptance_wording, wording);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.legal_presentations where account_id=$1 and requirement_id=$2",
          [accountId, requirementId],
        )
      ).rows[0].n,
      1,
    );
    await db.query(
      "select * from kxra.present_required_legal_documents(null,null)",
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.legal_presentations where account_id=$1 and requirement_id=$2",
          [accountId, requirementId],
        )
      ).rows[0].n,
      1,
    );
    await db.query("reset role");
    await db.query("savepoint immutable_presentation");
    await assert.rejects(
      () =>
        db.query("delete from kxra.legal_presentations where id=$1", [
          presentations.rows[0].presentation_id,
        ]),
      /Legal evidence is immutable/,
    );
    await db.query("rollback to savepoint immutable_presentation");
    await as(db, accountId, organisationId);
    const responseRequest = crypto.randomUUID();
    await db.query("select * from kxra.record_legal_response($1,true,$2)", [
      presentations.rows[0].presentation_id,
      responseRequest,
    ]);
    await db.query("select * from kxra.record_legal_response($1,true,$2)", [
      presentations.rows[0].presentation_id,
      responseRequest,
    ]);
    assert.equal(
      (await db.query("select * from kxra.legal_gate_status()")).rows[0]
        .allowed,
      true,
    );
    assert.deepEqual(
      (await db.query("select id from kxra.projects")).rows.map(
        (row) => row.id,
      ),
      [projectId],
    );
    const acceptance = (
      await db.query(
        `select account_id,membership_id,document_id,document_version,document_sha256,
          presented_at,responded_at,response,immutable_audit
         from kxra.legal_acceptances where account_id=$1`,
        [accountId],
      )
    ).rows[0];
    assert.equal(acceptance.membership_id, membershipId);
    assert.equal(acceptance.document_version, 1);
    assert.equal(acceptance.response, "ACCEPTED");
    assert.equal(acceptance.immutable_audit.document_sha256, first.hash);

    await as(db, secondAccount, organisationId);
    assert.equal(
      (await db.query("select * from kxra.legal_gate_status()")).rows[0].code,
      "AGREEMENT_REQUIRED",
    );

    await db.query("reset role");
    const second = await addApprovedLegalDocument(db, organisationId, 2);
    const secondRequirement = crypto.randomUUID();
    await db.query(
      `update kxra.legal_document_requirements set state='RETIRED',retired_at=now()
       where id=$1`,
      [requirementId],
    );
    await db.query(
      "update kxra.legal_documents set status='RETIRED',retired_at=now() where id=$1 and version=1",
      [first.id],
    );
    await db.query(
      `insert into kxra.legal_document_requirements(
        id,org_id,document_id,document_version,document_sha256,mandatory,state,
        acceptance_wording,acceptance_wording_version,acceptance_wording_sha256,effective_at
       ) values($1,$2,$3,2,$4,true,'ACTIVE',$5,2,$6,now())`,
      [
        secondRequirement,
        organisationId,
        second.id,
        second.hash,
        wording,
        digest(wording),
      ],
    );
    await as(db, accountId, organisationId);
    assert.equal(
      (await db.query("select * from kxra.legal_gate_status()")).rows[0].code,
      "AGREEMENT_REQUIRED",
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.legal_acceptances where account_id=$1 and response='ACCEPTED'",
          [accountId],
        )
      ).rows[0].n,
      1,
    );
    const nextPresentation = (
      await db.query(
        "select * from kxra.present_required_legal_documents(null,null)",
      )
    ).rows[0];
    await db.query("select * from kxra.record_legal_response($1,false,$2)", [
      nextPresentation.presentation_id,
      crypto.randomUUID(),
    ]);
    assert.equal(
      (await db.query("select * from kxra.legal_gate_status()")).rows[0]
        .allowed,
      false,
    );
  }));

test("AT-33 fake billing signatures reject tampering and expiry", () => {
  const secret = "billing-fixture-secret-" + "x".repeat(32);
  const now = Math.floor(Date.now() / 1000);
  const raw = Buffer.from(
    JSON.stringify({
      id: "evt_fixture",
      type: "customer.subscription.updated",
      created: now,
    }),
  );
  const signature = signFakeBillingWebhook(raw, secret, now);
  assert.equal(
    verifyBillingWebhook(raw, signature, secret, now).id,
    "evt_fixture",
  );
  assert.throws(
    () =>
      verifyBillingWebhook(
        Buffer.concat([raw, Buffer.from(" ")]),
        signature,
        secret,
        now,
      ),
    /BILLING_SIGNATURE_INVALID/,
  );
  assert.throws(
    () => verifyBillingWebhook(raw, signature, secret, now + 301),
    /BILLING_SIGNATURE_EXPIRED/,
  );
});

test("AT-33 billing replay/order, deterministic usage reservations and free owner grants fail closed", async () => {
  const setup = await admin.connect();
  const organisationId = crypto.randomUUID();
  const accountId = crypto.randomUUID();
  const freeOrganisation = crypto.randomUUID();
  const freeAccount = crypto.randomUUID();
  const planId = crypto.randomUUID();
  const planVersionId = crypto.randomUUID();
  const customerId = crypto.randomUUID();
  try {
    await setup.query("begin");
    await setup.query(
      `insert into kxra.organisations(id,name,slug) values
       ($1,'Billing customer',$3),($2,'Free grant customer',$4)`,
      [
        organisationId,
        freeOrganisation,
        `billing-${crypto.randomUUID().slice(0, 8)}`,
        `free-${crypto.randomUUID().slice(0, 8)}`,
      ],
    );
    await addAccount(setup, accountId, organisationId, "ORG_ADMIN");
    await addAccount(setup, freeAccount, freeOrganisation, "ORG_ADMIN");
    await setup.query(
      "insert into kxra.plans(id,plan_key,name,state) values($1,$2,'Synthetic plan','ACTIVE')",
      [planId, `synthetic-${crypto.randomUUID().slice(0, 8)}`],
    );
    await setup.query(
      `insert into kxra.plan_versions(
        id,plan_id,version,state,currency,amount_minor,billing_interval,tax_behavior,
        provider_price_reference,effective_at
       ) values($1,$2,1,'ACTIVE','GBP',3000,'MONTH','EXCLUSIVE',$3,now())`,
      [planVersionId, planId, `price_test_${crypto.randomUUID()}`],
    );
    await setup.query(
      `insert into kxra.plan_features(plan_version_id,feature_key,quantity_limit,usage_window)
       values($1,'brand.generate',2,'SUBSCRIPTION_PERIOD')`,
      [planVersionId],
    );
    await setup.query(
      `insert into kxra.billing_customers(id,org_id,provider_customer_id)
       values($1,$2,$3)`,
      [customerId, organisationId, `cus_${crypto.randomUUID()}`],
    );
    await setup.query("commit");
  } catch (error) {
    await setup.query("rollback");
    throw error;
  } finally {
    setup.release();
  }

  const eventPayload = {
    org_id: organisationId,
    customer_id: (
      await admin.query(
        "select provider_customer_id from kxra.billing_customers where id=$1",
        [customerId],
      )
    ).rows[0].provider_customer_id,
    subscription_id: `sub_${crypto.randomUUID()}`,
    plan_version_id: planVersionId,
    status: "active",
    period_start: new Date(Date.now() - 60_000).toISOString(),
    period_end: new Date(Date.now() + 3_600_000).toISOString(),
    grace_until: "",
    cancel_at_period_end: false,
  };
  const payloadHash = (
    await admin.query<{ hash: string }>(
      "select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') as hash",
      [eventPayload],
    )
  ).rows[0].hash;
  const eventId = `evt_${crypto.randomUUID()}`;
  const eventTime = new Date();
  assert.equal(
    (
      await admin.query<{ result: string }>(
        "select kxra_private.apply_billing_event($1,$2,$3,$4,$5) as result",
        [
          eventId,
          "customer.subscription.updated",
          eventTime,
          eventPayload,
          payloadHash,
        ],
      )
    ).rows[0].result,
    "PROCESSED",
  );
  assert.equal(
    (
      await admin.query<{ result: string }>(
        "select kxra_private.apply_billing_event($1,$2,$3,$4,$5) as result",
        [
          eventId,
          "customer.subscription.updated",
          eventTime,
          eventPayload,
          payloadHash,
        ],
      )
    ).rows[0].result,
    "PROCESSED",
  );
  const oldPayload = { ...eventPayload, status: "cancelled" };
  const oldHash = (
    await admin.query<{ hash: string }>(
      "select encode(sha256(convert_to($1::jsonb::text,'UTF8')),'hex') as hash",
      [oldPayload],
    )
  ).rows[0].hash;
  assert.equal(
    (
      await admin.query<{ result: string }>(
        "select kxra_private.apply_billing_event($1,$2,$3,$4,$5) as result",
        [
          `evt_${crypto.randomUUID()}`,
          "customer.subscription.updated",
          new Date(eventTime.getTime() - 60_000),
          oldPayload,
          oldHash,
        ],
      )
    ).rows[0].result,
    "IGNORED",
  );
  assert.equal(
    (
      await admin.query(
        "select state from kxra.billing_subscriptions where org_id=$1",
        [organisationId],
      )
    ).rows[0].state,
    "ACTIVE",
  );

  async function reserve(key: string) {
    const db = await admin.connect();
    try {
      await db.query("begin");
      await as(db, accountId, organisationId);
      const row = (
        await db.query(
          "select (kxra.reserve_usage('brand.generate',1,$1)).id",
          [key],
        )
      ).rows[0];
      await db.query("commit");
      return row.id as string;
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  }
  const attempts = await Promise.allSettled([
    reserve(`usage-${crypto.randomUUID()}`),
    reserve(`usage-${crypto.randomUUID()}`),
    reserve(`usage-${crypto.randomUUID()}`),
  ]);
  const successful = attempts.filter(
    (attempt): attempt is PromiseFulfilledResult<string> =>
      attempt.status === "fulfilled",
  );
  assert.equal(successful.length, 2);
  assert.equal(
    attempts.filter((attempt) => attempt.status === "rejected").length,
    1,
  );

  const complete = await admin.connect();
  try {
    await complete.query("begin");
    await as(complete, accountId, organisationId);
    await complete.query(
      "select kxra.complete_usage_reservation($1,'SUCCESS',1,12,'GBP')",
      [successful[0].value],
    );
    await complete.query(
      "select kxra.complete_usage_reservation($1,'FAILURE',0,0,'GBP')",
      [successful[1].value],
    );
    assert.equal(
      (await complete.query("select consumed_units from kxra.usage_aggregates"))
        .rows[0].consumed_units,
      "1",
    );
    await complete.query("commit");
  } finally {
    complete.release();
  }

  const grantDb = await admin.connect();
  let grantId: string;
  try {
    await grantDb.query("begin");
    await as(grantDb, ownerId, kxraOrg);
    grantId = (
      await grantDb.query<{ id: string }>(
        "select kxra.grant_free_entitlement($1,'brand.generate',3,'MONTH',$2,$3) as id",
        [
          freeOrganisation,
          new Date(Date.now() + 86_400_000),
          "Synthetic free partner grant",
        ],
      )
    ).rows[0].id;
    await grantDb.query("commit");
  } finally {
    grantDb.release();
  }
  assert.equal(
    (
      await admin.query(
        "select count(*)::int as n from kxra.billing_subscriptions where org_id=$1",
        [freeOrganisation],
      )
    ).rows[0].n,
    0,
  );
  const freeDb = await admin.connect();
  try {
    await freeDb.query("begin");
    await as(freeDb, freeAccount, freeOrganisation);
    assert.equal(
      (
        await freeDb.query(
          "select * from kxra.entitlement_decision('brand.generate',1)",
        )
      ).rows[0].reason,
      "ALLOWED_OWNER_GRANT",
    );
    assert.equal(
      (
        await freeDb.query(
          "select * from kxra.billing_customers where org_id=$1",
          [organisationId],
        )
      ).rowCount,
      0,
    );
    await denied(
      freeDb,
      `insert into kxra.entitlement_grants(
        org_id,feature_key,source,quantity_limit,usage_window,reason,issued_by
       ) values($1,'forged.feature','FREE_OWNER_GRANT',99,'MONTH','forged',$2)`,
      [freeOrganisation, freeAccount],
    );
    await freeDb.query("rollback");
  } finally {
    freeDb.release();
  }
  const revokeDb = await admin.connect();
  try {
    await revokeDb.query("begin");
    await as(revokeDb, ownerId, kxraOrg);
    await revokeDb.query("select kxra.revoke_free_entitlement($1,$2)", [
      grantId!,
      "Synthetic revocation",
    ]);
    await revokeDb.query("commit");
  } finally {
    revokeDb.release();
  }
  const deniedDb = await admin.connect();
  try {
    await deniedDb.query("begin");
    await as(deniedDb, freeAccount, freeOrganisation);
    assert.equal(
      (
        await deniedDb.query(
          "select * from kxra.entitlement_decision('brand.generate',1)",
        )
      ).rows[0].reason,
      "NO_ACTIVE_ENTITLEMENT",
    );
    await deniedDb.query("rollback");
  } finally {
    deniedDb.release();
  }
});

test("AT-34 custom project intake stays private and only an exact accepted paid proposal creates work", () =>
  tx(async (db) => {
    const organisationId = crypto.randomUUID();
    const customerAdmin = crypto.randomUUID();
    const customerMember = crypto.randomUUID();
    await db.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Custom project customer',$2)",
      [organisationId, `custom-${crypto.randomUUID().slice(0, 8)}`],
    );
    await addAccount(db, customerAdmin, organisationId, "ORG_ADMIN");
    await addAccount(db, customerMember, organisationId, "ORG_MEMBER");
    const managerMembership = await addAccount(
      db,
      ownerId,
      organisationId,
      "ORG_ADMIN",
      "INTERNAL",
      "KXRA manager",
    );
    await db.query(
      `insert into kxra.capability_grants(
        org_id,membership_id,capability,resource_type,state,issued_by,reason
       ) values($1,$2,'custom_project.manage','ORGANISATION','ACTIVE',$3,$4)`,
      [
        organisationId,
        managerMembership,
        ownerId,
        "Synthetic KXRA delivery authority",
      ],
    );
    const legal = await addApprovedLegalDocument(
      db,
      organisationId,
      1,
      "CUSTOM_PROJECT",
    );

    await as(db, customerAdmin, organisationId);
    const requestId = (
      await db.query<{ id: string }>(
        "select kxra.submit_custom_project_request($1,$2,$3,false,$4) as id",
        [
          "A bounded operational problem",
          "A separately priced delivery outcome",
          "Synthetic constraints",
          crypto.randomUUID(),
        ],
      )
    ).rows[0].id;
    await as(db, customerMember, organisationId);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.custom_project_requests",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (await db.query("select kxra.custom_project_management_status() as ok"))
        .rows[0].ok,
      false,
    );
    await denied(
      db,
      "select * from kxra.triage_custom_project_request($1,$2,$3,$4)",
      [requestId, "Unauthorized triage", "[]", "TRIAGE"],
    );

    await as(db, ownerId, organisationId);
    assert.equal(
      (await db.query("select kxra.custom_project_management_status() as ok"))
        .rows[0].ok,
      true,
    );
    const triage = (
      await db.query(
        "select * from kxra.triage_custom_project_request($1,$2,$3,$4)",
        [
          requestId,
          "The synthetic request is bounded and ready for a proposal.",
          JSON.stringify([{ kind: "fixture", reference: "AT-34" }]),
          "PROPOSAL_PENDING",
        ],
      )
    ).rows[0];
    assert.equal(triage.version, 1);

    await as(db, customerAdmin, organisationId);
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.custom_project_triage",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select state from kxra.custom_project_requests where id=$1",
          [requestId],
        )
      ).rows[0].state,
      "PROPOSAL_PENDING",
    );
    await denied(
      db,
      "select * from kxra.create_project_proposal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [
        requestId,
        "Customer-authored scope",
        "None",
        "None",
        JSON.stringify([{ key: "m1", title: "One" }]),
        10000,
        "GBP",
        "VAT exclusive synthetic fixture",
        "DEPOSIT",
        2500,
        legal.id,
        legal.version,
        legal.hash,
        new Date(Date.now() + 86_400_000),
      ],
    );
    await denied(
      db,
      "select kxra.activate_custom_project($1,'FORGED','Forged')",
      [crypto.randomUUID()],
    );

    await as(db, ownerId, organisationId);
    const proposal = (
      await db.query(
        "select * from kxra.create_project_proposal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
        [
          requestId,
          "Build the exact bounded synthetic outcome",
          "No production deployment or external sends",
          "Customer provides approved inputs",
          JSON.stringify([
            { key: "discovery", title: "Discovery" },
            { key: "delivery", title: "Delivery" },
          ]),
          120000,
          "GBP",
          "VAT exclusive synthetic fixture",
          "DEPOSIT",
          30000,
          legal.id,
          legal.version,
          legal.hash,
          new Date(Date.now() + 86_400_000),
        ],
      )
    ).rows[0];

    await as(db, customerAdmin, organisationId);
    await denied(db, "select kxra.accept_project_proposal($1,$2,$3)", [
      proposal.id,
      "0".repeat(64),
      crypto.randomUUID(),
    ]);
    await db.query("select kxra.accept_project_proposal($1,$2,$3)", [
      proposal.id,
      proposal.proposal_hash,
      crypto.randomUUID(),
    ]);

    await as(db, ownerId, organisationId);
    await denied(db, "select kxra.activate_custom_project($1,$2,$3)", [
      proposal.id,
      `CP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      "Synthetic custom project",
    ]);
    await denied(
      db,
      "select kxra.record_custom_project_payment($1,$2,$3,$4,$5)",
      [proposal.id, 30000, "USD", "RECEIVED", "synthetic-wrong-currency"],
    );
    const paymentId = (
      await db.query<{ id: string }>(
        "select kxra.record_custom_project_payment($1,$2,$3,$4,$5) as id",
        [proposal.id, 30000, "GBP", "RECEIVED", "synthetic-deposit"],
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query<{ id: string }>(
          "select kxra.record_custom_project_payment($1,$2,$3,$4,$5) as id",
          [proposal.id, 30000, "GBP", "RECEIVED", "synthetic-deposit"],
        )
      ).rows[0].id,
      paymentId,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          `select count(*)::int as n from kxra.audit_events
           where action='custom_project.payment_recorded' and resource_id=$1`,
          [paymentId],
        )
      ).rows[0].n,
      1,
    );
    await db.query(
      "select kxra.record_custom_project_payment($1,$2,$3,$4,$5)",
      [proposal.id, 10000, "GBP", "REFUNDED", "synthetic-refund"],
    );
    await denied(db, "select kxra.activate_custom_project($1,$2,$3)", [
      proposal.id,
      `CP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      "Synthetic custom project",
    ]);
    await db.query(
      "select kxra.record_custom_project_payment($1,$2,$3,$4,$5)",
      [proposal.id, 10000, "GBP", "RECEIVED", "synthetic-deposit-balance"],
    );
    await as(db, ownerId, organisationId);
    const projectId = (
      await db.query<{ id: string }>(
        "select kxra.activate_custom_project($1,$2,$3) as id",
        [
          proposal.id,
          `CP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          "Synthetic custom project",
        ],
      )
    ).rows[0].id;
    assert.ok(projectId);

    await as(db, customerAdmin, organisationId);
    assert.deepEqual(
      (await db.query("select id from kxra.projects")).rows.map(
        (row) => row.id,
      ),
      [projectId],
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int as n from kxra.project_memberships where project_id=$1 and user_id=$2",
          [projectId, customerAdmin],
        )
      ).rows[0].n,
      1,
    );

    const changeRequestId = crypto.randomUUID();
    const change = (
      await db.query(
        "select * from kxra.submit_custom_project_change($1,$2,$3,$4,$5)",
        [
          projectId,
          "Add one documented customer handover session",
          15000,
          "GBP",
          changeRequestId,
        ],
      )
    ).rows[0];
    assert.equal(change.version, 1);
    assert.deepEqual(
      (
        await db.query(
          "select * from kxra.submit_custom_project_change($1,$2,$3,$4,$5)",
          [
            projectId,
            "Add one documented customer handover session",
            15000,
            "GBP",
            changeRequestId,
          ],
        )
      ).rows[0],
      change,
    );
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select kxra.decide_custom_project_change($1,$2,'ACCEPTED','Customer accepts exact change') as state",
          [change.id, change.change_hash],
        )
      ).rows[0].state,
      "SUBMITTED",
    );
    await as(db, ownerId, organisationId);
    assert.equal(
      (
        await db.query<{ state: string }>(
          "select kxra.decide_custom_project_change($1,$2,'ACCEPTED','KXRA accepts exact change') as state",
          [change.id, change.change_hash],
        )
      ).rows[0].state,
      "ACCEPTED",
    );

    const delivery = (
      await db.query(
        "select * from kxra.submit_custom_project_milestone_delivery($1,$2,$3,$4)",
        [
          projectId,
          "discovery",
          "Discovery evidence delivered for customer review.",
          JSON.stringify([{ reference: "synthetic://delivery/discovery" }]),
        ],
      )
    ).rows[0];
    await as(db, customerAdmin, organisationId);
    await denied(db, "select kxra.accept_custom_project_milestone($1,$2)", [
      delivery.id,
      "0".repeat(64),
    ]);
    assert.ok(
      (
        await db.query<{ id: string }>(
          "select kxra.accept_custom_project_milestone($1,$2) as id",
          [delivery.id, delivery.delivery_hash],
        )
      ).rows[0].id,
    );
    await denied(
      db,
      "select kxra.issue_custom_project_invoice($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        projectId,
        crypto.randomUUID(),
        "INV-CUSTOMER-FORGE",
        15000,
        3000,
        "GBP",
        new Date(Date.now() + 86_400_000),
        "forged-customer-invoice",
      ],
    );
    await as(db, ownerId, organisationId);
    const invoiceId = (
      await db.query<{ id: string }>(
        "select kxra.issue_custom_project_invoice($1,$2,$3,$4,$5,$6,$7,$8) as id",
        [
          projectId,
          crypto.randomUUID(),
          `INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          15000,
          3000,
          "GBP",
          new Date(Date.now() + 86_400_000),
          "synthetic-accounting-reference",
        ],
      )
    ).rows[0].id;
    assert.ok(invoiceId);
    await as(db, customerAdmin, organisationId);
    await denied(
      db,
      "select * from kxra.issue_custom_project_credit_note($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        invoiceId,
        "0".repeat(64),
        crypto.randomUUID(),
        "CN-CUSTOMER-FORGE",
        1000,
        200,
        "Forged customer credit",
        "forged-customer-credit",
      ],
    );
    await denied(
      db,
      "select kxra.void_custom_project_invoice($1,$2,$3,$4,$5)",
      [
        invoiceId,
        "0".repeat(64),
        crypto.randomUUID(),
        "Forged customer void",
        "forged-customer-void",
      ],
    );
    await as(db, ownerId, organisationId);
    const invoiceHash = (
      await db.query<{ invoice_hash: string }>(
        "select invoice_hash from kxra.custom_project_invoices where id=$1",
        [invoiceId],
      )
    ).rows[0].invoice_hash;
    await denied(
      db,
      "select * from kxra.issue_custom_project_credit_note($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        invoiceId,
        "0".repeat(64),
        crypto.randomUUID(),
        "CN-WRONG-HASH",
        5000,
        1000,
        "Wrong hash attempt",
        "synthetic-credit-reference",
      ],
    );
    const creditRequest = crypto.randomUUID();
    const partialCredit = (
      await db.query(
        "select * from kxra.issue_custom_project_credit_note($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          invoiceId,
          invoiceHash,
          creditRequest,
          `CN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          5000,
          1000,
          "Agreed partial service adjustment",
          "synthetic-credit-reference-1",
        ],
      )
    ).rows[0];
    assert.equal(partialCredit.resulting_invoice_state, "PARTIALLY_CREDITED");
    assert.deepEqual(
      (
        await db.query(
          "select * from kxra.issue_custom_project_credit_note($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            invoiceId,
            invoiceHash,
            creditRequest,
            partialCredit.credit_note_id
              ? (
                  await db.query<{ credit_reference: string }>(
                    "select credit_reference from kxra.custom_project_credit_notes where id=$1",
                    [partialCredit.credit_note_id],
                  )
                ).rows[0].credit_reference
              : "",
            5000,
            1000,
            "Agreed partial service adjustment",
            "synthetic-credit-reference-1",
          ],
        )
      ).rows[0],
      partialCredit,
    );
    await denied(
      db,
      "select * from kxra.issue_custom_project_credit_note($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        invoiceId,
        invoiceHash,
        crypto.randomUUID(),
        `CN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        0,
        2500,
        "Tax over-credit attempt",
        "synthetic-credit-reference-over",
      ],
    );
    const fullCredit = (
      await db.query(
        "select * from kxra.issue_custom_project_credit_note($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          invoiceId,
          invoiceHash,
          crypto.randomUUID(),
          `CN-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          10000,
          2000,
          "Final agreed service adjustment",
          "synthetic-credit-reference-2",
        ],
      )
    ).rows[0];
    assert.equal(fullCredit.resulting_invoice_state, "CREDITED");
    await denied(
      db,
      "select kxra.void_custom_project_invoice($1,$2,$3,$4,$5)",
      [
        invoiceId,
        invoiceHash,
        crypto.randomUUID(),
        "Cannot void credited invoice",
        "synthetic-void-after-credit",
      ],
    );
    const voidInvoiceId = (
      await db.query<{ id: string }>(
        "select kxra.issue_custom_project_invoice($1,$2,$3,$4,$5,$6,$7,$8) as id",
        [
          projectId,
          crypto.randomUUID(),
          `INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
          1000,
          200,
          "GBP",
          new Date(Date.now() + 86_400_000),
          "synthetic-voidable-invoice",
        ],
      )
    ).rows[0].id;
    const voidInvoiceHash = (
      await db.query<{ invoice_hash: string }>(
        "select invoice_hash from kxra.custom_project_invoices where id=$1",
        [voidInvoiceId],
      )
    ).rows[0].invoice_hash;
    const voidRequest = crypto.randomUUID();
    const voidId = (
      await db.query<{ id: string }>(
        "select kxra.void_custom_project_invoice($1,$2,$3,$4,$5) as id",
        [
          voidInvoiceId,
          voidInvoiceHash,
          voidRequest,
          "Invoice issued in error",
          "synthetic-void-reference",
        ],
      )
    ).rows[0].id;
    assert.equal(
      (
        await db.query<{ id: string }>(
          "select kxra.void_custom_project_invoice($1,$2,$3,$4,$5) as id",
          [
            voidInvoiceId,
            voidInvoiceHash,
            voidRequest,
            "Invoice issued in error",
            "synthetic-void-reference",
          ],
        )
      ).rows[0].id,
      voidId,
    );
    await denied(
      db,
      "select * from kxra.issue_custom_project_credit_note($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        voidInvoiceId,
        voidInvoiceHash,
        crypto.randomUUID(),
        "CN-VOID-INVOICE",
        1000,
        200,
        "Cannot credit void invoice",
        "synthetic-credit-after-void",
      ],
    );
    await as(db, customerAdmin, organisationId);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from kxra.custom_project_invoices where id=$1",
          [invoiceId],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from kxra.custom_project_credit_notes where invoice_id=$1",
          [invoiceId],
        )
      ).rows[0].n,
      2,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from kxra.custom_project_invoice_voids where invoice_id=$1",
          [voidInvoiceId],
        )
      ).rows[0].n,
      1,
    );
    await as(db, customerMember, organisationId);
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from kxra.custom_project_invoices where id=$1",
          [invoiceId],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query<{ n: number }>(
          "select count(*)::int as n from kxra.custom_project_credit_notes where invoice_id=$1",
          [invoiceId],
        )
      ).rows[0].n,
      0,
    );

    await as(db, customerAdmin, organisationId);
    const staleRequest = (
      await db.query<{ id: string }>(
        "select kxra.submit_custom_project_request($1,$2,'',false,$3) as id",
        [
          "Stale proposal problem",
          "Stale proposal outcome",
          crypto.randomUUID(),
        ],
      )
    ).rows[0].id;
    await as(db, ownerId, organisationId);
    const staleOne = (
      await db.query(
        "select * from kxra.create_project_proposal($1,$2,'','',$3,1,'GBP',$4,'NONE',0,$5,1,$6,$7)",
        [
          staleRequest,
          "First scope",
          JSON.stringify([{ key: "m1" }]),
          "Synthetic tax",
          legal.id,
          legal.hash,
          new Date(Date.now() + 86_400_000),
        ],
      )
    ).rows[0];
    await db.query(
      "select * from kxra.create_project_proposal($1,$2,'','',$3,2,'GBP',$4,'NONE',0,$5,1,$6,$7)",
      [
        staleRequest,
        "Changed scope",
        JSON.stringify([{ key: "m2" }]),
        "Synthetic tax",
        legal.id,
        legal.hash,
        new Date(Date.now() + 86_400_000),
      ],
    );
    await as(db, customerAdmin, organisationId);
    await denied(db, "select kxra.accept_project_proposal($1,$2,$3)", [
      staleOne.id,
      staleOne.proposal_hash,
      crypto.randomUUID(),
    ]);
  }));

test("AT-46 release readiness requires exact legal, commercial, provider and review evidence", () =>
  tx(async (db) => {
    const manifest = crypto.randomUUID();
    const placeholder = "80000000-0000-4000-8000-000000000001";
    const placeholderRow = (
      await db.query(
        "select version,content_sha256 from kxra.legal_documents where id=$1 order by version desc limit 1",
        [placeholder],
      )
    ).rows[0];
    await db.query(
      `insert into kxra.release_manifests(
        id,org_id,release_name,release_version,legal_document_refs,
        commercial_configuration,support_channels,legal_owner,commercial_owner,reviewed_at
       ) values($1,$2,'Synthetic release',$3,$4,$5,$6,'Synthetic legal owner',
        'Synthetic commercial owner',now())`,
      [
        manifest,
        kxraOrg,
        `fixture-${crypto.randomUUID()}`,
        JSON.stringify([
          {
            document_id: placeholder,
            version: placeholderRow.version,
            sha256: placeholderRow.content_sha256,
          },
        ]),
        { plan: "synthetic", price_minor: 3000, currency: "GBP" },
        { support: "synthetic-support@fixture.invalid" },
      ],
    );
    await as(db, ownerId, kxraOrg);
    const blocked = (
      await db.query("select * from kxra.release_manifest_check($1)", [
        manifest,
      ])
    ).rows[0];
    assert.equal(blocked.ready, false);
    assert.ok(
      blocked.blockers.includes("LEGAL_DOCUMENT_UNAPPROVED_OR_HASH_MISMATCH"),
    );
    assert.ok(
      blocked.blockers.includes("REQUIRED_LEGAL_DOCUMENT_TYPES_MISSING"),
    );
    assert.ok(blocked.blockers.includes("COMMERCIAL_CONFIGURATION_INCOMPLETE"));
    assert.ok(blocked.blockers.includes("PROVIDER_EVIDENCE_INCOMPLETE"));

    await db.query("reset role");
    const requiredTypes = [
      "TERMS",
      "PRIVACY",
      "COOKIE",
      "DATA_PROCESSING",
      "CUSTOM_PROJECT",
    ] as const;
    const approved = [];
    for (const [index, type] of requiredTypes.entries())
      approved.push(
        await addApprovedLegalDocument(db, kxraOrg, 7001 + index, type),
      );
    const providerEvidence = [
      "CORE_STAGING",
      "AUTH_RLS",
      "BACKUP_RESTORE",
      "STRIPE_TEST",
      "EMAIL_STAGING",
    ].map((key) => ({
      key,
      status: "PASS",
      reference: `synthetic://${key.toLowerCase()}`,
      sha256: digest(`synthetic-${key}`),
    }));
    await db.query(
      `update kxra.release_manifests set legal_document_refs=$1,
        commercial_configuration=$2,support_channels=$3 where id=$4`,
      [
        JSON.stringify(
          approved.map((document) => ({
            document_id: document.id,
            version: document.version,
            sha256: document.hash,
          })),
        ),
        {
          plan_code: "synthetic-monthly",
          plan_name: "Synthetic monthly plan",
          price_minor: 3000,
          currency: "GBP",
          billing_interval: "MONTH",
          included_usage: { brand_generations: 20 },
          custom_projects_separate: true,
          cancellation_policy: "Synthetic cancellation policy.",
          refund_policy: "Synthetic refund policy.",
          grace_policy: "Synthetic grace policy.",
          tax_treatment: "Synthetic test tax treatment.",
          retention_policy: {
            customer_data_days: 365,
            backup_days: 30,
            deletion_process: "Synthetic deletion process.",
            legal_basis: "Synthetic test basis.",
          },
          subprocessors: [
            {
              name: "Synthetic provider",
              purpose: "Local acceptance testing",
              location: "GB",
            },
          ],
          public_copy_sha256: digest("synthetic-public-copy"),
          provider_evidence: providerEvidence,
          accessibility_review: {
            status: "PASS",
            reviewer: "Synthetic accessibility reviewer",
            reviewed_at: "2026-09-27T00:00:00Z",
          },
          security_review: {
            status: "PASS",
            reviewer: "Synthetic security reviewer",
            reviewed_at: "2026-09-27T00:00:00Z",
          },
        },
        {
          support_email: "support@fixture.invalid",
          privacy_email: "privacy@fixture.invalid",
          security_email: "security@fixture.invalid",
          response_policy: "Synthetic response policy.",
        },
        manifest,
      ],
    );
    await as(db, ownerId, kxraOrg);
    assert.deepEqual(
      (
        await db.query("select * from kxra.release_manifest_check($1)", [
          manifest,
        ])
      ).rows[0],
      { ready: true, blockers: [] },
    );
  }));
