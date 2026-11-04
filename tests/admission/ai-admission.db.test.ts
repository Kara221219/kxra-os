import { readPrivateFixtureJson } from "../support/private-fixture-json";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { bindSyntheticModernScope } from "../support/modern-billing-scope-db";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import { checkoutTermsPresentationDigest } from "../../packages/integrations/live-checkout-consent";

// Native local eligibility matrix. All synthetic schema/evidence writes roll back.
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
test("AI connection and run admission: actual provider/model/key scope and current business review", async (t) => {
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
      if (role !== "none") await db.query(`set local role ${role}`);
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
    const admissionInstalled = (
      await db.query(
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
          await db.query(
            "select count(*)::int n from public.kxra_local_migrations where name='0115_business_admission.sql'",
          )
        ).rows[0].n,
        1,
      );
    }
    if (!admissionPromoted && !admissionInstalled) {
      await db.query(
        fs
          .readFileSync(
            path.resolve("database/proposals/business-admission.sql"),
            "utf8",
          )
          .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
          .replace(/commit;\s*$/i, ""),
      );
    }
    const execution = await bindSyntheticModernScope(db.query.bind(db), mode),
      tag = execution.execution_scope,
      row = execution.catalogue[0];
    await db.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'Synthetic checkout presentation',$2,'CUSTOMER')",
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

    await db.query(
      "insert into kxra_private.business_declarations(id,org_id,actor_id,legal_name,country,region,provider,business_use,authorised,provider_costs,declaration_version) values($1,$2,$3,'Synthetic NZ business','NZ','Auckland','OPENAI',true,true,true,'business-byok-v1')",
      [declaration, org, actor],
    );
    await db.query(
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
    await db.query(reviewSql, reviewValues);
    await db.query(
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
      await db.query("savepoint app_call");
      try {
        await db.query("set session authorization kxra_app");
        await db.query("set local role authenticated");
        await db.query(
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
        const result = (await db.query(sql, values)).rows[0]?.value;
        await db.query("reset session authorization");
        await db.query("release savepoint app_call");
        return result;
      } catch (e) {
        await db.query("rollback to savepoint app_call");
        await db.query("reset session authorization");
        await db.query("release savepoint app_call");
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
        await db.query(
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
    await db.query(
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
    await db.query(
      "update kxra_private.live_billing_bindings set subscription_id='sub_syntheticAdmission',checkout_intent_id=$2,reconcile_required=false,version=1 where org_id=$1",
      [org, checkout],
    );
    await db.query(
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
    await db.query(
      "insert into kxra_private.live_paid_receipts(job_id,org_id,evidence_sha256,outcome,safe_evidence) values($1,$2,$3,'ELIGIBLE','{}')",
      [paidJob, org, review],
    );
    await db.query(
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
      (await db.query("select kxra_private.pilot_entitled($1) value", [org]))
        .rows[0].value,
      true,
    );
    const project = uuid();
    await db.query(
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
    async function scenario(name: string, fn: () => Promise<void>) {
      await t.test(name, async () => {
        await db.query("savepoint scenario");
        try {
          await fn();
        } finally {
          await db.query("rollback to savepoint scenario");
          await db.query("release savepoint scenario");
        }
      });
    }
    const statusOf = (id?: string, who = actor, workspace = org, sv = 1) =>
      appCall(
        "select kxra.ai_connection_status($1) value",
        [id ?? null],
        who,
        workspace,
        sv,
      );
    await scenario(
      "resume own-intent projection follows current clearance, saved state and withdrawal",
      async () => {
        assert.equal(await statusOf(), null);
        const id = uuid();
        await register(id);
        const pending = await statusOf(id);
        assert.equal(pending.reason, "AWAITING_PROVIDER_REVIEW");
        assert.deepEqual(
          Object.keys(pending).sort(),
          [
            "admission_id",
            "provider",
            "model",
            "endpoint_id",
            "state",
            "reason",
            "next_action",
            "expires_at",
          ].sort(),
        );
        assert.deepEqual(await statusOf(), pending);
        const reviewId = await reviewAi(id);
        assert.equal((await statusOf(id)).next_action, "RESUBMIT_SAME_DETAILS");
        await save(id);
        assert.equal((await statusOf(id)).state, "SAVED");
        await db.query(
          "update kxra_private.ai_connection_reviews set withdrawn_at=clock_timestamp() where id=$1",
          [reviewId],
        );
        assert.equal((await statusOf(id)).reason, "SAVED_AUTHORITY_CHANGED");
        await assert.rejects(save(id));
      },
    );
    await scenario(
      "resume denies foreign, stale-session, unauthorised-role and direct metadata access",
      async () => {
        const id = uuid();
        await register(id);
        await assert.rejects(statusOf(uuid()));
        await assert.rejects(statusOf(id, uuid()));
        await assert.rejects(statusOf(id, actor, uuid()));
        await assert.rejects(statusOf(id, actor, org, 2));
        await reject(
          "select kxra.ai_connection_status(null)",
          [],
          "anon",
          "42501",
        );
        await reject(
          "select kxra.ai_connection_status(null)",
          [],
          "kxra_ai_worker",
          "42501",
        );
        await reject(
          "select kxra.ai_connection_status(null)",
          [],
          "kxra_billing_worker",
          "42501",
        );
        await reject(
          "select * from kxra_private.ai_connection_intents",
          [],
          "authenticated",
          "42501",
        );
        await assert.rejects(
          db.query("select kxra.ai_connection_status(null)"),
          { code: "42501" },
        );
      },
    );
    await scenario(
      "resume reports provider mismatch and latest blocked/withdrawn/expired decisions precisely",
      async () => {
        const wrong = uuid();
        await register(wrong, "ANTHROPIC");
        await reviewAi(wrong);
        const mismatch = await statusOf(wrong);
        assert.equal(mismatch.reason, "BUSINESS_PROVIDER_MISMATCH");
        assert.equal(mismatch.next_action, "COMPLETE_BUSINESS_REVIEW");
        for (const [state, mode, expiry, reason] of [
          ["BLOCKED", "CUSTOMER_BILLED", "1 hour", "PROVIDER_REVIEW_BLOCKED"],
          ["ELIGIBLE", "UNKNOWN", "1 hour", "ACCOUNT_MODE_REVIEW_REQUIRED"],
          ["ELIGIBLE", "CUSTOMER_BILLED", "-1 second", "REVIEW_NOT_CURRENT"],
        ]) {
          const id = uuid();
          await register(id);
          if (expiry === "-1 second")
            await db.query(
              "insert into kxra_private.ai_connection_reviews(intent_id,state,account_mode,account_reference_sha256,provider_evidence_sha256,reviewer_reference,reviewed_at,expires_at) values($1,$2,$3,$4,$4,'SYNTHETIC_NOT_APPROVAL',clock_timestamp()-interval '2 seconds',clock_timestamp()-interval '1 second')",
              [id, state, mode, review],
            );
          else await reviewAi(id, state, mode, expiry);
          assert.equal((await statusOf(id)).reason, reason);
        }
        const withdrawn = uuid();
        await register(withdrawn);
        const r = await reviewAi(withdrawn);
        await db.query(
          "update kxra_private.ai_connection_reviews set withdrawn_at=clock_timestamp() where id=$1",
          [r],
        );
        assert.equal((await statusOf(withdrawn)).reason, "REVIEW_WITHDRAWN");
      },
    );
    await scenario(
      "unreviewed intent is finite and stores no credential; exact resume and old RPC bypass denial",
      async () => {
        const id = uuid();
        assert.deepEqual(await register(id), {
          connection_id: id,
          state: "REVIEW_REQUIRED",
        });
        await assert.rejects(save(id));
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from kxra.team_connections where id=$1",
              [id],
            )
          ).rows[0].n,
          0,
        );
        await assert.rejects(
          appCall(
            "select kxra.team_connection_save($1,'Bypass','OPENAI','synthetic-model','',$2) value",
            [id, cipher],
          ),
        );
        await reviewAi(id);
        assert.equal((await register(id)).state, "ELIGIBLE");
        await assert.rejects(register(id, "OPENAI", "changed-model"));
        await assert.rejects(
          register(id, "OPENAI", "synthetic-model", sha("changed key")),
        );
        await assert.rejects(
          register(
            id,
            "OPENAI",
            "synthetic-model",
            fingerprint,
            sha("changed endpoint"),
          ),
        );
        await assert.rejects(save(id, sha("changed key")));
        assert.equal(await save(id), id);
      },
    );
    await scenario(
      "actual run pins review and ciphertext; endpoint/key changes or withdrawn decisions prevent dispatch",
      async () => {
        const id = uuid();
        await register(id);
        const ai = await reviewAi(id);
        await save(id);
        const { run } = await start(id);
        assert.equal(await gate(run), true);
        assert.equal(await gate(run, sha("new endpoint")), false);
        assert.equal(await gate(run, ep, sha("new key")), false);
        await db.query(
          "update kxra_private.ai_connection_reviews set withdrawn_at=clock_timestamp() where id=$1",
          [ai],
        );
        assert.equal(await gate(run), false);
        assert.equal(
          await appCall("select kxra.team_run_ready($1) value", [run]),
          false,
        );
      },
    );
    await scenario(
      "changed declaration/provider, business review or policy never revives old connection authority",
      async () => {
        const id = uuid();
        await register(id);
        await reviewAi(id);
        await save(id);
        const { run } = await start(id);
        assert.equal(await gate(run), true);
        await db.query(
          "update kxra_private.business_eligibility_reviews set withdrawn_at=clock_timestamp() where id=$1",
          [eligibility],
        );
        assert.equal(await gate(run), false);
        assert.equal((await register(id)).state, "REVIEW_REQUIRED");
      },
    );
    await scenario(
      "model or encrypted credential mutation denies the existing run",
      async () => {
        const id = uuid();
        await register(id);
        await reviewAi(id);
        await save(id);
        const { run } = await start(id);
        await db.query(
          "update kxra.team_connections set encrypted_key='changed synthetic envelope' where id=$1",
          [id],
        );
        assert.equal(await gate(run), false);
      },
    );
    await scenario(
      "latest blocked/unknown/expired review cannot fall back to clearance",
      async () => {
        for (const state of ["BLOCKED", "REVIEW_REQUIRED"]) {
          const id = uuid();
          await register(id);
          await reviewAi(id);
          await reviewAi(id, state);
          assert.equal((await register(id)).state, "REVIEW_REQUIRED");
          await assert.rejects(save(id));
        }
        const id = uuid();
        await register(id);
        await reviewAi(id, "ELIGIBLE", "UNKNOWN");
        assert.equal((await register(id)).state, "REVIEW_REQUIRED");
        const stale = uuid();
        await register(stale);
        await reviewAi(stale, "ELIGIBLE", "CUSTOMER_BILLED", "1 millisecond");
        await new Promise((r) => setTimeout(r, 15));
        assert.equal((await register(stale)).state, "REVIEW_REQUIRED");
      },
    );
    await scenario(
      "Google requires matching business provider and independently reviewed paid account mode",
      async () => {
        const wrong = uuid();
        await register(wrong, "GOOGLE");
        await reviewAi(wrong, "ELIGIBLE", "GOOGLE_PAID");
        assert.equal(
          (await register(wrong, "GOOGLE")).state,
          "REVIEW_REQUIRED",
        );
        const googleDecl = uuid(),
          googleReview = uuid();
        await db.query(
          "insert into kxra_private.business_declarations(id,org_id,actor_id,legal_name,country,region,provider,business_use,authorised,provider_costs,declaration_version) values($1,$2,$3,'Synthetic NZ business','NZ','Auckland','GOOGLE',true,true,true,'business-byok-v1')",
          [googleDecl, org, actor],
        );
        const values = [...reviewValues];
        values[0] = googleReview;
        values[2] = googleDecl;
        await db.query(reviewSql, values);
        const id = uuid();
        await register(id, "GOOGLE");
        for (const mode of ["UNKNOWN", "CUSTOMER_BILLED"]) {
          await reviewAi(id, "ELIGIBLE", mode);
          assert.equal((await register(id, "GOOGLE")).state, "REVIEW_REQUIRED");
        }
        await reviewAi(id, "ELIGIBLE", "GOOGLE_PAID");
        assert.equal((await register(id, "GOOGLE")).state, "ELIGIBLE");
        assert.equal(
          await appCall(
            "select kxra.team_connection_save_admitted($1,'Google reviewed','GOOGLE','synthetic-model','',$2,$3) value",
            [id, cipher, fingerprint],
          ),
          id,
        );
      },
    );
    await scenario(
      "tenant, user and session mismatch deny intent replay and execution",
      async () => {
        const id = uuid();
        await register(id);
        await reviewAi(id);
        await save(id);
        const { run } = await start(id);
        await assert.rejects(
          appCall(
            "select kxra.ai_connection_admission($1,'OPENAI','synthetic-model','',$2,$3) value",
            [id, fingerprint, ep],
            uuid(),
          ),
        );
        assert.equal(
          await appCall(
            "select kxra.ai_run_admission($1,$2,$3) value",
            [run, ep, sha(cipher)],
            actor,
            uuid(),
          ),
          false,
        );
        assert.equal(
          await appCall(
            "select kxra.ai_run_admission($1,$2,$3) value",
            [run, ep, sha(cipher)],
            actor,
            org,
            2,
          ),
          false,
        );
      },
    );
    await scenario(
      "private evidence and renamed cores cannot be read, rewritten or self-approved",
      async () => {
        const id = uuid();
        await register(id);
        await reviewAi(id);
        await assert.rejects(
          appCall(
            "select to_jsonb(t) value from kxra_private.ai_connection_intents t",
          ),
        );
        await assert.rejects(
          appCall(
            "insert into kxra_private.ai_connection_reviews(intent_id,state,account_mode,account_reference_sha256,provider_evidence_sha256,reviewer_reference,expires_at) values($1,'ELIGIBLE','CUSTOMER_BILLED',$2,$2,'forged',now()+interval '1 day') returning id value",
            [id, review],
          ),
        );
        await assert.rejects(
          appCall(
            "select kxra.ai_previous_connection_save($1,'Bypass','OPENAI','synthetic-model','',$2) value",
            [id, cipher],
          ),
        );
        await assert.rejects(
          db.query(
            "update kxra_private.ai_connection_intents set model='changed' where id=$1",
            [id],
          ),
        );
      },
    );
    await scenario(
      "queued work is cancelled after review withdrawal before dispatch",
      async () => {
        const id = uuid();
        await register(id);
        const ai = await reviewAi(id);
        await save(id);
        const agent = await appCall(
            "select kxra.team_agent_create($1,$2,'Queued agent','Draft') value",
            [room, id],
          ),
          message = uuid(),
          job = uuid();
        await appCall(
          "select kxra.team_message_send($1,$2,'Queue safely',null) value",
          [message, room],
        );
        // Enable only this rollback fixture's existing hosted-job prerequisites;
        // no scheduler/provider runs and no production flag is changed.
        await db.query(
          "select set_config('request.kxra.hosted_room_jobs','on',true)",
        );
        await db.query(
          "insert into kxra.team_room_rollouts(room_id,org_id,connection_id,expires_at,max_daily_dispatches) values($1,$2,$3,now()+interval '1 day',20)",
          [room, org, id],
        );
        await appCall(
          "select kxra.team_room_byok_review($1,$2,'APPROVE') value",
          [room, id],
        );
        await appCall(
          "select kxra.team_job_enqueue($1,$2,$3,$4,'MESSAGE_ONLY',$5,$6,'{}','{}','{}','{}','{}','{}',null,$7) value",
          [
            job,
            room,
            agent,
            message,
            [message],
            sha("context"),
            sha("request"),
          ],
        );
        const grant = await appCall(
          "select kxra.team_execution_authorize($1,now()+interval '1 hour') value",
          [job],
        );
        await db.query("select set_config('request.kxra.team_grant',$1,true)", [
          grant,
        ]);
        const lease = await appCall(
          "select kxra.team_job_claim($1,$2,30) value",
          [uuid(), room],
        );
        assert.ok(lease.lease_token);
        await db.query(
          "update kxra_private.ai_connection_reviews set withdrawn_at=clock_timestamp() where id=$1",
          [ai],
        );
        assert.equal(
          await appCall("select kxra.team_job_dispatch($1,$2,$3) value", [
            job,
            lease.lease_token,
            sha("context"),
          ]),
          null,
        );
        assert.equal(
          (
            await db.query("select state from kxra.team_jobs where id=$1", [
              job,
            ])
          ).rows[0].state,
          "CANCELLED",
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from kxra.team_runs where id=$1",
              [lease.run_id],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await scenario(
      "business declaration/policy/session drift and agent rebinding deny an existing run",
      async () => {
        const id = uuid();
        await register(id);
        await reviewAi(id);
        await save(id);
        const { run, agent } = await start(id);
        for (const sql of [
          "update kxra_private.business_eligibility_policies set enabled=false where id=$1",
          "update kxra.account_identities set session_version=2 where account_id=$1",
        ]) {
          await db.query("savepoint drift");
          await db.query(sql, [
            sql.includes("policies") ? eligibilityPolicy : actor,
          ]);
          assert.equal(await gate(run), false);
          await db.query("rollback to savepoint drift");
          await db.query("release savepoint drift");
          assert.equal(await gate(run), true);
        }
        const second = uuid();
        await register(second);
        await reviewAi(second);
        await save(second);
        await db.query(
          "update kxra.team_agents set connection_id=$2 where id=$1",
          [agent, second],
        );
        assert.equal(await gate(run), false);
        await appCall(
          "select kxra.team_run_finish($1,'Must not publish after rebind',null,1,1) value",
          [run],
        );
        const published = (
          await db.query(
            "select status,output from kxra.team_runs where id=$1",
            [run],
          )
        ).rows[0];
        assert.equal(published.status, "CANCELLED");
        assert.equal(published.output, "");
        const original = await start(id),
          fixtureId = uuid();
        await appCall(
          "select kxra.team_connection_save($1,'Fixture target','FIXTURE','fixture-draft','','fixture') value",
          [fixtureId],
          actor,
          org,
          1,
          "fixture",
        );
        await db.query(
          "update kxra.team_agents set connection_id=$2 where id=$1",
          [original.agent, fixtureId],
        );
        await appCall(
          "select kxra.team_run_finish($1,'Must not publish across fixture switch',null,1,1) value",
          [original.run],
          actor,
          org,
          1,
          "fixture",
        );
        assert.deepEqual(
          (
            await db.query(
              "select status,output from kxra.team_runs where id=$1",
              [original.run],
            )
          ).rows[0],
          { status: "CANCELLED", output: "" },
        );
      },
    );
    await scenario(
      "pending-intent expiry blocks late activation but does not expire an already reviewed connection",
      async () => {
        await db.query(
          "alter table kxra_private.ai_connection_intents alter column expires_at set default clock_timestamp()+interval '5 seconds'",
        );
        const id = uuid();
        await register(id);
        await reviewAi(id);
        await save(id);
        const { run } = await start(id);
        const remaining = (
          await db.query(
            "select greatest(0,extract(epoch from (expires_at-clock_timestamp()))*1000)::int milliseconds from kxra_private.ai_connection_intents where id=$1",
            [id],
          )
        ).rows[0].milliseconds;
        await new Promise((r) => setTimeout(r, remaining + 50));
        assert.equal(await gate(run), true);
        assert.equal((await register(id)).state, "REVIEW_REQUIRED");
        await appCall("select kxra.team_connection_toggle($1,false) value", [
          id,
        ]);
        await db.query(
          "update kxra_private.ai_connection_reviews set withdrawn_at=clock_timestamp() where intent_id=$1",
          [id],
        );
        await assert.rejects(
          appCall("select kxra.team_connection_toggle($1,true) value", [id]),
        );
      },
    );
    await scenario(
      "a stale JWT cannot re-enable a newly admitted current-session connection",
      async () => {
        await db.query(
          "update kxra.account_identities set session_version=2 where account_id=$1",
          [actor],
        );
        const id = uuid();
        await appCall(
          "select kxra.ai_connection_admission($1,'OPENAI','synthetic-model','',$2,$3) value",
          [id, fingerprint, ep],
          actor,
          org,
          2,
        );
        await reviewAi(id);
        await appCall(
          "select kxra.team_connection_save_admitted($1,'New session','OPENAI','synthetic-model','',$2,$3) value",
          [id, cipher, fingerprint],
          actor,
          org,
          2,
        );
        await appCall(
          "select kxra.team_connection_toggle($1,false) value",
          [id],
          actor,
          org,
          2,
        );
        await assert.rejects(
          appCall(
            "select kxra.team_connection_toggle($1,true) value",
            [id],
            actor,
            org,
            1,
          ),
        );
        await appCall(
          "select kxra.team_connection_toggle($1,true) value",
          [id],
          actor,
          org,
          2,
        );
      },
    );
    await scenario(
      "renamed cores and evidence remain inaccessible to every client and worker role",
      async () => {
        for (const role of [
          "anon",
          "authenticated",
          "kxra_ai_worker",
          "kxra_billing_worker",
        ]) {
          for (const signature of [
            "kxra.ai_previous_connection_save(uuid,text,text,text,text,text)",
            "kxra.ai_previous_connection_toggle(uuid,boolean)",
            "kxra.ai_previous_run_start(uuid,uuid,uuid,uuid,uuid[],text)",
            "kxra.ai_previous_run_finish(uuid,text,text,integer,integer)",
            "kxra_private.ai_intent_review(uuid)",
          ]) {
            assert.equal(
              (
                await db.query(
                  "select has_function_privilege($1,$2,'EXECUTE') allowed",
                  [role, signature],
                )
              ).rows[0].allowed,
              false,
            );
          }
          assert.equal(
            (
              await db.query(
                "select has_table_privilege($1,'kxra_private.ai_connection_reviews','INSERT,UPDATE,SELECT') allowed",
                [role],
              )
            ).rows[0].allowed,
            false,
          );
        }
      },
    );
    await scenario(
      "local fixture exemption is explicit; hosted and fixture-looking real providers remain denied",
      async () => {
        await assert.rejects(
          appCall(
            "select kxra.team_connection_save($1,'Fixture','FIXTURE','fixture-draft','','fixture') value",
            [uuid()],
          ),
        );
        const fixtureId = uuid();
        assert.equal(
          await appCall(
            "select kxra.team_connection_save($1,'Fixture','FIXTURE','fixture-draft','','fixture') value",
            [fixtureId],
            actor,
            org,
            1,
            "fixture",
          ),
          fixtureId,
        );
        const fixture = await start(fixtureId, "fixture");
        await appCall(
          "select kxra.team_run_finish($1,'Ordinary fixture output',null,0,0) value",
          [fixture.run],
          actor,
          org,
          1,
          "fixture",
        );
        assert.deepEqual(
          (
            await db.query(
              "select status,output from kxra.team_runs where id=$1",
              [fixture.run],
            )
          ).rows[0],
          { status: "SUCCEEDED", output: "Ordinary fixture output" },
        );
        await assert.rejects(
          appCall(
            "select kxra.team_connection_save($1,'Real-looking fixture','OPENAI','fixture-draft','','fixture') value",
            [uuid()],
            actor,
            org,
            1,
            "fixture",
          ),
        );
      },
    );
  } finally {
    await db.query("rollback");
    await db.end();
  }
});
