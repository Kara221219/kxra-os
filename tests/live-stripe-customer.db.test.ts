import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { localModeConfiguration } from "../packages/authz/local-guard";
import pg from "pg";
import { runtimeFile } from "./support/runtime";

// SOURCE ONLY until owner runs sequentially after0100 +0102 in a fresh disposable local fixture.
// No provider is contacted, and every synthetic database write rolls back.
test("fresh live customer ledger: permanent reservation, authority, uncertain outcomes and binding", async () => {
  assert.ok(
    localModeConfiguration(process.env),
    "explicit generated fixture only",
  );
  assert.ok(process.env.KXRA_RUNTIME);
  const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8"));
  assert.equal(cfg.host, path.join(process.env.KXRA_RUNTIME!, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password);
  const db = new pg.Client({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: os.userInfo().username,
    password: "",
    ssl: false,
  });
  await db.connect();
  const hash = "a".repeat(64);
  let mappingRevision = 0;
  async function call(
    sql: string,
    values: unknown[] = [],
    context?: { actor: string; org: string } | "worker" | "anon",
    denied: boolean | string = false,
  ) {
    await db.query("savepoint customer_assertion");
    try {
      if (context === "worker")
        await db.query("set local role kxra_billing_worker");
      else if (context === "anon") await db.query("set local role anon");
      else if (context) {
        await db.query("set local session authorization kxra_app");
        await db.query("set local role authenticated");
        await db.query(
          "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
          [
            context.actor,
            JSON.stringify({
              sub: context.actor,
              aal: "aal2",
              auth_time: Math.floor(Date.now() / 1000),
            }),
            context.org,
          ],
        );
      }
      const r = await db.query(sql, values);
      if (denied) assert.fail("Expected SQL denial");
      await db.query("reset role");
      await db.query("reset session authorization");
      await db.query("release savepoint customer_assertion");
      return r;
    } catch (error) {
      await db.query("rollback to savepoint customer_assertion");
      await db.query("release savepoint customer_assertion");
      if (!denied || error instanceof assert.AssertionError) throw error;
      if (typeof denied === "string")
        assert.equal((error as { code?: string }).code, denied);
      return null;
    }
  }
  async function fixture() {
    const org = crypto.randomUUID(),
      actor = crypto.randomUUID(),
      intent = crypto.randomUUID();
    await db.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic live customer fixture',$2)",
      [org, `customer-${org}`],
    );
    await db.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
      [actor, `synthetic-${actor}`],
    );
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic customer admin','LOCAL_CUSTOMER_TEST')",
      [org, actor],
    );
    const context = { actor, org };
    const metadata = {
      kxra_customer_intent: intent,
      kxra_org: org,
      kxra_actor: actor,
      kxra_offer: "KXRA_STARTER_V1",
      kxra_mapping_revision: String(mappingRevision),
      kxra_intent_version: "1",
      kxra_terms_sha256: hash,
    };
    const receipt = {
      intent_id: intent,
      org_id: org,
      actor_id: actor,
      offer_key: "KXRA_STARTER_V1",
      mapping_revision: mappingRevision,
      intent_version: 1,
      account_id: "acct_1Rv3KdC84VkhhIRz",
      livemode: true,
      outcome: "BOUND",
      customer_id: `cus_${crypto.randomBytes(12).toString("hex")}`,
      metadata,
      reason: "VERIFIED_LIVE_CUSTOMER",
      result_sha256: hash,
      entitlement_authority: false,
    };
    const request = () =>
      call(
        "select kxra_private.request_live_customer_intent($1,'KXRA_STARTER_V1') value",
        [intent],
        context,
      );
    const claim = () =>
      call(
        "select kxra_private.claim_live_customer_intent($1) value",
        [intent],
        "worker",
      );
    const finish = async (r: unknown = receipt) =>
      (await call(
        "select kxra_private.finish_live_customer_intent($1,$2::jsonb) value",
        [intent, JSON.stringify(r)],
        "worker",
      ))!.rows[0].value;
    return { org, actor, intent, context, receipt, request, claim, finish };
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
    mappingRevision = (
      await db.query(
        "select coalesce(max(revision),0)+1 revision from kxra_private.live_billing_mappings where offer_key='KXRA_STARTER_V1'",
      )
    ).rows[0].revision;
    const happy = await fixture();
    await call(
      "select kxra_private.claim_live_customer_intent($1)",
      [happy.intent],
      "worker",
      true,
    );
    await db.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1",
      [hash],
    );

    await db.query(
      `insert into kxra_private.live_billing_mappings(offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method)
   values('KXRA_STARTER_V1',$2,true,'acct_1Rv3KdC84VkhhIRz','price_1UTbq7C84VkhhIRzkBHEHivV','prod_VUb2kv7rUiTeiu','bpc_synthetic123',$1,$1,$1,'inclusive',false,'card')`,
      [hash, mappingRevision],
    );
    await call(
      "select * from kxra_private.live_customer_intents",
      [],
      happy.context,
      true,
    );
    for (const table of [
      "live_customer_intents",
      "live_customer_receipts",
      "live_customer_conflicts",
    ])
      for (const role of [happy.context, "worker", "anon"] as const)
        for (const sql of [
          `select * from kxra_private.${table}`,
          `insert into kxra_private.${table} default values`,
          `delete from kxra_private.${table} where false`,
        ])
          await call(sql, [], role, "42501");
    const foreign = await fixture();
    await call(
      "select kxra_private.request_live_customer_intent($1,'KXRA_STARTER_V1')",
      [happy.intent],
      { actor: foreign.actor, org: happy.org },
      true,
    );
    await db.query("savepoint email_gate");
    await db.query(
      "update kxra.account_identities set email_verified_at=null where account_id=$1",
      [happy.actor],
    );
    await call(
      "select kxra_private.request_live_customer_intent($1,'KXRA_STARTER_V1')",
      [happy.intent],
      happy.context,
      true,
    );
    await db.query("rollback to savepoint email_gate");
    await db.query("release savepoint email_gate");
    // An unresolved legacy0067 creation is billing state even before a customer exists.
    const legacyPending = await fixture();
    const legacyRequest = crypto.randomUUID();
    await db.query(
      `insert into kxra.billing_customer_intents(org_id,requested_by,client_request_id,organisation_name,idempotency_key,request_hash)
      values($1,$2,$3,'Synthetic unresolved legacy intent',$4,$5)`,
      [
        legacyPending.org,
        legacyPending.actor,
        legacyRequest,
        `kxra-customer-${legacyRequest}`,
        hash,
      ],
    );
    await call(
      "select kxra_private.request_live_customer_intent($1,'KXRA_STARTER_V1')",
      [legacyPending.intent],
      legacyPending.context,
      true,
    );
    await happy.request();
    await call(
      "select kxra_private.request_live_customer_intent($1,'KXRA_STARTER_V1')",
      [crypto.randomUUID()],
      happy.context,
      true,
    );
    await call(
      "select kxra_private.claim_live_customer_intent($1)",
      [happy.intent],
      happy.context,
      true,
    );
    const claimed = await happy.claim();
    assert.equal(claimed!.rows[0].value.intent.state, "REQUESTED");
    assert.equal(claimed!.rows[0].value.intent.version, 1);
    assert.equal(
      (await call(
        "select kxra_private.live_customer_intent_current($1,1) value",
        [happy.intent],
        "worker",
      ))!.rows[0].value,
      true,
    );
    await call(
      "select kxra_private.claim_live_customer_intent($1)",
      [happy.intent],
      "worker",
      true,
    );
    await call(
      "select kxra_private.finish_live_customer_intent($1,$2::jsonb)",
      [
        happy.intent,
        JSON.stringify({
          ...happy.receipt,
          metadata: { ...happy.receipt.metadata, kxra_org: foreign.org },
        }),
      ],
      "worker",
      true,
    );
    assert.equal(await happy.finish(), "BOUND");
    assert.equal(
      (await call(
        "select kxra_private.live_customer_intent_current($1,1) value",
        [happy.intent],
        "worker",
      ))!.rows[0].value,
      false,
    );
    assert.equal(await happy.finish(), "BOUND");
    const bound = (
      await db.query(
        "select * from kxra_private.live_billing_bindings where org_id=$1",
        [happy.org],
      )
    ).rows[0];
    assert.equal(bound.customer_id, happy.receipt.customer_id);
    assert.equal(bound.offer_key, "KXRA_STARTER_V1");
    assert.equal(bound.reconcile_required, true);
    assert.equal(bound.subscription_id, null);
    assert.equal((await happy.request())!.rows[0].value.state, "BOUND");
    await call(
      "update kxra_private.live_billing_bindings set customer_id='cus_other123' where org_id=$1",
      [happy.org],
      undefined,
      true,
    );
    const uncertain = await fixture();
    await uncertain.request();
    await uncertain.claim();
    const uncertainReceipt = {
      ...uncertain.receipt,
      outcome: "UNCERTAIN",
      customer_id: happy.receipt.customer_id,
      metadata: null,
      reason: "PROVIDER_OUTCOME_UNVERIFIED",
    };
    assert.equal(await uncertain.finish(uncertainReceipt), "UNCERTAIN");
    assert.equal(await uncertain.finish(uncertainReceipt), "UNCERTAIN");
    await call(
      "select kxra_private.request_live_customer_intent($1,'KXRA_STARTER_V1')",
      [crypto.randomUUID()],
      uncertain.context,
      true,
    );
    const blockedLegacy = await fixture();
    await blockedLegacy.request();
    await blockedLegacy.claim();
    await call(
      "insert into kxra.billing_customers(org_id,provider_customer_id) values($1,$2)",
      [blockedLegacy.org, `cus_${crypto.randomBytes(12).toString("hex")}`],
      undefined,
      "42501",
    );
    // Reciprocal lane fencing prevents the formerly reachable late legacy write.
    // Quarantine remains exercised by committed revocation and disabled activation.
    assert.equal(await blockedLegacy.finish(), "BOUND");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra.billing_customers where org_id=$1",
          [blockedLegacy.org],
        )
      ).rows[0].n,
      0,
    );

    const revoked = await fixture();
    await revoked.request();
    await revoked.claim();
    await db.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1",
      [revoked.org],
    );
    assert.equal(await revoked.finish(), "QUARANTINED");
    const disabled = await fixture();
    await disabled.request();
    await disabled.claim();
    await db.query(
      "update kxra_private.live_billing_activation set enabled=false where singleton",
    );
    assert.equal(await disabled.finish(), "QUARANTINED");
    await db.query(
      "update kxra_private.live_billing_activation set enabled=true where singleton",
    );
    const conflict = {
      ...happy.receipt,
      result_sha256: "b".repeat(64),
      reason: "PROVIDER_CHANGED_DURING_READ",
    };
    assert.equal(await happy.finish(conflict), "QUARANTINED");
    const conflictVersion = (
      await db.query(
        "select version from kxra_private.live_billing_bindings where org_id=$1",
        [happy.org],
      )
    ).rows[0].version;
    assert.equal(await happy.finish(conflict), "QUARANTINED");
    assert.equal(
      (
        await db.query(
          "select version from kxra_private.live_billing_bindings where org_id=$1",
          [happy.org],
        )
      ).rows[0].version,
      conflictVersion,
    );
    await call(
      "delete from kxra_private.live_customer_receipts where intent_id=$1",
      [happy.intent],
      undefined,
      true,
    );
    for (const f of [happy, uncertain, blockedLegacy, revoked, disabled]) {
      assert.equal(
        (
          await db.query(
            "select count(*)::integer n from kxra.workspace_pilots where org_id=$1",
            [f.org],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::integer n from kxra.billing_subscriptions where org_id=$1",
            [f.org],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::integer n from kxra_private.live_billing_bindings where org_id=$1",
            [f.org],
          )
        ).rows[0].n,
        f === happy || f === blockedLegacy ? 1 : 0,
      );
    }
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
