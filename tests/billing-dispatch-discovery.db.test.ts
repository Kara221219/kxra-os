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

// Automatic native SOURCE, unexecuted by its author. First case rolls back;
// second leaves owned synthetic rows for disposable-cluster teardown.
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
// Automatic local-only SOURCE. Owner runs selected LIVE and STAGING_SANDBOX fixtures separately.
const selectedMode = () => {
  const value = process.env.KXRA_MODERN_BILLING_TEST_MODE;
  assert.ok([undefined, "LIVE", "STAGING_SANDBOX"].includes(value));
  return value === "STAGING_SANDBOX"
    ? ("STAGING_SANDBOX" as const)
    : ("LIVE" as const);
};
test("0112 eligibility before LIMIT, checked policy digest and worker-only discovery", async () => {
  const db = new pg.Client(configuration());
  await db.connect();
  const uuid = () => crypto.randomUUID(),
    sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
  const org = uuid(),
    actor = uuid(),
    request = uuid(),
    doc = uuid(),
    policy = uuid(),
    review = sha("SYNTHETIC_NOT_APPROVED"),
    content = 'SYNTHETIC terms £ with "quotes"',
    termsHash = sha(content),
    mode = selectedMode(),
    prefix = mode === "LIVE" ? "" : "staging_sandbox_";
  const discover = `select value from kxra_private.${prefix}discover_billing_dispatch($1,$2) rows(value)`;
  const getter = `select kxra_private.${prefix}live_checkout_dispatch_presentation($1) value`;
  async function worker(sql: string, values: unknown[] = []) {
    await db.query("set local role kxra_billing_worker");
    try {
      return await db.query(sql, values);
    } finally {
      await db.query("reset role");
    }
  }
  try {
    await db.query("begin");
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
    await db.query(
      "update kxra_private.live_billing_mappings set enabled=false where enabled",
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

    const found = (await worker(discover, [20, origin])).rows.map(
      (r) => r.value,
    );
    assert.ok(
      found.some((r) => r.request_id === request && r.action === "CHECKOUT"),
    );
    // Current SQL digest must match the exact JS presentation with quotes, £ and newline.
    const fancy = {
      ...terms,
      message: `SYNTHETIC £ "quoted"\n[terms](${terms.terms_url})`,
    };
    await db.query("savepoint presentation_variant");
    // Policy immutable wording: use a separate policy revision, never rewrite accepted content.
    await db.query(
      "update kxra_private.live_paid_policies set enabled=false where id=$1",
      [policy],
    );
    const variant = uuid();
    await db.query(
      `insert into kxra_private.live_paid_policies select (jsonb_populate_record(null::kxra_private.live_paid_policies,to_jsonb(p)||jsonb_build_object('id',$2::uuid,'revision',2,'enabled',true,'message',$3::text,'presentation_sha256',$4::text))).* from kxra_private.live_paid_policies p where id=$1`,
      [policy, variant, fancy.message, checkoutTermsPresentationDigest(fancy)],
    );
    assert.ok(
      (await worker(discover, [20, origin])).rows.some(
        (r) => r.value.request_id === request,
      ),
    );
    await db.query("rollback to savepoint presentation_variant");
    // Old invalid CUSTOMER heads must be filtered before a small LIMIT.
    const invalids: string[] = [];
    for (const reason of [
      "expired",
      "stale",
      "revoked",
      "disabled",
      "inflight",
      "uncertain",
    ]) {
      const o = uuid(),
        a = uuid(),
        i = uuid();
      invalids.push(i);
      await db.query(
        "insert into kxra.organisations(id,name,slug) values($1,'Synthetic discovery invalid',$2)",
        [o, `synthetic-discovery-${o}`],
      );
      await db.query(
        "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
        [a, `synthetic-${a}`],
      );
      await db.query(
        "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic','LOCAL_DISCOVERY_TEST')",
        [o, a],
      );
      await db.query(
        `insert into kxra_private.live_customer_intents(id,org_id,actor_id,offer_key,mapping_revision,terms_review_sha256,auth_time,created_at,expires_at,state,consumed_at) values($1,$2,$3,$4,$5,$6,now()-($7::integer*interval '1 minute'),now()-interval '4 minutes',now()+($8::integer*interval '1 second'),$9,case when $9='REQUESTED' then null else now() end)`,
        [
          i,
          o,
          a,
          row.offer_key,
          revision,
          termsHash,
          reason === "stale" ? 16 : 0,
          reason === "expired" ? -1 : 30,
          reason === "inflight"
            ? "INFLIGHT"
            : reason === "uncertain"
              ? "UNCERTAIN"
              : "REQUESTED",
        ],
      );
      if (reason === "revoked")
        await db.query(
          "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where account_id=$1",
          [a],
        );
      if (reason === "disabled")
        await db.query(
          "update kxra.account_identities set state='SUSPENDED' where account_id=$1",
          [a],
        );
    }
    const small = (await worker(discover, [1, origin])).rows.map(
      (r) => r.value,
    );
    assert.equal(small.length, 1);
    assert.ok(!invalids.includes(small[0].request_id));
    assert.ok(
      !(await worker(discover, [20, origin])).rows.some((r) =>
        invalids.includes(r.value.request_id),
      ),
    );
    for (const mutate of [
      [
        "update kxra_private.live_billing_mappings set enabled=false where offer_key=$1 and revision=$2",
        [row.offer_key, revision],
      ],
      [
        "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where account_id=$1",
        [actor],
      ],
      [
        "update kxra.legal_documents set status='RETIRED',retired_at=now() where id=$1",
        [doc],
      ],
      [
        "update kxra_private.live_billing_bindings set version=version+1 where org_id=$1",
        [org],
      ],
    ] as const) {
      await db.query("savepoint changed");
      await db.query(mutate[0], [...mutate[1]]);
      assert.ok(
        !(await worker(discover, [20, origin])).rows.some(
          (r) => r.value.request_id === request,
        ),
      );
      await db.query("rollback to savepoint changed");
    }

    await db.query("savepoint legal_missing");
    await db.query(
      `insert into kxra.legal_document_requirements(org_id,document_id,document_version,document_sha256,mandatory,state,acceptance_wording,acceptance_wording_version,acceptance_wording_sha256,effective_at) values($1,$2,1,$3,true,'ACTIVE','SYNTHETIC acceptance required',1,$4,now())`,
      [org, doc, termsHash, sha("SYNTHETIC acceptance required")],
    );
    assert.ok(
      !(await worker(discover, [20, origin])).rows.some(
        (r) => r.value.request_id === request,
      ),
    );
    await db.query("rollback to savepoint legal_missing");
    await worker(`select kxra_private.${prefix}claim_live_billing_intent($1)`, [
      request,
    ]);
    assert.ok(
      !(await worker(discover, [20, origin])).rows.some(
        (r) => r.value.request_id === request,
      ),
    );
    await worker(
      `select kxra_private.${prefix}finish_live_billing_intent($1,'UNCERTAIN',null,$2)`,
      [request, sha("synthetic uncertain pending checkout")],
    );
    assert.ok(
      !(await worker(discover, [20, origin])).rows.some(
        (r) => r.value.request_id === request,
      ),
    );
    for (const role of ["anon", "authenticated", "kxra_billing_worker"]) {
      await db.query("savepoint acl");
      await db.query(`set local role ${role}`);
      await assert.rejects(
        db.query(
          role === "kxra_billing_worker"
            ? "select kxra_private.modern_core_discover_billing_dispatch(1,$1)"
            : discover,
          role === "kxra_billing_worker" ? [origin] : [1, origin],
        ),
        { code: "42501" },
      );
      await db.query("rollback to savepoint acl");
    }
    await db.query("savepoint opposite_mode");
    await db.query("set local role kxra_billing_worker");
    await assert.rejects(
      db.query(
        `select * from kxra_private.${mode === "LIVE" ? "staging_sandbox_" : ""}discover_billing_dispatch(1,$1)`,
        [origin],
      ),
    );
    await db.query("rollback to savepoint opposite_mode");
  } finally {
    await db.query("rollback");
    await db.end();
  }
});

// This case COMMITs owned random synthetic rows so two real transactions can race.
// They remain only in the disposable cluster. Finally restores existing global flags;
// no immutable receipt is removed and no guard or role is changed.
test("0112 simultaneous discovery permits one canonical CUSTOMER claim", async () => {
  const cfg = configuration(),
    db = new pg.Client(cfg),
    a = new pg.Client(cfg),
    b = new pg.Client(cfg);
  await db.connect();
  await a.connect();
  await b.connect();
  const mode = selectedMode(),
    prefix = mode === "LIVE" ? "" : "staging_sandbox_",
    origin =
      mode === "LIVE"
        ? "https://app.kxra-group.com"
        : "https://kxra-os-staging.vercel.app";
  const request = crypto.randomUUID(),
    org = crypto.randomUUID(),
    actor = crypto.randomUUID(),
    review = crypto.createHash("sha256").update(request).digest("hex");
  let activation:
    { enabled: boolean; review_sha256: string | null } | undefined;
  let enabled: { offer_key: string; revision: number }[] = [];
  let owned: { offer_key: string; revision: number } | undefined;
  let aOpen = false,
    bOpen = false;
  try {
    await db.query("begin");
    const execution = await bindSyntheticModernScope(db.query.bind(db), mode),
      row = execution.catalogue[0],
      tag = execution.execution_scope;
    activation = (
      await db.query(
        "select enabled,review_sha256 from kxra_private.live_billing_activation where singleton",
      )
    ).rows[0];
    enabled = (
      await db.query(
        "select offer_key,revision from kxra_private.live_billing_mappings where enabled",
      )
    ).rows;
    await db.query(
      "update kxra_private.live_billing_mappings set enabled=false where enabled",
    );
    await db.query(
      "update kxra_private.live_billing_activation set enabled=true,review_sha256=$1 where singleton",
      [review],
    );
    const revision = (
      await db.query(
        "select coalesce(max(revision),0)+1 v from kxra_private.live_billing_mappings where offer_key=$1",
        [row.offer_key],
      )
    ).rows[0].v;
    owned = { offer_key: row.offer_key, revision };
    await db.query(
      `insert into kxra_private.live_billing_mappings(offer_key,revision,enabled,account_id,price_id,product_id,portal_configuration_id,activation_review_sha256,terms_review_sha256,tax_review_sha256,tax_behavior,automatic_tax,payment_method,mode) values($1,$2,true,$3,$4,$5,'bpc_syntheticDispatchRace',$6,$6,$6,'inclusive',false,'card',$7)`,
      [
        row.offer_key,
        revision,
        tag.account_id,
        row.price_id,
        row.product_id,
        review,
        tag.livemode ? "live" : "staging_sandbox",
      ],
    );
    await db.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic dispatch race',$2)",
      [org, `synthetic-dispatch-${org}`],
    );
    await db.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$2,'ACTIVE',now())",
      [actor, `synthetic-${actor}`],
    );
    await db.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic race','LOCAL_DISPATCH_TEST')",
      [org, actor],
    );
    await db.query(
      "insert into kxra_private.live_customer_intents(id,org_id,actor_id,offer_key,mapping_revision,terms_review_sha256,auth_time) values($1,$2,$3,$4,$5,$6,now())",
      [request, org, actor, row.offer_key, revision, review],
    );
    await db.query("commit");
    await a.query(
      "begin;set local statement_timeout='5s';set local role kxra_billing_worker",
    );
    aOpen = true;
    await b.query(
      "begin;set local statement_timeout='5s';set local role kxra_billing_worker",
    );
    bOpen = true;
    const discovery = `select value from kxra_private.${prefix}discover_billing_dispatch(20,$1) rows(value)`;
    for (const connection of [a, b])
      assert.ok(
        (await connection.query(discovery, [origin])).rows.some(
          (r) => r.value.request_id === request,
        ),
      );
    const claim = `select kxra_private.${prefix}claim_live_customer_intent($1) value`;
    const first = (await a.query(claim, [request])).rows[0].value;
    assert.equal(first.intent.id, request);
    const pid = (await b.query("select pg_backend_pid() id")).rows[0].id;
    const second = b.query(claim, [request]).then(
      () => ({ accepted: true }),
      () => ({ accepted: false }),
    );
    let blocked = false;
    const until = Date.now() + 2000;
    while (Date.now() < until) {
      if (
        (
          await db.query(
            "select wait_event_type='Lock' waiting from pg_stat_activity where pid=$1",
            [pid],
          )
        ).rows[0]?.waiting
      ) {
        blocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(
      blocked,
      "Second actual transaction must wait on first canonical claim",
    );
    await a.query("commit");
    aOpen = false;
    assert.deepEqual(await second, { accepted: false });
    await b.query("rollback");
    bOpen = false;
    const stored = (
      await db.query(
        "select state,consumed_at,version from kxra_private.live_customer_intents where id=$1",
        [request],
      )
    ).rows[0];
    assert.equal(stored.state, "INFLIGHT");
    assert.ok(stored.consumed_at);
    assert.equal(stored.version, 1);
    await a.query("begin;set local role kxra_billing_worker");
    aOpen = true;
    assert.ok(
      !(await a.query(discovery, [origin])).rows.some(
        (r) => r.value.request_id === request,
      ),
    );
    await a.query("rollback");
    aOpen = false;
  } finally {
    if (aOpen) await a.query("rollback");
    if (bOpen) await b.query("rollback");
    await db.query("rollback");
    try {
      if (activation) {
        await db.query("begin");
        if (owned)
          await db.query(
            "update kxra_private.live_billing_mappings set enabled=false where offer_key=$1 and revision=$2",
            [owned.offer_key, owned.revision],
          );
        for (const row of enabled)
          await db.query(
            "update kxra_private.live_billing_mappings set enabled=true where offer_key=$1 and revision=$2",
            [row.offer_key, row.revision],
          );
        await db.query(
          "update kxra_private.live_billing_activation set enabled=$1,review_sha256=$2 where singleton",
          [activation.enabled, activation.review_sha256],
        );
        await db.query("commit");
      }
    } finally {
      await Promise.all([a.end(), b.end(), db.end()]);
    }
  }
});
