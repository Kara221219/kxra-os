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
test("business eligibility: direct checkout, dispatch, revocation and worldwide review bindings", async () => {
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
    async function customerCall(
      value: unknown,
      selectedOrg = org,
      selectedActor = actor,
      aal = "aal2",
      command?: { text: string; values: unknown[] },
    ) {
      await db.query("savepoint customer_call");
      try {
        await db.query("set session authorization kxra_app");
        await db.query("set local role authenticated");
        await db.query(
          "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
          [
            selectedActor,
            JSON.stringify({
              sub: selectedActor,
              aal,
              auth_time: Math.floor(Date.now() / 1000),
            }),
            selectedOrg,
          ],
        );
        const result = (
          await db.query(
            command?.text ??
              "select kxra.submit_business_declaration($1::jsonb) value",
            command?.values ?? [JSON.stringify(value)],
          )
        ).rows[0].value;
        if (!command) {
          const replay = (
            await db.query(
              "select kxra.submit_business_declaration($1::jsonb) value",
              [JSON.stringify(value)],
            )
          ).rows[0].value;
          assert.deepEqual(replay, result);
        }
        return result;
      } finally {
        await db.query("rollback to savepoint customer_call");
        await db.query("reset session authorization");
        await db.query("release savepoint customer_call");
      }
    }
    const validDeclaration = {
      legal_name: "Synthetic NZ Business",
      country: " nz ",
      region: "Auckland",
      provider: "Synthetic provider",
      business_use: true,
      authorised: true,
      provider_costs: true,
      declaration_version: "business-byok-v1",
    };
    assert.equal(
      (await customerCall(validDeclaration)).state,
      "REVIEW_REQUIRED",
    );
    for (const change of [
      { business_use: false },
      { authorised: false },
      { provider_costs: false },
      { state: "ELIGIBLE" },
      { country: "ZZ" },
      { region: null },
      { region: 17 },
      { declaration_version: "old" },
    ])
      await assert.rejects(customerCall({ ...validDeclaration, ...change }));
    await assert.rejects(customerCall(validDeclaration, uuid()));
    await assert.rejects(customerCall(validDeclaration, org, uuid()));
    await assert.rejects(customerCall(validDeclaration, org, actor, "aal1"));
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
    await reject(insertIntent, intentValues, "none");
    await db.query(
      "insert into kxra_private.business_declarations(id,org_id,actor_id,legal_name,country,region,provider,business_use,authorised,provider_costs,declaration_version) values($1,$2,$3,'Synthetic NZ business','NZ','Auckland','Synthetic customer provider',true,true,true,'business-byok-v1')",
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
    // Drafts remain inert, but an ever-enabled successor is sticky: withdrawing
    // it must not resurrect an older reviewed clearance. All these inserts share
    // the transaction's now(), so policy sequence is the deterministic order.
    await db.query("savepoint policy_supersession");
    const currentReview = async () =>
      (
        await db.query(
          "select kxra_private.business_current_review($1,$2,$3,$4,$5,$6) value",
          [org, customer, tag.scope_id, row.offer_key, revision, termsHash],
        )
      ).rows[0].value;
    const successor = uuid(),
      replacement = uuid(),
      replacementReview = uuid();
    const insertPolicy =
      "insert into kxra_private.business_eligibility_policies(id,version,evidence_sha256,owner_review_reference,effective_at,expires_at,enabled) values($1,$2,$3,'SYNTHETIC_NOT_APPROVAL',now(),now()+interval '1 day',$4)";
    await db.query("savepoint expired_policy_successor");
    await db.query(
      insertPolicy.replace(
        "now(),now()+interval '1 day'",
        "now()-interval '2 hours',now()-interval '1 hour'",
      ),
      [uuid(), uuid(), review, true],
    );
    assert.equal(await currentReview(), null);
    await db.query("rollback to savepoint expired_policy_successor");
    assert.equal(await currentReview(), eligibility);
    await db.query(insertPolicy, [successor, uuid(), review, false]);
    assert.equal(
      (
        await db.query(
          "select first_enabled_at from kxra_private.business_eligibility_policies where id=$1",
          [successor],
        )
      ).rows[0].first_enabled_at,
      null,
    );
    assert.equal(await currentReview(), eligibility);
    await db.query(
      "update kxra_private.business_eligibility_policies set enabled=true where id=$1",
      [successor],
    );
    assert.ok(
      (
        await db.query(
          "select first_enabled_at from kxra_private.business_eligibility_policies where id=$1",
          [successor],
        )
      ).rows[0].first_enabled_at,
    );
    assert.equal(await currentReview(), null);
    await db.query(
      "update kxra_private.business_eligibility_policies set enabled=false where id=$1",
      [successor],
    );
    assert.equal(await currentReview(), null);
    await db.query(
      "update kxra_private.business_eligibility_policies set enabled=false where id=$1",
      [eligibilityPolicy],
    );
    await db.query(
      "update kxra_private.business_eligibility_policies set enabled=true where id=$1",
      [eligibilityPolicy],
    );
    assert.equal(await currentReview(), null);
    await reject(
      "update kxra_private.business_eligibility_policies set first_enabled_at=null where id=$1",
      [successor],
      "none",
    );
    await reject(
      "update kxra_private.business_eligibility_policies set first_enabled_at=now()-interval '1 second' where id=$1",
      [successor],
      "none",
    );
    await reject(
      "insert into kxra_private.business_eligibility_policies(version,evidence_sha256,owner_review_reference,effective_at,expires_at,enabled,first_enabled_at) values($1,$2,'SYNTHETIC_NOT_APPROVAL',now(),now()+interval '1 day',false,now())",
      [uuid(), review],
      "none",
    );
    await db.query(insertPolicy, [replacement, uuid(), review, false]);
    assert.equal(await currentReview(), null);
    await db.query(
      "update kxra_private.business_eligibility_policies set enabled=true where id=$1",
      [replacement],
    );
    assert.equal(await currentReview(), null);
    await db.query(
      reviewSql,
      reviewValues.map((value, index) =>
        index === 0 ? replacementReview : index === 3 ? replacement : value,
      ),
    );
    assert.equal(await currentReview(), replacementReview);
    await db.query("rollback to savepoint policy_supersession");
    assert.equal(await currentReview(), eligibility);
    for (const change of [
      ["legal_status", "BLOCKED"],
      ["provider_status", "BLOCKED"],
      ["tax_status", "REVIEW_REQUIRED"],
      ["payment_status", "REVIEW_REQUIRED"],
    ]) {
      await db.query("savepoint bad_review");
      await db.query(
        reviewSql.replace(
          "'CLEARED','CLEARED','CLEARED','CLEARED'",
          ["legal_status", "payment_status", "provider_status", "tax_status"]
            .map((field) =>
              field === change[0] ? "'" + change[1] + "'" : "'CLEARED'",
            )
            .join(","),
        ),
        [uuid(), ...reviewValues.slice(1)],
      );
      await reject(insertIntent, intentValues, "none");
      await db.query("rollback to savepoint bad_review");
    }
    await reject(
      "update kxra_private.business_eligibility_reviews set provider_status='BLOCKED' where id=$1",
      [eligibility],
      "none",
    );
    for (const pair of [
      ["customer_id", "cus_OtherCustomer"],
      ["terms_sha256", sha("other terms")],
      ["mapping_tax_sha256", sha("other tax")],
    ]) {
      await db.query("savepoint mismatched_review");
      await db.query(
        reviewSql,
        [uuid(), ...reviewValues.slice(1)].map((v, i) =>
          i ===
          (pair[0] === "customer_id" ? 5 : pair[0] === "terms_sha256" ? 9 : 10)
            ? pair[1]
            : v,
        ),
      );
      await reject(insertIntent, intentValues, "none");
      await db.query("rollback to savepoint mismatched_review");
    }
    await db.query("savepoint expired_review");
    await db.query(
      reviewSql
        .replace(
          "expires_at,reviewer_reference)",
          "reviewed_at,expires_at,reviewer_reference)",
        )
        .replace(
          "now()+interval '1 hour'",
          "now()-interval '2 hours',now()-interval '1 hour'",
        ),
      [uuid(), ...reviewValues.slice(1)],
    );
    await reject(insertIntent, intentValues, "none");
    await db.query("rollback to savepoint expired_review");
    await db.query(insertIntent, intentValues);
    await db.query(
      "update kxra_private.live_billing_bindings set checkout_intent_id=$2 where org_id=$1",
      [org, request],
    );
    assert.equal(
      (
        await db.query(
          "select business_eligibility_review_id from kxra_private.live_billing_intents where id=$1",
          [request],
        )
      ).rows[0].business_eligibility_review_id,
      eligibility,
    );
    for (const role of ["anon", "authenticated", "kxra_billing_worker"]) {
      await reject(
        "select * from kxra_private.business_eligibility_reviews",
        [],
        role,
        "42501",
      );
      await reject(
        "select kxra_private.business_previous_dispatch_presentation($1)",
        [request],
        role,
        "42501",
      );
      await reject(
        "select kxra_private.business_checkout_current($1)",
        [request],
        role,
        "42501",
      );
    }
    const replayCommand = {
      text: `select kxra_private.${prefix}request_live_billing_intent($1,'CHECKOUT',$2) value`,
      values: [request, row.offer_key],
    };
    assert.equal(
      (await customerCall(null, org, actor, "aal2", replayCommand)).id,
      request,
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
        "update kxra_private.business_eligibility_reviews set withdrawn_at=now() where id=$1",
        eligibility,
      ],
      [
        "update kxra_private.business_eligibility_policies set enabled=false where id=$1",
        eligibilityPolicy,
      ],
      [
        "insert into kxra_private.business_declarations(org_id,actor_id,legal_name,country,region,provider,business_use,authorised,provider_costs,declaration_version) values($1,'" +
          actor +
          "','Changed business','US','California','Other provider',true,true,true,'business-byok-v1')",
        org,
      ],
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
      if (mutation[0].includes("business_"))
        await assert.rejects(
          customerCall(null, org, actor, "aal2", replayCommand),
        );
      if (!mutation[0].includes("live_paid_policies"))
        await reject(
          `select kxra_private.${prefix}claim_live_billing_intent($1)`,
          [request],
        );
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
    await db.query("savepoint completed_result");
    const resultCommand = {
      text: `select kxra_private.${mode === "LIVE" ? "live_checkout_result_context" : "staging_sandbox_checkout_result_context"}($1) value`,
      values: [request],
    };
    await worker(
      `select kxra_private.${prefix}finish_live_billing_intent($1,'CONSUMED',$2,$3) value`,
      [
        request,
        mode === "LIVE"
          ? "cs_live_syntheticBusinessResult"
          : "cs_test_syntheticBusinessResult",
        sha("synthetic result receipt"),
      ],
    );
    assert.equal(
      (await customerCall(null, org, actor, "aal2", resultCommand)).intent.id,
      request,
    );
    await db.query(
      "update kxra_private.business_eligibility_reviews set withdrawn_at=now() where id=$1",
      [eligibility],
    );
    await assert.rejects(customerCall(null, org, actor, "aal2", resultCommand));
    await db.query("rollback to savepoint completed_result");
    await db.query("savepoint withdrawn_after_claim");
    await db.query(
      "update kxra_private.business_eligibility_reviews set withdrawn_at=now() where id=$1",
      [eligibility],
    );
    assert.equal(
      (
        await worker(
          `select kxra_private.${prefix}current_live_billing_intent($1) value`,
          [request],
        )
      ).rows[0].value,
      false,
    );
    await reject(getter, [request]);
    await reject(
      "select kxra_private.checkout_result_context($1,$2)",
      [request, mode],
      "none",
    );
    await db.query("rollback to savepoint withdrawn_after_claim");
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
