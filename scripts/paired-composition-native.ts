import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { postgresBin } from "./postgres-bin.mjs";
import {
  pairedCompositionCatalog,
  pairedCompositionData,
} from "./paired-composition-catalog.mjs";
import { fixtureUsers } from "../packages/authz/session";
import { PairedAdmissionStore } from "../packages/workspace/paired-admission-store";
import type { Principal } from "../packages/db";
import type { seedAiResumeFixture } from "../tests/support/ai-resume-fixture";
import type { syntheticPairedAuthority } from "../tests/support/paired-authority-fixture";

/** Only called by the owned, exact-source two-cluster native fixture. */
export async function runPairedCompositionProof(p: {
  admin: pg.Client;
  app: pg.Pool;
  fenceAdmin: pg.Client;
  fence: pg.Pool;
  root: string;
  runtime: string;
  env: NodeJS.ProcessEnv;
  fixture: Awaited<ReturnType<typeof seedAiResumeFixture>>;
  actor: Principal;
  intent: string;
  authority: ReturnType<typeof syntheticPairedAuthority>;
  request: { task_id: string; fence: string; attempt_id: string };
  hash: string;
  command(): {
    request_id: string;
    room_id: string;
    ai_intent_id: string;
    auth_route: string;
    label: string;
  };
  refresh(): Promise<unknown>;
  check(name: string, fn: () => Promise<void>): Promise<void>;
  write(name: string, value: unknown): void;
}) {
  const { admin, app, check, write, fixture: f, authority: a } = p,
    id = () => crypto.randomUUID();
  assert.equal(process.env.KXRA_PAIRED_COMPOSITION_PROOF, "1");
  assert.match(p.root, /^\/(?:private\/)?tmp\/kxra-pas-[A-Za-z0-9]+$/);
  const cfg = JSON.parse(
    fs.readFileSync(path.join(p.runtime, "database.json"), "utf8"),
  );
  assert.equal(cfg.host, path.join(p.runtime, "socket"));
  assert.equal(cfg.database, "postgres");
  assert.ok(!cfg.password && !cfg.ssl && !cfg.connectionString);
  const platform = "10000000-0000-4000-8000-000000000001",
    operator = fixtureUsers.owner;
  await admin.query(
    "insert into kxra_private.review_operator_grants(platform_org_id,reviewer_id,session_version,target_org_id,kind,provider,policy_id,can_withdraw,can_replace,max_valid_seconds,owner_review_reference,valid_from,valid_until) values($1,$2,1,$3,'AI','OPENAI',$4,true,true,3600,'SYNTHETIC_REVIEW_POLICY_NOT_APPROVAL',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')",
    [platform, operator, f.org, f.eligibilityPolicy],
  );
  const connect = async (who: string, org: string) => {
    const c = await app.connect();
    try {
      await c.query("begin");
      await c.query("set local statement_timeout='3s'");
      await c.query("set local lock_timeout='2s'");
      await c.query("set local role authenticated");
      await c.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true),set_config('request.kxra.execution_mode','hosted',true)",
        [
          who,
          org,
          JSON.stringify({
            sub: who,
            aal: "aal2",
            session_version: 1,
            auth_time: Math.floor(Date.now() / 1000),
          }),
        ],
      );
      return c;
    } catch (error) {
      await c.query("rollback").catch(() => {});
      c.release();
      throw error;
    }
  };
  const rollback = async (c: pg.PoolClient) => {
    try {
      await c.query("rollback");
    } finally {
      c.release();
    }
  };
  const review = (c: pg.PoolClient, action: string, input: unknown) =>
    c
      .query("select kxra.review_operations($1,$2::jsonb,$3) value", [
        action,
        JSON.stringify(input),
        f.review,
      ])
      .then((r) => r.rows[0].value);
  const open = (c: pg.PoolClient) =>
    review(c, "OPEN", { kind: "AI", subject_id: p.intent });
  const decide = (c: pg.PoolClient, request_id: string) =>
    review(c, "DECIDE", {
      request_id,
      operation_id: id(),
      attested: true,
      decision: {
        expires_at: new Date(Date.now() + 300000).toISOString(),
        state: "ELIGIBLE",
        account_mode: "CUSTOMER_BILLED",
        account_reference_sha256: f.review,
        provider_evidence_sha256: f.review,
      },
    });
  const startRequest = (c: pg.PoolClient) => {
    const q = p.command();
    return c
      .query(
        "select kxra_paired_admission.request_setup($1,$2,$3,$4,$5) value",
        [q.request_id, q.room_id, q.ai_intent_id, q.auth_route, q.label],
      )
      .then((r) => r.rows[0].value);
  };
  const observeFenceWait = async (pid: number, blocker: number) => {
    for (let i = 0; i < 100; i++) {
      if (
        (
          await admin.query(
            "select exists(select 1 from pg_locks where pid=$1 and locktype='advisory' and not granted) and $2=any(pg_blocking_pids($1)) waiting",
            [pid, blocker],
          )
        ).rows[0].waiting
      )
        return;
      await new Promise((r) => setTimeout(r, 5));
    }
    write("composition-wait-failure.json", {
      pid,
      blocker,
      activity: (
        await admin.query(
          "select pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1",
          [pid],
        )
      ).rows,
      locks: (
        await admin.query(
          "select locktype,mode,granted from pg_locks where pid=$1 order by locktype,mode,granted",
          [pid],
        )
      ).rows,
    });
    assert.fail("EXPECTED_REVIEW_POLICY_WAIT_NOT_OBSERVED");
  };
  const outcomes: unknown[] = [];
  for (const mode of [
    "CONSUME_ACCOUNT",
    "REQUEST_ACCOUNT",
    "REQUEST_AI_INTENT",
  ]) {
    await check(
      "combined reviewer vs paired " + mode + " has no row/fence inversion",
      async () => {
        await p.refresh();
        let rc: pg.PoolClient | undefined;
        let c: pg.PoolClient | undefined;
        let pending: Promise<any> | undefined;
        let barrier = false;
        try {
          rc = await connect(operator, platform);
          const detail = await open(rc);
          let reviewerPid = (await rc.query("select pg_backend_pid() pid"))
            .rows[0].pid;
          if (mode === "REQUEST_AI_INTENT") {
            await rc.query("commit");
            rc.release();
            rc = undefined;
            rc = await connect(operator, platform);
            reviewerPid = (await rc.query("select pg_backend_pid() pid"))
              .rows[0].pid;
            await admin.query("begin");
            barrier = true;
            await admin.query(
              "select pg_advisory_xact_lock(hashtextextended('kxra-review-current-policy-v1',0))",
            );
            const barrierPid = (
              await admin.query("select pg_backend_pid() pid")
            ).rows[0].pid;
            // The actual definer RPC acquires its own subject/account locks.
            // Pause after its subject lock at the existing review-policy fence; never grant the
            // unprivileged reviewer direct private-table access for staging.
            pending = decide(rc, detail.request_id);
            void pending.catch(() => {});
            await observeFenceWait(reviewerPid, barrierPid);
          }
          c = await connect(f.actor, f.org);
          const value =
            mode === "CONSUME_ACCOUNT"
              ? (
                  await c.query(
                    "select kxra_paired_admission.consume($1,$2,$3,$4,$5) value",
                    [a.task.id, a.task.fence, id(), p.hash, id()],
                  )
                ).rows[0].value
              : await startRequest(c);
          assert.equal(
            mode === "CONSUME_ACCOUNT" ? value.state : value.reason,
            mode === "CONSUME_ACCOUNT" ? "CONSUMED" : "POLICY_READY_SETUP_HELD",
          );
          const consumerPid = (await c.query("select pg_backend_pid() pid"))
            .rows[0].pid;
          if (barrier) {
            await admin.query("rollback");
            barrier = false;
          }
          if (!pending) {
            pending = decide(rc, detail.request_id);
            void pending.catch(() => {});
          }
          await observeFenceWait(reviewerPid, consumerPid);
          await c.query("rollback");
          const receipt = await pending;
          assert.equal(receipt.entitlement_authority, false);
          outcomes.push({
            mode,
            pairedCompletedWhileReviewRowHeld: true,
            reviewWaitObserved: true,
            reviewCompletedAfterPairedRollback: true,
          });
        } finally {
          const released = await Promise.allSettled([
            c ? rollback(c) : Promise.resolve(),
            barrier ? admin.query("rollback") : Promise.resolve(),
          ]);
          await pending?.catch(() => {});
          if (rc) released.push(...(await Promise.allSettled([rollback(rc)])));
          assert.ok(
            released.every((r) => r.status === "fulfilled"),
            "RACE_CONNECTION_CLEANUP_UNCONFIRMED",
          );
        }
      },
    );
  }
  await check(
    "composed orphaned agent and setup IDs deny fresh authority without FK grants",
    async () => {
      const agent = id(),
        request = id(),
        unknown = id();
      await admin.query(
        "insert into kxra_paired_admission.agents(id,org_id,account_id,room_id) values($1,$2,$3,$4)",
        [agent, unknown, unknown, unknown],
      );
      await admin.query(
        "insert into kxra_paired_admission.setup_requests(id,org_id,account_id,session_version,membership_version,room_id,agent_id,ai_intent_id,auth_route,label) values($1,$2,$2,1,1,$2,$3,$2,'CUSTOMER_API_KEY','ORPHANED_SYNTHETIC')",
        [request, unknown, agent],
      );
      assert.equal(
        (
          await admin.query(
            "select extract(epoch from(expires_at-created_at))::integer seconds from kxra_paired_admission.setup_requests where id=$1",
            [request],
          )
        ).rows[0].seconds,
        300,
      );
      const c = await connect(f.actor, f.org);
      try {
        assert.equal(
          (
            await c.query(
              "select count(*)::int n from kxra_paired_admission.setup_requests where id=$1",
              [request],
            )
          ).rows[0].n,
          0,
        );
        await assert.rejects(
          c.query("select kxra_paired_admission.setup_status($1)", [request]),
          { code: "42501" },
        );
      } finally {
        await rollback(c);
      }
      const fks = (
        await admin.query(
          "select conrelid::regclass::text table_name,confrelid::regclass::text reference from pg_constraint where contype='f' and conrelid in('kxra_paired_admission.agents'::regclass,'kxra_paired_admission.setup_requests'::regclass) order by 1,2",
        )
      ).rows;
      assert.deepEqual(fks, [
        {
          table_name: "kxra_paired_admission.setup_requests",
          reference: "kxra_paired_admission.agents",
        },
      ]);
      outcomes.push({
        orphanDenied: true,
        retainedPrivateAgentForeignKey: true,
      });
    },
  );
  await check(
    "combined catalogue records complete paired ACLs and independently owned fence identity",
    async () => {
      const appSystem = (
        await admin.query(
          "select system_identifier::text id from pg_control_system()",
        )
      ).rows[0].id;
      const externalSystem = (
        await p.fenceAdmin.query(
          "select system_identifier::text id from pg_control_system()",
        )
      ).rows[0].id;
      assert.notEqual(appSystem, externalSystem);
      const unknown = (
        await admin.query(
          "select nspname from pg_namespace where nspname!~'^pg_' and nspname not in('information_schema','auth','public','kxra','kxra_private','kxra_pairing','kxra_github_receipt','kxra_paired_admission') order by 1",
        )
      ).rows;
      assert.deepEqual(unknown, []);
      const tables = (
        await admin.query(
          "select c.relname,c.relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kxra_paired_admission' and c.relkind='r' order by 1",
        )
      ).rows;
      assert.deepEqual(
        tables.map((r) => r.relname),
        [
          "agents",
          "authorities",
          "consumptions",
          "devices",
          "reviews",
          "setup_requests",
          "transport_policies",
        ],
      );
      assert.ok(tables.every((r) => r.relrowsecurity));
      write("composition-lock-order.json", {
        outcomes,
        appSystem,
        externalSystem,
        realProvider: false,
        authorityIssued: false,
        schemasUnknown: unknown,
        tables,
      });
    },
  );
  await p.refresh();
  const catalog = await pairedCompositionCatalog(admin),
    data = await pairedCompositionData(admin, catalog);
  write("composition-catalog-source.json", catalog);
  write("composition-data-source.json", data);
  const bin = postgresBin(),
    dump = path.join(p.runtime, "composition.dump"),
    dbName = "paired_composition_" + id().replaceAll("-", "");
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: p.runtime,
    USER: os.userInfo().username,
    LANG: "C",
    LC_ALL: "C",
    NODE_ENV: "development",
  };
  const run = (file: string, args: string[]) =>
    execFileSync(path.join(bin, file), args, {
      env,
      timeout: 120000,
      stdio: "pipe",
    });
  run("pg_dump", [
    "-h",
    cfg.host,
    "-p",
    String(cfg.port),
    "-U",
    os.userInfo().username,
    "-d",
    "postgres",
    "-Fc",
    "-f",
    dump,
  ]);
  return async () => {
    await check(
      "full genuine119 GitHub paired extension restore preserves catalogue and cannot replay independent burn",
      async () => {
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from pg_database where datname=$1",
              [dbName],
            )
          ).rows[0].n,
          0,
        );
        await admin.query(
          'create database "' + dbName + '" template template0',
        );
        const restoredAdmin = new pg.Client({
            ...cfg,
            user: os.userInfo().username,
            database: dbName,
          }),
          restoredPool = new pg.Pool({ ...cfg, database: dbName });
        try {
          await restoredAdmin.connect();
          assert.equal(
            (
              await restoredAdmin.query(
                "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname!~'^pg_' and n.nspname<>'information_schema' and c.relkind in('r','S','v')",
              )
            ).rows[0].n,
            0,
          );
          assert.equal(
            (
              await restoredAdmin.query(
                "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname!~'^pg_' and n.nspname<>'information_schema'",
              )
            ).rows[0].n,
            0,
          );
          run("pg_restore", [
            "-h",
            cfg.host,
            "-p",
            String(cfg.port),
            "-U",
            os.userInfo().username,
            "-d",
            dbName,
            "--no-owner",
            "--exit-on-error",
            "--single-transaction",
            dump,
          ]);
          const restoredCatalog = await pairedCompositionCatalog(restoredAdmin),
            restoredData = await pairedCompositionData(
              restoredAdmin,
              restoredCatalog,
            );
          write("composition-catalog-restored.json", restoredCatalog);
          write("composition-data-restored.json", restoredData);
          assert.deepEqual(restoredCatalog, catalog);
          assert.deepEqual(restoredData, data);
          const store = new PairedAdmissionStore(
            restoredPool,
            p.fence,
            p.actor,
            { enabled: true },
          );
          assert.deepEqual(await store.readCurrent(p.request), a);
          await assert.rejects(
            store.consume({ ...p.request, attempt_id: id() }, p.hash),
            /UNCONFIRMED_NO_REPLAY/,
          );
          assert.equal(
            (
              await restoredAdmin.query(
                "select count(*)::int n from kxra_paired_admission.consumptions where task_id=$1",
                [a.task.id],
              )
            ).rows[0].n,
            0,
          );
          assert.equal(
            (
              await p.fenceAdmin.query(
                "select count(*)::int n from kxra_paired_fence.burns where task_id=$1",
                [a.task.id],
              )
            ).rows[0].n,
            1,
          );
          write("composition-restore.json", {
            verifiedEmptyTarget: dbName,
            fullCatalogueAndDataEqual: true,
            restoredCurrentTaskVisible: true,
            externalBurnRetained: 1,
            additionalAppConsumptions: 0,
            realProviderCalls: 0,
            forcedCrash: false,
            independentClusterRestore: false,
            externalLedgerRestore: false,
          });
        } finally {
          const cleanup = await Promise.allSettled([
            restoredPool.end(),
            restoredAdmin.end(),
          ]);
          assert.ok(
            cleanup.every((r) => r.status === "fulfilled"),
            "RESTORED_CLIENT_CLEANUP_UNCONFIRMED",
          );
        }
      },
    );
  };
}
