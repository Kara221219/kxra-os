import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";
import { checkoutTermsPresentationDigest } from "../packages/integrations/live-checkout-consent";
// Automatic native test SOURCE: owner runs sequentially after107/108/109.
// Generated local socket only; synthetic metadata, no provider IO, whole test rolls back.
function nativeConfiguration() {
  assert.ok(
    localModeConfiguration(process.env),
    "Explicit generated local fixture required",
  );
  assert.ok(
    !process.env.VERCEL && !process.env.VERCEL_ENV && !process.env.DATABASE_URL,
  );
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  for (const directory of [runtime, path.join(runtime, "socket")]) {
    const m = fs.lstatSync(directory);
    assert.ok(m.isDirectory() && !m.isSymbolicLink());
    assert.equal(m.uid, process.getuid!());
    assert.equal(m.mode & 0o077, 0, "Owner-private generated fixture only");
  }
  const file = path.join(runtime, "database.json"),
    meta = fs.lstatSync(file);
  assert.ok(meta.isFile() && !meta.isSymbolicLink());
  assert.equal(meta.uid, process.getuid!());
  assert.equal(meta.mode & 0o022, 0);
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(cfg.host, path.join(process.env.KXRA_RUNTIME!, "socket"));
  assert.equal(fs.realpathSync(cfg.host), path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  assert.ok(
    Number.isInteger(cfg.port) && cfg.port >= 1024 && cfg.port <= 65535,
  );
  assert.ok(
    typeof cfg.database === "string" && /^[a-zA-Z0-9_-]+$/.test(cfg.database),
  );
  return {
    host: path.join(runtime, "socket"),
    port: cfg.port as number,
    database: cfg.database as string,
    user: os.userInfo().username,
    password: "",
    ssl: false as const,
    options: "",
  };
}

test("checkout result SQL: current completed own request, fixed mode, generation/revocation/policy fences and no URL storage", async () => {
  const db = new pg.Client(nativeConfiguration());
  await db.connect();
  const uuid = () => crypto.randomUUID(),
    hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  assert.ok(
    [undefined, "LIVE", "STAGING_SANDBOX"].includes(
      process.env.KXRA_MODERN_BILLING_TEST_MODE,
    ),
  );
  const mode =
    process.env.KXRA_MODERN_BILLING_TEST_MODE === "STAGING_SANDBOX"
      ? "STAGING_SANDBOX"
      : "LIVE";
  const prefix = mode === "LIVE" ? "live_" : "staging_sandbox_";
  const actor = uuid(),
    otherAdmin = uuid(),
    org = uuid(),
    outsider = uuid(),
    otherOrg = uuid(),
    document = uuid(),
    policy = uuid(),
    intent = uuid();
  async function call(
    currentActor = actor,
    currentOrg = org,
    token?: string,
    denied = false,
    overridePrefix = prefix,
    role = "authenticated",
  ) {
    await db.query("savepoint checkout_read_assertion");
    try {
      await db.query("set local session authorization kxra_app");
      await db.query(
        role === "anon"
          ? "set local role anon"
          : "set local role authenticated",
      );
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.hosted_self_service','off',true),set_config('request.kxra.verified_supabase_identity','off',true)",
        [
          currentActor,
          JSON.stringify({
            sub: currentActor,
            aal: "aal2",
            auth_time: Math.floor(Date.now() / 1000),
            email_verified: true,
          }),
          currentOrg,
        ],
      );
      const sql =
        token === undefined
          ? `select kxra_private.${overridePrefix}checkout_result_context($1) value`
          : `select kxra_private.${overridePrefix}checkout_result_current($1,$2) value`;
      const result = (
        await db.query(sql, token === undefined ? [intent] : [intent, token])
      ).rows[0].value;
      if (denied) assert.fail("Expected SQL delivery fence denial");
      await db.query("reset role");
      await db.query("reset session authorization");
      await db.query("release savepoint checkout_read_assertion");
      return result;
    } catch (error) {
      await db.query("rollback to savepoint checkout_read_assertion");
      await db.query("release savepoint checkout_read_assertion");
      if (!denied || error instanceof assert.AssertionError) throw error;
      assert.ok(
        ["42501", "P0001"].includes((error as { code?: string }).code || ""),
        "Unexpected checkout fence SQL error: " +
          (error as { code?: string }).code +
          ": " +
          (error as Error).message,
      );
      return null;
    }
  }
  try {
    await db.query("begin");
    await db.query("set local statement_timeout='5s'");
    const execution = await bindSyntheticModernScope(db.query.bind(db), mode),
      scope = execution.execution_scope;
    const plan = execution.catalogue.find(
        (p) => p.offer_key === "KXRA_TEAM_V1",
      )!,
      terms = hash("Synthetic checkout terms only"),
      review = hash("Synthetic result approval"),
      termsUrl = `https://kxra.example/legal/terms?sha256=${terms}`,
      message = `Accept synthetic [Terms](${termsUrl})`;
    const presentation = checkoutTermsPresentationDigest({
      terms_review_sha256: terms,
      terms_url: termsUrl,
      message,
    });
    for (const [id, who] of [
      [org, actor],
      [otherOrg, outsider],
    ]) {
      await db.query(
        "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'Synthetic checkout result tenant',$2,'CUSTOMER')",
        [id, `checkout-${id}`],
      );
      await db.query(
        "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
        [who, `synthetic-${who}`],
      );
      await db.query(
        "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic result admin','LOCAL_RESULT_TEST')",
        [id, who],
      );
    }
    await db.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
      [otherAdmin, `synthetic-${otherAdmin}`],
    );
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Other current admin','LOCAL_RESULT_TEST')",
      [org, otherAdmin],
    );
    await db.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1",
      [review],
    );
    await db.query(
      "update kxra_private.live_billing_mappings set enabled=false where enabled",
    );
    const revision = (
      await db.query(
        "select coalesce(max(revision),0)+1 n from kxra_private.live_billing_mappings where offer_key=$1",
        [plan.offer_key],
      )
    ).rows[0].n;
    await db.query(
      "insert into kxra_private.live_billing_mappings(mode,offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method) values($1,$2,$3,true,$4,$5,$6,'bpc_syntheticresult',$7,$8,$7,'inclusive',false,'card')",
      [
        scope.livemode ? "live" : "staging_sandbox",
        plan.offer_key,
        revision,
        scope.account_id,
        plan.price_id,
        plan.product_id,
        review,
        terms,
      ],
    );
    const customer = `cus_${crypto.randomBytes(12).toString("hex")}`,
      session = `cs_${scope.livemode ? "live" : "test"}_${crypto.randomBytes(12).toString("hex")}`;
    await db.query(
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision) values($1,$2,$3,$4)",
      [org, customer, plan.offer_key, revision],
    );
    await db.query(
      "insert into kxra_private.live_billing_intents(id,org_id,actor_id,kind,state,customer_id,offer_key,mapping_revision,terms_review_sha256,observed_version,auth_time) values($1,$2,$3,'CHECKOUT','REQUESTED',$4,$5,$6,$7,0,now())",
      [intent, org, actor, customer, plan.offer_key, revision, terms],
    );
    await db.query(
      "update kxra_private.live_billing_bindings set checkout_intent_id=$1 where org_id=$2",
      [intent, org],
    );
    // Neither an unfinished request nor a completed request without approved policy is deliverable.
    await call(actor, org, undefined, true);
    await db.query(
      "update kxra_private.live_billing_intents set state='CONSUMED',consumed_at=now(),provider_session_id=$2,result_sha256=$3 where id=$1",
      [intent, session, review],
    );
    await call(actor, org, undefined, true);
    await db.query(
      "insert into kxra.legal_documents(id,org_id,document_type,audience,version,title,rendered_content,content_sha256,status,effective_at,immutable_object_key,owner_approval_reference,owner_approved_at) values($1,$2,'TERMS','CUSTOMER',1,'Synthetic result terms','Synthetic checkout terms only',$3,'APPROVED',now(),'synthetic/result-terms','SYNTHETIC_NOT_APPROVAL',now())",
      [document, org, terms],
    );
    await db.query(
      "insert into kxra_private.live_paid_policies(id,revision,enabled,offer_key,mapping_revision,terms_document_id,terms_document_version,terms_url,message,activation_review_sha256,terms_review_sha256,presentation_sha256,tax_review_sha256,cancellation_review_sha256,grace_review_sha256,refund_review_sha256,trial_review_sha256,ai_review_sha256,access_rule,cancellation_mode,grace_seconds,refund_mode,trial_access,past_due_access,proof_ttl_seconds) values($1,1,true,$2,$3,$4,1,$5,$6,$7,$8,$9,$7,$7,$7,$7,$7,$7,'CURRENT_COLLECTED_ACTIVE_ONLY','END_OF_PAID_PERIOD',0,'DENY_ANY_REFUND',false,false,180)",
      [
        policy,
        plan.offer_key,
        revision,
        document,
        termsUrl,
        message,
        review,
        terms,
        presentation,
      ],
    );
    const prepared = await call();
    assert.equal(prepared.intent.state, "CONSUMED");
    assert.equal(prepared.intent.provider_session_id, session);
    assert.deepEqual(prepared.execution_scope, scope);
    assert.equal(prepared.generation_sha256.length, 64);
    assert.equal(prepared.url, undefined);
    assert.equal(await call(actor, org, prepared.generation_sha256), true);
    assert.equal(await call(actor, org, "f".repeat(64)), false);
    await call(outsider, org, undefined, true);
    await call(otherAdmin, org, undefined, true);
    await call(actor, otherOrg, undefined, true);
    await call(
      actor,
      org,
      undefined,
      true,
      mode === "LIVE" ? "staging_sandbox_" : "live_",
    );
    await call(actor, org, undefined, true, prefix, "anon");
    // A current member who is not the original creator cannot recover that request.
    // Existing unpaid LIVE seats cannot be expanded, so test role downgrade under a savepoint.
    await db.query("savepoint member_denial");
    await db.query(
      "update kxra.organisation_memberships set security_role='ORG_MEMBER' where org_id=$1 and account_id=$2",
      [org, actor],
    );
    await call(actor, org, undefined, true);
    await db.query("rollback to savepoint member_denial");
    await db.query("release savepoint member_denial");
    await db.query("savepoint terms_denial");
    await db.query(
      "update kxra_private.live_paid_policies set enabled=false where id=$1",
      [policy],
    );
    await call(actor, org, prepared.generation_sha256, true);
    await db.query("rollback to savepoint terms_denial");
    await db.query("release savepoint terms_denial");
    await db.query("savepoint revoked_context");
    await db.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1 and account_id=$2",
      [org, actor],
    );
    await call(actor, org, prepared.generation_sha256, true);
    await db.query("rollback to savepoint revoked_context");
    await db.query("release savepoint revoked_context");
    await db.query("savepoint unverified_context");
    await db.query(
      "update kxra.account_identities set email_verified_at=null where account_id=$1",
      [actor],
    );
    await call(actor, org, prepared.generation_sha256, true);
    await db.query("rollback to savepoint unverified_context");
    await db.query("release savepoint unverified_context");
    await db.query("savepoint role_version");
    await db.query(
      "update kxra.organisation_memberships set version=version+1 where org_id=$1 and account_id=$2",
      [org, actor],
    );
    assert.equal(await call(actor, org, prepared.generation_sha256), false);
    await db.query("rollback to savepoint role_version");
    await db.query("release savepoint role_version");
    await db.query(
      "update kxra_private.live_billing_bindings set version=version+1 where org_id=$1",
      [org],
    );
    await call(actor, org, prepared.generation_sha256, true);
    const bearerColumns = (
      await db.query(
        "select column_name from information_schema.columns where table_schema='kxra_private' and table_name='live_billing_intents' and column_name in ('url','redirect_url','bearer_url')",
      )
    ).rows;
    assert.equal(bearerColumns.length, 0);
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
});
