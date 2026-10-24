import { readPrivateFixtureJson } from "./support/private-fixture-json";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { checkoutTermsPresentationDigest } from "../packages/integrations/live-checkout-consent";

// Automatic native SOURCE, unexecuted by its author. All synthetic writes roll back.
// Provider HTTP, hosted configuration and customer legal approvals are NOT tested.
function configuration() {
  assert.ok(localModeConfiguration(process.env));
  assert.ok(!process.env.VERCEL_ENV && !process.env.DATABASE_URL);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  for (const directory of [runtime, path.join(runtime, "socket")]) {
    const meta = fs.lstatSync(directory);
    assert.ok(meta.isDirectory() && !meta.isSymbolicLink());
    assert.equal(meta.uid, process.getuid!());
    assert.equal(meta.mode & 0o077, 0);
  }
  const cfg = readPrivateFixtureJson(path.join(runtime, "database.json"));
  assert.equal(fs.realpathSync(cfg.host), path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  assert.ok(
    Number.isInteger(cfg.port) && cfg.port >= 1024 && cfg.port <= 65535,
  );
  assert.match(cfg.database, /^[A-Za-z0-9_-]+$/);
  return {
    host: path.join(runtime, "socket"),
    port: cfg.port as number,
    database: cfg.database as string,
    user: os.userInfo().username,
    password: "",
    ssl: false as const,
  };
}
test("0111: reviewed CHECKOUT presentation is read-only, scoped and worker-only before/after claim", async () => {
  const db = new pg.Client(configuration());
  await db.connect();
  const sha = (s: string) =>
      crypto.createHash("sha256").update(s).digest("hex"),
    uuid = () => crypto.randomUUID();
  const org = uuid(),
    actor = uuid(),
    request = uuid(),
    doc = uuid(),
    policy = uuid(),
    review = sha("SYNTHETIC_REVIEW_NOT_APPROVED"),
    content = "SYNTHETIC legal terms for rollback fixture only",
    termsHash = sha(content);
  const mode =
    process.env.KXRA_MODERN_BILLING_TEST_MODE === "STAGING_SANDBOX"
      ? "STAGING_SANDBOX"
      : "LIVE";
  assert.ok(
    [undefined, "LIVE", "STAGING_SANDBOX"].includes(
      process.env.KXRA_MODERN_BILLING_TEST_MODE,
    ),
  );
  const prefix = mode === "LIVE" ? "" : "staging_sandbox_";
  const getter = `select kxra_private.${prefix}live_checkout_dispatch_presentation($1) value`;
  async function worker(sql: string, values: unknown[] = []) {
    await db.query("set local role kxra_billing_worker");
    try {
      const result = await db.query(sql, values);
      await db.query("reset role");
      return result;
    } catch (error) {
      throw error;
    }
  }
  async function reject(
    sql: string,
    values: unknown[] = [],
    role = "kxra_billing_worker",
    code?: string,
  ) {
    await db.query("savepoint denied_getter");
    try {
      await db.query(`set local role ${role}`);
      if (code) await assert.rejects(db.query(sql, values), { code });
      else await assert.rejects(db.query(sql, values));
    } finally {
      await db.query("rollback to savepoint denied_getter");
      await db.query("release savepoint denied_getter");
    }
  }
  try {
    await db.query("begin");
    await db.query("set local statement_timeout='5s'");
    const execution = await bindSyntheticModernScope(db.query.bind(db), mode),
      tag = execution.execution_scope,
      row = execution.catalogue[0];
    await db.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic checkout presentation',$2)",
      [org, `synthetic-presentation-${org}`],
    );
    await db.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
      [actor, `synthetic-${actor}`],
    );
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic admin','LOCAL_PRESENTATION_TEST')",
      [org, actor],
    );
    const revision = (
      await db.query(
        "select coalesce(max(revision),0)+1 revision from kxra_private.live_billing_mappings where offer_key=$1",
        [row.offer_key],
      )
    ).rows[0].revision;
    await db.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1 where singleton",
      [review],
    );
    await db.query(
      `insert into kxra_private.live_billing_mappings(offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method,mode)
    values($1,$2,true,$3,$4,$5,'bpc_syntheticPresentation',$6,$7,$6,'inclusive',false,'card',$8)`,
      [
        row.offer_key,
        revision,
        tag.account_id,
        row.price_id,
        row.product_id,
        review,
        termsHash,
        tag.livemode ? "live" : "staging_sandbox",
      ],
    );
    const customer = `cus_${crypto.randomBytes(12).toString("hex")}`;
    await db.query(
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision) values($1,$2,$3,$4)",
      [org, customer, row.offer_key, revision],
    );
    await db.query(
      "insert into kxra_private.live_billing_intents(id,org_id,actor_id,kind,customer_id,offer_key,mapping_revision,terms_review_sha256,observed_version,auth_time) values($1,$2,$3,'CHECKOUT',$4,$5,$6,$7,0,now())",
      [request, org, actor, customer, row.offer_key, revision, termsHash],
    );
    await db.query(
      "update kxra_private.live_billing_bindings set checkout_intent_id=$2 where org_id=$1",
      [org, request],
    );
    await reject(getter, [request]);
    assert.equal(
      (
        await db.query(
          "select state from kxra_private.live_billing_intents where id=$1",
          [request],
        )
      ).rows[0].state,
      "REQUESTED",
    );
    const origin =
      mode === "LIVE"
        ? "https://app.kxra-group.com"
        : "https://kxra-os-staging.vercel.app";
    const terms = {
      terms_review_sha256: termsHash,
      terms_url: `${origin}/legal/terms?sha256=${termsHash}`,
      message: `SYNTHETIC ONLY [terms](${origin}/legal/terms?sha256=${termsHash})`,
    };
    const expected = {
      ...terms,
      presentation_sha256: checkoutTermsPresentationDigest(terms),
    };
    await db.query(
      `insert into kxra.legal_documents(id,org_id,document_type,audience,version,title,rendered_content,content_sha256,immutable_object_key,status,effective_at,owner_approval_reference,owner_approved_at)
    values($1,$2,'TERMS','CUSTOMER',1,'Synthetic reviewed terms',$3,$4,$5,'APPROVED',now(),'SYNTHETIC_OWNER_APPROVAL',now())`,
      [doc, org, content, termsHash, `synthetic://terms/${doc}`],
    );
    await db.query(
      `insert into kxra_private.live_paid_policies(id,revision,enabled,offer_key,mapping_revision,terms_document_id,terms_document_version,terms_url,message,activation_review_sha256,terms_review_sha256,presentation_sha256,tax_review_sha256,cancellation_review_sha256,grace_review_sha256,refund_review_sha256,trial_review_sha256,ai_review_sha256,access_rule,cancellation_mode,grace_seconds,refund_mode,trial_access,past_due_access,proof_ttl_seconds)
    values($1,1,true,$2,$3,$4,1,$5,$6,$7,$8,$9,$7,$7,$7,$7,$7,$7,'CURRENT_COLLECTED_ACTIVE_ONLY','END_OF_PAID_PERIOD',0,'DENY_ANY_REFUND',false,false,60)`,
      [
        policy,
        row.offer_key,
        revision,
        doc,
        terms.terms_url,
        terms.message,
        review,
        termsHash,
        expected.presentation_sha256,
      ],
    );
    const before = (
      await db.query(
        "select to_jsonb(r) row from kxra_private.live_billing_intents r where id=$1",
        [request],
      )
    ).rows[0].row;
    const loaded = (await worker(getter, [request])).rows[0].value;
    assert.deepEqual(loaded, {
      request_id: request,
      presentation: expected,
      execution_scope: tag,
    });
    assert.deepEqual(
      (
        await db.query(
          "select to_jsonb(r) row from kxra_private.live_billing_intents r where id=$1",
          [request],
        )
      ).rows[0].row,
      before,
    );
    for (const mutation of [
      [
        "update kxra_private.live_paid_policies set enabled=false where id=$1",
        policy,
      ],
      [
        "update kxra.legal_documents set status='RETIRED',retired_at=now() where id=$1",
        doc,
      ],
      [
        "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where account_id=$1",
        actor,
      ],
      [
        "update kxra_private.live_billing_bindings set version=version+1 where org_id=$1",
        org,
      ],
    ]) {
      await db.query("savepoint eligibility_change");
      await db.query(mutation[0], [mutation[1]]);
      await reject(getter, [request]);
      await db.query("rollback to savepoint eligibility_change");
    }
    await reject(
      `select kxra_private.${mode === "LIVE" ? "staging_sandbox_" : ""}live_checkout_dispatch_presentation($1)`,
      [request],
    );
    for (const role of ["anon", "authenticated"])
      await reject(getter, [request], role, "42501");
    await reject(
      "select kxra_private.modern_core_checkout_dispatch_presentation($1)",
      [request],
      "kxra_billing_worker",
      "42501",
    );
    await worker(
      `select kxra_private.${prefix}claim_live_billing_intent($1) value`,
      [request],
    );
    assert.equal(
      (await worker(getter, [request])).rows[0].value.request_id,
      request,
    );
    await db.query(
      "update kxra_private.live_billing_activation set enabled=false where singleton",
    );
    await reject(getter, [request]);
    assert.equal(
      (
        await worker(
          `select kxra_private.${prefix}finish_live_billing_intent($1,'UNCERTAIN',null,$2) value`,
          [request, sha("synthetic uncertain dispatch")],
        )
      ).rows[0].value,
      "UNCERTAIN",
    );
    await reject(getter, [request]);
  } finally {
    try {
      await db.query("rollback");
    } finally {
      await db.end();
    }
  }
});
