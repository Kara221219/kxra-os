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
const viewer = "20000000-0000-4000-8000-000000000003";
const revoked = "20000000-0000-4000-8000-000000000004";

after(() => admin.end());

async function as(
  db: pg.PoolClient,
  account: string | null,
  selectedOrg = org,
) {
  await db.query("reset role");
  await db.query("set local role authenticated");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
    [
      account || "",
      JSON.stringify({
        sub: account,
        aal: "aal2",
        auth_time: Math.floor(Date.now() / 1000),
      }),
      selectedOrg,
    ],
  );
}

async function tx(run: (db: pg.PoolClient) => Promise<void>) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await run(db);
  } finally {
    await db.query("rollback");
    db.release();
  }
}

async function denied(db: pg.PoolClient, sql: string, values: unknown[] = []) {
  await db.query("savepoint denied_action");
  try {
    await db.query(sql, values);
    assert.fail("Expected action to be denied");
  } catch (error) {
    assert.ok(
      ["P0001", "42501", "23514"].includes(
        (error as { code?: string }).code || "",
      ),
    );
  } finally {
    await db.query("rollback to savepoint denied_action");
  }
}

async function createSubscription(db: pg.PoolClient) {
  await db.query("reset role");
  const plan = crypto.randomUUID();
  const version = crypto.randomUUID();
  const customer = crypto.randomUUID();
  const subscription = crypto.randomUUID();
  await db.query(
    `insert into kxra.plans(id,plan_key,name,state)
     values($1,$2,'Synthetic customer service plan','DRAFT')`,
    [plan, `service-${crypto.randomUUID()}`],
  );
  await db.query(
    `insert into kxra.plan_versions(
      id,plan_id,version,state,currency,amount_minor,billing_interval,tax_behavior
     ) values($1,$2,1,'DRAFT','GBP',3000,'MONTH','UNSPECIFIED')`,
    [version, plan],
  );
  await db.query(
    `insert into kxra.billing_customers(id,org_id,provider_customer_id)
     values($1,$2,$3)`,
    [customer, org, `cus_${crypto.randomUUID()}`],
  );
  await db.query(
    `insert into kxra.billing_subscriptions(
      id,org_id,billing_customer_id,provider_subscription_id,plan_version_id,
      state,provider_event_created_at,provider_event_id
     ) values($1,$2,$3,$4,$5,'ACTIVE',now(),$6)`,
    [
      subscription,
      org,
      customer,
      `sub_${crypto.randomUUID()}`,
      version,
      `evt_${crypto.randomUUID()}`,
    ],
  );
  return subscription;
}

test("AT-46 customer service requests are exact, isolated and do not mutate billing", () =>
  tx(async (db) => {
    const subscription = await createSubscription(db);
    const submitKey = crypto.randomUUID();
    await as(db, partner);
    const submitted = (
      await db.query<{ id: string }>(
        "select kxra.submit_customer_service_request($1,$2,$3,$4,$5) as id",
        [
          "SUBSCRIPTION_CANCELLATION",
          "Cancel synthetic subscription",
          "Please record cancellation for review.",
          subscription,
          submitKey,
        ],
      )
    ).rows[0].id;
    const replay = (
      await db.query<{ id: string }>(
        "select kxra.submit_customer_service_request($1,$2,$3,$4,$5) as id",
        [
          "SUBSCRIPTION_CANCELLATION",
          "Cancel synthetic subscription",
          "Please record cancellation for review.",
          subscription,
          submitKey,
        ],
      )
    ).rows[0].id;
    assert.equal(replay, submitted);
    await denied(
      db,
      "select kxra.submit_customer_service_request($1,$2,$3,$4,$5)",
      [
        "SUPPORT",
        "Different request",
        "Conflicting replay body",
        null,
        submitKey,
      ],
    );
    assert.equal(
      (
        await db.query(
          "select * from kxra.customer_service_requests where id=$1",
          [submitted],
        )
      ).rowCount,
      1,
    );
    assert.equal(
      (
        await db.query(
          "select * from kxra.customer_service_internal_notes where request_id=$1",
          [submitted],
        )
      ).rowCount,
      0,
    );

    await as(db, viewer);
    assert.equal(
      (await db.query("select * from kxra.customer_service_requests")).rowCount,
      0,
    );
    await as(db, revoked);
    assert.equal(
      (
        await db.query(
          "select * from kxra.customer_service_requests where id=$1",
          [submitted],
        )
      ).rowCount,
      0,
    );

    await as(db, partner);
    await denied(
      db,
      "select kxra.submit_customer_service_request($1,$2,$3,$4,$5)",
      [
        "SUBSCRIPTION_CANCELLATION",
        "Crafted subscription target",
        "This cross-resource target must fail.",
        crypto.randomUUID(),
        crypto.randomUUID(),
      ],
    );

    await as(db, owner);
    const request = (
      await db.query<{
        request_hash: string;
        version: number;
        state: string;
      }>(
        "select request_hash,version,state from kxra.customer_service_requests where id=$1",
        [submitted],
      )
    ).rows[0];
    assert.equal(request.state, "SUBMITTED");
    await denied(
      db,
      "select kxra.transition_customer_service_request($1,$2,$3,$4,$5,$6)",
      [
        submitted,
        "0".repeat(64),
        1,
        crypto.randomUUID(),
        "ACKNOWLEDGED",
        "We received your request.",
      ],
    );
    const acknowledgementKey = crypto.randomUUID();
    const acknowledged = (
      await db.query<{ version: number }>(
        "select kxra.transition_customer_service_request($1,$2,$3,$4,$5,$6) as version",
        [
          submitted,
          request.request_hash,
          1,
          acknowledgementKey,
          "ACKNOWLEDGED",
          "We received your request.",
        ],
      )
    ).rows[0].version;
    assert.equal(acknowledged, 2);
    assert.equal(
      (
        await db.query<{ version: number }>(
          "select kxra.transition_customer_service_request($1,$2,$3,$4,$5,$6) as version",
          [
            submitted,
            request.request_hash,
            1,
            acknowledgementKey,
            "ACKNOWLEDGED",
            "We received your request.",
          ],
        )
      ).rows[0].version,
      2,
    );
    const note = (
      await db.query<{ id: string }>(
        "select kxra.add_customer_service_internal_note($1,$2,$3,$4) as id",
        [
          submitted,
          crypto.randomUUID(),
          "Check the provider state before any external action.",
          "synthetic://billing-evidence",
        ],
      )
    ).rows[0].id;
    assert.ok(note);

    await as(db, partner);
    assert.equal(
      (await db.query("select * from kxra.customer_service_internal_notes"))
        .rowCount,
      0,
    );
    const replyKey = crypto.randomUUID();
    const replied = (
      await db.query<{ version: number }>(
        "select kxra.reply_customer_service_request($1,$2,$3,$4,$5) as version",
        [
          submitted,
          request.request_hash,
          2,
          replyKey,
          "Please cancel at the end of the current period.",
        ],
      )
    ).rows[0].version;
    assert.equal(replied, 3);
    assert.equal(
      (
        await db.query<{ version: number }>(
          "select kxra.reply_customer_service_request($1,$2,$3,$4,$5) as version",
          [
            submitted,
            request.request_hash,
            2,
            replyKey,
            "Please cancel at the end of the current period.",
          ],
        )
      ).rows[0].version,
      3,
    );
    assert.equal(
      (
        await db.query<{ state: string; cancel_at_period_end: boolean }>(
          "select state,cancel_at_period_end from kxra.billing_subscriptions where id=$1",
          [subscription],
        )
      ).rowCount,
      0,
      "ordinary member cannot use the service request to expose billing state",
    );
    await db.query("reset role");
    assert.deepEqual(
      (
        await db.query<{ state: string; cancel_at_period_end: boolean }>(
          "select state,cancel_at_period_end from kxra.billing_subscriptions where id=$1",
          [subscription],
        )
      ).rows[0],
      { state: "ACTIVE", cancel_at_period_end: false },
    );

    await as(db, partner);
    const supportId = (
      await db.query<{ id: string }>(
        "select kxra.submit_customer_service_request($1,$2,$3,$4,$5) as id",
        [
          "SUPPORT",
          "Cancel this support request",
          "Synthetic customer cancellation evidence.",
          null,
          crypto.randomUUID(),
        ],
      )
    ).rows[0].id;
    const supportHash = (
      await db.query<{ request_hash: string }>(
        "select request_hash from kxra.customer_service_requests where id=$1",
        [supportId],
      )
    ).rows[0].request_hash;
    const cancelKey = crypto.randomUUID();
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal(
        (
          await db.query<{ version: number }>(
            "select kxra.cancel_customer_service_request($1,$2,$3,$4,$5) as version",
            [
              supportId,
              supportHash,
              1,
              cancelKey,
              "Request no longer required.",
            ],
          )
        ).rows[0].version,
        2,
      );
    }
  }));

test("AT-46 customer-tenant handling needs an explicit live capability", () =>
  tx(async (db) => {
    const customerOrg = crypto.randomUUID();
    const customerAccount = crypto.randomUUID();
    await db.query("reset role");
    await db.query(
      `insert into kxra.organisations(
        id,name,slug,organisation_kind,relationship_type
       ) values($1,'Service capability customer',$2,'CUSTOMER','CUSTOMER')`,
      [customerOrg, `service-${crypto.randomUUID()}`],
    );
    await db.query(
      `insert into kxra.account_identities(
        account_id,auth_subject,state,email_verified_at
       ) values($1::uuid,$1::uuid::text,'ACTIVE',now())`,
      [customerAccount],
    );
    await db.query(
      `insert into kxra.organisation_memberships(
        org_id,account_id,security_role,relationship_type,state,display_name,grant_source
       ) values($1,$2,'ORG_MEMBER','CUSTOMER','ACTIVE','Service customer','AT_FIXTURE')`,
      [customerOrg, customerAccount],
    );
    const managerMembership = (
      await db.query<{ id: string }>(
        `insert into kxra.organisation_memberships(
          org_id,account_id,security_role,relationship_type,state,display_name,grant_source
         ) values($1,$2,'ORG_MEMBER','INTERNAL','ACTIVE','KXRA handler','AT_FIXTURE')
         returning id`,
        [customerOrg, owner],
      )
    ).rows[0].id;
    const grant = (
      await db.query<{ id: string }>(
        `insert into kxra.capability_grants(
          org_id,membership_id,capability,resource_type,state,issued_by,reason
         ) values($1,$2,'customer_service.manage','ORGANISATION','ACTIVE',$3,
          'Synthetic exact customer-service handling authority') returning id`,
        [customerOrg, managerMembership, owner],
      )
    ).rows[0].id;

    await as(db, customerAccount, customerOrg);
    const requestId = (
      await db.query<{ id: string }>(
        "select kxra.submit_customer_service_request($1,$2,$3,$4,$5) as id",
        [
          "DATA_ERASURE",
          "Synthetic erasure request",
          "Record this request without deleting data.",
          null,
          crypto.randomUUID(),
        ],
      )
    ).rows[0].id;
    const requestHash = (
      await db.query<{ request_hash: string }>(
        "select request_hash from kxra.customer_service_requests where id=$1",
        [requestId],
      )
    ).rows[0].request_hash;

    await as(db, owner, customerOrg);
    assert.equal(
      (
        await db.query(
          "select kxra.customer_service_management_status() as allowed",
        )
      ).rows[0].allowed,
      true,
    );
    await db.query(
      "select kxra.transition_customer_service_request($1,$2,1,$3,'ACKNOWLEDGED',$4)",
      [
        requestId,
        requestHash,
        crypto.randomUUID(),
        "Request received; identity and legal review remain required.",
      ],
    );

    await db.query("reset role");
    await db.query(
      `update kxra.capability_grants set state='REVOKED',revoked_at=now()
       where id=$1`,
      [grant],
    );
    await as(db, owner, customerOrg);
    assert.equal(
      (
        await db.query(
          "select kxra.customer_service_management_status() as allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await denied(
      db,
      "select kxra.transition_customer_service_request($1,$2,2,$3,'IN_PROGRESS',$4)",
      [requestId, requestHash, crypto.randomUUID(), "Revoked handler attempt"],
    );
  }));

test("AT-46 personal data requests remain personal while authorized handlers retain a redacted queue", () =>
  tx(async (db) => {
    await as(db, partner);
    const requestId = (
      await db.query<{ id: string }>(
        "select kxra.submit_customer_service_request($1,$2,$3,$4,$5) as id",
        [
          "DATA_ACCESS",
          "Access my personal data",
          "Provide the personal data associated with this synthetic account.",
          null,
          crypto.randomUUID(),
        ],
      )
    ).rows[0].id;
    const hash = (
      await db.query<{ request_hash: string }>(
        "select request_hash from kxra.customer_service_requests where id=$1",
        [requestId],
      )
    ).rows[0].request_hash;

    await as(db, viewer);
    assert.equal(
      (
        await db.query(
          "select * from kxra.customer_service_requests where id=$1",
          [requestId],
        )
      ).rowCount,
      0,
    );
    await denied(
      db,
      "select kxra.reply_customer_service_request($1,$2,$3,$4,$5)",
      [requestId, hash, 1, crypto.randomUUID(), "Forged reply"],
    );

    await as(db, owner);
    assert.equal(
      (
        await db.query(
          "select * from kxra.customer_service_requests where id=$1",
          [requestId],
        )
      ).rowCount,
      1,
    );
    const version = (
      await db.query<{ version: number }>(
        "select kxra.transition_customer_service_request($1,$2,$3,$4,$5,$6) as version",
        [
          requestId,
          hash,
          1,
          crypto.randomUUID(),
          "ACKNOWLEDGED",
          "Identity verification is required before disclosure.",
        ],
      )
    ).rows[0].version;
    assert.equal(version, 2);
    await denied(
      db,
      "select kxra.transition_customer_service_request($1,$2,$3,$4,$5,$6)",
      [
        requestId,
        hash,
        1,
        crypto.randomUUID(),
        "IN_PROGRESS",
        "Stale transition",
      ],
    );
    assert.equal(
      (
        await db.query<{ action: string }>(
          "select action from kxra.audit_events where resource_id=$1 order by created_at",
          [requestId],
        )
      ).rows.some((event) => event.action === "customer_service.transitioned"),
      true,
    );
  }));
