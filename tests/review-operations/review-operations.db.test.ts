import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import pg from "pg";
import { seedAiResumeFixture } from "../support/ai-resume-fixture";
import {
  parseReviewDetail,
  parseReviewQueue,
  parseReviewReceipt,
} from "../../packages/review-operations/public";
import { fixtureUsers } from "../../packages/authz/session";
const uuid = () => crypto.randomUUID();
test("independent business and AI operator decisions use exact current scope with durable receipts", async (t) => {
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  assert.match(
    runtime,
    /^\/(?:private\/)?tmp\/kxra-ro-[a-zA-Z0-9]+\/\.runtime\/review-operations$/,
  );
  assert.equal(process.env.KXRA_AUTH_MODE, "fixture");
  assert.ok(!process.env.DATABASE_URL && !process.env.VERCEL_ENV);
  const cfg = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.ok(!cfg.password && !cfg.ssl && !cfg.connectionString);
  const admin = new pg.Client({ ...cfg, user: os.userInfo().username });
  await admin.connect();
  const operator = fixtureUsers.owner,
    platform = "10000000-0000-4000-8000-000000000001";
  const created: pg.Client[] = [];
  async function connection(who = operator, org = platform, sv = 1, age = 0) {
    const c = new pg.Client(cfg);
    created.push(c);
    await c.connect();
    await c.query("begin");
    await c.query("set local statement_timeout='5s'");
    await c.query("set local role authenticated");
    await c.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true),set_config('request.kxra.execution_mode','hosted',true)",
      [
        who,
        org,
        JSON.stringify({
          sub: who,
          aal: "aal2",
          session_version: sv,
          auth_time: Math.floor(Date.now() / 1000) - age,
        }),
      ],
    );
    return c;
  }
  async function done(c: pg.Client, commit = false) {
    try {
      await c.query(commit ? "commit" : "rollback");
    } finally {
      await c.end();
      created.splice(created.indexOf(c), 1);
    }
  }
  let f: Awaited<ReturnType<typeof seedAiResumeFixture>>;
  let businessGrant = "",
    aiGrant = "";
  const receipts: any[] = [];
  async function command(
    action: string,
    input: unknown = {},
    who = operator,
    org = platform,
    sv = 1,
    age = 0,
  ) {
    const c = await connection(who, org, sv, age);
    try {
      const value = (
        await c.query("select kxra.review_operations($1,$2::jsonb,$3) value", [
          action,
          JSON.stringify(input),
          f.review,
        ])
      ).rows[0].value;
      await done(c, true);
      return value;
    } catch (e) {
      await done(c);
      throw e;
    }
  }
  async function grant(kind: string, reviewer = operator, withdraw = true) {
    return (
      await admin.query(
        "insert into kxra_private.review_operator_grants(platform_org_id,reviewer_id,session_version,target_org_id,kind,provider,policy_id,can_withdraw,max_valid_seconds,owner_review_reference,valid_from,valid_until) values($1,$2,1,$3,$4,'OPENAI',$5,$6,3600,'SYNTHETIC_REVIEW_POLICY_NOT_APPROVAL',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour') returning id",
        [platform, reviewer, f.org, kind, f.eligibilityPolicy, withdraw],
      )
    ).rows[0].id;
  }
  const expiry = () => new Date(Date.now() + 300_000).toISOString();
  const businessDecision = () => ({
    expires_at: expiry(),
    legal_status: "CLEARED",
    payment_status: "CLEARED",
    provider_status: "CLEARED",
    tax_status: "CLEARED",
    legal_evidence_sha256: f.review,
    payment_evidence_sha256: f.review,
    provider_evidence_sha256: f.review,
    tax_evidence_sha256: f.review,
  });
  const aiDecision = () => ({
    expires_at: expiry(),
    state: "ELIGIBLE",
    account_mode: "CUSTOMER_BILLED",
    account_reference_sha256: f.review,
    provider_evidence_sha256: f.review,
  });
  async function newDeclaration() {
    const id = uuid();
    await admin.query(
      "insert into kxra_private.business_declarations(id,org_id,actor_id,legal_name,country,region,provider,business_use,authorised,provider_costs,declaration_version) values($1,$2,$3,'Synthetic operator-reviewed customer','NZ','Auckland','OPENAI',true,true,true,'business-byok-v1')",
      [id, f.org, f.actor],
    );
    return id;
  }
  async function open(kind: string, subject_id: string, who = operator) {
    return parseReviewDetail(await command("OPEN", { kind, subject_id }, who));
  }
  async function record(d: any, decision: any, id = uuid(), who = operator) {
    const cmd = {
      request_id: d.request_id,
      operation_id: id,
      decision,
      attested: true,
    };
    const r = parseReviewReceipt(await command("DECIDE", cmd, who));
    receipts.push(r);
    return { cmd, receipt: r };
  }
  try {
    assert.equal(
      fs.realpathSync(
        (await admin.query("show data_directory")).rows[0].data_directory,
      ),
      path.join(runtime, "postgres"),
    );
    assert.equal(
      (await admin.query("show listen_addresses")).rows[0].listen_addresses,
      "",
    );
    await admin.query("begin");
    f = await seedAiResumeFixture(admin, false);
    await admin.query("commit");
    await t.test(
      "no default grant, customer/staff/self/stale-MFA/session and foreign-context requests grant nothing",
      async () => {
        assert.deepEqual(parseReviewQueue(await command("LIST")), {
          items: [],
          next_cursor: null,
        });
        await assert.rejects(command("LIST", {}, f.actor, f.org), {
          code: "42501",
        });
        businessGrant = await grant("BUSINESS");
        aiGrant = await grant("AI");
        assert.deepEqual(
          parseReviewQueue(await command("LIST", {}, operator, platform, 2)),
          { items: [], next_cursor: null },
        );
      },
    );
    // An unavailable session-specific grant yields an empty queue, never authority.
    await t.test(
      "queue is scoped, projected and paginated; missing/stale identity cannot open subjects",
      async () => {
        const q = parseReviewQueue(await command("LIST"));
        assert.ok(q.items.some((i) => i.subject_id === f.declaration));
        for (const text of [
          "fingerprint",
          "encrypted_key",
          "customer_id",
          "scope_id",
          "provider_evidence_sha256",
        ])
          assert.ok(!JSON.stringify(q).includes(text));
        await assert.rejects(
          command(
            "OPEN",
            { kind: "BUSINESS", subject_id: f.declaration },
            operator,
            platform,
            2,
          ),
          { code: "42501" },
        );
        await assert.rejects(
          command(
            "OPEN",
            { kind: "BUSINESS", subject_id: f.declaration },
            operator,
            platform,
            1,
            901,
          ),
          { code: "42501" },
        );
        await assert.rejects(
          command("OPEN", { kind: "BUSINESS", subject_id: uuid() }),
          { code: "42501" },
        );
        await assert.rejects(
          command("OPEN", {
            kind: "BUSINESS",
            subject_id: f.declaration,
            target_org_id: f.org,
          }),
        );
      },
    );
    let declared = "";
    await t.test(
      "an independent operator records real business review; exact replay is one row, altered payload conflicts",
      async () => {
        declared = await newDeclaration();
        assert.equal(
          (await f.appCall("select kxra.business_admission_status() value"))
            .state,
          "REVIEW_REQUIRED",
        );
        const d = await open("BUSINESS", declared);
        assert.equal(d.request_current, true);
        assert.equal(d.can_decide, true);
        const decision = businessDecision(),
          { cmd, receipt } = await record(d, decision);
        assert.equal(receipt.state, "ELIGIBLE");
        assert.equal(
          (await f.appCall("select kxra.business_admission_status() value"))
            .state,
          "ELIGIBLE",
        );
        assert.deepEqual(
          parseReviewReceipt(await command("DECIDE", cmd)),
          receipt,
        );
        await assert.rejects(
          command("DECIDE", {
            ...cmd,
            decision: { ...decision, provider_status: "BLOCKED" },
          }),
        );
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from kxra_private.review_operation_receipts where request_id=$1",
              [d.request_id],
            )
          ).rows[0].n,
          1,
        );
        const view = parseReviewDetail(
          await command("VIEW", { request_id: d.request_id }),
        );
        assert.equal(view.request_current, false);
        assert.equal(view.receipt?.operation_id, receipt.operation_id);
      },
    );
    await t.test(
      "provider-bound AI review advances the customer intent and withdrawal revokes existing run authority",
      async () => {
        const id = uuid();
        await f.register(id);
        const d = await open("AI", id);
        assert.equal(d.can_decide, true);
        await record(d, aiDecision());
        assert.equal((await f.register(id)).state, "ELIGIBLE");
        await admin.query(
          "update kxra_private.live_paid_access set checked_at=clock_timestamp(),valid_until=clock_timestamp()+interval '45 seconds' where org_id=$1",
          [f.org],
        );
        await f.save(id);
        const run = await f.start(id);
        assert.equal(await f.gate(run.run), true);
        const withdrawal = await open("AI", id);
        assert.equal(withdrawal.can_decide, false);
        assert.equal(withdrawal.can_withdraw, true);
        const r = parseReviewReceipt(
          await command("WITHDRAW", {
            request_id: withdrawal.request_id,
            operation_id: uuid(),
            decision: {},
            attested: true,
          }),
        );
        assert.equal(r.state, "WITHDRAWN");
        assert.equal(await f.gate(run.run), false);
      },
    );
    await t.test(
      "new declarations invalidate frozen requests while historical receipts stay recoverable without regrant",
      async () => {
        const d = await open("BUSINESS", declared);
        const newer = await newDeclaration();
        await assert.rejects(record(d, businessDecision()));
        const view = parseReviewDetail(
          await command("VIEW", { request_id: d.request_id }),
        );
        assert.equal(view.request_current, false);
        const current = await open("BUSINESS", newer);
        await record(current, businessDecision());
        declared = newer;
      },
    );
    await t.test(
      "revoked grants, policy drift and target session drift stop pending decisions before a receipt",
      async () => {
        const id = uuid();
        await f.register(id);
        const d = await open("AI", id);
        await admin.query(
          "update kxra_private.review_operator_grants set revoked_at=clock_timestamp() where id=$1",
          [aiGrant],
        );
        await assert.rejects(record(d, aiDecision()), { code: "42501" });
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from kxra_private.review_operation_receipts where request_id=$1",
              [d.request_id],
            )
          ).rows[0].n,
          0,
        );
        aiGrant = await grant("AI");
        const fresh = await open("AI", id);
        await admin.query(
          "update kxra_private.business_eligibility_policies set enabled=false where id=$1",
          [f.eligibilityPolicy],
        );
        await assert.rejects(record(fresh, aiDecision()), { code: "42501" });
        await admin.query(
          "update kxra_private.business_eligibility_policies set enabled=true where id=$1",
          [f.eligibilityPolicy],
        );
        const renewed = await open("AI", id);
        await admin.query(
          "update kxra.account_identities set session_version=session_version+1 where account_id=$1",
          [f.actor],
        );
        await assert.rejects(record(renewed, aiDecision()));
        await admin.query(
          "update kxra.account_identities set session_version=session_version+1 where account_id=$1",
          [f.actor],
        );
      },
    );
    await t.test(
      "private grants, contexts, snapshots and receipts are inaccessible to customers and workers",
      async () => {
        for (const role of [
          "authenticated",
          "anon",
          "kxra_billing_worker",
          "kxra_ai_worker",
        ]) {
          const c = new pg.Client({ ...cfg, user: os.userInfo().username });
          await c.connect();
          try {
            await c.query("begin");
            await c.query("set local role " + role);
            await assert.rejects(
              c.query("select * from kxra_private.review_operator_grants"),
              { code: "42501" },
            );
            await c.query("rollback");
            await c.query("begin");
            await c.query("set local role " + role);
            await assert.rejects(
              c.query("select kxra_private.review_subject_context($1,$2)", [
                businessGrant,
                declared,
              ]),
              { code: "42501" },
            );
          } finally {
            await c.query("rollback");
            await c.end();
          }
        }
      },
    );
    // Prepare a fresh customer for actual browser operations; prior grants remain isolated by their exact target.
    await admin.query("begin");
    const browser = await seedAiResumeFixture(admin, false);
    await admin.query("commit");
    f = browser;
    businessGrant = await grant("BUSINESS");
    aiGrant = await grant("AI");
    const browserDeclaration = await newDeclaration();
    fs.writeFileSync(
      path.join(runtime, "browser-fixture.json"),
      JSON.stringify({
        platform,
        operator,
        customer: f.actor,
        org: f.org,
        businessGrant,
        aiGrant,
        declaration: browserDeclaration,
        policy: f.eligibilityPolicy,
        policySha: f.review,
        ep: f.ep,
        fingerprint: f.fingerprint,
        cipher: f.cipher,
      }) + "\n",
      { mode: 0o600 },
    );
    fs.writeFileSync(
      path.join(runtime, "native-receipts.json"),
      JSON.stringify(receipts, null, 2) + "\n",
      { mode: 0o600 },
    );
    console.log("REVIEW_OPERATIONS_NATIVE_PASS");
  } finally {
    for (const c of created) {
      try {
        await c.query("rollback");
      } catch {}
      await c.end();
    }
    await admin.query("rollback");
    await admin.end();
  }
});
