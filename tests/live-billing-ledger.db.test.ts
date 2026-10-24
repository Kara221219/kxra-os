import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile } from "./support/runtime";

// OWNER MUST RUN SEQUENTIALLY after applying 0100 to a disposable LOCAL fixture.
// Explicit opt-in; no provider/network service is contacted. All fixture writes roll back.
const enabled = process.env.KXRA_RUN_LIVE_BILLING_LEDGER_DB_TESTS === "true";
test(
  "live ledger SQL: authority, single consumption, immutable receipts and quarantine",
  { skip: !enabled },
  async () => {
    assert.ok(!process.env.VERCEL, "local fixture only");
    const cfg = JSON.parse(
      fs.readFileSync(runtimeFile("database.json"), "utf8"),
    );
    assert.ok(
      typeof cfg.host === "string" &&
        (cfg.host.startsWith("/") ||
          ["localhost", "127.0.0.1", "::1"].includes(cfg.host)),
      "loopback/private socket only",
    );
    const db = new pg.Client({ ...cfg, user: os.userInfo().username });
    await db.connect();
    const owner = crypto.randomUUID(),
      outsider = crypto.randomUUID(),
      org = crypto.randomUUID(),
      otherOrg = crypto.randomUUID(),
      intent = crypto.randomUUID();
    const customer = `cus_${crypto.randomBytes(12).toString("hex")}`,
      hash = "a".repeat(64);
    async function call(
      sql: string,
      values: unknown[] = [],
      authority: "owner" | "outsider" | "worker" | "admin" = "admin",
      denied = false,
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
        } else if (authority === "worker")
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
        "select kxra_private.claim_live_billing_intent($1)",
        [intent],
        "worker",
        true,
      );
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
      await db.query(
        `insert into kxra_private.live_billing_mappings(offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method)
      values('KXRA_STARTER_V1',1,true,'acct_1Rv3KdC84VkhhIRz','price_1UTbq7C84VkhhIRzkBHEHivV','prod_VUb2kv7rUiTeiu','bpc_synthetic123',$1,$1,$1,'inclusive',false,'card')`,
        [hash],
      );
      await db.query(
        "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision) values($1,$2,'KXRA_STARTER_V1',1)",
        [org, customer],
      );
      await call(
        "select * from kxra_private.live_billing_bindings",
        [],
        "owner",
        true,
      );
      await call(
        "select kxra_private.request_live_billing_intent($1,'CHECKOUT','KXRA_STARTER_V1')",
        [intent],
        "outsider",
        true,
      );
      await call(
        "select kxra_private.request_live_billing_intent($1,'CHECKOUT','KXRA_STARTER_V1')",
        [intent],
        "owner",
      );
      await call(
        "select kxra_private.request_live_billing_intent($1,'CHECKOUT','KXRA_STARTER_V1')",
        [crypto.randomUUID()],
        "owner",
        true,
      );
      await call(
        "select kxra_private.claim_live_billing_intent($1)",
        [intent],
        "owner",
        true,
      );
      const claim = await call(
        "select kxra_private.claim_live_billing_intent($1) value",
        [intent],
        "worker",
      );
      assert.equal(claim!.rows[0].value.intent.id, intent);
      assert.equal(claim!.rows[0].value.intent.state, "REQUESTED");
      assert.equal(claim!.rows[0].value.entitlement_authority, false);
      await call(
        "select kxra_private.claim_live_billing_intent($1)",
        [intent],
        "worker",
        true,
      );
      await call(
        "select kxra_private.finish_live_billing_intent($1,'UNCERTAIN',null,$2)",
        [intent, hash],
        "worker",
      );
      await call(
        "select kxra_private.finish_live_billing_intent($1,'UNCERTAIN',null,$2)",
        [intent, hash],
        "worker",
      );
      await call(
        "select kxra_private.finish_live_billing_intent($1,'CONSUMED','cs_live_other123',$2)",
        [intent, hash],
        "worker",
        true,
      );
      const receipt = {
        event_id: `evt_${crypto.randomBytes(12).toString("hex")}`,
        payload_sha256: hash,
        account_id: "acct_1Rv3KdC84VkhhIRz",
        mode: "live",
        customer_id: customer,
        subscription_id: "sub_synthetic123",
        checkout_intent_id: intent,
        offer_key: "KXRA_STARTER_V1",
        mapping_revision: 1,
      };
      const record = async (r: unknown) =>
        (await call(
          "select kxra_private.record_live_billing_event($1::jsonb) value",
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
  },
);
