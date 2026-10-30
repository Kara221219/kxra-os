import {
  seedReviewedBusinessFixture,
  seedSyntheticAdmissionTerms,
} from "./support/reviewed-business-fixture";
import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { localModeConfiguration } from "../packages/authz/local-guard";
import pg from "pg";
import { runtimeFile } from "./support/runtime";

import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";
import { modernBillingFixture } from "./support/modern-billing-scope";
const mode = process.env.KXRA_MODERN_BILLING_TEST_MODE ?? "LIVE";
assert.ok(
  mode === "LIVE" || mode === "STAGING_SANDBOX",
  "Explicit supported synthetic execution mode required",
);
const scoped = modernBillingFixture(mode),
  tag = scoped.execution.execution_scope;
const prefix = mode === "LIVE" ? "" : "staging_sandbox_";
const starter = scoped.execution.catalogue.find(
  (r) => r.offer_key === "KXRA_STARTER_V1",
)!;

// OWNER MUST RUN SEQUENTIALLY after applying 0100 to a disposable LOCAL fixture.
// Full CI supplies a private synthetic fixture. Never silently skip this gate.
// No provider/network service is contacted; all fixture writes roll back.
test("live ledger SQL: authority, single consumption, immutable receipts and quarantine", async () => {
  assert.ok(
    localModeConfiguration(process.env),
    "explicit synthetic fixture only",
  );
  assert.ok(process.env.KXRA_RUNTIME);
  const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8"));
  assert.equal(cfg.host, path.join(process.env.KXRA_RUNTIME!, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password, "password-free private socket only");
  const db = new pg.Client({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: os.userInfo().username,
    password: "",
    ssl: false,
  });
  await db.connect();
  const owner = crypto.randomUUID(),
    outsider = crypto.randomUUID(),
    org = crypto.randomUUID(),
    otherOrg = crypto.randomUUID(),
    intent = crypto.randomUUID();
  const customer = `cus_${crypto.randomBytes(12).toString("hex")}`,
    hash = crypto
      .createHash("sha256")
      .update("Synthetic ledger admission terms")
      .digest("hex");
  async function call(
    sql: string,
    values: unknown[] = [],
    authority: "owner" | "outsider" | "worker" | "admin" | "anon" = "admin",
    denied: boolean | string = false,
  ) {
    await db.query("savepoint assertion");
    try {
      if (authority === "owner" || authority === "outsider") {
        await db.query("set local session authorization kxra_app");
        await db.query("set local role authenticated");
        const actor = authority === "owner" ? owner : outsider;
        await db.query(
          "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
          [
            actor,
            JSON.stringify({
              sub: actor,
              aal: "aal2",
              auth_time: Math.floor(Date.now() / 1000),
            }),
            org,
          ],
        );
      } else if (authority === "anon") await db.query("set local role anon");
      else if (authority === "worker")
        await db.query("set local role kxra_billing_worker");
      const result = await db.query(sql, values);
      if (denied) assert.fail("Expected SQL denial");
      await db.query("reset role");
      await db.query("reset session authorization");
      await db.query("release savepoint assertion");
      return result;
    } catch (error) {
      await db.query("rollback to savepoint assertion");
      await db.query("release savepoint assertion");
      if (!denied || error instanceof assert.AssertionError) throw error;
      if (typeof denied === "string")
        assert.equal((error as { code?: string }).code, denied);
      return null;
    }
  }
  try {
    await db.query("begin");
    await db.query("set local statement_timeout='5s'");
    assert.equal(
      (
        await db.query(
          "select enabled from kxra_private.live_billing_activation where singleton",
        )
      ).rows[0].enabled,
      false,
    );
    await call(
      `select kxra_private.${prefix}claim_live_billing_intent($1)`,
      [intent],
      "worker",
      true,
    );
    for (const table of [
      "live_billing_activation",
      "live_billing_mappings",
      "live_billing_bindings",
      "live_billing_intents",
      "live_billing_event_receipts",
      "live_billing_event_conflicts",
    ])
      for (const role of ["owner", "outsider", "worker", "anon"] as const)
        for (const sql of [
          `select * from kxra_private.${table}`,
          `insert into kxra_private.${table} default values`,
          `delete from kxra_private.${table} where false`,
        ])
          await call(sql, [], role, "42501");

    await bindSyntheticModernScope(db.query.bind(db), mode);
    for (const [id, name] of [
      [org, "Ledger owner fixture"],
      [otherOrg, "Ledger outsider fixture"],
    ])
      await db.query(
        "insert into kxra.organisations(id,name,slug) values($1,$2,$3)",
        [id, name, `ledger-${id}`],
      );
    for (const [actor, tenant] of [
      [owner, org],
      [outsider, otherOrg],
    ]) {
      await db.query(
        "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'FIXTURE',$2,'ACTIVE',now())",
        [actor, `ledger-${actor}`],
      );
      await db.query(
        "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic ledger owner','LOCAL_LEDGER_TEST')",
        [tenant, actor],
      );
    }
    await db.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1",
      [hash],
    );
    const mappingRevision = (
      await db.query(
        "select coalesce(max(revision),0)+1 revision from kxra_private.live_billing_mappings where offer_key='KXRA_STARTER_V1'",
      )
    ).rows[0].revision;
    await db.query(
      `insert into kxra_private.live_billing_mappings(offer_key,revision,mode,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method)
      values('KXRA_STARTER_V1',$2,$3,true,$4,$5,$6,'bpc_synthetic123',$1,$1,$1,'inclusive',false,'card')`,
      [
        hash,
        mappingRevision,
        mode === "LIVE" ? "live" : "staging_sandbox",
        tag.account_id,
        starter.price_id,
        starter.product_id,
      ],
    );
    await db.query(
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision) values($1,$2,'KXRA_STARTER_V1',$3)",
      [org, customer, mappingRevision],
    );
    await call(
      "select * from kxra_private.live_billing_bindings",
      [],
      "owner",
      true,
    );
    await call(
      `select kxra_private.${prefix}request_live_billing_intent($1,'CHECKOUT','KXRA_STARTER_V1')`,
      [intent],
      "outsider",
      true,
    );
    await call(
      `select kxra_private.${prefix}request_live_billing_intent($1,'CHECKOUT','KXRA_STARTER_V1')`,
      [intent],
      "owner",
      true,
    );
    await seedSyntheticAdmissionTerms(db.query.bind(db), {
      org_id: org,
      content: "Synthetic ledger admission terms",
    });
    await seedReviewedBusinessFixture(db.query.bind(db), {
      org_id: org,
      actor_id: owner,
    });
    await call(
      `select kxra_private.${prefix}request_live_billing_intent($1,'CHECKOUT','KXRA_STARTER_V1')`,
      [intent],
      "owner",
    );
    await call(
      `select kxra_private.${prefix}request_live_billing_intent($1,'CHECKOUT','KXRA_STARTER_V1')`,
      [crypto.randomUUID()],
      "owner",
      true,
    );
    await call(
      `select kxra_private.${prefix}claim_live_billing_intent($1)`,
      [intent],
      "owner",
      true,
    );
    // Requirement was added after the canonical request. Retirement is a supported
    // transition; an ACTIVE requirement must still block claim, not vanish in a join.
    await db.query("savepoint retired_legal_fixture");
    const document = crypto.randomUUID(),
      requirement = crypto.randomUUID(),
      legalHash = crypto
        .createHash("sha256")
        .update("Synthetic only")
        .digest("hex");
    await db.query(
      `insert into kxra.legal_documents(id,org_id,document_type,audience,version,title,rendered_content,content_sha256,status,effective_at,immutable_object_key,owner_approval_reference,owner_approved_at)
        values($1,$2,'TERMS','CUSTOMER',1,'Synthetic ledger terms','Synthetic only',$3,'APPROVED',now(),'synthetic/ledger-terms','SYNTHETIC_NOT_REAL_APPROVAL',now())`,
      [document, org, legalHash],
    );
    await db.query(
      `insert into kxra.legal_document_requirements(id,org_id,document_id,document_version,document_sha256,state,effective_at,acceptance_wording,acceptance_wording_version,acceptance_wording_sha256)
        values($1,$2,$3,1,$4,'ACTIVE',now(),'Synthetic accept',1,encode(sha256(convert_to('Synthetic accept','UTF8')),'hex'))`,
      [requirement, org, document, legalHash],
    );
    await call(
      `select kxra_private.${prefix}claim_live_billing_intent($1)`,
      [intent],
      "worker",
      true,
    );
    const presentations = await call(
      "select * from kxra.present_required_legal_documents(null,null)",
      [],
      "owner",
    );
    assert.equal(presentations!.rowCount, 1);
    await call(
      "select * from kxra.record_legal_response($1,true,$2)",
      [presentations!.rows[0].presentation_id, crypto.randomUUID()],
      "owner",
    );
    await db.query("savepoint stale_legal_wording");
    await db.query(
      "update kxra.legal_document_requirements set acceptance_wording='Synthetic revised accept',acceptance_wording_version=2,acceptance_wording_sha256=encode(sha256(convert_to('Synthetic revised accept','UTF8')),'hex') where id=$1",
      [requirement],
    );
    await call(
      `select kxra_private.${prefix}claim_live_billing_intent($1)`,
      [intent],
      "worker",
      true,
    );
    await call(
      `select kxra_private.${prefix}request_live_billing_intent($1,'CHECKOUT','KXRA_STARTER_V1')`,
      [intent],
      "owner",
      true,
    );
    await db.query("rollback to savepoint stale_legal_wording");
    await db.query("release savepoint stale_legal_wording");
    await db.query(
      "update kxra.legal_documents set status='RETIRED',retired_at=now() where id=$1",
      [document],
    );
    await call(
      `select kxra_private.${prefix}claim_live_billing_intent($1)`,
      [intent],
      "worker",
      true,
    );
    await call(
      `select kxra_private.${prefix}request_live_billing_intent($1,'CHECKOUT','KXRA_STARTER_V1')`,
      [intent],
      "owner",
      true,
    );
    // The composite FK also prevents normally reachable missing/hash-drift records.
    await call(
      "delete from kxra.legal_documents where id=$1",
      [document],
      "admin",
      true,
    );
    await call(
      "update kxra.legal_document_requirements set document_sha256=$2 where id=$1",
      [requirement, "c".repeat(64)],
      "admin",
      true,
    );
    await db.query("rollback to savepoint retired_legal_fixture");
    await db.query("release savepoint retired_legal_fixture");
    const claim = await call(
      `select kxra_private.${prefix}claim_live_billing_intent($1) value`,
      [intent],
      "worker",
    );
    assert.deepEqual(claim!.rows[0].value.execution_scope, tag);
    assert.equal(claim!.rows[0].value.intent.id, intent);
    assert.equal(claim!.rows[0].value.intent.state, "REQUESTED");
    assert.equal(claim!.rows[0].value.entitlement_authority, false);
    await call(
      `select kxra_private.${prefix}claim_live_billing_intent($1)`,
      [intent],
      "worker",
      true,
    );
    await call(
      `select kxra_private.${prefix}finish_live_billing_intent($1,'UNCERTAIN',null,$2)`,
      [intent, hash],
      "worker",
    );
    await call(
      `select kxra_private.${prefix}finish_live_billing_intent($1,'UNCERTAIN',null,$2)`,
      [intent, hash],
      "worker",
    );
    await call(
      `select kxra_private.${prefix}finish_live_billing_intent($1,'CONSUMED','${mode === "LIVE" ? "cs_live_other123" : "cs_test_other123"}',$2)`,
      [intent, hash],
      "worker",
      true,
    );
    const receipt = {
      event_id: `evt_${crypto.randomBytes(12).toString("hex")}`,
      payload_sha256: hash,
      account_id: tag.account_id,
      execution_scope: tag,
      mode: mode === "LIVE" ? "live" : "staging_sandbox",
      customer_id: customer,
      subscription_id: "sub_synthetic123",
      checkout_intent_id: intent,
      offer_key: "KXRA_STARTER_V1",
      mapping_revision: mappingRevision,
    };
    const record = async (r: unknown) =>
      (await call(
        `select kxra_private.${prefix}record_live_billing_event($1::jsonb) value`,
        [JSON.stringify(r)],
        "worker",
      ))!.rows[0].value;
    assert.equal(await record(receipt), "RECONCILE_REQUIRED");
    const version = (
      await db.query(
        "select version from kxra_private.live_billing_bindings where org_id=$1",
        [org],
      )
    ).rows[0].version;
    assert.equal(await record(receipt), "DUPLICATE");
    assert.equal(
      (
        await db.query(
          "select version from kxra_private.live_billing_bindings where org_id=$1",
          [org],
        )
      ).rows[0].version,
      version,
    );
    assert.equal(
      await record({ ...receipt, payload_sha256: "b".repeat(64) }),
      "CONFLICT",
    );
    assert.equal(
      (
        await db.query(
          "select quarantined from kxra_private.live_billing_bindings where org_id=$1",
          [org],
        )
      ).rows[0].quarantined,
      true,
    );
    const conflictVersion = (
      await db.query(
        "select version from kxra_private.live_billing_bindings where org_id=$1",
        [org],
      )
    ).rows[0].version;
    assert.equal(
      await record({ ...receipt, payload_sha256: "b".repeat(64) }),
      "CONFLICT",
    );
    assert.equal(
      (
        await db.query(
          "select version from kxra_private.live_billing_bindings where org_id=$1",
          [org],
        )
      ).rows[0].version,
      conflictVersion,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::integer n from kxra_private.live_billing_event_conflicts where event_id=$1",
          [receipt.event_id],
        )
      ).rows[0].n,
      1,
    );
    await call(
      "delete from kxra_private.live_billing_event_receipts where event_id=$1",
      [receipt.event_id],
      "admin",
      true,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::integer n from kxra.workspace_pilots where org_id=$1",
          [org],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::integer n from kxra.billing_subscriptions where org_id=$1",
          [org],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
