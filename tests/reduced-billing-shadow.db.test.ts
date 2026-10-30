import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { readPrivateFixtureJson } from "./support/private-fixture-json";
import { bindSyntheticModernScope } from "./support/modern-billing-scope-db";
import {
  seedSyntheticAdmissionTerms,
  seedReviewedBusinessFixture,
} from "./support/reviewed-business-fixture";
import { paidRefreshProviderFixture } from "./support/paid-refresh-provider-fixture";
import { runPaidRefreshOnce } from "../packages/integrations/live-paid-refresh-worker";
import { runReducedBillingShadowOnce } from "../packages/integrations/reduced-billing-shadow";
import {
  createLiveWebhookHandler,
  createStagingSandboxWebhookHandler,
} from "../packages/integrations/live-webhook";

test("native reduced shadow: durable inbox, consent integrity, coalesced CAS, bounded retries and no production proof changes", async () => {
  assert.ok(localModeConfiguration(process.env));
  assert.ok(!process.env.VERCEL_ENV && !process.env.DATABASE_URL);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!),
    cfg = readPrivateFixtureJson(path.join(runtime, "database.json"));
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.equal(fs.realpathSync(cfg.host), cfg.host);
  for (const directory of [runtime, cfg.host]) {
    assert.equal(fs.statSync(directory).mode & 0o077, 0);
    assert.equal(fs.statSync(directory).uid, process.getuid!());
  }
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  const mode = process.env.KXRA_MODERN_BILLING_TEST_MODE ?? "LIVE";
  assert.ok(mode === "LIVE" || mode === "STAGING_SANDBOX");
  const conn = {
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    password: "",
    ssl: false as const,
  };
  const admin = new pg.Client({ ...conn, user: os.userInfo().username });
  await admin.connect();
  let ownedRole = false;
  const content = "Synthetic reduced billing terms",
    h = crypto.createHash("sha256").update(content).digest("hex");
  const f = paidRefreshProviderFixture(mode, Math.floor(Date.now() / 1000), h),
    s = f.subject;
  s.org_id = crypto.randomUUID();
  s.actor_id = crypto.randomUUID();
  s.checkout_intent_id = crypto.randomUUID();
  f.sub.metadata.kxra_live_intent_id = s.checkout_intent_id;
  f.session.client_reference_id = s.checkout_intent_id;
  const providerId = (prefix: string) =>
    `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
  s.customer_id = providerId("cus");
  s.subscription_id = providerId("sub");
  s.checkout_session_id = `cs_${mode === "LIVE" ? "live" : "test"}_${crypto.randomBytes(12).toString("hex")}`;
  f.sub.id = s.subscription_id;
  f.sub.customer = s.customer_id;
  f.sub.latest_invoice = providerId("in");
  f.sub.items.data[0].id = providerId("si");
  f.invoice.id = f.sub.latest_invoice;
  f.invoice.customer = s.customer_id;
  f.invoice.parent.subscription_details.subscription = s.subscription_id;
  f.invoice.lines.data[0].invoice = f.invoice.id;
  f.invoice.lines.data[0].parent.subscription_item_details.subscription =
    s.subscription_id;
  f.invoice.lines.data[0].parent.subscription_item_details.subscription_item =
    f.sub.items.data[0].id;
  f.payments.data[0].invoice = f.invoice.id;
  f.pi.id = providerId("pi");
  f.payments.data[0].payment.payment_intent = f.pi.id;
  f.pi.customer = s.customer_id;
  f.charge.id = providerId("ch");
  f.charge.customer = s.customer_id;
  f.charge.payment_intent = f.pi.id;
  f.pi.latest_charge = f.charge.id;
  f.session.id = s.checkout_session_id;
  f.session.customer = s.customer_id;
  f.session.subscription = s.subscription_id;

  const scope = f.options.execution.execution_scope,
    prefix = mode === "LIVE" ? "" : "staging_sandbox_";
  const query = async (text: string, values: unknown[] = []) => {
    const client = new pg.Client({ ...conn, user: "kxra_billing_runner" });
    await client.connect();
    try {
      await client.query("begin");
      await client.query("set local role kxra_billing_worker");
      await client.query("set local statement_timeout='5s'");
      await client.query("set local lock_timeout='1s'");
      const r = await client.query(text, values);
      await client.query("commit");
      return r;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      await client.end();
    }
  };
  const value = async (text: string, values: unknown[] = []) =>
    (await query(text, values)).rows[0]?.value;
  const originalProof = async () =>
    (
      await admin.query(
        "select to_jsonb(p) value from kxra_private.live_paid_access p where org_id=$1",
        [s.org_id],
      )
    ).rows[0]?.value;
  try {
    const identity = (
      await admin.query(
        "select session_user,current_user,current_database() db,current_setting('listen_addresses') listen,current_setting('unix_socket_directories') socket",
      )
    ).rows[0];
    assert.equal(identity.session_user, os.userInfo().username);
    assert.equal(identity.current_user, identity.session_user);
    assert.equal(identity.db, cfg.database);
    assert.equal(identity.listen, "");
    assert.equal(fs.realpathSync(identity.socket), cfg.host);
    // The coordinated harness installs the unnumbered proposal first. Never
    // skip this test or silently bypass a missing candidate schema.
    assert.ok(
      (
        await admin.query(
          "select to_regclass('kxra_private.reduced_billing_shadow_jobs') present",
        )
      ).rows[0].present,
    );
    await admin.query("begin");
    await bindSyntheticModernScope(admin.query.bind(admin), mode);
    assert.equal(
      (
        await admin.query(
          "select count(*)::integer n from pg_roles where rolname='kxra_billing_runner'",
        )
      ).rows[0].n,
      0,
    );
    await admin.query(
      "create role kxra_billing_runner login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 3",
    );
    await admin.query("grant kxra_billing_worker to kxra_billing_runner");
    ownedRole = true;
    await admin.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic reduced shadow',$2)",
      [s.org_id, `shadow-${s.org_id}`],
    );
    await admin.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
      [s.actor_id, `shadow-${s.actor_id}`],
    );
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic shadow','LOCAL_SHADOW_TEST')",
      [s.org_id, s.actor_id],
    );
    const revision = (
      await admin.query(
        "select coalesce(max(revision),0)+1 n from kxra_private.live_billing_mappings where offer_key=$1",
        [s.offer_key],
      )
    ).rows[0].n;
    await admin.query(
      "update kxra_private.live_billing_mappings set enabled=false where enabled",
    );
    await admin.query(
      "insert into kxra_private.live_billing_mappings(offer_key,revision,enabled,mode,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method) values($1,$2,true,$3,$4,$5,$6,'bpc_syntheticShadow',$7,$7,$7,'inclusive',false,'card')",
      [
        s.offer_key,
        revision,
        scope.livemode ? "live" : "staging_sandbox",
        scope.account_id,
        s.mapping.price_id,
        s.mapping.product_id,
        h,
      ],
    );
    await admin.query(
      "insert into kxra_private.live_billing_bindings(org_id,customer_id,subscription_id,offer_key,mapping_revision) values($1,$2,$3,$4,$5)",
      [s.org_id, s.customer_id, s.subscription_id, s.offer_key, revision],
    );
    const seeded = await seedSyntheticAdmissionTerms(admin.query.bind(admin), {
      org_id: s.org_id,
      content,
    });
    await seedReviewedBusinessFixture(admin.query.bind(admin), {
      org_id: s.org_id,
      actor_id: s.actor_id,
    });
    const p = (
      await admin.query(
        "select * from kxra_private.live_paid_policies where id=$1",
        [seeded.policy],
      )
    ).rows[0];
    f.sub.metadata.kxra_mapping_revision = String(revision);
    f.sub.metadata.kxra_consent_presentation_sha256 = p.presentation_sha256;
    f.session.custom_text.terms_of_service_acceptance.message = p.message;
    await admin.query(
      "insert into kxra_private.live_billing_intents(id,org_id,actor_id,kind,state,customer_id,offer_key,mapping_revision,terms_review_sha256,observed_version,auth_time,created_at,expires_at,consumed_at,provider_session_id,result_sha256) values($1,$2,$3,'CHECKOUT','CONSUMED',$4,$5,$6,$7,0,now()-interval '1 hour',now()-interval '1 hour',now()-interval '40 minutes',now()-interval '59 minutes',$8,$7)",
      [
        s.checkout_intent_id,
        s.org_id,
        s.actor_id,
        s.customer_id,
        s.offer_key,
        revision,
        h,
        s.checkout_session_id,
      ],
    );
    await admin.query(
      "update kxra_private.live_billing_bindings set checkout_intent_id=$2 where org_id=$1",
      [s.org_id, s.checkout_intent_id],
    );
    await admin.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1 where singleton",
      [h],
    );
    await admin.query("commit");
    const initial = await runPaidRefreshOnce({
      ...f.options,
      query,
      nowSeconds: () => Math.floor(Date.now() / 1000),
    });
    assert.equal(
      initial.outcomes[0].outcome,
      "ELIGIBLE",
      JSON.stringify({
        initial,
        paths: f.calls.map((u) => new URL(u).pathname),
        receipts: (
          await admin.query(
            "select outcome,safe_evidence->>'reason' reason from kxra_private.live_paid_receipts where org_id=$1",
            [s.org_id],
          )
        ).rows,
      }),
    );
    assert.equal(f.calls.length, 20);
    const baseline = await originalProof();
    assert.ok(baseline);
    const options = {
      ...f.options,
      query,
      readReview: h,
      readCeiling: 10000,
      nowSeconds: () => Math.floor(Date.now() / 1000),
    };
    f.calls.length = 0;
    assert.equal(
      (await runReducedBillingShadowOnce(options)).reads,
      0,
      "DB default-off",
    );
    await admin.query(
      "insert into kxra_private.reduced_billing_shadow_config(scope_id,enabled,review_sha256,read_review_sha256,read_ceiling) values($1,true,$2,$2,10000) on conflict(scope_id) do update set enabled=true where reduced_billing_shadow_config.review_sha256=excluded.review_sha256",
      [scope.scope_id, h],
    );
    await admin.query(
      "insert into kxra_private.modern_scheduler_read_budgets(scope_id,period_start,enabled,review_sha256,limit_reads,expires_at) values($1,date_trunc('month',now() at time zone 'UTC')::date,true,$2,10000,date_trunc('month',now())+interval '1 month') on conflict(scope_id,period_start) do update set enabled=true,review_sha256=excluded.review_sha256,limit_reads=10000,expires_at=excluded.expires_at",
      [scope.scope_id, h],
    );
    const reduced = await runReducedBillingShadowOnce(options);
    assert.equal(reduced.collected, 1);
    assert.equal(reduced.reads, 7);
    await assert.rejects(
      admin.query(
        "update kxra_private.reduced_billing_consents set source_sha256=$2 where org_id=$1",
        [s.org_id, "0".repeat(64)],
      ),
    );
    assert.equal(f.calls.length, 7);
    assert.deepEqual(
      await originalProof(),
      baseline,
      "Shadow must not renew or rewrite production access",
    );
    assert.equal(
      (
        await admin.query(
          "select count(*)::integer n from kxra_private.reduced_billing_consents where org_id=$1",
          [s.org_id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (await runReducedBillingShadowOnce(options)).reads,
      0,
      "Not due: no unconditional repeated GETs",
    );
    const secret = "whsec_SYNTHETIC_NOT_A_CREDENTIAL_0000000000000000",
      origin = "https://kxra.example";
    let failCommit = false;
    const ports = {
      configuration: () => ({
        ...f.options,
        project: scope.project_ref,
        origin,
        secret,
        account_id: scope.account_id,
      }),
      record: async (e: unknown) => {
        if (!failCommit)
          return value(
            `select kxra_private.${prefix}record_live_billing_wakeup($1::jsonb) value`,
            [JSON.stringify(e)],
          );
        const client = new pg.Client({ ...conn, user: "kxra_billing_runner" });
        await client.connect();
        try {
          await client.query("begin");
          await client.query("set local role kxra_billing_worker");
          await client.query(
            `select kxra_private.${prefix}record_live_billing_wakeup($1::jsonb)`,
            [JSON.stringify(e)],
          );
          throw Error("SYNTHETIC_COMMIT_FAILURE");
        } finally {
          await client.query("rollback");
          await client.end();
        }
      },
    };
    const handler =
      mode === "LIVE"
        ? createLiveWebhookHandler(ports)
        : createStagingSandboxWebhookHandler(ports);
    await admin.query(
      "update kxra_private.live_webhook_endpoint_binding set enabled=true,project_ref=$1,review_sha256=$2 where singleton",
      [scope.project_ref, h],
    );
    const createdTimes = new Map<string, number>();
    const send = async (
      id: string,
      created = Math.floor(Date.now() / 1000),
    ) => {
      created = createdTimes.get(id) ?? created;
      createdTimes.set(id, created);
      const time = Math.floor(Date.now() / 1000),
        raw = JSON.stringify({
          id,
          object: "event",
          type: "customer.subscription.updated",
          created,
          api_version: scope.api_version,
          livemode: scope.livemode,
          account: scope.account_id,
          data: { object: f.sub },
        });
      const mac = crypto
        .createHmac("sha256", secret)
        .update(`${time}.${raw}`)
        .digest("hex");
      return handler(
        new Request(
          `${origin}/api/webhooks/${scope.livemode ? "workspace-live" : "workspace-sandbox"}`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "stripe-signature": `t=${time},v1=${mac}`,
            },
            body: raw,
          },
        ),
      );
    };
    failCommit = true;
    assert.equal((await send("evt_shadowRollback")).status, 503);
    assert.equal(
      (
        await admin.query(
          "select count(*)::integer n from kxra_private.live_webhook_receipts where event_id='evt_shadowRollback'",
        )
      ).rows[0].n,
      0,
    );
    failCommit = false;
    assert.equal((await send("evt_shadowRollback")).status, 200);
    const version = (
      await admin.query(
        "select version from kxra_private.live_billing_bindings where org_id=$1",
        [s.org_id],
      )
    ).rows[0].version;
    assert.equal((await send("evt_shadowRollback")).status, 200);
    assert.equal(
      (
        await admin.query(
          "select version from kxra_private.live_billing_bindings where org_id=$1",
          [s.org_id],
        )
      ).rows[0].version,
      version,
    );
    assert.equal(
      (
        await admin.query(
          "select kxra_private.pilot_entitled($1::uuid) value",
          [s.org_id],
        )
      ).rows[0].value,
      false,
      "Known event invalidates original revision immediately",
    );
    await send("evt_shadowReordered", Math.floor(Date.now() / 1000) - 30);
    const racers = await Promise.all([
      query(
        "select value from kxra_private.claim_reduced_billing_shadow(1,$1) value",
        [mode],
      ),
      query(
        "select value from kxra_private.claim_reduced_billing_shadow(1,$1) value",
        [mode],
      ),
    ]);
    assert.equal(
      racers[0].rowCount! + racers[1].rowCount!,
      1,
      "One durable coalesced claim across real connections",
    );
    const claim = [...racers[0].rows, ...racers[1].rows][0].value;
    assert.equal(
      (
        await admin.query(
          "select count(*)::integer n from kxra_private.reduced_billing_shadow_jobs where org_id=$1",
          [s.org_id],
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      await value(
        "select kxra_private.reduced_billing_shadow_current($1,$2,$3) value",
        [crypto.randomUUID(), claim.subject.claim_token, mode],
      ),
      false,
      "Foreign workspace cannot borrow a claim token",
    );
    await admin.query(
      "update kxra.account_identities set state='SUSPENDED' where account_id=$1",
      [s.actor_id],
    );
    assert.equal(
      await value(
        "select kxra_private.reduced_billing_shadow_current($1,$2,$3) value",
        [s.org_id, claim.subject.claim_token, mode],
      ),
      false,
    );
    await admin.query(
      "update kxra.account_identities set state='ACTIVE' where account_id=$1",
      [s.actor_id],
    );
    await send("evt_shadowSuperseded");
    assert.equal(
      await value(
        "select kxra_private.reduced_billing_shadow_current($1,$2,$3) value",
        [s.org_id, claim.subject.claim_token, mode],
      ),
      false,
    );
    const failed = await runReducedBillingShadowOnce({
      ...options,
      transport: async () =>
        new Response("SYNTHETIC_PRIVATE", {
          status: 429,
          headers: { "retry-after": "3600" },
        }),
    });
    assert.equal(failed.unverified, 1);
    assert.equal(failed.reads, 1);
    const retry = (
      await admin.query(
        "select state,extract(epoch from next_attempt_at-now()) seconds from kxra_private.reduced_billing_shadow_jobs where org_id=$1",
        [s.org_id],
      )
    ).rows[0];
    assert.equal(retry.state, "PENDING");
    assert.ok(Number(retry.seconds) > 3500 && Number(retry.seconds) <= 3600);
    await admin.query(
      "update kxra_private.reduced_billing_shadow_jobs set state='CLAIMED',attempts=5,lease_until=now()-interval '1 second',next_attempt_at=now()-interval '1 second' where org_id=$1",
      [s.org_id],
    );
    assert.equal(
      (
        await query(
          "select value from kxra_private.claim_reduced_billing_shadow(1,$1) value",
          [mode],
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await admin.query(
          "select state from kxra_private.reduced_billing_shadow_jobs where org_id=$1",
          [s.org_id],
        )
      ).rows[0].state,
      "DEAD",
      "Five crashed attempts reach durable operator-held state",
    );
    assert.deepEqual(await originalProof(), baseline);
    await assert.rejects(
      value(
        "select value from kxra_private.claim_reduced_billing_shadow(1,$1) value",
        [mode === "LIVE" ? "STAGING_SANDBOX" : "LIVE"],
      ),
    );
    await admin.query("set role authenticated");
    await assert.rejects(
      admin.query("select * from kxra_private.reduced_billing_consents"),
      { code: "42501" },
    );
    await admin.query("reset role");
  } finally {
    try {
      await admin.query("rollback").catch(() => {});
      await admin.query("reset role").catch(() => {});
      if (
        ownedRole &&
        (
          await admin.query(
            "select 1 from pg_roles where rolname='kxra_billing_runner'",
          )
        ).rowCount
      ) {
        await admin.query(
          "update kxra_private.live_billing_activation set enabled=false where singleton",
        );
        await admin.query(
          "update kxra_private.live_webhook_endpoint_binding set enabled=false where singleton",
        );
        await admin.query(
          "update kxra_private.reduced_billing_shadow_config set enabled=false",
        );
        await admin.query(
          "update kxra_private.live_billing_mappings set enabled=false where enabled",
        );
        await admin.query("drop role kxra_billing_runner");
      }
    } finally {
      await admin.end();
    }
  }
});
