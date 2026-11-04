// Explicit synthetic data for a fresh owned disposable cluster only. Seed contract mirrors ai-admission.db.test.ts; no hosted approvals.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type pg from "pg";
import { bindSyntheticModernScope } from "./modern-billing-scope-db";
import { checkoutTermsPresentationDigest } from "../../packages/integrations/live-checkout-consent";
export async function seedAiResumeFixture(db: pg.Client, install = true) {
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
  // Each committed synthetic organization gets distinct provider-shaped identifiers.
  const syntheticTag = "syntheticAdmission" + org.replaceAll("-", "");
  const fixtureQuery = (sql: string, values?: unknown[]) =>
    db.query(
      sql.replaceAll("syntheticAdmission", syntheticTag),
      values?.map((v) =>
        typeof v === "string"
          ? v.replaceAll("syntheticAdmission", syntheticTag)
          : v,
      ),
    );
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
    await fixtureQuery("set local role kxra_billing_worker");
    try {
      const result = await fixtureQuery(sql, values);
      await fixtureQuery("reset role");
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
    await fixtureQuery("savepoint denied_getter");
    try {
      if (role !== "none") await fixtureQuery(`set local role ${role}`);
      if (code) await assert.rejects(fixtureQuery(sql, values), { code });
      else await assert.rejects(fixtureQuery(sql, values));
    } finally {
      await fixtureQuery("rollback to savepoint denied_getter");
      await fixtureQuery("release savepoint denied_getter");
    }
  }

  await fixtureQuery("set local statement_timeout='5s'");
  const admissionInstalled = (
    await fixtureQuery(
      "select to_regclass('kxra_private.business_eligibility_reviews') installed",
    )
  ).rows[0].installed;
  const admissionPromoted = fs.existsSync(
    path.resolve("supabase/migrations/0115_business_admission.sql"),
  );
  if (admissionPromoted) {
    assert.ok(
      admissionInstalled,
      "Promoted admission schema must already be installed; no proposal repair",
    );
    assert.equal(
      (
        await fixtureQuery(
          "select count(*)::int n from public.kxra_local_migrations where name='0115_business_admission.sql'",
        )
      ).rows[0].n,
      1,
    );
  }
  if (!admissionPromoted && !admissionInstalled) {
    await fixtureQuery(
      fs
        .readFileSync(
          path.resolve("database/proposals/business-admission.sql"),
          "utf8",
        )
        .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
        .replace(/commit;\s*$/i, ""),
    );
  }
  const execution = await bindSyntheticModernScope(fixtureQuery.bind(db), mode),
    tag = execution.execution_scope,
    row = execution.catalogue[0];
  await fixtureQuery(
    "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'Synthetic checkout presentation',$2,'CUSTOMER')",
    [org, `synthetic-presentation-${org}`],
  );
  await fixtureQuery(
    "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
    [actor, `synthetic-${actor}`],
  );
  await fixtureQuery(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic admin','LOCAL_PRESENTATION_TEST')",
    [org, actor],
  );
  const revision = (
    await fixtureQuery(
      "select coalesce(max(revision),0)+1 revision from kxra_private.live_billing_mappings where offer_key=$1",
      [row.offer_key],
    )
  ).rows[0].revision;
  await fixtureQuery(
    "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1 where singleton",
    [review],
  );
  await fixtureQuery(
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
  await fixtureQuery(
    "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision) values($1,$2,$3,$4)",
    [org, customer, row.offer_key, revision],
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
  await fixtureQuery(
    `insert into kxra.legal_documents(id,org_id,document_type,audience,version,title,rendered_content,content_sha256,immutable_object_key,status,effective_at,owner_approval_reference,owner_approved_at)
    values($1,$2,'TERMS','CUSTOMER',1,'Synthetic reviewed terms',$3,$4,$5,'APPROVED',now(),'SYNTHETIC_OWNER_APPROVAL',now())`,
    [doc, org, content, termsHash, `synthetic://terms/${doc}`],
  );
  await fixtureQuery(
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
  const declaration = uuid(),
    eligibility = uuid(),
    eligibilityPolicy = uuid();
  const insertIntent =
    "insert into kxra_private.live_billing_intents(id,org_id,actor_id,kind,customer_id,offer_key,mapping_revision,terms_review_sha256,observed_version,auth_time) values($1,$2,$3,'CHECKOUT',$4,$5,$6,$7,0,now())";
  const intentValues = [
    request,
    org,
    actor,
    customer,
    row.offer_key,
    revision,
    termsHash,
  ];

  await fixtureQuery(
    "insert into kxra_private.business_declarations(id,org_id,actor_id,legal_name,country,region,provider,business_use,authorised,provider_costs,declaration_version) values($1,$2,$3,'Synthetic NZ business','NZ','Auckland','OPENAI',true,true,true,'business-byok-v1')",
    [declaration, org, actor],
  );
  await fixtureQuery(
    "insert into kxra_private.business_eligibility_policies(id,version,evidence_sha256,owner_review_reference,effective_at,expires_at,enabled) values($1,'SYNTHETIC_ONLY',$2,'SYNTHETIC_NOT_APPROVAL',now(),now()+interval '1 day',true)",
    [eligibilityPolicy, review],
  );
  const reviewSql =
    "insert into kxra_private.business_eligibility_reviews(id,org_id,declaration_id,policy_id,scope_id,customer_id,offer_key,mapping_revision,terms_document_id,terms_document_version,terms_sha256,mapping_tax_sha256,legal_status,payment_status,provider_status,tax_status,legal_evidence_sha256,payment_evidence_sha256,provider_evidence_sha256,tax_evidence_sha256,expires_at,reviewer_reference) values($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,'CLEARED','CLEARED','CLEARED','CLEARED',$11,$11,$11,$11,now()+interval '1 hour','SYNTHETIC_NOT_APPROVAL')";
  const reviewValues = [
    eligibility,
    org,
    declaration,
    eligibilityPolicy,
    tag.scope_id,
    customer,
    row.offer_key,
    revision,
    doc,
    termsHash,
    review,
  ];
  await fixtureQuery(reviewSql, reviewValues);
  if (install)
    await fixtureQuery(
      fs
        .readFileSync("database/proposals/ai-business-admission.sql", "utf8")
        .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
        .replace(/commit;\s*$/i, ""),
    );
  async function appCall(
    sql: string,
    values: unknown[] = [],
    who = actor,
    workspace = org,
    sv = 1,
    execution = "hosted",
  ) {
    await fixtureQuery("savepoint app_call");
    try {
      await fixtureQuery("set session authorization kxra_app");
      await fixtureQuery("set local role authenticated");
      await fixtureQuery(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true),set_config('request.kxra.execution_mode',$4,true)",
        [
          who,
          workspace,
          JSON.stringify({
            sub: who,
            aal: "aal2",
            auth_time: Math.floor(Date.now() / 1000),
            session_version: sv,
          }),
          execution,
        ],
      );
      const result = (await fixtureQuery(sql, values)).rows[0]?.value;
      await fixtureQuery("reset session authorization");
      await fixtureQuery("release savepoint app_call");
      return result;
    } catch (e) {
      await fixtureQuery("rollback to savepoint app_call");
      await fixtureQuery("reset session authorization");
      await fixtureQuery("release savepoint app_call");
      throw e;
    }
  }
  const ep = sha("https://api.openai.com/v1/chat/completions"),
    fingerprint = sha("SYNTHETIC_NOT_A_KEY"),
    cipher = "SYNTHETIC_ENVELOPE_NOT_A_CREDENTIAL";
  const register = (
    id: string,
    p = "OPENAI",
    model = "synthetic-model",
    f = fingerprint,
    h = ep,
  ) =>
    appCall("select kxra.ai_connection_admission($1,$2,$3,'',$4,$5) value", [
      id,
      p,
      model,
      f,
      h,
    ]);
  async function reviewAi(
    id: string,
    state = "ELIGIBLE",
    mode = "CUSTOMER_BILLED",
    expiry = "1 hour",
  ) {
    return (
      await fixtureQuery(
        "insert into kxra_private.ai_connection_reviews(intent_id,state,account_mode,account_reference_sha256,provider_evidence_sha256,reviewer_reference,expires_at) values($1,$2,$3,$4,$4,'SYNTHETIC_NOT_APPROVAL',clock_timestamp()+$5::interval) returning id",
        [id, state, mode, review, expiry],
      )
    ).rows[0].id as string;
  }
  const save = (id: string, f = fingerprint) =>
    appCall(
      "select kxra.team_connection_save_admitted($1,'Synthetic admitted connection','OPENAI','synthetic-model','',$2,$3) value",
      [id, cipher, f],
    );
  // Seed a complete synthetic paid-access chain; preserve every existing pilot
  // admission trigger. This is not a payment/provider acceptance test.
  const checkout = uuid(),
    paidJob = uuid(),
    session = tag.livemode
      ? "cs_live_syntheticAdmission"
      : "cs_test_syntheticAdmission";
  await fixtureQuery(
    "insert into kxra_private.live_billing_intents(id,org_id,actor_id,kind,state,customer_id,offer_key,mapping_revision,terms_review_sha256,observed_version,auth_time,consumed_at,provider_session_id,result_sha256) values($1,$2,$3,'CHECKOUT','CONSUMED',$4,$5,$6,$7,0,now(),now(),$8,$7)",
    [
      checkout,
      org,
      actor,
      customer,
      row.offer_key,
      revision,
      termsHash,
      session,
    ],
  );
  await fixtureQuery(
    "update kxra_private.live_billing_bindings set subscription_id='sub_syntheticAdmission',checkout_intent_id=$2,reconcile_required=false,version=1 where org_id=$1",
    [org, checkout],
  );
  await fixtureQuery(
    "insert into kxra_private.live_paid_read_jobs(id,org_id,actor_id,checkout_actor_id,binding_version,mapping_revision,offer_key,policy_id,policy_revision,checkout_intent_id,checkout_session_id,customer_id,subscription_id,invoice_id,subscription_item_id,period_start,period_end,expected_total_minor,state) values($1,$2,$3,$3,1,$4,$5,$6,1,$7,$8,$9,'sub_syntheticAdmission','in_syntheticAdmission','si_syntheticAdmission',extract(epoch from now()-interval '1 minute')::bigint,extract(epoch from now()+interval '1 hour')::bigint,2900,'COMMITTED')",
    [
      paidJob,
      org,
      actor,
      revision,
      row.offer_key,
      policy,
      checkout,
      session,
      customer,
    ],
  );
  await fixtureQuery(
    "insert into kxra_private.live_paid_receipts(job_id,org_id,evidence_sha256,outcome,safe_evidence) values($1,$2,$3,'ELIGIBLE','{}')",
    [paidJob, org, review],
  );
  await fixtureQuery(
    "insert into kxra_private.live_paid_access(org_id,job_id,binding_version,mapping_revision,offer_key,policy_id,policy_revision,customer_id,subscription_id,invoice_id,payment_intent_id,charge_id,checkout_intent_id,checkout_session_id,terms_review_sha256,presentation_sha256,period_start,period_end,valid_until,cancel_at_period_end,checked_at) values($1,$2,1,$3,$4,$5,1,$6,'sub_syntheticAdmission','in_syntheticAdmission','pi_syntheticAdmission','ch_syntheticAdmission',$7,$8,$9,$10,now()-interval '1 minute',now()+interval '1 hour',now()+interval '1 minute',false,now())",
    [
      org,
      paidJob,
      revision,
      row.offer_key,
      policy,
      customer,
      checkout,
      session,
      termsHash,
      expected.presentation_sha256,
    ],
  );
  assert.equal(
    (await fixtureQuery("select kxra_private.pilot_entitled($1) value", [org]))
      .rows[0].value,
    true,
  );
  const project = uuid();
  await fixtureQuery(
    "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'AI-ELIGIBILITY','Synthetic project','TEST','ACTIVE','Review')",
    [project, org],
  );
  const room = await appCall(
    "select kxra.team_room_create($1,'Synthetic eligibility room','Review','PRIVATE') value",
    [project],
  );
  async function start(id: string, execution = "hosted") {
    const agent = await appCall(
        "select kxra.team_agent_create($1,$2,'Reviewed synthetic agent','Draft only') value",
        [room, id],
      ),
      message = uuid(),
      run = uuid();
    await appCall(
      "select kxra.team_message_send($1,$2,'Synthetic request',null) value",
      [message, room],
    );
    await appCall(
      "select kxra.team_run_start_memory($1,$2,$3,$4,$5,$6,'{}','{}','{}','{}','{}','{}') value",
      [run, room, agent, message, [message], sha("context")],
      actor,
      org,
      1,
      execution,
    );
    return { run, agent, message };
  }
  const gate = (run: string, h = ep, k = sha(cipher)) =>
    appCall("select kxra.ai_run_admission($1,$2,$3) value", [run, h, k]);
  return {
    org,
    actor,
    room,
    eligibility,
    eligibilityPolicy,
    declaration,
    review,
    sha,
    ep,
    fingerprint,
    cipher,
    register,
    reviewAi,
    save,
    start,
    gate,
    appCall,
  };
}
