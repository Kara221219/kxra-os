import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import type pg from "pg";
import { productionAiPayload } from "./production-ai-review.mjs";
import { seedAiResumeFixture } from "../tests/support/ai-resume-fixture";
import { syntheticPairedAuthority } from "../tests/support/paired-authority-fixture";
import { PairedSetupStore } from "../packages/workspace/paired-setup";
import { pairedSetupHttp } from "../packages/workspace/paired-setup-http";
import { PairedAdmissionStore } from "../packages/workspace/paired-admission-store";
import {
  pairedAdmissionDigest,
  pairedRuntimeSubject,
  pairedTextPolicyDigest,
} from "../packages/workspace/paired-execution-admission";
export async function runPairedSetupProof(p: {
  admin: pg.Client;
  app: pg.Pool;
  fenceAdmin: pg.Client;
  fence: pg.Pool;
  root: string;
  runtime: string;
  env: NodeJS.ProcessEnv;
  check(name: string, fn: () => Promise<void>): Promise<void>;
  write(name: string, v: unknown): void;
}) {
  const { admin, app, fenceAdmin, fence, check, write } = p,
    id = () => crypto.randomUUID();
  Object.assign(process.env, p.env, {
    KXRA_MODERN_BILLING_TEST_MODE: "STAGING_SANDBOX",
  });
  await admin.query(productionAiPayload(p.root).bytes);
  const acl = () =>
    admin
      .query(
        "select p.oid::regprocedure::text identity,has_function_privilege('authenticated',p.oid,'EXECUTE') executable,has_schema_privilege('authenticated',n.oid,'USAGE') reachable from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra_private' order by 1",
      )
      .then((r) => r.rows);
  const before = await acl(),
    sql = fs.readFileSync(
      "database/production/paired-setup-policy-v1.sql",
      "utf8",
    );
  await check(
    "setup proposal rollback restores original RLS and grants",
    async () => {
      const oid = (
        await admin.query(
          "select polqual::text value from pg_policy where polname='scoped_authority'",
        )
      ).rows;
      await admin.query("begin");
      await admin.query(
        sql
          .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
          .replace(/commit;\s*$/i, ""),
      );
      await admin.query("rollback");
      assert.equal(
        (
          await admin.query(
            "select to_regclass('kxra_paired_admission.setup_requests') value",
          )
        ).rows[0].value,
        null,
      );
      assert.deepEqual(
        (
          await admin.query(
            "select polqual::text value from pg_policy where polname='scoped_authority'",
          )
        ).rows,
        oid,
      );
      assert.deepEqual(await acl(), before);
    },
  );
  await admin.query(sql);
  await check(
    "setup ACL has no storage-helper bypass or private-function expansion",
    async () => {
      assert.deepEqual(await acl(), before);
      const c = await app.connect();
      try {
        await c.query("set role authenticated");
        for (const q of [
          "select kxra_paired_admission.storage_current_task(null)",
          "select kxra_paired_admission.storage_consume(null,null,null,null,null)",
          "select * from kxra_paired_admission.transport_policies",
          "select nextval('kxra_paired_admission.transport_policies_sequence_seq')",
          "update kxra_paired_admission.agents set enabled=true",
          "update kxra_paired_admission.setup_requests set cancelled_at=null",
        ])
          await assert.rejects(c.query(q), { code: "42501" });
      } finally {
        c.release();
      }
      const functions = (
        await admin.query(
          "select p.oid::regprocedure::text identity,p.proacl::text acl,has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,has_function_privilege('anon',p.oid,'EXECUTE') anon_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra_paired_admission' order by 1",
        )
      ).rows;
      assert.ok(functions.every((f) => !f.anon_execute));
      assert.equal(functions.filter((f) => f.authenticated_execute).length, 6);
      write("setup-acl.json", {
        privateBefore: before,
        privateAfter: await acl(),
        functions,
      });
    },
  );
  await admin.query("begin");
  let f: Awaited<ReturnType<typeof seedAiResumeFixture>>;
  try {
    f = await seedAiResumeFixture(admin, false);
    await admin.query("commit");
  } catch (e) {
    await admin.query("rollback");
    throw e;
  }
  const actor = {
    id: f.actor,
    organisation_id: f.org,
    session_version: 1,
    aal: "aal2" as const,
    auth_time: Math.floor(Date.now() / 1000),
    source: "supabase" as const,
  };
  const store = new PairedSetupStore(app, actor, true),
    make = () => ({
      action: "REQUEST" as const,
      request_id: id(),
      room_id: f.room,
      ai_intent_id: "",
      auth_route: "CUSTOMER_API_KEY" as const,
      label: "Synthetic private agent",
    });
  const refresh = () =>
    admin.query(
      "update kxra_private.live_paid_access set checked_at=clock_timestamp(),valid_until=clock_timestamp()+interval '45 seconds' where org_id=$1",
      [f.org],
    );
  const intent = id();
  await f.register(intent);
  await f.reviewAi(intent);
  await refresh();
  const command = () => ({ ...make(), ai_intent_id: intent });
  let held: Awaited<ReturnType<typeof store.command>>;
  await check(
    "authenticated setup creates only a disabled private agent and no credentials",
    async () => {
      held = await store.command(command());
      assert.equal(held.reason, "TRANSPORT_REVIEW_REQUIRED");
      assert.equal(held.activation_allowed, false);
      assert.equal(held.credential_issued, false);
      assert.equal(
        (
          await admin.query(
            "select enabled from kxra_paired_admission.agents where id=$1",
            [held.agent_id],
          )
        ).rows[0].enabled,
        false,
      );
      assert.equal(
        (
          await admin.query(
            "select count(*)::int n from kxra_paired_admission.devices where agent_id=$1",
            [held.agent_id],
          )
        ).rows[0].n,
        0,
      );
    },
  );
  const tp = id();
  await admin.query(
    "insert into kxra_paired_admission.transport_policies(id,policy_sha256,auth_route,enabled,expires_at,review_reference) values($1,$2,'CUSTOMER_API_KEY',true,clock_timestamp()+interval '1 hour','SYNTHETIC_NOT_APPROVAL')",
    [tp, pairedTextPolicyDigest()],
  );
  await check(
    "new reviewed policy requires a new request; subscription permission never inferred",
    async () => {
      assert.equal(
        (await store.command({ action: "STATUS", request_id: held.request_id }))
          .reason,
        "NEW_REQUEST_REQUIRED",
      );
      const sub = await store.command({
        ...command(),
        auth_route: "CHATGPT_SUBSCRIPTION",
      });
      assert.equal(sub.reason, "SUBSCRIPTION_PROVIDER_CONFIRMATION_REQUIRED");
    },
  );
  const readyCommand = command();
  let ready = await store.command(readyCommand);
  assert.equal(ready.reason, "POLICY_READY_SETUP_HELD");
  await check(
    "concurrent explicit setup retries reuse one disabled agent; conflicts rejected",
    async () => {
      const cmd = command(),
        receipts = await Promise.all(
          Array.from({ length: 4 }, () => store.command(cmd)),
        );
      assert.equal(new Set(receipts.map((r) => r.agent_id)).size, 1);
      assert.equal(
        (
          await admin.query(
            "select count(*)::int n from kxra_paired_admission.setup_requests where id=$1",
            [cmd.request_id],
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        store.command({ ...cmd, label: "Conflicting label" }),
      );
    },
  );
  const origin = "http://127.0.0.1:39881",
    cookie = crypto.randomBytes(32).toString("hex");
  const dispatch = (
    v: unknown,
    options: {
      cookie?: string;
      origin?: string;
      who?: typeof actor | null;
    } = {},
  ) =>
    pairedSetupHttp(
      new Request(origin + "/api/paired-setup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: options.origin ?? origin,
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        body: JSON.stringify(v),
      }),
      {
        enabled: true,
        origin,
        verifyIdentity: async (r) =>
          r.headers.get("cookie") === cookie
            ? options.who === undefined
              ? actor
              : options.who
            : null,
        store: (a) => new PairedSetupStore(app, a, true),
      },
    );
  await check(
    "HTTP identity, origin, tenant, stale MFA and body-authority negatives",
    async () => {
      assert.equal((await dispatch(command())).status, 401);
      assert.equal(
        (await dispatch(command(), { cookie: "PAIRED_DEVICE_PURPOSE_TOKEN" }))
          .status,
        401,
      );
      assert.equal(
        (
          await dispatch(command(), {
            cookie,
            origin: "https://foreign.invalid",
          })
        ).status,
        403,
      );
      assert.equal(
        (await dispatch({ ...command(), account_id: f.actor }, { cookie }))
          .status,
        400,
      );
      for (const who of [
        { ...actor, organisation_id: id() },
        { ...actor, auth_time: actor.auth_time - 3600 },
        { ...actor, aal: "aal1" as never },
        { ...actor, session_version: 2 },
      ])
        assert.equal((await dispatch(command(), { cookie, who })).status, 403);
      const valid = await dispatch(command(), { cookie });
      assert.equal(valid.status, 200);
      assert.equal((await valid.json()).activation_allowed, false);
      await admin.query(
        "update kxra.team_room_members set active=false where room_id=$1 and account_id=$2",
        [f.room, f.actor],
      );
      assert.equal((await dispatch(command(), { cookie })).status, 403);
      await admin.query(
        "update kxra.team_room_members set active=true where room_id=$1 and account_id=$2",
        [f.room, f.actor],
      );
    },
  );
  await check(
    "cancellation and expiry cannot reactivate or issue access",
    async () => {
      const c = command(),
        receipt = await store.command(c);
      assert.equal(
        (await store.command({ action: "CANCEL", request_id: c.request_id }))
          .reason,
        "CANCELLED",
      );
      assert.equal((await store.command(c)).reason, "CANCELLED");
      const expired = await store.command(command());
      await admin.query(
        "update kxra_paired_admission.setup_requests set created_at=clock_timestamp()-interval '6 minutes',expires_at=clock_timestamp()-interval '2 minutes' where id=$1",
        [expired.request_id],
      );
      assert.equal(
        (
          await store.command({
            action: "STATUS",
            request_id: expired.request_id,
          })
        ).reason,
        "EXPIRED",
      );
      assert.equal(
        (
          await admin.query(
            "select enabled from kxra_paired_admission.agents where id=$1",
            [receipt.agent_id],
          )
        ).rows[0].enabled,
        false,
      );
    },
  );
  await check(
    "paid, business, AI review and transport withdrawal recompose current policy",
    async () => {
      await admin.query(
        "update kxra_private.live_paid_access set checked_at=clock_timestamp()-interval '1 hour' where org_id=$1",
        [f.org],
      );
      assert.equal(
        (
          await store.command({
            action: "STATUS",
            request_id: ready.request_id,
          })
        ).reason,
        "PAID_PROOF_REQUIRED",
      );
      await refresh();
      await admin.query(
        "update kxra_paired_admission.transport_policies set enabled=false where id=$1",
        [tp],
      );
      assert.equal(
        (
          await store.command({
            action: "STATUS",
            request_id: ready.request_id,
          })
        ).reason,
        "TRANSPORT_REVIEW_REQUIRED",
      );
      await admin.query(
        "update kxra_paired_admission.transport_policies set enabled=true where id=$1",
        [tp],
      );
      await f.reviewAi(intent, "BLOCKED");
      assert.equal(
        (
          await store.command({
            action: "STATUS",
            request_id: ready.request_id,
          })
        ).reason,
        "AI_REVIEW_REQUIRED",
      );
      await f.reviewAi(intent);
      assert.equal(
        (
          await store.command({
            action: "STATUS",
            request_id: ready.request_id,
          })
        ).reason,
        "NEW_REQUEST_REQUIRED",
      );
      await admin.query(
        "update kxra_private.business_eligibility_policies set enabled=false where id=$1",
        [f.eligibilityPolicy],
      );
      assert.equal(
        (
          await store.command({
            action: "STATUS",
            request_id: ready.request_id,
          })
        ).reason,
        "BUSINESS_REVIEW_REQUIRED",
      );
      await admin.query(
        "update kxra_private.business_eligibility_policies set enabled=true where id=$1",
        [f.eligibilityPolicy],
      );
    },
  );
  ready = await store.command(command());
  assert.equal(ready.reason, "POLICY_READY_SETUP_HELD");
  const thread = id(),
    mv = (
      await admin.query(
        "select version from kxra.organisation_memberships where org_id=$1 and account_id=$2",
        [f.org, f.actor],
      )
    ).rows[0].version;
  const a = syntheticPairedAuthority(f.org, f.actor, f.room, thread, mv);
  a.task.agent_id = ready.agent_id;
  const binding = (
    await admin.query(
      "select policy_binding from kxra_paired_admission.setup_requests where id=$1",
      [ready.request_id],
    )
  ).rows[0].policy_binding;
  a.runtime.auth_binding_sha256 = binding.account_binding_sha256;
  a.auth_review.binding_sha256 = binding.account_binding_sha256;
  a.runtime.model_sha256 = binding.model_sha256;
  a.runtime_review.subject_sha256 = pairedRuntimeSubject(a);
  await admin.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.kxra.org_id',$2,false)",
    [f.actor, f.org],
  );
  await admin.query(
    "insert into kxra.team_messages(id,room_id,author_id,body) values($1,$2,$3,$4)",
    [thread, f.room, f.actor, a.task.sources[0].body],
  );
  await admin.query(
    "update kxra_paired_admission.agents set enabled=true where id=$1",
    [ready.agent_id],
  ); // synthetic approval only; no runtime exposes activation
  await admin.query(
    "insert into kxra_paired_admission.devices values($1,$2,$3,$4,$5,$6,$7,true,$8,null)",
    [
      a.device_id,
      f.org,
      f.actor,
      a.task.agent_id,
      a.device_session_id,
      a.realm_id,
      a.continuity_epoch,
      a.task.lease_until,
    ],
  );
  const source = id();
  for (const [rid, kind, artifact] of [
    [a.runtime_review.id, "RUNTIME", a.runtime_review],
    [a.auth_review.id, "AUTH", a.auth_review],
    [
      source,
      "SOURCE",
      { approval: a.approval, task: a.task, context: a.context },
    ],
  ])
    await admin.query(
      "insert into kxra_paired_admission.reviews values($1,$2,$3,$4,null)",
      [rid, kind, artifact, a.task.lease_until],
    );
  await admin.query(
    "insert into kxra_paired_admission.authorities(task_id,org_id,account_id,room_id,device_id,runtime_review_id,auth_review_id,source_review_id,manifest,enabled)values($1,$2,$3,$4,$5,$6,$7,$8,$9,true)",
    [
      a.task.id,
      f.org,
      f.actor,
      f.room,
      a.device_id,
      a.runtime_review.id,
      a.auth_review.id,
      source,
      a,
    ],
  );
  await fenceAdmin.query(
    "insert into kxra_paired_fence.realms values($1,$2,$3,$4,$5,$6,true)",
    [
      a.realm_id,
      a.continuity_epoch,
      f.org,
      f.actor,
      a.device_id,
      a.device_session_id,
    ],
  );
  const request = { task_id: a.task.id, fence: a.task.fence, attempt_id: id() },
    hash = pairedAdmissionDigest(a),
    admission = new PairedAdmissionStore(app, fence, actor, { enabled: true });
  await check(
    "composed authority RLS blocks former storage path when paid proof expires",
    async () => {
      await refresh();
      assert.deepEqual(await admission.readCurrent(request), a);
      await admin.query(
        "update kxra_private.live_paid_access set checked_at=clock_timestamp()-interval '1 hour' where org_id=$1",
        [f.org],
      );
      await assert.rejects(admission.readCurrent(request));
      await refresh();
      assert.deepEqual(await admission.readCurrent(request), a);
    },
  );
  await check(
    "policy withdrawal serializes with consumption; receipt expires at paid-proof bound",
    async () => {
      const c = await app.connect();
      const writer = admin;
      try {
        await c.query("begin");
        await c.query("set local role authenticated");
        await c.query(
          "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true)",
          [
            f.actor,
            f.org,
            JSON.stringify({
              sub: f.actor,
              aal: "aal2",
              session_version: 1,
              auth_time: actor.auth_time,
            }),
          ],
        );
        const result = (
          await c.query(
            "select kxra_paired_admission.consume($1,$2,$3,$4,$5) value",
            [a.task.id, a.task.fence, request.attempt_id, hash, id()],
          )
        ).rows[0].value;
        const deadline = (
          await admin.query(
            "select valid_until from kxra_private.live_paid_access where org_id=$1",
            [f.org],
          )
        ).rows[0].valid_until;
        assert.ok(deadline instanceof Date);
        assert.ok(Date.parse(result.expires_at) <= deadline.getTime());
        write("setup-expiry.json", {
          returned: result.expires_at,
          paid_valid_until: deadline.toISOString(),
          bounded: true,
        });
        await writer.query("set lock_timeout='150ms'");
        // A real policy-table write must wait for the consumer shared fence via its trigger.
        await assert.rejects(
          writer.query(
            "update kxra_private.live_paid_access set checked_at=clock_timestamp() where org_id=$1",
            [f.org],
          ),
          { code: "55P03" },
        );
      } finally {
        await c.query("rollback");
        c.release();
        await writer.query("reset lock_timeout");
      }
    },
  );
  await check(
    "permit deadline includes near-expiry MFA and organisation membership",
    async () => {
      async function preview(authTime: number) {
        const c = await app.connect();
        try {
          await c.query("begin");
          await c.query("set local role authenticated");
          await c.query(
            "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true)",
            [
              f.actor,
              f.org,
              JSON.stringify({
                sub: f.actor,
                aal: "aal2",
                session_version: 1,
                auth_time: authTime,
              }),
            ],
          );
          return (
            await c.query(
              "select kxra_paired_admission.consume($1,$2,$3,$4,$5) value",
              [a.task.id, a.task.fence, id(), hash, id()],
            )
          ).rows[0].value;
        } finally {
          await c.query("rollback");
          c.release();
        }
      }
      const authTime = Math.floor(Date.now() / 1000) - 895,
        receipt = await preview(authTime);
      assert.ok(Date.parse(receipt.expires_at) <= (authTime + 900) * 1000);
      const expiry = new Date(Date.now() + 8000).toISOString();
      await admin.query(
        "update kxra.organisation_memberships set expires_at=$3 where org_id=$1 and account_id=$2",
        [f.org, f.actor, expiry],
      );
      try {
        const receipt = await preview(actor.auth_time);
        assert.ok(Date.parse(receipt.expires_at) <= Date.parse(expiry));
      } finally {
        await admin.query(
          "update kxra.organisation_memberships set expires_at=null where org_id=$1 and account_id=$2",
          [f.org, f.actor],
        );
      }
    },
  );
  await check(
    "setup cancellation after durable burn rejects late consumption without replay",
    async () => {
      const hooked = new PairedAdmissionStore(app, fence, actor, {
        enabled: true,
        afterExternalCommit: async () => {
          await store.command({
            action: "CANCEL",
            request_id: ready.request_id,
          });
        },
      });
      await assert.rejects(
        hooked.consume(request, hash),
        /UNCONFIRMED_NO_REPLAY/,
      );
      assert.equal(
        (
          await admin.query(
            "select count(*)::int n from kxra_paired_admission.consumptions where task_id=$1",
            [a.task.id],
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await fenceAdmin.query(
            "select count(*)::int n from kxra_paired_fence.burns where task_id=$1",
            [a.task.id],
          )
        ).rows[0].n,
        1,
      );
      await assert.rejects(
        admission.consume({ ...request, attempt_id: id() }, hash),
      );
    },
  );
  if (process.env.KXRA_PAIRED_SETUP_UI_PROOF === "1") {
    const { runPairedSetupUiProof } = await import("./paired-setup-ui-native");
    await runPairedSetupUiProof({
      root: p.root,
      runtime: p.runtime,
      env: p.env,
      admin,
      actor,
      room: f.room,
      intent,
      refresh,
      check,
      write,
    });
  }
  write("setup.json", {
    activation: false,
    credentialIssued: false,
    policyComposition: true,
    authRoute: "CUSTOMER_API_KEY",
    subscriptionPermission: false,
  });
}
