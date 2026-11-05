import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import pg from "pg";
import { execFileSync } from "node:child_process";
import { seedAiResumeFixture } from "../support/ai-resume-fixture";
import { githubFake } from "../support/github-production-fake";
import {
  GithubProductionOutbox,
  GithubClaim,
} from "../../packages/connectors/github-production-outbox";
import { GithubProductionExecutor } from "../../packages/connectors/github-production-transport";
import {
  GithubDurableFence,
  GithubFenceReconciler,
  fenceSubject,
} from "../../packages/connectors/github-production-fence";
import {
  githubProductionBinding,
  githubBindingDigest,
  githubOperationDigest,
} from "../../packages/connectors/github-production-contracts";
import { postgresBin } from "../../scripts/postgres-bin.mjs";
import {
  integrationCatalog,
  integrationData,
} from "../../scripts/integration-catalog.mjs";
const uuid = () => crypto.randomUUID(),
  sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex"),
  token = () => crypto.randomBytes(32).toString("base64url");
test("independent durable fence survives older application snapshots and never reissues external send permission", async (t) => {
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  assert.match(
    runtime,
    /^\/(?:private\/)?tmp\/kxra-gho-[A-Za-z0-9]+\/\.runtime\/github-outbox$/,
  );
  const dir = path.join(runtime, "external-fence");
  assert.equal(
    process.env.KXRA_FENCE_DATABASE_FILE,
    path.join(dir, "database.json"),
  );
  const cfg = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    ),
    fcfg = JSON.parse(fs.readFileSync(path.join(dir, "database.json"), "utf8"));
  assert.notEqual(fcfg.host, cfg.host);
  assert.ok(!process.env.DATABASE_URL && !process.env.VERCEL_ENV);
  const admin = new pg.Client({ ...cfg, user: os.userInfo().username }),
    fa = new pg.Client({ ...fcfg, user: os.userInfo().username });
  await admin.connect();
  await fa.connect();
  const appPool = new pg.Pool({ ...cfg, max: 8 }),
    fp = new pg.Pool({
      ...fcfg,
      user: "kxra_gh_fence",
      connectionTimeoutMillis: 500,
    }),
    op = new pg.Pool({
      ...fcfg,
      user: "kxra_gh_reconcile",
      connectionTimeoutMillis: 500,
    });
  fp.on("error", () => {});
  op.on("error", () => {});
  const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      KXRA_GITHUB_OUTBOX_ENABLED: "true",
    },
    store = new GithubProductionOutbox(appPool, { environment: () => env });
  let f: Awaited<ReturnType<typeof seedAiResumeFixture>>;
  const pools: pg.Pool[] = [];
  const observations: any[] = [];
  const actor = () => ({
    id: f.actor,
    organisation_id: f.org,
    session_version: 1,
    aal: "aal2" as const,
    auth_time: Math.floor(Date.now() / 1000),
    source: "supabase" as const,
  });
  async function fixture() {
    await admin.query(
      "update kxra_private.live_paid_access set checked_at=clock_timestamp(),valid_until=clock_timestamp()+interval '60 seconds' where org_id=$1",
      [f.org],
    );
    const realm = uuid(),
      activation = uuid(),
      id = uuid(),
      read = token(),
      dispatch = token();
    await fa.query(
      "insert into kxra_github_fence.realms values($1,1,'ACTIVE',$2,clock_timestamp()-interval '1 second',clock_timestamp()+interval '10 minutes',$3)",
      [realm, uuid(), f.review],
    );
    await admin.query(
      "insert into kxra_private.ghp_activations(id,enabled,review_sha256,owner_review_reference,valid_from,valid_until,receipt_ttl_seconds) values($1,true,$2,'SYNTHETIC_FENCE_NOT_APPROVAL',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',3600)",
      [activation, f.review],
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
      repo: "external-fence-proof",
      expires_at: new Date(Date.now() + 600000).toISOString(),
    });
    await admin.query(
      "insert into kxra_private.ghp_connections(id,org_id,user_id,activation_id,business_review_id,binding,allow_write) values($1,$2,$3,$4,$5,$6,true)",
      [id, f.org, f.actor, activation, f.eligibility, JSON.stringify(binding)],
    );
    for (const [purpose, value] of [
      ["READ_WORKER", read],
      ["DISPATCH_WORKER", dispatch],
    ])
      await admin.query(
        "insert into kxra_private.ghp_capabilities values($1,$2,$3,null,1,1,clock_timestamp()-interval '1 second',clock_timestamp()+interval '9 minutes',null,'SYNTHETIC_ONLY')",
        [sha(value), purpose, id],
      );
    return {
      realm,
      activation,
      id,
      read,
      dispatch,
      binding,
      fence: new GithubDurableFence(fp, realm, 1),
      reconciler: new GithubFenceReconciler(op, realm),
    };
  }
  type C = Awaited<ReturnType<typeof fixture>>;
  async function queue(c: C) {
    const r = await store.recordRead(c.read, sha("synthetic scoped read")),
      p: any = await store.human(actor(), {
        action: "PROPOSE",
        connection_id: c.id,
        write_id: uuid(),
        read_id: r.read_id,
        note: "Synthetic independently fenced write",
      }),
      a: any = await store.human(actor(), {
        action: "APPROVE",
        connection_id: c.id,
        write_id: p.write_id,
        proposal_digest: p.proposal_digest,
        attested: true,
      });
    return (await store.human(actor(), {
      action: "ENQUEUE",
      connection_id: c.id,
      write_id: p.write_id,
      approval_digest: a.approval_digest,
    })) as any;
  }
  async function claim(c: C, s = store) {
    const w = await queue(c),
      h = await s.claim(c.dispatch, w.write_id);
    assert.ok(h instanceof GithubClaim);
    return h;
  }
  function executor(
    h: GithubClaim,
    c: C,
    fake = githubFake(h.binding),
    fence: any = c.fence,
  ) {
    return {
      fake,
      e: new GithubProductionExecutor(h.binding, {
        authority: h.authority(),
        rollbackFence: fence,
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
  const input = (h: GithubClaim) => ({
    binding: h.binding,
    operation: h.operation,
    binding_sha256: githubBindingDigest(h.binding),
    operation_sha256: githubOperationDigest(h.binding, h.operation),
    scope: "issues:write" as const,
  });
  const count = async (h: GithubClaim, db = admin) =>
    (
      await db.query(
        "select count(*)::int n from kxra_private.ghp_consumptions where attempt_id=$1",
        [(h.operation as any).attempt_id],
      )
    ).rows[0].n;
  const bin = postgresBin(process.env),
    lib = path.join(dir, "empty-libpq");
  fs.writeFileSync(lib, "", { mode: 0o600 });
  const subenv: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: process.env.PATH,
    HOME: dir,
    PGPASSFILE: lib,
    PGSERVICEFILE: lib,
    PGSYSCONFDIR: dir,
  };
  const args = [
    "-h",
    cfg.host,
    "-p",
    String(cfg.port),
    "-U",
    os.userInfo().username,
  ];
  async function dump(name: string) {
    const file = path.join(dir, name + ".dump"),
      cat = await integrationCatalog(admin),
      data = await integrationData(admin, cat);
    execFileSync(
      path.join(bin, "pg_dump"),
      [...args, "-d", cfg.database, "-Fc", "-f", file],
      { env: subenv, timeout: 30000 },
    );
    return { file, cat, data };
  }
  async function restore(snapshot: Awaited<ReturnType<typeof dump>>) {
    const name = "fence_restore_" + uuid().replaceAll("-", "");
    await admin.query("create database " + name + " template template0");
    const db = new pg.Client({
      ...cfg,
      database: name,
      user: os.userInfo().username,
    });
    await db.connect();
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema'",
        )
      ).rows[0].n,
      0,
    );
    execFileSync(
      path.join(bin, "pg_restore"),
      [
        ...args,
        "-d",
        name,
        "--single-transaction",
        "--exit-on-error",
        snapshot.file,
      ],
      { env: subenv, timeout: 30000 },
    );
    assert.deepEqual(await integrationCatalog(db), snapshot.cat);
    assert.deepEqual(await integrationData(db, snapshot.cat), snapshot.data);
    const pool = new pg.Pool({ ...cfg, database: name });
    pools.push(pool);
    return {
      db,
      store: new GithubProductionOutbox(pool, { environment: () => env }),
      name,
    };
  }
  try {
    await admin.query("begin");
    f = await seedAiResumeFixture(admin, false);
    await admin.query("commit");
    env.KXRA_GITHUB_OUTBOX_POLICY_SHA256 = f.review;
    await t.test(
      "separate cluster, default empty authority, RLS, disjoint runtime/reconciliation privileges and immutable witness",
      async () => {
        assert.equal((await fa.query("show fsync")).rows[0].fsync, "on");
        assert.equal(
          (await fa.query("show synchronous_commit")).rows[0]
            .synchronous_commit,
          "on",
        );
        for (const pool of [fp, op]) {
          const c = await pool.connect();
          try {
            await assert.rejects(
              c.query("select * from kxra_github_fence.writes"),
              { code: "42501" },
            );
            if (pool === fp)
              await assert.rejects(
                c.query("select kxra_github_fence.reconcile($1,'LIST','{}')", [
                  uuid(),
                ]),
                { code: "42501" },
              );
            else
              await assert.rejects(
                c.query(
                  "select kxra_github_fence.runtime($1,1,'RESERVE','{}')",
                  [uuid()],
                ),
                { code: "42501" },
              );
          } finally {
            c.release();
          }
        }
        assert.equal(
          (
            await fa.query(
              "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kxra_github_fence' and c.relkind='r' and c.relrowsecurity",
            )
          ).rows[0].n,
          4,
        );
      },
    );
    await t.test(
      "missing fence, absent realm and stale epoch refuse before application consumption or POST",
      async () => {
        const c = await fixture();
        for (const fence of [
          undefined,
          new GithubDurableFence(fp, uuid(), 1),
          new GithubDurableFence(fp, c.realm, 2),
        ]) {
          const h = await claim(c),
            fake = githubFake(c.binding),
            x = executor(h, c, fake, fence);
          if (fence === undefined) (x.e as any).ports.rollbackFence = undefined;
          await preflight(x.e);
          assert.equal((await x.e.execute(h.operation)).outcome, "REFUSED");
          assert.equal(fake.posts(), 0);
          assert.equal(await count(h), 0);
        }
      },
    );
    await t.test(
      "independent reservation and send consumption permit one competing executor only",
      async () => {
        const c = await fixture(),
          h = await claim(c),
          fake = githubFake(c.binding),
          material = await h.escrow(async (m) => m),
          a = executor(h, c, fake).e,
          b = executor(store.restoreClaim(material), c, fake).e;
        await preflight(a);
        await preflight(b);
        const results = await Promise.all([
          a.execute(h.operation),
          b.execute(h.operation),
        ]);
        assert.equal(results.filter((r) => r.outcome === "ACCEPTED").length, 1);
        assert.equal(fake.posts(), 1);
        assert.equal(await count(h), 1);
        await assert.rejects(
          fa.query("delete from kxra_github_fence.writes where realm=$1", [
            c.realm,
          ]),
        );
        await assert.rejects(
          c.fence.send(
            input(h),
            await fa.query("select 1"),
            new AbortController().signal,
          ),
        );
      },
    );
    await t.test(
      "lost reserve, app consumption and external send acknowledgments remain burned or held without POST",
      async () => {
        for (const stage of ["RESERVE", "CONSUME", "SEND"]) {
          const c = await fixture(),
            custom =
              stage === "CONSUME"
                ? new GithubProductionOutbox(appPool, {
                    environment: () => env,
                    afterCommit: async (s) => {
                      if (s === "CONSUME")
                        throw Error("synthetic commit ACK loss");
                    },
                  })
                : store,
            h = await claim(c, custom),
            fake = githubFake(c.binding),
            fence = new GithubDurableFence(fp, c.realm, 1, async (s) => {
              if (s === stage) throw Error("synthetic fence ACK loss");
            }),
            a = executor(h, c, fake, fence).e;
          await preflight(a);
          assert.equal((await a.execute(h.operation)).outcome, "REFUSED");
          assert.equal(fake.posts(), 0);
          const b = executor(
            store.restoreClaim(await h.escrow(async (m) => m)),
            c,
            fake,
          ).e;
          await preflight(b);
          assert.equal((await b.execute(h.operation)).outcome, "REFUSED");
          assert.equal(fake.posts(), 0);
          assert.equal(
            (
              await fa.query(
                "select count(*)::int n from kxra_github_fence.writes where realm=$1",
                [c.realm],
              )
            ).rows[0].n,
            1,
          );
        }
      },
    );
    await t.test(
      "HOLD between application consume and external SEND denies dispatch and requires explicit reconciliation",
      async () => {
        const c = await fixture(),
          h = await claim(c),
          fake = githubFake(c.binding);
        let held: any;
        const fence = {
          reserve: c.fence.reserve.bind(c.fence),
          send: async (i: any, r: any, s: any) => {
            held = await c.reconciler.command("HOLD", {
              session_id: uuid(),
              review_sha256: f.review,
              authority_sha256: f.review,
            });
            return c.fence.send(i, r, s);
          },
        };
        const x = executor(h, c, fake, fence).e;
        await preflight(x);
        assert.equal((await x.execute(h.operation)).outcome, "REFUSED");
        assert.equal(fake.posts(), 0);
        assert.equal(await count(h), 1);
        await assert.rejects(
          c.reconciler.command("RESUME", {
            session_id: held.session_id,
            epoch: held.epoch,
            review_sha256: f.review,
            authority_sha256: f.review,
          }),
        );
        const state = await c.reconciler.command("LIST", {});
        assert.equal(state.pending, 1);
        assert.equal(state.items[0].state, "RESERVED");
        await c.reconciler.command("OBSERVE", {
          session_id: held.session_id,
          epoch: held.epoch,
          write_id: (h.operation as any).write_id,
          classification: "NOT_SENT",
          evidence: { reason: "EXTERNAL_SEND_NEVER_CONSUMED" },
        });
        observations.push({
          case: "hold-before-send",
          phase: held.phase,
          additionalPosts: fake.posts(),
        });
      },
    );
    await t.test(
      "actual rollback before claim and before consumption cannot duplicate an external effect, even with a fresh attempt and enabled restored activation",
      async () => {
        const c = await fixture(),
          w = await queue(c),
          beforeClaim = await dump("before-claim"),
          h = await store.claim(c.dispatch, w.write_id);
        assert.ok(h instanceof GithubClaim);
        const material = await h.escrow(async (m) => m),
          beforeConsume = await dump("before-consume"),
          fake = githubFake(c.binding);
        fake.setMode("drop");
        const x = executor(h, c, fake).e;
        await preflight(x);
        assert.equal((await x.execute(h.operation)).outcome, "UNCERTAIN");
        assert.equal(fake.posts(), 1);
        const externalBefore = (
          await fa.query(
            "select * from kxra_github_fence.writes where realm=$1",
            [c.realm],
          )
        ).rows;
        for (const [phase, snapshot] of [
          ["before-claim", beforeClaim],
          ["before-consume", beforeConsume],
        ] as const) {
          const restored = await restore(snapshot);
          try {
            assert.equal(
              (
                await restored.db.query(
                  "select enabled from kxra_private.ghp_activations where id=$1",
                  [c.activation],
                )
              ).rows[0].enabled,
              true,
            );
            assert.equal(
              (
                await restored.db.query(
                  "select count(*)::int n from kxra_private.ghp_consumptions where attempt_id=$1",
                  [(h.operation as any).attempt_id],
                )
              ).rows[0].n,
              0,
            );
            const recovered =
              phase === "before-claim"
                ? await restored.store.claim(c.dispatch, w.write_id)
                : restored.store.restoreClaim(material);
            assert.ok(recovered instanceof GithubClaim);
            if (phase === "before-claim")
              assert.notEqual(
                (recovered.operation as any).attempt_id,
                (h.operation as any).attempt_id,
              );
            const e = executor(recovered, c, fake).e;
            await preflight(e);
            assert.equal(
              (await e.execute(recovered.operation)).outcome,
              "REFUSED",
            );
            assert.equal(fake.posts(), 1);
            assert.deepEqual(
              (
                await fa.query(
                  "select * from kxra_github_fence.writes where realm=$1",
                  [c.realm],
                )
              ).rows,
              externalBefore,
            );
            observations.push({
              snapshot: phase,
              restoredActivationEnabled: true,
              applicationConsumptionAbsent: true,
              additionalFakePosts: 0,
            });
          } finally {
            await restored.db.end();
          }
        }
        const held: any = await c.reconciler.command("HOLD", {
          session_id: uuid(),
          review_sha256: f.review,
          authority_sha256: f.review,
        });
        assert.equal(held.epoch, 2);
        await assert.rejects(
          c.fence.reserve(input(h), new AbortController().signal),
        );
        await assert.rejects(
          new GithubDurableFence(fp, c.realm, 2).reserve(
            input(h),
            new AbortController().signal,
          ),
        );
        await assert.rejects(
          c.reconciler.command("OBSERVE", {
            session_id: held.session_id,
            epoch: held.epoch,
            write_id: w.write_id,
            classification: "NOT_SENT",
            evidence: { reason: "EXTERNAL_SEND_NEVER_CONSUMED" },
          }),
        );
        const read = new GithubProductionExecutor(c.binding, {
          authority: store.authority(c.read),
          broker: fake.broker,
          request: fake.request,
          lookup: async () => [{ address: "8.8.8.8" }],
          enabled: () => true,
        });
        const found = await read.execute({ kind: "COMMENTS", page: 1 });
        assert.equal(found.outcome, "READ");
        const matching = (found.data as any).comments.filter(
          (v: any) =>
            sha(v.body) === fenceSubject(input(h)).body_sha256 &&
            v.author_id === c.binding.author_id,
        );
        assert.equal(matching.length, 1);
        const evidence = {
          status: 200,
          comment_id: matching[0].id,
          body_sha256: sha(matching[0].body),
          author_id: c.binding.author_id,
          issue_id: c.binding.issue_id,
        };
        await assert.rejects(
          c.reconciler.command("OBSERVE", {
            session_id: held.session_id,
            epoch: held.epoch,
            write_id: w.write_id,
            classification: "ACCEPTED",
            evidence: { ...evidence, body_sha256: "f".repeat(64) },
          }),
        );
        await c.reconciler.command("OBSERVE", {
          session_id: held.session_id,
          epoch: held.epoch,
          write_id: w.write_id,
          classification: "ACCEPTED",
          evidence,
        });
        await new Promise((r) => setTimeout(r, 3100));
        const resumed: any = await c.reconciler.command("RESUME", {
          session_id: held.session_id,
          epoch: held.epoch,
          review_sha256: f.review,
          authority_sha256: f.review,
        });
        assert.equal(resumed.phase, "ACTIVE");
        assert.equal(resumed.epoch, 2);
        await assert.rejects(
          c.fence.reserve(input(h), new AbortController().signal),
        );
        await assert.rejects(
          new GithubDurableFence(fp, c.realm, 2).reserve(
            input(h),
            new AbortController().signal,
          ),
        );
        assert.equal(fake.posts(), 1);
        observations.push({
          case: "reconciliation",
          matchingEffects: matching.length,
          oldEpochRejected: true,
          newEpochCannotReplayOldWrite: true,
          additionalFakePosts: 0,
        });
      },
    );
    fs.writeFileSync(
      path.join(dir, "acceptance.json"),
      JSON.stringify(
        {
          status: "PASS_EXTERNAL_ROLLBACK_FENCE",
          applicationCluster: cfg.host,
          independentFenceCluster: fcfg.host,
          sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
            encoding: "utf8",
          }).trim(),
          observations,
          realProviderCalls: 0,
          realCredentials: false,
          hostedChanges: false,
          activation: false,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  } finally {
    await Promise.allSettled(pools.map((p) => p.end()));
    await appPool.end();
    await fp.end();
    await op.end();
    await admin.end();
    await fa.end();
  }
});
