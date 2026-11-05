import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";
import { fixtureUsers } from "../packages/authz/session";
import { exampleCustomApp } from "../packages/custom-apps/contract";
import type { seedAiResumeFixture } from "../tests/support/ai-resume-fixture";

/** Synthetic actors and private control barriers exist only in the owned fixture. */
export async function runCustomAppsCompositionProof(p: {
  admin: pg.Client;
  pool: pg.Pool;
  fixture: Awaited<ReturnType<typeof seedAiResumeFixture>>;
  reviewer: ReturnType<typeof crypto.randomUUID>;
  root: string;
  runtime: string;
  cfg: any;
  refreshProof(): Promise<void>;
  write(name: string, value: unknown): void;
}) {
  const { admin, pool, fixture: f, reviewer, write } = p,
    id = () => crypto.randomUUID();
  assert.match(p.root, /^\/(?:private\/)?tmp\/kxra-capps-[A-Za-z0-9]+$/);
  assert.equal(p.cfg.host, path.join(p.runtime, "socket"));
  const outcomes: unknown[] = [];
  const connect = async (
    who: string,
    org = f.org,
    authTime = Math.floor(Date.now() / 1000),
  ) => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local statement_timeout='6s'");
      await c.query("set local lock_timeout='5s'");
      await c.query("set local role authenticated");
      await c.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true),set_config('request.kxra.execution_mode','hosted',true),set_config('request.kxra.custom_apps_verified','on',true)",
        [
          who,
          org,
          JSON.stringify({
            sub: who,
            aal: "aal2",
            session_version: 1,
            provider_session_version: 1,
            auth_time: authTime,
          }),
        ],
      );
      return c;
    } catch (e) {
      await c.query("rollback").catch(() => {});
      c.release();
      throw e;
    }
  };
  const finish = async (c: pg.PoolClient, commit = false) => {
    try {
      await c.query(commit ? "commit" : "rollback");
    } finally {
      c.release();
    }
  };
  const call = async (who: string, sql: string, args: unknown[] = []) => {
    const c = await connect(who);
    try {
      const r = await c.query(sql, args);
      await finish(c, true);
      return r;
    } catch (e) {
      await finish(c);
      throw e;
    }
  };
  const app = id(),
    record = id(),
    values = Object.fromEntries(
      exampleCustomApp.fields.map((f) => [
        f.key,
        f.type === "checkbox"
          ? true
          : f.type === "select"
            ? f.options[0]
            : "Synthetic composition value",
      ]),
    );
  await p.refreshProof();
  await call(f.actor, "select kxra.custom_app_register($1,$2,0,$3)", [
    app,
    f.room,
    exampleCustomApp,
  ]);
  let state = () =>
    admin
      .query(
        "select a.revision,a.active_version,v.sha256 from kxra.custom_apps a join kxra.custom_app_versions v on v.app_id=a.id and v.version=1 where a.id=$1",
        [app],
      )
      .then((r) => r.rows[0]);
  let s = await state();
  await call(
    reviewer,
    "select kxra.custom_app_review($1,$2,$3,1,$4,'APPROVED')",
    [app, f.room, s.revision, s.sha256],
  );
  s = await state();
  await call(
    f.actor,
    "select kxra.custom_app_release_reviewed($1,$2,$3,1,'PUBLISH')",
    [app, f.room, s.revision],
  );
  s = await state();
  await call(f.actor, "select kxra.custom_app_register($1,$2,$3,$4)", [
    app,
    f.room,
    s.revision,
    { ...exampleCustomApp, title: "Synthetic reviewed alternate" },
  ]);
  s = await state();
  const hash2 = (
    await admin.query(
      "select sha256 from kxra.custom_app_versions where app_id=$1 and version=2",
      [app],
    )
  ).rows[0].sha256;
  await call(
    reviewer,
    "select kxra.custom_app_review($1,$2,$3,2,$4,'APPROVED')",
    [app, f.room, s.revision, hash2],
  );
  s = await state();
  await call(
    f.actor,
    "select kxra.custom_app_release_reviewed($1,$2,$3,2,'PUBLISH')",
    [app, f.room, s.revision],
  );
  s = await state();
  await call(
    f.actor,
    "select kxra.custom_app_release_reviewed($1,$2,$3,1,'ROLLBACK')",
    [app, f.room, s.revision],
  );
  const current = await state();
  const save = (c: pg.PoolClient, op = id(), r = id()) =>
    c.query("select kxra.custom_app_record_save($1,$2,$3,$4,$5,1,0,$6) value", [
      op,
      r,
      app,
      f.room,
      current.revision,
      values,
    ]);
  const receiptOp = id();
  await call(
    f.actor,
    "select kxra.custom_app_record_save($1,$2,$3,$4,$5,1,0,$6)",
    [receiptOp, record, app, f.room, current.revision, values],
  );
  const observe = async (pid: number, blocker: number, type = "advisory") => {
    for (let i = 0; i < 200; i++) {
      if (
        (
          await admin.query(
            "select exists(select 1 from pg_locks where pid=$1 and locktype=$3 and not granted) and $2=any(pg_blocking_pids($1)) waiting",
            [pid, blocker, type],
          )
        ).rows[0].waiting
      )
        return;
      await new Promise((r) => setTimeout(r, 5));
    }
    write("composition-wait-failure.json", {
      pid,
      blocker,
      type,
      activity: (
        await admin.query(
          "select pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) blockers from pg_stat_activity where pid=$1",
          [pid],
        )
      ).rows,
    });
    assert.fail("EXPECTED_OWNED_LOCK_WAIT_NOT_OBSERVED");
  };
  const operator = fixtureUsers.owner,
    platform = "10000000-0000-4000-8000-000000000001";
  await admin.query(
    "insert into kxra_private.review_operator_grants(platform_org_id,reviewer_id,session_version,target_org_id,kind,provider,policy_id,can_withdraw,can_replace,max_valid_seconds,owner_review_reference,valid_from,valid_until) values($1,$2,1,$3,'AI','OPENAI',$4,true,true,3600,'SYNTHETIC_REVIEW_POLICY_NOT_APPROVAL',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour')",
    [platform, operator, f.org, f.eligibilityPolicy],
  );
  const intents = new Map<string, string>();
  for (const who of [f.actor, reviewer]) {
    const intent = id();
    await f.appCall(
      "select kxra.ai_connection_admission($1,'OPENAI','synthetic-model','',$2,$3) value",
      [intent, f.fingerprint, f.ep],
      who,
    );
    await f.reviewAi(intent);
    intents.set(who, intent);
  }
  const review = (c: pg.PoolClient, action: string, v: unknown) =>
    c
      .query("select kxra.review_operations($1,$2,$3) value", [
        action,
        v,
        f.review,
      ])
      .then((r) => r.rows[0].value);
  for (const mode of [
    "REGISTER",
    "REVIEW",
    "PUBLISH_AUTHOR",
    "PUBLISH_REVIEWER",
    "SAVE",
  ]) {
    await p.refreshProof();
    let rc: pg.PoolClient | undefined,
      c: pg.PoolClient | undefined,
      pending: Promise<any> | undefined;
    const subject =
      mode === "REVIEW" || mode === "PUBLISH_REVIEWER" ? reviewer : f.actor;
    try {
      rc = await connect(operator, platform);
      const opened = await review(rc, "OPEN", {
        kind: "AI",
        subject_id: intents.get(subject),
      });
      const reviewerPid = (await rc.query("select pg_backend_pid() pid"))
        .rows[0].pid;
      c = await connect(mode === "REVIEW" ? reviewer : f.actor);
      const row = await state();
      if (mode === "REGISTER")
        await c.query("select kxra.custom_app_register($1,$2,0,$3)", [
          id(),
          f.room,
          exampleCustomApp,
        ]);
      else if (mode === "REVIEW")
        await c.query(
          "select kxra.custom_app_review($1,$2,$3,1,$4,'APPROVED')",
          [app, f.room, row.revision, row.sha256],
        );
      else if (mode.startsWith("PUBLISH")) {
        await c.query(
          "select kxra.custom_app_release_reviewed($1,$2,$3,2,'PUBLISH')",
          [app, f.room, row.revision],
        );
      } else await save(c);
      const pid = (await c.query("select pg_backend_pid() pid")).rows[0].pid;
      pending = (async () => {
        const receipt = await review(rc!, "DECIDE", {
          request_id: opened.request_id,
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
        // AI review itself is not a custom-app dependency. Exercise the real
        // authority writer in that same account-holding review transaction.
        await rc!.query(
          "select kxra.revoke_own_sessions('Synthetic rollback-only authority fence test','LOCAL_APPLIED')",
        );
        return receipt;
      })();
      void pending.catch(() => {});
      await observe(reviewerPid, pid);
      await c.query("rollback");
      const receipt = await pending;
      assert.equal(receipt.entitlement_authority, false);
      outcomes.push({
        mode,
        actualReviewRpc: true,
        actualSessionRevocationRpcInReviewTransaction: true,
        appCompletedWhileAccountHeld: true,
        exactFenceWaitObserved: true,
      });
    } finally {
      const closed = await Promise.allSettled([
        c ? finish(c) : Promise.resolve(),
      ]);
      await pending?.catch(() => {});
      if (rc) closed.push(...(await Promise.allSettled([finish(rc)])));
      assert.ok(
        closed.every((r) => r.status === "fulfilled"),
        "OWNED_RACE_CLEANUP_UNCONFIRMED",
      );
    }
  }
  // Reviewer-specific current legal acceptance must not be replaced by the actor's.
  await p.refreshProof();
  const requirement = id(),
    membership = (
      await admin.query(
        "select id from kxra.organisation_memberships where org_id=$1 and account_id=$2",
        [f.org, reviewer],
      )
    ).rows[0].id;
  await admin.query(
    "insert into kxra.legal_document_requirements select (jsonb_populate_record(null::kxra.legal_document_requirements,to_jsonb(q)||jsonb_build_object('id',$2::text,'membership_id',$3::text,'relationship_type',null,'created_at',clock_timestamp()))).* from kxra.legal_document_requirements q where q.org_id=$1 and q.mandatory and q.state='ACTIVE' limit 1",
    [f.org, requirement, membership],
  );
  try {
    const c = await connect(reviewer);
    try {
      assert.equal(
        (
          await c.query("select kxra_private.can_team_room($1,true) allowed", [
            f.room,
          ])
        ).rows[0].allowed,
        false,
      );
    } finally {
      await finish(c);
    }
    assert.equal(
      (
        await admin.query(
          "select kxra_private.custom_app_review_current($1,1) allowed",
          [app],
        )
      ).rows[0].allowed,
      false,
    );
    await assert.rejects(
      call(
        f.actor,
        "select kxra.custom_app_record_save($1,$2,$3,$4,$5,1,0,$6)",
        [id(), id(), app, f.room, current.revision, values],
      ),
      { code: "42501" },
    );
    outcomes.push({ reviewerMandatoryLegalWins: true, actorUnchanged: true });
  } finally {
    await admin.query(
      "update kxra.legal_document_requirements set state='RETIRED',retired_at=clock_timestamp() where id=$1",
      [requirement],
    );
  }
  assert.equal(
    (
      await admin.query(
        "select kxra_private.custom_app_review_current($1,1) allowed",
        [app],
      )
    ).rows[0].allowed,
    true,
  );
  const clock = () =>
    admin
      .query("select extract(epoch from clock_timestamp())*1000 ms")
      .then((r) => Number(r.rows[0].ms));
  for (const mode of [
    "PAID",
    "PAID_RETRY",
    "MEMBERSHIP",
    "PROJECT",
    "REVIEW",
    "MFA",
  ]) {
    await p.refreshProof();
    let original: any;
    let c: pg.PoolClient | undefined;
    let pending: Promise<any> | undefined;
    let held = false;
    try {
      let until: number;
      if (mode.startsWith("PAID"))
        until = Number(
          (
            await admin.query(
              "update kxra_private.live_paid_access set valid_until=clock_timestamp()+interval '1200 milliseconds' where org_id=$1 returning extract(epoch from valid_until)*1000 ms",
              [f.org],
            )
          ).rows[0].ms,
        );
      else if (mode === "MEMBERSHIP")
        until = Number(
          (
            await admin.query(
              "update kxra.organisation_memberships set expires_at=clock_timestamp()+interval '1200 milliseconds' where org_id=$1 and account_id=$2 returning extract(epoch from expires_at)*1000 ms",
              [f.org, f.actor],
            )
          ).rows[0].ms,
        );
      else if (mode === "PROJECT") {
        original = (
          await admin.query(
            "select security_role from kxra.organisation_memberships where org_id=$1 and account_id=$2",
            [f.org, f.actor],
          )
        ).rows[0].security_role;
        await admin.query(
          "update kxra.organisation_memberships set security_role='ORG_MEMBER' where org_id=$1 and account_id=$2",
          [f.org, f.actor],
        );
        const project = (
          await admin.query(
            "select project_id from kxra.team_rooms where id=$1",
            [f.room],
          )
        ).rows[0].project_id;
        await admin.query(
          "insert into kxra.project_memberships(project_id,user_id,org_id,role,active,expires_at) values($1,$2,$3,'contributor',true,clock_timestamp()+interval '1200 milliseconds') on conflict(project_id,user_id) do update set active=true,role='contributor',expires_at=excluded.expires_at",
          [project, f.actor, f.org],
        );
        until = Number(
          (
            await admin.query(
              "select extract(epoch from expires_at)*1000 ms from kxra.project_memberships where project_id=$1 and user_id=$2",
              [project, f.actor],
            )
          ).rows[0].ms,
        );
      } else if (mode === "REVIEW") {
        // Append only: production does not allow rewriting prior review history.
        await admin.query(
          "insert into kxra.custom_app_reviews(app_id,version,artifact_sha256,decision,reviewed_by,session_version,expires_at) values($1,1,$2,'APPROVED',$3,1,clock_timestamp()+interval '1200 milliseconds')",
          [app, current.sha256, reviewer],
        );
        until = Number(
          (
            await admin.query(
              "select extract(epoch from expires_at)*1000 ms from kxra.custom_app_reviews where app_id=$1 order by sequence desc limit 1",
              [app],
            )
          ).rows[0].ms,
        );
      } else until = (Math.floor(Date.now() / 1000) - 899 + 900) * 1000;
      await admin.query("begin");
      held = true;
      await admin.query(
        "select id from kxra.custom_apps where id=$1 for update",
        [app],
      );
      const blocker = (await admin.query("select pg_backend_pid() pid")).rows[0]
        .pid;
      c = await connect(
        mode === "MFA" ? reviewer : f.actor,
        f.org,
        mode === "MFA"
          ? Math.floor(until / 1000) - 900
          : Math.floor(Date.now() / 1000),
      );
      const pid = (await c.query("select pg_backend_pid() pid")).rows[0].pid;
      const row = await state();
      pending =
        mode === "MFA"
          ? c.query("select kxra.custom_app_review($1,$2,$3,1,$4,'APPROVED')", [
              app,
              f.room,
              row.revision,
              row.sha256,
            ])
          : mode === "PAID_RETRY"
            ? save(c, receiptOp, record)
            : save(c);
      void pending.catch(() => {});
      await observe(pid, blocker, "transactionid");
      while ((await clock()) <= until + 30)
        await new Promise((r) => setTimeout(r, 20));
      await admin.query("rollback");
      held = false;
      await assert.rejects(pending, { code: "42501" });
      outcomes.push({
        expiry: mode,
        waitObserved: true,
        clockAdvancedPastDeadline: true,
        mutationDenied: true,
      });
    } finally {
      const released = await Promise.allSettled([
        held ? admin.query("rollback") : Promise.resolve(),
        c ? finish(c) : Promise.resolve(),
      ]);
      await pending?.catch(() => {});
      assert.ok(
        released.every((r) => r.status === "fulfilled"),
        "OWNED_EXPIRY_CLEANUP_UNCONFIRMED",
      );
      if (mode === "MEMBERSHIP")
        await admin.query(
          "update kxra.organisation_memberships set expires_at=null where org_id=$1 and account_id=$2",
          [f.org, f.actor],
        );
      if (mode === "PROJECT")
        await admin.query(
          "update kxra.organisation_memberships set security_role=$3 where org_id=$1 and account_id=$2",
          [f.org, f.actor, original],
        );
      await p.refreshProof();
      if (mode === "REVIEW")
        await call(
          reviewer,
          "select kxra.custom_app_review($1,$2,$3,1,$4,'APPROVED')",
          [app, f.room, current.revision, current.sha256],
        );
    }
  }
  const exact = (
    await admin.query(
      "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra_private' and p.proname='custom_app_room_current' and has_function_privilege('authenticated',p.oid,'EXECUTE')",
    )
  ).rows;
  assert.deepEqual(exact, []);
  const externalFks = (
    await admin.query(
      "select conrelid::regclass::text relation,confrelid::regclass::text parent from pg_constraint where contype='f' and conrelid::regclass::text like 'kxra.custom_app%' and confrelid::regclass::text not like 'kxra.custom_app%' order by 1,2",
    )
  ).rows;
  assert.deepEqual(externalFks, []);
  write("composition-acceptance.json", {
    outcomes,
    privateRoomHelperDirectExecute: false,
    externalAuthorityForeignKeys: externalFks,
    internalRelationshipsRetained: true,
    reviewerAdminProjectBypassPreserved: true,
    realProviderCalls: 0,
    liveAuthentication: false,
  });
}
