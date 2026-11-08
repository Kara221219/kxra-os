import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import { readPrivateFixtureJson } from "../support/private-fixture-json";
import {
  ownerOverviewSql,
  ownerOverviewFromRow,
} from "../../packages/workspace/owner-overview-contract";

function configuration() {
  assert.ok(
    localModeConfiguration(process.env),
    "EXPLICIT_LOCAL_FIXTURE_REQUIRED",
  );
  assert.ok(
    !process.env.DATABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.VERCEL &&
      !process.env.VERCEL_ENV,
  );
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  const cfg = readPrivateFixtureJson(path.join(runtime, "database.json"));
  for (const directory of [runtime, path.join(runtime, "socket")]) {
    const stat = fs.lstatSync(directory);
    assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
    assert.equal(stat.uid, process.getuid!());
    assert.equal(stat.mode & 0o077, 0);
  }
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  return {
    host: cfg.host as string,
    port: cfg.port as number,
    database: cfg.database as string,
    user: os.userInfo().username,
    ssl: false as const,
    password: "",
    options: "",
  };
}
const org = "10000000-0000-4000-8000-000000000001";
const owner = "20000000-0000-4000-8000-000000000001";
const partner = "20000000-0000-4000-8000-000000000002";
const viewer = "20000000-0000-4000-8000-000000000003";
const revoked = "20000000-0000-4000-8000-000000000004";

test("owner overview native authority, bounded links and nonmutation", async (t) => {
  const db = new pg.Client(configuration());
  await db.connect();
  const base = process.env.KXRA_ORIGIN!;
  assert.equal(new URL(base).hostname, "127.0.0.1");
  const foreignOrg = crypto.randomUUID();
  const pendingEnquiry = crypto.randomUUID();
  const foreignEnquiry = crypto.randomUUID();
  const activity = crypto.randomUUID();
  const taskId = crypto.randomUUID();
  const approvalIds: string[] = Array.from({ length: 3 }, () =>
    crypto.randomUUID(),
  );
  async function login(fixture: string) {
    const r = await fetch(base + "/api/auth", {
      method: "POST",
      headers: { origin: base },
      body: new URLSearchParams({ fixture }),
      redirect: "manual",
    });
    assert.equal(r.status, 303);
    const cookie = r.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);
    return cookie;
  }
  async function html(route: string, cookie?: string) {
    const response = await fetch(base + route, {
      headers: cookie ? { cookie } : {},
      signal: AbortSignal.timeout(90000),
      redirect: "manual",
    });
    return {
      status: response.status,
      text: await response.text(),
      location: response.headers.get("location"),
    };
  }
  async function snapshot(
    account: string,
    selectedOrg = org,
    queryOrg = selectedOrg,
  ) {
    await db.query("begin read only");
    try {
      await db.query("set local role authenticated");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
        [
          account,
          JSON.stringify({
            sub: account,
            aal: "aal2",
            auth_time: Math.floor(Date.now() / 1000),
          }),
          selectedOrg,
        ],
      );
      const result = await db.query(ownerOverviewSql, [queryOrg]);
      return ownerOverviewFromRow(result.rows[0], {
        organisation: "Synthetic test",
        local: true,
      });
    } finally {
      await db.query("rollback");
    }
  }
  async function insertEnquiry(
    id: string,
    scope: string,
    state: string,
    company: string,
    age: string,
  ) {
    await db.query(
      `insert into kxra.public_enquiry_submissions(id,org_id,form_kind,status,name,email,company,message,source_path,consent_recorded_at,request_digest,content_fingerprint,idempotency_key,received_at)
      values($1,$2,'CONTACT',$3,'Synthetic sender','sender@example.invalid',$4,'Synthetic request for the owner overview only.','/contact',now(),$5,$6,$7,now()-$8::interval)`,
      [
        id,
        scope,
        state,
        company,
        "a".repeat(64),
        crypto.randomBytes(32).toString("hex"),
        crypto.randomUUID(),
        age,
      ],
    );
  }
  async function insertActivity(
    id: string,
    title: string,
    age = "0 seconds",
    scope = org,
  ) {
    await db.query(
      `insert into kxra.work_log_entries(id,org_id,entry_type,status,actor_kind,department,title,source_kind,source_id,occurred_at)
      values($1,$2,'SYSTEM_EVENT','RECORDED','SYSTEM','Operations',$3,'AUDIT_EVENT',$4,now()-$5::interval)`,
      [id, scope, title, crypto.randomUUID(), age],
    );
  }
  async function state() {
    return (
      await db.query(`select (select count(*)::text from kxra.audit_events) audit_count,
      (select jsonb_agg(jsonb_build_object('id',id,'state',state,'consumed_at',consumed_at) order by id) from kxra.approvals) approval_states,
      (select count(*)::text from kxra.work_log_entries) work_count,
      (select jsonb_agg(jsonb_build_object('id',id,'state',state,'version',version) order by id) from kxra.workflow_tasks) task_states,
      (select jsonb_agg(jsonb_build_object('id',id,'status',status) order by id) from kxra.public_enquiry_submissions) enquiry_states`)
    ).rows[0];
  }
  try {
    await db.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind,relationship_type) values($1,'Synthetic customer boundary',$2,'CUSTOMER','CUSTOMER')",
      [foreignOrg, `owner-test-${foreignOrg}`],
    );
    await insertEnquiry(
      pendingEnquiry,
      org,
      "UNVERIFIED",
      "Synthetic older pending enquiry",
      "2 days",
    );
    for (let i = 0; i < 55; i++)
      await insertEnquiry(
        crypto.randomUUID(),
        org,
        "CLOSED",
        `Synthetic closed enquiry ${i}`,
        "1 minute",
      );
    await insertEnquiry(
      foreignEnquiry,
      foreignOrg,
      "UNVERIFIED",
      "FOREIGN ENQUIRY MUST NOT LEAK",
      "0 seconds",
    );
    await insertActivity(
      activity,
      "Synthetic retained activity target",
      "1 minute",
    );
    for (const [i, id] of approvalIds.entries())
      await db.query(
        `insert into kxra.approvals(id,org_id,action,payload,payload_hash,environment,requested_by,state,expires_at,consumed_at)
        values($1,$2,'publish',$3,$4,'local',$5,'REQUESTED',case when $6=1 then now() else now()+interval '1 day' end,case when $6=2 then now() else null end)`,
        [
          id,
          org,
          JSON.stringify({ action_summary: `Synthetic approval case ${i}` }),
          crypto.randomBytes(32).toString("hex"),
          owner,
          i,
        ],
      );
    await db.query(
      `insert into kxra.workflow_tasks(id,org_id,project_id,context_record_id,context_version,title,acceptance_criteria,assignee_id,assigned_by,assigned_at)
       select $1,r.org_id,r.project_id,r.id,r.version,'Synthetic owner follow-up task','Review only this disposable fixture record',$3,$3,now()-interval '3 days'
       from kxra.records r join kxra.record_versions v on v.record_id=r.id and v.version=r.version
       where r.org_id=$2 and r.project_id is not null order by r.created_at,r.id limit 1`,
      [taskId, org, owner],
    );
    const ownerCookie = await login("owner");
    await t.test(
      "snapshot runs in an actual READ ONLY transaction and excludes expired/consumed approvals",
      async () => {
        const data = await snapshot(owner);
        assert.ok(data.enquiries.some((item) => item.id === pendingEnquiry));
        assert.ok(data.tasks.some((item) => item.id === taskId));
        assert.ok(!data.enquiries.some((item) => item.id === foreignEnquiry));
        assert.ok(data.approvals.some((item) => item.id === approvalIds[0]));
        assert.ok(
          !data.approvals.some((item) =>
            approvalIds.slice(1).includes(item.id),
          ),
        );
        const expected = await db.query(
          "select count(*)::text n from kxra.public_enquiry_submissions where org_id=$1 and status in ('UNVERIFIED','REVIEWING')",
          [org],
        );
        assert.equal(data.counts.enquiries, Number(expected.rows[0].n));
        assert.ok(data.enquiries.length <= 5 && data.activity.length <= 6);
      },
    );
    await t.test(
      "owner home and inbox GET leave audit, approvals, enquiries and work records unchanged",
      async () => {
        const before = await state();
        for (const route of [
          "/os",
          "/os/enquiries",
          `/os/enquiries?enquiry=${pendingEnquiry}`,
        ]) {
          const page = await html(route, ownerCookie);
          assert.equal(page.status, 200);
          assert.ok(!page.text.includes("Overview temporarily unavailable"));
        }
        assert.deepEqual(await state(), before);
      },
    );
    await t.test(
      "an older pending enquiry is reachable beyond latest fifty and activity survives a page shift",
      async () => {
        const inbox = await html("/os/enquiries", ownerCookie);
        assert.ok(
          !inbox.text.includes(`id="public-enquiry-${pendingEnquiry}"`),
        );
        const taskPage = await html("/os/tasks", ownerCookie);
        assert.ok(taskPage.text.includes(`id="task-${taskId}"`));
        const selected = await html(
          `/os/enquiries?enquiry=${pendingEnquiry}`,
          ownerCookie,
        );
        assert.ok(
          selected.text.includes(`id="public-enquiry-${pendingEnquiry}"`),
        );
        for (let i = 0; i < 55; i++)
          await insertActivity(
            crypto.randomUUID(),
            `Synthetic later activity ${i}`,
          );
        await insertActivity(
          crypto.randomUUID(),
          "Synthetic future event",
          "-1 day",
        );
        const recent = await html("/os/work-log", ownerCookie);
        assert.ok(!recent.text.includes(`id="work-${activity}"`));
        const exact = await html(`/os/work-log?entry=${activity}`, ownerCookie);
        assert.ok(exact.text.includes(`id="work-${activity}"`));
        const data = await snapshot(owner);
        assert.ok(
          !data.activity.some(
            (item) => item.title === "Synthetic future event",
          ),
        );
      },
    );
    await t.test(
      "anonymous, partner, viewer and revoked identities cannot read new owner pages",
      async () => {
        const anonymous = await html("/os/enquiries");
        assert.equal(anonymous.status, 307);
        assert.equal(anonymous.location, "/login");
        for (const fixture of ["partner", "viewer", "revoked"]) {
          const cookie = await login(fixture);
          for (const route of [
            "/os/enquiries",
            `/os/enquiries?enquiry=${pendingEnquiry}`,
            `/os/work-log?entry=${activity}`,
            "/os/venture-overview",
          ]) {
            const page = await html(route, cookie);
            assert.ok(
              !page.text.includes(`id="public-enquiry-${pendingEnquiry}"`),
            );
            assert.ok(!page.text.includes(`id="work-${activity}"`));
            assert.ok(!page.text.includes("owner-metric"));
            assert.ok(
              page.text.includes("Not available") ||
                page.text.includes("Access unavailable") ||
                [303, 307].includes(page.status),
              fixture + route,
            );
          }
        }
        for (const account of [partner, viewer, revoked]) {
          const data = await snapshot(account);
          assert.equal(data.counts.enquiries, 0);
          assert.equal(data.counts.approvals, 0);
          assert.equal(data.counts.activity_seven_days, 0);
        }
      },
    );
    await t.test(
      "customer admin/member and forged selected organisations never inherit platform-owner UI or records",
      async () => {
        const cookie = await login("viewer");
        const member = (
          await db.query(
            "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic customer admin','OWNER_UI_LOCAL_TEST') returning id",
            [foreignOrg, viewer],
          )
        ).rows[0].id;
        try {
          for (const role of ["ORG_ADMIN", "ORG_MEMBER"]) {
            await db.query(
              "update kxra.organisation_memberships set security_role=$2 where id=$1",
              [member, role],
            );
            const scopedCookie = cookie + `; kxra_organisation=${foreignOrg}`;
            const home = await html("/os", scopedCookie);
            assert.ok(!home.text.includes("owner-metric"));
            for (const route of [
              "/os/enquiries",
              `/os/enquiries?enquiry=${pendingEnquiry}`,
              `/os/work-log?entry=${activity}`,
            ]) {
              const page = await html(route, scopedCookie);
              assert.ok(page.text.includes("Not available"), role + route);
            }
            const data = await snapshot(viewer, foreignOrg, org);
            assert.equal(data.counts.enquiries, 0);
            assert.equal(data.counts.approvals, 0);
            assert.equal(data.counts.activity_seven_days, 0);
          }
        } finally {
          await db.query(
            "delete from kxra.organisation_memberships where id=$1",
            [member],
          );
        }
        const foreign = await html(
          `/os/enquiries?enquiry=${foreignEnquiry}`,
          ownerCookie,
        );
        assert.ok(foreign.text.includes("Not available"));
        const forged = await html(
          "/os/enquiries",
          ownerCookie + `; kxra_organisation=${foreignOrg}`,
        );
        assert.ok(!forged.text.includes("FOREIGN ENQUIRY MUST NOT LEAK"));
        const data = await snapshot(owner, org, foreignOrg);
        assert.equal(data.counts.enquiries, 0);
      },
    );
    await t.test(
      "an inactive owner membership cannot load the new overview",
      async () => {
        const member = (
          await db.query(
            "select id from kxra.organisation_memberships where org_id=$1 and account_id=$2",
            [org, owner],
          )
        ).rows[0].id;
        await db.query(
          "update kxra.organisation_memberships set state='SUSPENDED' where id=$1",
          [member],
        );
        try {
          const page = await html("/os", ownerCookie);
          assert.ok(!page.text.includes("owner-metric"));
          const data = await snapshot(owner);
          assert.equal(data.counts.enquiries, 0);
          assert.equal(data.counts.approvals, 0);
        } finally {
          await db.query(
            "update kxra.organisation_memberships set state='ACTIVE' where id=$1",
            [member],
          );
        }
      },
    );
  } finally {
    await db.end();
  }
});
