import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import util from "node:util";
import pg from "pg";
import { seedAiResumeFixture } from "../support/ai-resume-fixture";
import { githubFake } from "../support/github-production-fake";
import {
  GithubProductionOutbox,
  GithubClaim,
  type GithubAttemptRecoveryMaterial,
} from "../../packages/connectors/github-production-outbox";
import { GithubProductionExecutor } from "../../packages/connectors/github-production-transport";
import {
  githubProductionBinding,
  githubBindingDigest,
  githubCommentApprovalDigest,
  githubOperationDigest,
} from "../../packages/connectors/github-production-contracts";
const uuid = () => crypto.randomUUID(),
  sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex"),
  newToken = () => crypto.randomBytes(32).toString("base64url");
test("production SQL outbox enforces human approval, exact purpose, irreversible consumption and historical receipts", async (t) => {
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  assert.match(
    runtime,
    /^\/(?:private\/)?tmp\/kxra-gho-[A-Za-z0-9]+\/\.runtime\/github-outbox$/,
  );
  const cfg = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.ok(
    !cfg.password && !cfg.connectionString && !process.env.DATABASE_URL,
  );
  const admin = new pg.Client({ ...cfg, user: os.userInfo().username });
  await admin.connect();
  const pool = new pg.Pool({ ...cfg, max: 8 });
  const secrets = new Set<string>();
  const environment: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    KXRA_GITHUB_OUTBOX_ENABLED: "true",
  };
  const store = new GithubProductionOutbox(pool, {
    environment: () => environment,
  });
  let f: Awaited<ReturnType<typeof seedAiResumeFixture>>;
  async function refresh() {
    await admin.query(
      "update kxra_private.live_paid_access set checked_at=clock_timestamp(),valid_until=clock_timestamp()+interval '45 seconds' where org_id=$1",
      [f.org],
    );
  }
  const actor = () => ({
    id: f.actor,
    organisation_id: f.org,
    session_version: 1,
    aal: "aal2" as const,
    auth_time: Math.floor(Date.now() / 1000),
    source: "supabase" as const,
  });
  async function connection(enabled = true) {
    await refresh();
    const activation = uuid(),
      id = uuid(),
      read = newToken(),
      dispatch = newToken();
    secrets.add(read);
    secrets.add(dispatch);
    await admin.query(
      "insert into kxra_private.ghp_activations(id,enabled,review_sha256,owner_review_reference,valid_from,valid_until,receipt_ttl_seconds) values($1,$2,$3,'SYNTHETIC_NOT_POLICY_APPROVAL',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',3600)",
      [activation, enabled, f.review],
    );
    const binding = githubProductionBinding.parse({
      provider: "github",
      api_version: "2026-03-10",
      org_id: f.org,
      user_id: f.actor,
      connection_id: id,
      session_version: 1,
      grant_version: 1,
      credential_ref: "vault:github:offline-reference",
      credential_version: 1,
      app_id: 1011,
      installation_id: 1012,
      account_id: 1013,
      repository_id: 1014,
      issue_id: 1015,
      issue_number: 8,
      author_id: 1016,
      owner: "Offline-Org",
      repo: "outbox-proof",
      expires_at: new Date(Date.now() + 600000).toISOString(),
    });
    await admin.query(
      "insert into kxra_private.ghp_connections(id,org_id,user_id,activation_id,business_review_id,binding,allow_write) values($1,$2,$3,$4,$5,$6::jsonb,true)",
      [id, f.org, f.actor, activation, f.eligibility, JSON.stringify(binding)],
    );
    for (const [purpose, value] of [
      ["READ_WORKER", read],
      ["DISPATCH_WORKER", dispatch],
    ])
      await admin.query(
        "insert into kxra_private.ghp_capabilities values($1,$2,$3,null,1,1,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '9 minutes',null,'SYNTHETIC_LOCAL_WORKLOAD')",
        [sha(value), purpose, id],
      );
    return { id, activation, binding, read, dispatch };
  }
  type C = Awaited<ReturnType<typeof connection>>;
  async function prepared(c: C, note = "Synthetic exact proposal") {
    const r = await store.recordRead(c.read, sha("synthetic scoped read"));
    return (await store.human(actor(), {
      action: "PROPOSE",
      connection_id: c.id,
      write_id: uuid(),
      read_id: r.read_id,
      note,
    })) as any;
  }
  async function queued(c: C, note?: string) {
    const p = await prepared(c, note);
    const a = (await store.human(actor(), {
      action: "APPROVE",
      connection_id: c.id,
      write_id: p.write_id,
      proposal_digest: p.proposal_digest,
      attested: true,
    })) as any;
    return (await store.human(actor(), {
      action: "ENQUEUE",
      connection_id: c.id,
      write_id: p.write_id,
      approval_digest: a.approval_digest,
    })) as any;
  }
  async function claimed(c: C, custom = store) {
    const w = await queued(c);
    const h = await custom.claim(c.dispatch, w.write_id);
    assert.ok(h instanceof GithubClaim);
    await h.escrow(async (m) => {
      secrets.add(m.dispatch_token);
      secrets.add(m.receipt_token);
    });
    return h;
  }
  const input = (h: GithubClaim) => ({
    binding: h.binding,
    operation: h.operation,
    binding_sha256: githubBindingDigest(h.binding),
    operation_sha256: githubOperationDigest(h.binding, h.operation),
    scope: "issues:write" as const,
  });
  function executor(h: GithubClaim, fake = githubFake(h.binding)) {
    return {
      fake,
      e: new GithubProductionExecutor(h.binding, {
        authority: h.authority(),
        broker: fake.broker,
        request: fake.request,
        lookup: async () => [{ address: "8.8.8.8" }],
        enabled: () => true,
      }),
    };
  }
  async function preflight(e: GithubProductionExecutor) {
    assert.equal((await e.execute({ kind: "REPOSITORY" })).outcome, "READ");
    assert.equal((await e.execute({ kind: "ISSUE" })).outcome, "READ");
  }
  async function direct(
    channel: "human" | "worker" | "receipt",
    cap: string,
    sql: string,
    args: unknown[],
    who = actor(),
  ) {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role authenticated");
      await c.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.github_capability',$4,true),set_config('request.kxra.github_receipt',$5,true)",
        [
          channel === "human" ? who.id : "",
          channel === "human" ? JSON.stringify(who) : "{}",
          channel === "human" ? who.organisation_id : "",
          channel === "worker" ? cap : "",
          channel === "receipt" ? cap : "",
        ],
      );
      const value = (await c.query(sql, args)).rows[0]?.value;
      await c.query("commit");
      return value;
    } finally {
      await c.query("rollback");
      c.release();
    }
  }
  try {
    await admin.query("begin");
    f = await seedAiResumeFixture(admin, false);
    await admin.query("commit");
    environment.KXRA_GITHUB_OUTBOX_POLICY_SHA256 = f.review;
    await t.test(
      "private activation is default closed despite valid worker token; direct tables/helpers deny all app/worker roles",
      async () => {
        const c = await connection(false);
        await assert.rejects(store.readContext(c.read));
        for (const role of [
          "authenticated",
          "anon",
          "kxra_billing_worker",
          "kxra_ai_worker",
        ]) {
          await admin.query("begin");
          await admin.query("set local role " + role);
          await assert.rejects(
            admin.query("select * from kxra_private.ghp_capabilities"),
            { code: "42501" },
          );
          await admin.query("rollback");
          await admin.query("begin");
          await admin.query("set local role " + role);
          await assert.rejects(
            admin.query("select kxra_private.ghp_sha('x')"),
            { code: "42501" },
          );
          await admin.query("rollback");
        }
      },
    );
    await t.test(
      "SQL hashes match reviewed JavaScript codec including Unicode, controls and timestamp audit fields",
      async () => {
        const c = await connection();
        const context = await store.readContext(c.read);
        assert.equal(context.binding_sha256, githubBindingDigest(c.binding));
        for (const text of [
          "ascii",
          'quotes " slash \\ tab\t newline\n',
          "emoji 😀 plus \u2028 separator",
          "combining e\u0301",
        ]) {
          const p = await prepared(c, text);
          const expected = sha(
            JSON.stringify({
              binding_sha256: githubBindingDigest(c.binding),
              scope: "issues:write",
              write_id: p.write_id,
              read_id: (
                await admin.query(
                  "select read_id from kxra_private.ghp_writes where id=$1",
                  [p.write_id],
                )
              ).rows[0].read_id,
              body: p.body,
              expires_at: p.expires_at,
            }),
          );
          assert.equal(p.proposal_digest, expected);
          const a = (await store.human(actor(), {
            action: "APPROVE",
            connection_id: c.id,
            write_id: p.write_id,
            proposal_digest: p.proposal_digest,
            attested: true,
          })) as any;
          assert.equal(
            a.approval_digest,
            githubCommentApprovalDigest(c.binding, {
              write_id: a.write_id,
              body: a.body,
              approved_at: a.approved_at,
              expires_at: a.expires_at,
            }),
          );
        }
      },
    );
    await t.test(
      "only exact independently authenticated human approval can queue; reused read and changed payload cannot",
      async () => {
        const c = await connection(),
          p = await prepared(c);
        assert.equal(
          (await store.claim(c.dispatch, p.write_id)).claimed,
          false,
        );
        await assert.rejects(
          store.human(
            { ...actor(), aal: "aal1" },
            {
              action: "APPROVE",
              connection_id: c.id,
              write_id: p.write_id,
              proposal_digest: p.proposal_digest,
              attested: true,
            },
          ),
        );
        await assert.rejects(
          store.human(
            { ...actor(), session_version: 2 },
            { action: "VIEW", connection_id: c.id, write_id: p.write_id },
          ),
        );
        await assert.rejects(
          store.human(
            {
              ...actor(),
              organisation_id: "10000000-0000-4000-8000-000000000001",
            },
            { action: "VIEW", connection_id: c.id, write_id: p.write_id },
          ),
        );
        await assert.rejects(
          store.human(actor(), {
            action: "APPROVE",
            connection_id: c.id,
            write_id: p.write_id,
            proposal_digest: "f".repeat(64),
            attested: true,
          }),
        );
        const a = (await store.human(actor(), {
          action: "APPROVE",
          connection_id: c.id,
          write_id: p.write_id,
          proposal_digest: p.proposal_digest,
          attested: true,
        })) as any;
        assert.equal(
          (await store.claim(c.dispatch, p.write_id)).claimed,
          false,
        );
        await store.human(actor(), {
          action: "ENQUEUE",
          connection_id: c.id,
          write_id: p.write_id,
          approval_digest: a.approval_digest,
        });
        const h = await store.claim(c.dispatch, p.write_id);
        assert.ok(h instanceof GithubClaim);
        assert.equal(
          (await store.claim(c.dispatch, p.write_id)).claimed,
          false,
        );
        const read = (
          await admin.query(
            "select read_id from kxra_private.ghp_writes where id=$1",
            [p.write_id],
          )
        ).rows[0].read_id;
        await assert.rejects(
          store.human(actor(), {
            action: "PROPOSE",
            connection_id: c.id,
            write_id: uuid(),
            read_id: read,
            note: "changed",
          }),
        );
        assert.ok(!JSON.stringify(h).includes("vault:"));
        assert.ok(!util.inspect(h).includes("vault:"));
      },
    );
    await t.test(
      "capability purposes cannot substitute for human, read, dispatch or receipt authority",
      async () => {
        const c = await connection(),
          h = await claimed(c);
        const material = await h.escrow(async (m) => m);
        await assert.rejects(store.readContext(c.dispatch));
        await assert.rejects(store.recordRead(c.dispatch, sha("x")));
        await assert.rejects(
          store.claim(
            c.read,
            h.operation.kind === "COMMENT" ? h.operation.write_id : uuid(),
          ),
        );
        await assert.rejects(store.readContext(material.receipt_token));
        await assert.rejects(
          store
            .authority(material.receipt_token)
            .current(input(h), new AbortController().signal),
        );
        await assert.rejects(
          store.publishReceipt(
            material.dispatch_token,
            h.operation.kind === "COMMENT" ? h.operation.attempt_id : uuid(),
            h.operation_sha256,
            {
              outcome: "UNCERTAIN",
              evidence: { reason: "RESPONSE_UNCONFIRMED" },
            },
          ),
        );
        await assert.rejects(
          direct(
            "human",
            "",
            "select kxra.github_prod_worker('READ_CONTEXT','{}',$1) value",
            [f.review],
          ),
        );
      },
    );
    await t.test(
      "actual SQL consumption permits one competing transport POST and sanitized immutable receipt only",
      async () => {
        const c = await connection(),
          h = await claimed(c),
          m = await h.escrow(async (v) => v),
          other = store.restoreClaim(m),
          fake = githubFake(c.binding),
          a = executor(h, fake).e,
          b = executor(other, fake).e;
        await preflight(a);
        await preflight(b);
        const results = await Promise.all([
          a.execute(h.operation),
          b.execute(other.operation),
        ]);
        assert.equal(results.filter((r) => r.outcome === "ACCEPTED").length, 1);
        assert.equal(results.filter((r) => r.outcome === "REFUSED").length, 1);
        assert.equal(fake.posts(), 1);
        const accepted = results.find((r) => r.outcome === "ACCEPTED")!;
        const receipt = await h.publish(accepted);
        assert.equal(receipt.state, "ACCEPTED");
        assert.equal((await h.publish(accepted)).duplicate, true);
        await assert.rejects(
          h.publish({
            ...accepted,
            evidence: { ...accepted.evidence, body_sha256: "f".repeat(64) },
          }),
        );
        await assert.rejects(
          h.authority().consume(input(h), new AbortController().signal),
        );
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from kxra_private.ghp_consumptions where attempt_id=$1",
              [m.operation && (m.operation as any).attempt_id],
            )
          ).rows[0].n,
          1,
        );
      },
    );
    await t.test(
      "consume COMMIT acknowledgement loss persists the row and reconstruction cannot send or reclaim",
      async () => {
        const c = await connection();
        let lost = false;
        const faulty = new GithubProductionOutbox(pool, {
          environment: () => environment,
          afterCommit: async (stage) => {
            if (stage === "CONSUME" && !lost) {
              lost = true;
              throw Error("synthetic lost commit acknowledgement");
            }
          },
        });
        const h = await claimed(c, faulty),
          m = await h.escrow(async (v) => v),
          fake = githubFake(c.binding),
          e = executor(h, fake).e;
        await preflight(e);
        assert.equal((await e.execute(h.operation)).outcome, "REFUSED");
        assert.equal(fake.posts(), 0);
        const rebuilt = store.restoreClaim(m),
          r = executor(rebuilt, fake).e;
        await preflight(r);
        assert.equal((await r.execute(rebuilt.operation)).outcome, "REFUSED");
        assert.equal(fake.posts(), 0);
        assert.equal(
          (await store.claim(c.dispatch, (m.operation as any).write_id))
            .claimed,
          false,
        );
      },
    );
    await t.test(
      "cancel, feature withdrawal, grant revocation and account session loss stop consume after a blocked lock",
      async () => {
        for (const change of ["cancel", "activation", "worker", "session"]) {
          const c = await connection(),
            h = await claimed(c),
            m = await h.escrow(async (v) => v);
          const locker = new pg.Client({
            ...cfg,
            user: os.userInfo().username,
          });
          await locker.connect();
          await locker.query("begin");
          if (change === "session")
            await locker.query(
              "select pg_advisory_xact_lock(hashtextextended('kxra-review-current-policy-v1',0))",
            );
          await locker.query(
            "select id from kxra_private.ghp_connections where id=$1 for update",
            [c.id],
          );
          const pending = h
            .authority()
            .consume(input(h), new AbortController().signal)
            .then(
              () => ({ ok: true }),
              () => ({ ok: false }),
            );
          try {
            let blocked = false;
            for (let n = 0; n < 100; n++) {
              const q = await admin.query(
                "select 1 from pg_stat_activity where usename='kxra_app' and wait_event_type='Lock'",
              );
              if (q.rowCount) {
                blocked = true;
                break;
              }
              await new Promise((r) => setTimeout(r, 10));
            }
            assert.equal(blocked, true);
            if (change === "cancel")
              await locker.query(
                "update kxra_private.ghp_writes set cancel_requested=true where id=$1",
                [(m.operation as any).write_id],
              );
            if (change === "activation")
              await locker.query(
                "update kxra_private.ghp_activations set enabled=false where id=$1",
                [c.activation],
              );
            if (change === "worker")
              await locker.query(
                "update kxra_private.ghp_capabilities set revoked_at=clock_timestamp() where token_sha256=$1",
                [sha(c.dispatch)],
              );
            if (change === "session")
              await locker.query(
                "update kxra.account_identities set session_version=session_version+1 where account_id=$1",
                [f.actor],
              );
            await locker.query("commit");
            assert.equal((await pending).ok, false);
            assert.equal(
              (
                await admin.query(
                  "select count(*)::int n from kxra_private.ghp_consumptions where attempt_id=$1",
                  [(m.operation as any).attempt_id],
                )
              ).rows[0].n,
              0,
            );
          } finally {
            await locker.query("rollback");
            await locker.end();
            await pending;
          }
          if (change === "session") {
            await admin.query(
              "update kxra.account_identities set session_version=session_version+1 where account_id=$1",
              [f.actor],
            );
          }
        }
      },
    );
    // The final recovery cohort has its own current customer/policy after the deliberate account loss above.
    await admin.query("begin");
    f = await seedAiResumeFixture(admin, false);
    await admin.query("commit");
    environment.KXRA_GITHUB_OUTBOX_POLICY_SHA256 = f.review;
    await t.test(
      "unreceipted consumed external effect is retained for real restart and empty-target restore",
      async () => {
        const c = await connection(),
          h = await claimed(c),
          fake = githubFake(c.binding),
          e = executor(h, fake).e;
        await preflight(e);
        fake.setMode("drop");
        const result = await e.execute(h.operation);
        assert.equal(result.outcome, "UNCERTAIN");
        assert.equal(fake.posts(), 1);
        const material = await h.escrow(async (v) => v);
        secrets.add(material.dispatch_token);
        secrets.add(material.receipt_token);
        const state = {
          synthetic_only: true,
          material,
          readToken: c.read,
          dispatchWorkerToken: c.dispatch,
          actor: actor(),
          policy: f.review,
          activation: c.activation,
          effects: fake.effects,
          connection: c.id,
        };
        fs.writeFileSync(
          path.join(runtime, "ephemeral-recovery-state.json"),
          JSON.stringify(state),
          { mode: 0o600 },
        );
        assert.equal(
          (
            await admin.query(
              "select state from kxra_private.ghp_writes where id=$1",
              [(h.operation as any).write_id],
            )
          ).rows[0].state,
          "DISPATCHING",
        );
      },
    );
    const pglog = fs.readFileSync(path.join(runtime, "postgres.log"), "utf8");
    for (const s of secrets)
      assert.ok(
        !pglog.includes(s),
        "capabilities must not occur in database error logs",
      );
    console.log("GITHUB_OUTBOX_DB_BOUNDARY_PASS");
  } finally {
    await admin.query("rollback");
    await admin.end();
    await pool.end();
  }
});
