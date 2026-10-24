import { readPrivateFixtureJson } from "./support/private-fixture-json";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";
import { modernBillingFixture } from "./support/modern-billing-scope";
import { requireLiveBillingWorkerIdentity } from "../packages/integrations/live-worker-identity";
import { runPaidRefreshOnce } from "../packages/integrations/live-paid-refresh-worker";
import {
  buildLivePaidProof,
  buildStagingSandboxPaidProof,
} from "../packages/integrations/live-paid-access";
import {
  checkoutTermsPresentationDigest,
  type LiveCheckoutConsentProof,
} from "../packages/integrations/live-checkout-consent";
import type { LivePaymentEvidence } from "../packages/integrations/live-stripe-payment-evidence";

/** Automatic native acceptance SOURCE. Owner runs sequentially on a fresh generated
 * private socket fixture after0110, once per selected mode in separate databases.
 * No hosted connections/provider HTTP. Canonical random fixtures must COMMIT so a
 * genuine LOGIN runner can see them; retain their immutable evidence until the
 * disposable fixture is destroyed. Never switch/reset a database's bound scope. */
test("0110 genuine runner executes bounded due refresh, concurrent leases and generation CAS", async () => {
  assert.ok(
    localModeConfiguration(process.env),
    "Generated private local fixture required",
  );
  assert.ok(!process.env.VERCEL_ENV && !process.env.DATABASE_URL);
  const selected = process.env.KXRA_MODERN_BILLING_TEST_MODE ?? "LIVE";
  assert.ok(selected === "LIVE" || selected === "STAGING_SANDBOX");
  const mode = selected as "LIVE" | "STAGING_SANDBOX",
    prefix = mode === "LIVE" ? "" : "staging_sandbox_",
    opposite = mode === "LIVE" ? "staging_sandbox_" : "";
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  for (const directory of [runtime, path.join(runtime, "socket")]) {
    const m = fs.lstatSync(directory);
    assert.ok(m.isDirectory() && !m.isSymbolicLink());
    assert.equal(m.uid, process.getuid!());
    assert.equal(m.mode & 0o077, 0);
  }
  const cfg = readPrivateFixtureJson(path.join(runtime, "database.json"));
  assert.equal(cfg.host, path.join(process.env.KXRA_RUNTIME!, "socket"));
  assert.equal(fs.realpathSync(cfg.host), path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  assert.ok(
    Number.isInteger(cfg.port) && cfg.port >= 1024 && cfg.port <= 65535,
  );
  assert.match(cfg.database, /^[A-Za-z0-9_-]+$/);
  const config = {
    host: path.join(runtime, "socket"),
    port: cfg.port,
    database: cfg.database,
    user: os.userInfo().username,
    password: "",
    ssl: false as const,
    options: "",
  };
  const admin = new pg.Client(config),
    runner = new pg.Client({ ...config, user: "kxra_billing_runner" }),
    other = new pg.Client({ ...config, user: "kxra_billing_runner" });
  const id = () => crypto.randomUUID(),
    provider = (p: string) => `${p}_${crypto.randomBytes(12).toString("hex")}`,
    hash = (v: string) => crypto.createHash("sha256").update(v).digest("hex"),
    now = () => Math.floor(Date.now() / 1000);
  const org = id(),
    actor = id(),
    project = id(),
    checkout = id(),
    document = id(),
    policy = id(),
    otherOrg = id(),
    customer = provider("cus"),
    subscription = provider("sub"),
    invoice = provider("in"),
    item = provider("si");
  const review = hash(`SYNTHETIC_ONLY_${org}`),
    terms = hash("Synthetic only"),
    termsUrl = `https://kxra.example/legal/terms?sha256=${terms}`,
    message = `Synthetic [terms](${termsUrl})`;
  const presentation = checkoutTermsPresentationDigest({
    terms_review_sha256: terms,
    terms_url: termsUrl,
    message,
  });
  let ownedRole = false,
    setupCommitted = false;
  await admin.connect();
  async function worker(sql: string, values: unknown[] = [], client = runner) {
    await client.query("begin");
    try {
      await client.query("set local role kxra_billing_worker");
      await client.query("set local statement_timeout='5s'");
      await client.query("set local lock_timeout='2s'");
      requireLiveBillingWorkerIdentity(
        (await client.query("select session_user,current_user")).rows[0],
      );
      const r = await client.query(sql, values);
      await client.query("commit");
      return r;
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  const rpc = async (name: string, args: unknown[] = [], client = runner) =>
    (
      await worker(
        `select value from kxra_private.${prefix}${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) value`,
        args,
        client,
      )
    ).rows;
  const claim = async (n = 20, client = runner) =>
    (await rpc("claim_live_paid_refresh", [n], client)).map((r) => r.value);
  const current = async (s: any) =>
    (await rpc("live_paid_refresh_current", [s.org_id, s.claim_token]))[0]
      .value;
  const reserve = async (s: any, job = id()) =>
    (
      await rpc("reserve_live_paid_refresh", [
        s.org_id,
        s.claim_token,
        job,
        2900,
        invoice,
        item,
        now() - 60,
        now() + 3000,
      ])
    )[0].value;
  const entitled = async () =>
    (await admin.query("select kxra_private.pilot_entitled($1) value", [org]))
      .rows[0].value;
  async function work(denied = false) {
    await admin.query("begin");
    try {
      await admin.query("set local session authorization kxra_app");
      await admin.query("set local role authenticated");
      await admin.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
        [
          actor,
          JSON.stringify({ sub: actor, aal: "aal2", auth_time: now() }),
          org,
        ],
      );
      const call = admin.query(
        "select kxra.team_room_create($1,'Refresh native work','','PROJECT') value",
        [project],
      );
      if (denied) await assert.rejects(call);
      else assert.ok((await call).rows[0].value);
    } finally {
      await admin.query("rollback");
    }
  }
  try {
    // Coordinate the exact operator role name with live-worker-identity.db.test.ts.
    await admin.query(
      "select pg_advisory_lock(hashtext('local-fixture-billing-runner-identity'))",
    );
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from pg_roles where rolname='kxra_billing_runner'",
        )
      ).rows[0].n,
      0,
      "Refuse any preexisting runner role",
    );
    assert.deepEqual(
      (
        await admin.query(
          "select rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls from pg_roles where rolname='kxra_billing_worker'",
        )
      ).rows[0],
      {
        rolcanlogin: false,
        rolsuper: false,
        rolinherit: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
        rolbypassrls: false,
      },
    );
    await admin.query("begin");
    const execution = await bindSyntheticModernScope(
        admin.query.bind(admin),
        mode,
      ),
      scope = execution.execution_scope,
      row = execution.catalogue.find((r) => r.offer_key === "KXRA_STARTER_V1")!;
    const modern = {
      execution,
      runtimeIdentity: modernBillingFixture(mode).runtimeIdentity,
    };
    assert.equal(
      (
        await admin.query(
          "select enabled from kxra_private.live_billing_activation where singleton",
        )
      ).rows[0].enabled,
      false,
      "Fresh fixture activation starts off",
    );
    await admin.query(
      "create role kxra_billing_runner login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 3",
    );
    ownedRole = true;
    await admin.query("grant kxra_billing_worker to kxra_billing_runner");
    await admin.query("commit");
    assert.deepEqual(
      (
        await admin.query(
          "select rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolconnlimit,coalesce(rolconfig,'{}') rolconfig from pg_roles where rolname='kxra_billing_runner'",
        )
      ).rows[0],
      {
        rolcanlogin: true,
        rolsuper: false,
        rolinherit: false,
        rolcreaterole: false,
        rolcreatedb: false,
        rolreplication: false,
        rolbypassrls: false,
        rolconnlimit: 3,
        rolconfig: [],
      },
    );
    assert.deepEqual(
      (
        await admin.query(
          "select role.rolname granted,m.admin_option from pg_auth_members m join pg_roles role on role.oid=m.roleid join pg_roles member on member.oid=m.member where member.rolname='kxra_billing_runner' order by role.rolname",
        )
      ).rows,
      [{ granted: "kxra_billing_worker", admin_option: false }],
    );
    await runner.connect();
    await other.connect();
    assert.deepEqual(
      (await runner.query("select session_user,current_user")).rows[0],
      {
        session_user: "kxra_billing_runner",
        current_user: "kxra_billing_runner",
      },
    );
    assert.deepEqual(await claim(), []);
    await assert.rejects(
      runPaidRefreshOnce({
        enabled: false,
        mode,
        runtimeIdentity: modern.runtimeIdentity,
        secretKey: "",
        origin: "https://kxra.example",
        query: async () => {
          assert.fail("Disabled runner touched SQL");
        },
        transport: async () => {
          assert.fail("Disabled runner touched provider");
        },
      }),
      /DISABLED/,
    );
    await assert.rejects(rpc("claim_live_paid_refresh", [0]));
    await assert.rejects(rpc("claim_live_paid_refresh", [21]));
    await assert.rejects(
      worker(`select kxra_private.${opposite}claim_live_paid_refresh(1)`),
    );
    await admin.query("begin");
    await admin.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at,email_digest) values($1,'SUPABASE',$2,'ACTIVE',now(),$3)",
      [actor, `synthetic-refresh-${actor}`, hash(actor)],
    );
    await admin.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic refresh fixture',$2),($3,'Synthetic unrelated fixture',$4)",
      [org, `refresh-${org}`, otherOrg, `refresh-${otherOrg}`],
    );
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic refresh admin','LOCAL_REFRESH_TEST')",
      [org, actor],
    );
    await admin.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'REFRESH','Synthetic refresh project','TEST','ACTIVE','Verify')",
      [project, org],
    );
    await admin.query(
      "insert into kxra.legal_documents(id,org_id,document_type,audience,version,title,rendered_content,content_sha256,status,effective_at,immutable_object_key,owner_approval_reference,owner_approved_at) values($1,$2,'TERMS','CUSTOMER',1,'Synthetic refresh terms','Synthetic only',$3,'APPROVED',now(),'synthetic/refresh-terms','SYNTHETIC_NOT_REAL_APPROVAL',now())",
      [document, org, terms],
    );
    const revision = (
      await admin.query(
        "select coalesce(max(revision),0)+1 revision from kxra_private.live_billing_mappings where offer_key='KXRA_STARTER_V1'",
      )
    ).rows[0].revision;
    await admin.query(
      "insert into kxra_private.live_billing_mappings(mode,offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method) values($1,'KXRA_STARTER_V1',$2,true,$3,$4,$5,'bpc_syntheticRefresh',$6,$7,$6,'inclusive',false,'card')",
      [
        scope.livemode ? "live" : "staging_sandbox",
        revision,
        scope.account_id,
        row.price_id,
        row.product_id,
        review,
        terms,
      ],
    );
    await admin.query(
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,offer_key,mapping_revision,subscription_id) values($1,$2,'KXRA_STARTER_V1',$3,$4)",
      [org, customer, revision, subscription],
    );
    await admin.query(
      "insert into kxra_private.live_billing_intents(id,org_id,actor_id,kind,state,customer_id,offer_key,mapping_revision,terms_review_sha256,observed_version,auth_time,created_at,expires_at,consumed_at,provider_session_id,result_sha256) values($1,$2,$3,'CHECKOUT','CONSUMED',$4,'KXRA_STARTER_V1',$5,$6,0,now()-interval '2 days',now()-interval '2 days',now()-interval '2 days'+interval '20 minutes',now()-interval '2 days'+interval '1 minute',$7,$6)",
      [
        checkout,
        org,
        actor,
        customer,
        revision,
        terms,
        `${scope.livemode ? "cs_live" : "cs_test"}_${crypto.randomBytes(12).toString("hex")}`,
      ],
    );
    await admin.query(
      "update kxra_private.live_billing_bindings set checkout_intent_id=$2 where org_id=$1",
      [org, checkout],
    );
    await admin.query(
      "insert into kxra_private.live_paid_policies(id,revision,enabled,offer_key,mapping_revision,terms_document_id,terms_document_version,terms_url,message,activation_review_sha256,terms_review_sha256,presentation_sha256,tax_review_sha256,cancellation_review_sha256,grace_review_sha256,refund_review_sha256,trial_review_sha256,ai_review_sha256,access_rule,cancellation_mode,grace_seconds,refund_mode,trial_access,past_due_access,proof_ttl_seconds) values($1,1,true,'KXRA_STARTER_V1',$2,$3,1,$4,$5,$6,$7,$8,$6,$6,$6,$6,$6,$6,'CURRENT_COLLECTED_ACTIVE_ONLY','END_OF_PAID_PERIOD',0,'DENY_ANY_REFUND',false,false,120)",
      [
        policy,
        revision,
        document,
        termsUrl,
        message,
        review,
        terms,
        presentation,
      ],
    );
    await admin.query("commit");
    setupCommitted = true;
    // Policies alone cannot activate billing. Actual private SQL must still return no work.
    assert.deepEqual(await claim(), []);
    assert.equal(await entitled(), false);
    await work(true);
    await admin.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1 where singleton",
      [review],
    );
    await admin.query("begin");
    await admin.query(
      "select 1 from kxra_private.live_billing_bindings where org_id=$1 for update",
      [org],
    );
    try {
      assert.deepEqual(
        await claim(1),
        [],
        "Discovery skips a locked binding without waiting",
      );
    } finally {
      await admin.query("rollback");
    }
    const racers = await Promise.all([claim(1), claim(1, other)]);
    assert.equal(
      racers[0].length + racers[1].length,
      1,
      "Only one concurrent worker claims the canonical generation",
    );
    const first = [...racers[0], ...racers[1]][0];
    assert.equal(first.org_id, org);
    assert.deepEqual(first.execution_scope, scope);
    assert.equal(first.checkout_actor_id, actor);
    assert.equal(first.actor_id, actor);
    assert.equal(await current(first), true);
    assert.deepEqual(
      await claim(1, other),
      [],
      "Concurrent connection cannot steal an active lease",
    );
    assert.equal(await current({ ...first, org_id: otherOrg }), false);
    assert.equal(await current({ ...first, claim_token: id() }), false);
    await assert.rejects(reserve({ ...first, org_id: otherOrg }));
    await assert.rejects(reserve({ ...first, claim_token: id() }));
    const read = await reserve(first),
      job = read.context.reconciliation_id;
    const replay = (
      await rpc("reserve_live_paid_refresh", [
        org,
        first.claim_token,
        job,
        2900,
        invoice,
        item,
        read.context.period_start,
        read.context.period_end,
      ])
    )[0].value;
    assert.deepEqual(replay, read);
    await assert.rejects(reserve(first));
    function packet(r: any, state: LivePaymentEvidence["state"] = "COLLECTED") {
      const c = r.context;
      const payment: LivePaymentEvidence = {
        execution_scope: r.execution_scope,
        version: 1,
        state,
        reason: "SYNTHETIC_NATIVE_REFRESH",
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
        collected_minor: state === "COLLECTED" ? 2900 : 0,
        refunded_minor: 0,
        payment_intent_id: provider("pi"),
        charge_id: provider("ch"),
        subscription_status: "active",
        observation_started_at: c.created_at,
        observed_at: now(),
        source_sha256: review,
        requires_recheck: true,
        entitlement_authority: false,
        payout_authority: false,
      };
      const consent: LiveCheckoutConsentProof = {
        execution_scope: r.execution_scope,
        state: "VERIFIED",
        reason: "SYNTHETIC_HISTORICAL_CONSENT",
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
        terms_review_sha256: terms,
        presentation_sha256: presentation,
        period_start: c.period_start,
        period_end: c.period_end,
        subscription_status: "active",
        cancel_at_period_end: false,
        observed_at: now(),
        source_sha256: review,
        entitlement_authority: false,
      };
      return (
        mode === "LIVE" ? buildLivePaidProof : buildStagingSandboxPaidProof
      )(c, r.policy, payment, consent, now(), modern);
    }
    const commit = async (s: any, r: any, e = packet(r)) =>
      (
        await rpc("commit_live_paid_refresh", [
          s.org_id,
          s.claim_token,
          r.context.reconciliation_id,
          JSON.stringify(e),
        ])
      )[0].value;
    const before = (
      await admin.query(
        "select version from kxra_private.live_billing_bindings where org_id=$1",
        [org],
      )
    ).rows[0].version;
    assert.equal(await commit({ ...first, claim_token: id() }, read), "STALE");
    assert.equal(await entitled(), false);
    const proof = packet(read);
    assert.equal(await commit(first, read, proof), "ELIGIBLE");
    assert.equal(await entitled(), true);
    await work();
    assert.equal(
      Number(
        (
          await admin.query(
            "select version from kxra_private.live_billing_bindings where org_id=$1",
            [org],
          )
        ).rows[0].version,
      ),
      Number(before) + 1,
    );
    assert.equal(await current(first), false);
    assert.equal(
      await commit(first, read, proof),
      "STALE",
      "Consumed refresh token cannot replay SQL writes",
    );
    assert.deepEqual(
      await claim(),
      [],
      "Current proof outside due window does not refresh immediately",
    );
    const access = (
      await admin.query(
        "select extract(epoch from valid_until-checked_at)::int ttl,job_id from kxra_private.live_paid_access where org_id=$1",
        [org],
      )
    ).rows[0];
    assert.ok(access.ttl > 0 && access.ttl <= 120);
    assert.equal(access.job_id, job);
    // Force only owned fixture scheduling times: no sleeps, changed scope, or forged ACK.
    await admin.query(
      "update kxra_private.live_paid_access set valid_until=now()+interval '45 seconds' where org_id=$1",
      [org],
    );
    await admin.query(
      "update kxra_private.modern_paid_refresh_leases set next_attempt_at=now()-interval '1 second' where org_id=$1",
      [org],
    );
    const due = (await claim(1))[0];
    assert.ok(due);
    assert.equal(due.binding_version, Number(before) + 1);
    const dueRead = await reserve(due);
    assert.equal(await commit(due, dueRead), "ELIGIBLE");
    assert.equal(await entitled(), true);
    await admin.query(
      "update kxra_private.live_paid_access set valid_until=now()-interval '1 second' where org_id=$1",
      [org],
    );
    assert.equal(await entitled(), false);
    await work(true);
    await admin.query(
      "update kxra_private.modern_paid_refresh_leases set next_attempt_at=now()-interval '1 second' where org_id=$1",
      [org],
    );
    const expiring = (await claim(1))[0];
    const expiredRead = await reserve(expiring);
    await admin.query(
      "update kxra_private.modern_paid_refresh_leases set lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where org_id=$1",
      [org],
    );
    assert.equal(await current(expiring), false);
    const replacement = (await claim(1, other))[0];
    assert.notEqual(replacement.claim_token, expiring.claim_token);
    assert.equal(await commit(expiring, expiredRead), "STALE");
    await assert.rejects(reserve(expiring));
    const replacementRead = await reserve(replacement);
    await assert.rejects(
      rpc("commit_live_paid_refresh", [
        org,
        replacement.claim_token,
        replacementRead.context.reconciliation_id,
        JSON.stringify({}),
      ]),
      "Malformed evidence cannot commit",
    );
    await admin.query(
      "update kxra_private.live_billing_bindings set version=version+1,reconcile_required=true where org_id=$1",
      [org],
    );
    assert.equal(await current(replacement), false);
    assert.equal(await commit(replacement, replacementRead), "STALE");
    assert.equal(await entitled(), false);
    await admin.query(
      "update kxra_private.modern_paid_refresh_leases set lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where org_id=$1",
      [org],
    );
    await admin.query(
      "update kxra_private.live_webhook_endpoint_binding set enabled=true,project_ref=$1,review_sha256=$2 where singleton",
      [scope.project_ref, review],
    );
    const wake = {
      execution_scope: scope,
      event_id: provider("evt"),
      event_type: "invoice.paid",
      payload_sha256: review,
      customer_id: customer,
      subscription_id: subscription,
      invoice_id: invoice,
      account_id: scope.account_id,
      project_ref: scope.project_ref,
      api_version: scope.api_version,
      livemode: scope.livemode,
    };
    assert.equal(
      (await rpc("record_live_billing_wakeup", [JSON.stringify(wake)]))[0]
        .value,
      "QUEUED",
    );
    const wakeClaim = (await rpc("claim_live_billing_wakeups", [20]))
      .map((r) => r.value)
      .find((w) => w.event_id === wake.event_id);
    assert.ok(wakeClaim);
    const matching = (await claim(1))[0],
      matchingRead = await reserve(matching);
    assert.equal(matching.binding_version, wakeClaim.binding_version);
    await assert.rejects(
      rpc("ack_live_billing_wakeup", [
        wake.event_id,
        wakeClaim.claim_token,
        read.context.reconciliation_id,
      ]),
    );
    assert.equal(await commit(matching, matchingRead), "ELIGIBLE");
    assert.equal(
      (
        await rpc("ack_live_billing_wakeup", [
          wake.event_id,
          wakeClaim.claim_token,
          matchingRead.context.reconciliation_id,
        ])
      )[0].value,
      "DONE",
    );
    const oldWake = {
      ...wake,
      event_id: provider("evt"),
      payload_sha256: hash("older-wakeup"),
    };
    await rpc("record_live_billing_wakeup", [JSON.stringify(oldWake)]);
    const oldClaim = (await rpc("claim_live_billing_wakeups", [20]))
      .map((r) => r.value)
      .find((w) => w.event_id === oldWake.event_id);
    assert.ok(oldClaim);
    await admin.query(
      "update kxra_private.live_billing_bindings set version=version+1,reconcile_required=true where org_id=$1",
      [org],
    );
    await admin.query(
      "update kxra_private.modern_paid_refresh_leases set lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where org_id=$1",
      [org],
    );
    const handedOff = (await claim(1))[0];
    assert.ok(handedOff);
    assert.notEqual(handedOff.binding_version, oldClaim.binding_version);
    assert.equal(
      (
        await admin.query(
          "select state,acknowledged_job_id from kxra_private.live_webhook_queue where event_id=$1",
          [oldWake.event_id],
        )
      ).rows[0].state,
      "SUPERSEDED",
    );
    const handedRead = await reserve(handedOff);
    assert.equal(await commit(handedOff, handedRead), "ELIGIBLE");
    await assert.rejects(
      rpc("ack_live_billing_wakeup", [
        oldWake.event_id,
        oldClaim.claim_token,
        handedRead.context.reconciliation_id,
      ]),
    );
    assert.equal(
      (
        await admin.query(
          "select acknowledged_job_id from kxra_private.live_webhook_queue where event_id=$1",
          [oldWake.event_id],
        )
      ).rows[0].acknowledged_job_id,
      null,
    );
    assert.equal(await entitled(), true);
    await work();
    // Genuine worker receives functions only, while application/client roles get no new capability.
    await assert.rejects(
      worker("select * from kxra_private.modern_paid_refresh_leases"),
    );
    for (const role of ["anon", "authenticated", "kxra_app"]) {
      assert.equal(
        (
          await admin.query(
            "select has_function_privilege($1,$2,'EXECUTE') allowed",
            [role, `kxra_private.${prefix}claim_live_paid_refresh(integer)`],
          )
        ).rows[0].allowed,
        false,
      );
      assert.equal(
        (
          await admin.query(
            "select has_table_privilege($1,'kxra_private.modern_paid_refresh_leases','SELECT,INSERT,UPDATE,DELETE') allowed",
            [role],
          )
        ).rows[0].allowed,
        false,
      );
    }
    assert.equal(
      (
        await admin.query(
          "select has_function_privilege('kxra_billing_worker','kxra_private.modern_core_claim_live_paid_refresh(integer,text)','EXECUTE') allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await admin.query("begin");
    await admin.query("set local role kxra_billing_worker");
    await assert.rejects(
      admin.query(`select kxra_private.${prefix}claim_live_paid_refresh(1)`),
    );
    await admin.query("rollback");
  } finally {
    try {
      await runner.end().catch(() => {});
      await other.end().catch(() => {});
    } finally {
      try {
        await admin.query("rollback").catch(() => {});
        try {
          if (setupCommitted) {
            // Disable only this test's reviewed synthetic rows; retain immutable lineage.
            await admin.query(
              "update kxra_private.live_paid_policies set enabled=false where id=$1",
              [policy],
            );
            await admin.query(
              "update kxra_private.live_billing_mappings set enabled=false where offer_key='KXRA_STARTER_V1' and activation_review_sha256=$1",
              [review],
            );
            await admin.query(
              "update kxra_private.live_billing_activation set enabled=false where singleton and review_sha256=$1",
              [review],
            );
            await admin.query(
              "update kxra_private.live_webhook_endpoint_binding set enabled=false where singleton and review_sha256=$1",
              [review],
            );
          }
        } finally {
          if (ownedRole) {
            await admin.query("drop role if exists kxra_billing_runner");
            assert.equal(
              (
                await admin.query(
                  "select count(*)::int n from pg_roles where rolname='kxra_billing_runner'",
                )
              ).rows[0].n,
              0,
            );
          }
        }
      } finally {
        await admin.end();
      }
    }
  }
});
