import assert from "node:assert/strict";
import { modernBillingFixture } from "./support/modern-billing-scope";
import type {
  ModernExecutionMode,
  ModernBillingConfiguration,
  ModernRuntimeIdentity,
} from "../packages/integrations/modern-billing-scope";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { localModeConfiguration } from "../packages/authz/local-guard";
import pg from "pg";
import { runtimeFile } from "./support/runtime";
import {
  buildLivePaidProof,
  buildStagingSandboxPaidProof,
} from "../packages/integrations/live-paid-access";
import { checkoutTermsPresentationDigest } from "../packages/integrations/live-checkout-consent";
import type { LivePaymentEvidence } from "../packages/integrations/live-stripe-payment-evidence";
import type { LiveCheckoutConsentProof } from "../packages/integrations/live-checkout-consent";

// OWNER sequential execution only, after exact0100-0104 on a disposable LOCAL fixture.
// No Stripe calls; fixture writes roll back. This source has NOT been executed by this worker.
test("LIVE work/seat authority overrides grandfather fallback and fences stale proofs", async () => {
  assert.ok(
    localModeConfiguration(process.env),
    "generated private fixture only",
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
  const uuid = () => crypto.randomUUID(),
    sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex"),
    termsHash = sha("Synthetic paid terms only"),
    review = sha("Synthetic unapproved policy fixture");
  const now = () => Math.floor(Date.now() / 1000);
  assert.ok(
    [undefined, "LIVE", "STAGING_SANDBOX"].includes(
      process.env.KXRA_MODERN_BILLING_TEST_MODE,
    ),
  );
  const executionMode: ModernExecutionMode =
    process.env.KXRA_MODERN_BILLING_TEST_MODE === "STAGING_SANDBOX"
      ? "STAGING_SANDBOX"
      : "LIVE";
  let modern: {
    execution: ModernBillingConfiguration;
    runtimeIdentity: ModernRuntimeIdentity;
  } = modernBillingFixture(executionMode);
  const scopedSQL = (sql: string) =>
    executionMode === "LIVE"
      ? sql
      : sql.replace(
          /kxra_private\.(reserve_live_paid_read|commit_live_paid_proof|live_paid_read_current|live_paid_access_status)\(/g,
          "kxra_private.staging_sandbox_$1(",
        );
  let mappingRevision = 0;
  async function call(
    sql: string,
    values: unknown[] = [],
    authority?: "worker" | { org: string; actor: string },
    denied = false,
  ) {
    await db.query("savepoint paid_assertion");
    try {
      if (authority === "worker")
        await db.query("set local role kxra_billing_worker");
      else if (authority) {
        await db.query("set local session authorization kxra_app");
        await db.query("set local role authenticated");
        await db.query(
          "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
          [
            authority.actor,
            JSON.stringify({
              sub: authority.actor,
              aal: "aal2",
              auth_time: now(),
            }),
            authority.org,
          ],
        );
      }
      const r = await db.query(scopedSQL(sql), values);
      if (denied) assert.fail("Expected SQL denial");
      await db.query("reset role");
      await db.query("reset session authorization");
      await db.query(
        "select set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),set_config('request.kxra.org_id','',true)",
      );
      await db.query("release savepoint paid_assertion");
      return r;
    } catch (error) {
      await db.query("rollback to savepoint paid_assertion");
      await db.query("release savepoint paid_assertion");
      if (!denied || error instanceof assert.AssertionError) throw error;
      return null;
    }
  }
  async function account() {
    const actor = uuid();
    await db.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at,email_digest) values($1,'SUPABASE',$2,'ACTIVE',now(),$3)",
      [actor, `synthetic-${actor}`, sha(actor)],
    );
    return actor;
  }
  async function organisation() {
    const org = uuid(),
      actor = await account(),
      project = uuid();
    await db.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic paid fixture',$2)",
      [org, `paid-${org}`],
    );
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic admin','LOCAL_PAID_TEST')",
      [org, actor],
    );
    await db.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'PAID','Synthetic project','TEST','ACTIVE','Verify')",
      [project, org],
    );
    return { org, actor, project };
  }
  const entitled = async (org: string) =>
    (await db.query("select kxra_private.pilot_entitled($1) value", [org]))
      .rows[0].value;
  const work = async (
    f: { org: string; actor: string; project: string },
    denied = false,
  ) =>
    call(
      "select kxra.team_room_create($1,'Persistent paid work','','PROJECT') value",
      [f.project],
      f,
      denied,
    );
  try {
    await db.query("begin");
    await db.query("set local statement_timeout='5s'");
    // Synthetic fixture only: each execution mode needs a separate fresh private DB.
    const identity = (
      await db.query(
        "select scope_id from kxra_private.modern_billing_execution_identity where singleton",
      )
    ).rows[0];
    if (identity.scope_id === null) {
      const x = modern.execution,
        tag = x.execution_scope;
      await db.query(
        `update kxra_private.modern_billing_execution_identity set enabled=false,scope_id=$1,execution_mode=$2,project_ref=$3,account_id=$4,api_version=$5,catalogue_revision=$6,review_sha256=$7,scope_sha256=$8 where singleton`,
        [
          tag.scope_id,
          tag.execution_mode,
          tag.project_ref,
          tag.account_id,
          tag.api_version,
          tag.catalogue_revision,
          x.review_sha256,
          tag.scope_sha256,
        ],
      );
      for (const r of x.catalogue)
        await db.query(
          `insert into kxra_private.modern_billing_scope_catalogue(scope_id,offer_key,price_id,product_id,monthly_amount_minor,people,currency,interval) values($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            tag.scope_id,
            r.offer_key,
            r.price_id,
            r.product_id,
            r.monthly_amount_minor,
            r.people,
            r.currency,
            r.interval,
          ],
        );
      await db.query(
        "update kxra_private.modern_billing_execution_identity set enabled=true where singleton",
      );
    }
    const attestation = (await call(
      "select kxra_private.modern_billing_scope_attestation() value",
      [],
      "worker",
    ))!.rows[0].value;
    assert.equal(attestation.execution_scope.execution_mode, executionMode);
    modern = {
      execution: attestation,
      runtimeIdentity: {
        environment:
          attestation.execution_scope.project_ref === "lhbgeucifxxcdoyrnesf"
            ? "production"
            : "staging",
        project_ref: attestation.execution_scope.project_ref,
        supabase_url: `https://${attestation.execution_scope.project_ref}.supabase.co`,
      },
    };
    const scope = modern.execution.execution_scope,
      starter = modern.execution.catalogue.find(
        (r) => r.offer_key === "KXRA_STARTER_V1",
      )!,
      teamOffer = modern.execution.catalogue.find(
        (r) => r.offer_key === "KXRA_TEAM_V1",
      )!;

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
    const f = await organisation(),
      legacy = await organisation(),
      document = uuid(),
      policyId = uuid(),
      checkout = uuid(),
      customer = `cus_${crypto.randomBytes(12).toString("hex")}`,
      subscription = `sub_${crypto.randomBytes(12).toString("hex")}`,
      session = `${scope.livemode ? "cs_live" : "cs_test"}_${crypto.randomBytes(12).toString("hex")}`;
    assert.equal(await entitled(legacy.org), true);
    await work(legacy);
    await db.query(
      "insert into kxra.legal_documents(id,org_id,document_type,audience,version,title,rendered_content,content_sha256,status,effective_at,immutable_object_key,owner_approval_reference,owner_approved_at) values($1,$2,'TERMS','CUSTOMER',1,'Synthetic terms','Synthetic paid terms only',$3,'APPROVED',now(),'synthetic/paid-terms','SYNTHETIC_NOT_REAL_APPROVAL',now())",
      [document, f.org, termsHash],
    );
    await db.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1 where singleton",
      [review],
    );
    await db.query(
      `insert into kxra_private.live_billing_mappings(mode,offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method)
   values($4,'KXRA_STARTER_V1',$3,true,$5,$6,$7,'bpc_synthetic123',$1,$2,$1,'inclusive',false,'card')`,
      [
        review,
        termsHash,
        mappingRevision,
        scope.livemode ? "live" : "staging_sandbox",
        scope.account_id,
        starter.price_id,
        starter.product_id,
      ],
    );
    await db.query(
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision,subscription_id) values($1,$2,'KXRA_STARTER_V1',$4,$3)",
      [f.org, customer, subscription, mappingRevision],
    );
    // No self_service_workspaces row: this exact case previously leaked legacy admission.
    assert.equal(
      (
        await db.query(
          "select count(*)::integer n from kxra.self_service_workspaces where org_id=$1",
          [f.org],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(await entitled(f.org), false);
    const unpaidStatus = (await call(
      "select kxra_private.live_paid_access_status() value",
      [],
      f,
    ))!.rows[0].value;
    assert.equal(unpaidStatus.entitled, false);
    assert.equal(unpaidStatus.policy_ready, false);
    assert.equal(unpaidStatus.offer.monthly_amount_minor, 2900);
    assert.ok(!JSON.stringify(unpaidStatus).includes(customer));
    assert.equal(
      (
        await db.query(
          scopedSQL("select kxra_private.live_paid_access_status() value"),
        )
      ).rows[0].value,
      null,
    );
    await work(f, true);
    const extra = await account();
    await call(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_MEMBER','CUSTOMER','ACTIVE','Over cap','LOCAL_PAID_TEST')",
      [f.org, extra],
      undefined,
      true,
    );
    await db.query(
      `insert into kxra_private.live_billing_intents(id,org_id,actor_id,kind,state,customer_id,subscription_id,offer_key,mapping_revision,terms_review_sha256,observed_version,auth_time,created_at,expires_at,consumed_at,provider_session_id,result_sha256)
   values($1,$2,$3,'CHECKOUT','CONSUMED',$4,null,'KXRA_STARTER_V1',$7,$5,0,now()-interval '2 days',now()-interval '2 days',now()-interval '2 days'+interval '20 minutes',now()-interval '2 days'+interval '1 minute',$6,$5)`,
      [checkout, f.org, f.actor, customer, termsHash, session, mappingRevision],
    );
    await db.query(
      "update kxra_private.live_billing_bindings set checkout_intent_id=$2 where org_id=$1",
      [f.org, checkout],
    );
    const invoice = "in_synthetic123",
      item = "si_synthetic123",
      periodStart = now() - 60,
      periodEnd = now() + 3000;
    const reserve = async (id = uuid()) =>
      (await call(
        "select kxra_private.reserve_live_paid_read($1,$2,2900,$3,$4,$5,$6) value",
        [id, f.org, invoice, item, periodStart, periodEnd],
        "worker",
      ))!.rows[0].value;
    await call(
      "select kxra_private.reserve_live_paid_read($1,$2,2900,$3,$4,$5,$6)",
      [uuid(), f.org, invoice, item, periodStart, periodEnd],
      "worker",
      true,
    );
    const termsUrl = `https://kxra.example/legal/terms?sha256=${termsHash}`,
      message = `Synthetic reviewed [terms](${termsUrl})`,
      presentation = checkoutTermsPresentationDigest({
        terms_review_sha256: termsHash,
        terms_url: termsUrl,
        message,
      });
    await db.query(
      `insert into kxra_private.live_paid_policies(id,revision,enabled,offer_key,mapping_revision,terms_document_id,terms_document_version,terms_url,message,activation_review_sha256,terms_review_sha256,presentation_sha256,tax_review_sha256,cancellation_review_sha256,grace_review_sha256,refund_review_sha256,trial_review_sha256,ai_review_sha256,access_rule,cancellation_mode,grace_seconds,refund_mode,trial_access,past_due_access,proof_ttl_seconds)
   values($1,1,true,'KXRA_STARTER_V1',$8,$2,1,$3,$4,$5,$6,$7,$5,$5,$5,$5,$5,$5,'CURRENT_COLLECTED_ACTIVE_ONLY','END_OF_PAID_PERIOD',0,'DENY_ANY_REFUND',false,false,120)`,
      [
        policyId,
        document,
        termsUrl,
        message,
        review,
        termsHash,
        presentation,
        mappingRevision,
      ],
    );
    async function packet(
      read: Awaited<ReturnType<typeof reserve>>,
      state: LivePaymentEvidence["state"] = "COLLECTED",
      status = "active",
      consentState: LiveCheckoutConsentProof["state"] = "VERIFIED",
    ) {
      const c = read.context;
      const p: LivePaymentEvidence = {
        execution_scope: read.execution_scope,
        version: 1,
        state,
        reason: "SYNTHETIC_PROVIDER_EVIDENCE",
        org_id: c.org_id,
        reconciliation_id: c.reconciliation_id,
        binding_version: c.binding_version,
        mapping_revision: c.mapping_revision,
        invoice_id: c.invoice_id,
        subscription_id: c.subscription_id,
        customer_id: c.customer_id,
        offer_key: c.offer_key,
        period_start: c.period_start,
        period_end: c.period_end,
        currency: "GBP",
        expected_total_minor: c.expected_total_minor,
        collected_minor: state === "COLLECTED" ? c.expected_total_minor : 0,
        refunded_minor: 0,
        payment_intent_id: "pi_synthetic123",
        charge_id: "ch_synthetic123",
        subscription_status: status,
        observation_started_at: c.created_at,
        observed_at: now(),
        source_sha256: review,
        requires_recheck: true,
        entitlement_authority: false,
        payout_authority: false,
      };
      const s: LiveCheckoutConsentProof = {
        execution_scope: read.execution_scope,
        state: consentState,
        reason: "SYNTHETIC_REQUIRED_TERMS_ACCEPTED",
        org_id: c.org_id,
        reconciliation_id: c.reconciliation_id,
        binding_version: c.binding_version,
        mapping_revision: c.mapping_revision,
        offer_key: c.offer_key,
        checkout_intent_id: c.checkout_intent_id,
        checkout_session_id: c.checkout_session_id,
        customer_id: c.customer_id,
        subscription_id: c.subscription_id,
        invoice_id: c.invoice_id,
        price_id: c.price_id,
        product_id: c.product_id,
        terms_review_sha256: termsHash,
        presentation_sha256: presentation,
        period_start: c.period_start,
        period_end: c.period_end,
        subscription_status: status,
        cancel_at_period_end: false,
        observed_at: now(),
        source_sha256: review,
        entitlement_authority: false,
      };
      return (
        executionMode === "LIVE"
          ? buildLivePaidProof
          : buildStagingSandboxPaidProof
      )(c, read.policy, p, s, now(), modern);
    }
    const commit = async (p: Awaited<ReturnType<typeof packet>>) =>
      (await call(
        "select kxra_private.commit_live_paid_proof($1,$2::jsonb) value",
        [p.reconciliation_id, JSON.stringify(p)],
        "worker",
      ))!.rows[0].value;
    const winning = await reserve(),
      older = await reserve();
    const good = await packet(winning);
    assert.equal(
      (await call(
        "select kxra_private.live_paid_read_current($1) value",
        [good.reconciliation_id],
        "worker",
      ))!.rows[0].value,
      true,
    );
    await call(
      "select kxra_private.commit_live_paid_proof($1,$2::jsonb)",
      [good.reconciliation_id, JSON.stringify(good)],
      f,
      true,
    );
    assert.equal(await commit(good), "ELIGIBLE");
    assert.equal(
      (await call(
        "select kxra_private.live_paid_read_current($1) value",
        [good.reconciliation_id],
        "worker",
      ))!.rows[0].value,
      false,
    );
    assert.equal(await entitled(f.org), true);
    const room = await work(f);
    assert.ok(room!.rows[0].value);
    assert.equal(
      (
        await db.query(
          "select count(*)::integer n from kxra.team_rooms where org_id=$1",
          [f.org],
        )
      ).rows[0].n,
      1,
    );
    // Disabling the explicit policy revokes actual work even with a still-current paid proof.
    await db.query(
      "update kxra_private.live_paid_policies set enabled=false where id=$1",
      [policyId],
    );
    assert.equal(await entitled(f.org), false);
    await work(f, true);
    assert.equal(
      (await call(
        "select kxra_private.live_paid_access_status() value",
        [],
        f,
      ))!.rows[0].value.policy_ready,
      false,
    );
    await db.query(
      "update kxra_private.live_paid_policies set enabled=true where id=$1",
      [policyId],
    );
    assert.equal(await entitled(f.org), true);
    const version = (
      await db.query(
        "select version from kxra_private.live_billing_bindings where org_id=$1",
        [f.org],
      )
    ).rows[0].version;
    assert.equal(await commit(good), "ELIGIBLE");
    assert.equal(
      (
        await db.query(
          "select version from kxra_private.live_billing_bindings where org_id=$1",
          [f.org],
        )
      ).rows[0].version,
      version,
    );
    assert.equal(await commit(await packet(older)), "STALE");
    assert.equal(await entitled(f.org), true);
    await call(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_MEMBER','CUSTOMER','ACTIVE','Over cap','LOCAL_PAID_TEST')",
      [f.org, extra],
      undefined,
      true,
    );
    const pending = await reserve();
    const denied = await packet(pending, "PENDING");
    assert.equal(await commit(denied), "DENIED");
    assert.equal(await entitled(f.org), false);
    await work(f, true);
    // Replayed OLD success cannot undo a newer failed/pending/cancelled generation.
    assert.equal(await commit(good), "ELIGIBLE");
    assert.equal(await entitled(f.org), false);
    for (const state of ["past_due", "canceled"]) {
      const r = await reserve();
      assert.equal(await commit(await packet(r, "COLLECTED", state)), "DENIED");
      assert.equal(await entitled(f.org), false);
    }
    const noConsent = await reserve();
    assert.equal(
      await commit(
        await packet(noConsent, "COLLECTED", "active", "UNVERIFIED"),
      ),
      "DENIED",
    );
    const refresh = await reserve();
    assert.equal(await commit(await packet(refresh)), "ELIGIBLE");
    assert.equal(await entitled(f.org), true);
    // Event generation changes before commit fence stale evidence without restoring old access.
    const raced = await reserve();
    await db.query(
      "update kxra_private.live_billing_bindings set version=version+1,reconcile_required=true where org_id=$1",
      [f.org],
    );
    assert.equal(await commit(await packet(raced)), "STALE");
    assert.equal(await entitled(f.org), false);
    const again = await reserve();
    assert.equal(await commit(await packet(again)), "ELIGIBLE");
    await db.query(
      "update kxra_private.live_paid_access set valid_until=now()-interval '1 second' where org_id=$1",
      [f.org],
    );
    assert.equal(await entitled(f.org), false);
    await work(f, true);
    // Another LIVE tenant uses Team capacity; neither tenant can borrow the other's seats.
    const team = await organisation(),
      secondAdmin = await account();
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Second authorized admin','LOCAL_PAID_TEST')",
      [team.org, secondAdmin],
    );
    await db.query(
      `insert into kxra_private.live_billing_mappings select (jsonb_populate_record(null::kxra_private.live_billing_mappings,to_jsonb(m)||jsonb_build_object('offer_key','KXRA_TEAM_V1','price_id',$2::text,'product_id',$3::text))).* from kxra_private.live_billing_mappings m where m.offer_key='KXRA_STARTER_V1' and m.revision=$1`,
      [mappingRevision, teamOffer.price_id, teamOffer.product_id],
    );
    await db.query(
      `insert into kxra_private.live_paid_policies select (jsonb_populate_record(null::kxra_private.live_paid_policies,to_jsonb(q)||jsonb_build_object('id',$1::uuid,'offer_key','KXRA_TEAM_V1'))).* from kxra_private.live_paid_policies q where q.id=$2`,
      [uuid(), policyId],
    );
    const teamCustomer = `cus_${crypto.randomBytes(12).toString("hex")}`,
      teamSub = `sub_${crypto.randomBytes(12).toString("hex")}`,
      teamCheckout = uuid(),
      teamSession = `${scope.livemode ? "cs_live" : "cs_test"}_${crypto.randomBytes(12).toString("hex")}`;
    await db.query(
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision,subscription_id) values($1,$2,'KXRA_TEAM_V1',$4,$3)",
      [team.org, teamCustomer, teamSub, mappingRevision],
    );
    await db.query(
      `insert into kxra_private.live_billing_intents(id,org_id,actor_id,kind,state,customer_id,subscription_id,offer_key,mapping_revision,terms_review_sha256,observed_version,auth_time,created_at,expires_at,consumed_at,provider_session_id,result_sha256)
        values($1,$2,$3,'CHECKOUT','CONSUMED',$4,null,'KXRA_TEAM_V1',$7,$5,0,now()-interval '2 days',now()-interval '2 days',now()-interval '2 days'+interval '20 minutes',now()-interval '2 days'+interval '1 minute',$6,$5)`,
      [
        teamCheckout,
        team.org,
        team.actor,
        teamCustomer,
        termsHash,
        teamSession,
        mappingRevision,
      ],
    );
    await db.query(
      "update kxra_private.live_billing_bindings set checkout_intent_id=$2 where org_id=$1",
      [team.org, teamCheckout],
    );
    const teamRead = (await call(
      "select kxra_private.reserve_live_paid_read($1,$2,7900,'in_teamfixture123','si_teamfixture123',$3,$4) value",
      [uuid(), team.org, periodStart, periodEnd],
      "worker",
    ))!.rows[0].value;
    assert.equal(await commit(await packet(teamRead)), "ELIGIBLE");
    // 0108 member view uses this actual collected/consented104 proof, not a mock gate.
    const ordinaryMember = await account();
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_MEMBER','CUSTOMER','ACTIVE','Paid member projection','LOCAL_PAID_TEST')",
      [team.org, ordinaryMember],
    );
    const memberProjection = (await call(
      "select kxra_private.own_member_live_workspace_access() value",
      [],
      { org: team.org, actor: ordinaryMember },
    ))!.rows[0].value;
    assert.equal(memberProjection.lane, "LIVE");
    assert.equal(memberProjection.entitled, true);
    assert.deepEqual(
      Object.keys(memberProjection).sort(),
      [
        "lane",
        "entitled",
        "reconciliation_required",
        "quarantined",
        "proof_valid_until",
      ].sort(),
    );
    assert.ok(!JSON.stringify(memberProjection).includes(teamCustomer));
    assert.equal(
      (await call("select kxra_private.live_paid_access_status() value", [], {
        org: team.org,
        actor: ordinaryMember,
      }))!.rows[0].value,
      null,
    );

    assert.equal(
      (
        await db.query(
          "select kxra_private.workspace_seat_capacity($1) value",
          [team.org],
        )
      ).rows[0].value,
      5,
    );
    assert.equal(
      (
        await db.query(
          "select kxra_private.workspace_seat_capacity($1) value",
          [f.org],
        )
      ).rows[0].value,
      1,
    );
    const teamMember = await account();
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_MEMBER','CUSTOMER','ACTIVE','Within Team capacity','LOCAL_PAID_TEST')",
      [team.org, teamMember],
    );
    assert.equal(await entitled(team.org), true);
    // Revoking the original checkout actor neither grants a new charge action nor voids
    // historical consent while another current eligible admin remains.
    await db.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1 and account_id=$2",
      [team.org, team.actor],
    );
    assert.equal(await entitled(team.org), true);
    await work({ ...team, actor: secondAdmin });
    assert.equal(await entitled(f.org), false);
    assert.equal(await entitled(legacy.org), true);
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
