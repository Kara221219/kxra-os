import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { runtimeFile, testOrigin } from "./support/runtime";

const nativeFetch = globalThis.fetch;
const fetch: typeof nativeFetch = (input, init) =>
  nativeFetch(input, { ...init, signal: AbortSignal.timeout(20000) });
const base = testOrigin;
const org = "10000000-0000-4000-8000-000000000001";
const ownerId = "20000000-0000-4000-8000-000000000001";
const p2 = "30000000-0000-4000-8000-000000000002";
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });

after(() => admin.end());

async function login(fixture: string) {
  const response = await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: { origin: base },
    body: new URLSearchParams({ fixture }),
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

async function api(
  endpoint: string,
  cookie?: string,
  payload?: unknown,
  method = "POST",
) {
  return fetch(`${base}/api/${endpoint}`, {
    method: payload === undefined ? "GET" : method,
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: base,
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

function nestedKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(nestedKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [
    key,
    ...nestedKeys(child),
  ]);
}

test("AT-22 Dashboard counts, Portfolio pagination and owner-only control routes are exact", async () => {
  const owner = await login("owner");
  const partner = await login("partner");
  const dashboardResponse = await api("dashboard", owner);
  assert.equal(
    dashboardResponse.status,
    200,
    await dashboardResponse.clone().text(),
  );
  const dashboard = await dashboardResponse.json();
  const expected = (
    await admin.query(
      `select
       (select count(*) from kxra.workflow_tasks where org_id=$1 and state='assigned')+
       (select count(*) from kxra.projects where org_id=$1 and next_gate is not null) as today,
       (select count(*) from kxra.approvals where org_id=$1 and state in ('REQUESTED','APPROVED'))+
       (select count(*) from kxra.records where org_id=$1 and kind='decision' and status in ('draft','submitted')) as decisions,
       (select count(*) from kxra.records where org_id=$1 and kind='risk'
        and coalesce(nullif(data->>'status',''),status) not in ('closed','archived','rejected'))+
       (select count(*) from kxra.records where org_id=$1 and kind='blocker'
        and status not in ('completed','archived','rejected'))+
       (select count(*) from kxra.work_log_entries where org_id=$1 and status='FAILED')+
       (select count(*) from kxra.account_security_events where org_id=$1
        and event_type in ('ACCOUNT_SUSPENDED','ACCOUNT_REVOKED','SESSIONS_REVOKED','MFA_STATE_CHANGED')) as at_risk,
       (select count(*) from kxra.work_log_entries where org_id=$1) as recent`,
      [org],
    )
  ).rows[0];
  assert.equal(dashboard.today.count, Number(expected.today));
  assert.equal(dashboard.needs_your_decision.count, Number(expected.decisions));
  assert.equal(dashboard.at_risk.count, Number(expected.at_risk));
  assert.equal(dashboard.recent_activity.count, Number(expected.recent));
  for (const section of Object.values(dashboard) as any[])
    for (const item of section.items) assert.match(item.href, /^\/os\//);

  const firstResponse = await api(
    "portfolio?page=1&page_size=2&sort=code&direction=asc",
    owner,
  );
  assert.equal(firstResponse.status, 200, await firstResponse.clone().text());
  const first = await firstResponse.json();
  const repeated = await (
    await api("portfolio?page=1&page_size=2&sort=code&direction=asc", owner)
  ).json();
  const second = await (
    await api("portfolio?page=2&page_size=2&sort=code&direction=asc", owner)
  ).json();
  assert.equal(first.total_count, 7);
  assert.equal(first.rows.length, 2);
  assert.deepEqual(
    first.rows.map((row: any) => row.id),
    repeated.rows.map((row: any) => row.id),
  );
  assert.equal(
    new Set([...first.rows, ...second.rows].map((row: any) => row.id)).size,
    4,
  );
  assert.ok(first.rows.every((row: any) => row.venture_score === null));
  assert.ok(first.rows.every((row: any) => row.confidence_score === null));
  const validation = await (
    await api(
      "portfolio?lifecycle_stage=VALIDATION&page_size=100&sort=code&direction=asc",
      owner,
    )
  ).json();
  assert.equal(validation.total_count, 4);
  assert.ok(
    validation.rows.every((row: any) => row.lifecycle_stage === "VALIDATION"),
  );

  for (const endpoint of ["dashboard", "portfolio", "work-log", "admin"])
    assert.equal((await api(endpoint, partner)).status, 403, endpoint);

  const beforeAudit = Number(
    (
      await admin.query(
        "select count(*) as n from kxra.audit_events where org_id=$1 and action='admin.viewed'",
        [org],
      )
    ).rows[0].n,
  );
  const adminResponse = await api("admin", owner);
  assert.equal(adminResponse.status, 200, await adminResponse.clone().text());
  const snapshot = await adminResponse.json();
  assert.equal(snapshot.database.rls_tables, 143);
  assert.equal(snapshot.database.protected_tables, 143);
  assert.ok(
    Object.values(snapshot.integrations).every(
      (value) => typeof value === "boolean",
    ),
  );
  assert.ok(
    nestedKeys(snapshot).every(
      (key) =>
        !/api[_-]?key|access[_-]?token|client[_-]?secret|password/i.test(key),
    ),
    "Admin responses must not expose credential-bearing fields",
  );
  const afterAudit = Number(
    (
      await admin.query(
        "select count(*) as n from kxra.audit_events where org_id=$1 and action='admin.viewed'",
        [org],
      )
    ).rows[0].n,
  );
  assert.equal(afterAudit, beforeAudit + 1);
  assert.equal((await api("admin", owner, {})).status, 404);

  const workLogResponse = await api(
    `work-log?project_id=${p2}&type=AUDIT_EVENT&page_size=20`,
    owner,
  );
  assert.equal(workLogResponse.status, 200);
  const workLog = await workLogResponse.json();
  assert.ok(workLog.rows.length > 0);
  assert.ok(
    workLog.rows.every(
      (row: any) =>
        row.project_id === p2 &&
        row.entry_type === "AUDIT_EVENT" &&
        /^\/os\//.test(row.href),
    ),
  );
});

test("AT-22 HTTP Idea lifecycle and explicit-share isolation reveal no hidden aggregate", async () => {
  const marker = crypto.randomUUID();
  const owner = await login("owner");
  let partner = await login("partner");
  const viewer = await login("viewer");

  const baselineResponse = await api(
    `ideas?project_id=${p2}&submitter_id=${ownerId}&page_size=100`,
    partner,
  );
  assert.equal(baselineResponse.status, 200);
  const baseline = await baselineResponse.json();

  const ownResponse = await api("ideas", partner, {
    project_id: p2,
    title: `AT-22 partner ${marker}`,
    raw_idea: "A raw partner idea",
    structured_summary: "A structured partner summary",
    problem_statement: "A specific customer problem",
    target_customer: "A specific buyer",
    validation_plan: "Run a bounded demand test",
    next_experiment: "Interview five candidate buyers",
    source_note: "HTTP acceptance fixture",
    evidence: [],
  });
  assert.equal(ownResponse.status, 201, await ownResponse.clone().text());
  const own = await ownResponse.json();
  assert.equal(own.source_type, "PARTNER_PORTAL");
  assert.equal(own.state, "NEW");
  assert.equal(own.structured_summary, "A structured partner summary");
  assert.equal(own.venture_score, null);

  const updateResponse = await api(
    `ideas/${own.record_id}`,
    partner,
    {
      version: own.version,
      title: `AT-22 partner revised ${marker}`,
      raw_idea: "A revised raw partner idea",
      structured_summary: "Revised summary",
      problem_statement: "Revised problem",
      target_customer: "Revised customer",
      validation_plan: "Revised validation",
      next_experiment: "Revised experiment",
      source_note: "Revised source",
      evidence: [],
    },
    "PATCH",
  );
  assert.equal(updateResponse.status, 200, await updateResponse.clone().text());
  const updatedOwn = await updateResponse.json();
  assert.equal(updatedOwn.version, own.version + 1);
  assert.equal(updatedOwn.problem_statement, "Revised problem");
  assert.equal(
    (
      await api(
        `ideas/${own.record_id}`,
        partner,
        {
          version: own.version,
          title: "Stale",
          raw_idea: "Stale",
          evidence: [],
        },
        "PATCH",
      )
    ).status,
    409,
  );

  async function ownerIdea(label: string) {
    const response = await api("ideas", owner, {
      project_id: p2,
      title: `AT-22 ${label} ${marker}`,
      raw_idea: `${label} owner idea`,
      evidence: [],
    });
    assert.equal(response.status, 201, await response.clone().text());
    return response.json();
  }
  const shared = await ownerIdea("shared");
  const hidden = await ownerIdea("hidden");
  const beforeShare = await (
    await api(
      `ideas?project_id=${p2}&submitter_id=${ownerId}&page_size=100`,
      partner,
    )
  ).json();
  assert.equal(beforeShare.total_count, baseline.total_count);
  assert.equal((await api(`ideas/${hidden.record_id}`, partner)).status, 404);

  const shareRequest = await api(
    `ideas/${shared.record_id}/share-approval`,
    owner,
    {
      user_id: "20000000-0000-4000-8000-000000000002",
      active: true,
    },
  );
  assert.equal(shareRequest.status, 201, await shareRequest.clone().text());
  const approval = await shareRequest.json();
  assert.equal(approval.action, "idea.share");
  assert.equal(approval.state, "REQUESTED");
  for (const key of [
    "action_summary",
    "before",
    "after",
    "recipient",
    "estimated_cost",
    "risk_summary",
  ])
    assert.ok(Object.hasOwn(approval.payload, key));
  assert.equal(
    (
      await api(`approvals/${approval.id}`, owner, {
        hash: approval.payload_hash,
        approve: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await api(`approvals/${approval.id}/execute`, owner, {})).status,
    200,
  );
  assert.equal(
    (await api(`approvals/${approval.id}/execute`, owner, {})).status,
    409,
  );

  partner = await login("partner");
  const afterShare = await (
    await api(
      `ideas?project_id=${p2}&submitter_id=${ownerId}&page_size=100`,
      partner,
    )
  ).json();
  assert.equal(afterShare.total_count, baseline.total_count + 1);
  assert.ok(
    afterShare.rows.some((row: any) => row.record_id === shared.record_id),
  );
  assert.ok(
    !afterShare.rows.some((row: any) => row.record_id === hidden.record_id),
  );
  assert.equal((await api(`ideas/${shared.record_id}`, partner)).status, 200);
  assert.equal((await api(`ideas/${hidden.record_id}`, partner)).status, 404);
  assert.equal((await api(`ideas/${shared.record_id}`, viewer)).status, 404);
  assert.equal(
    (
      await api(`ideas/${shared.record_id}/state`, partner, {
        version: shared.version,
        state: "TRIAGE",
        reason: "Partner cannot govern states",
      })
    ).status,
    403,
  );

  let lifecycle = await ownerIdea("lifecycle");
  assert.equal(
    (
      await api(`ideas/${lifecycle.record_id}/state`, owner, {
        version: lifecycle.version,
        state: "BUILDING",
        reason: "Invalid direct jump",
      })
    ).status,
    409,
  );
  const states = [lifecycle.state];
  for (const state of [
    "TRIAGE",
    "VALIDATING",
    "PROMISING",
    "BUILDING",
    "PAUSED",
    "REJECTED",
    "TRIAGE",
    "ARCHIVED",
  ]) {
    const response = await api(`ideas/${lifecycle.record_id}/state`, owner, {
      version: lifecycle.version,
      state,
      reason: `HTTP transition to ${state}`,
    });
    assert.equal(response.status, 200, await response.clone().text());
    lifecycle = await response.json();
    states.push(lifecycle.state);
  }
  assert.deepEqual(
    new Set(states),
    new Set([
      "NEW",
      "TRIAGE",
      "VALIDATING",
      "PROMISING",
      "BUILDING",
      "PAUSED",
      "REJECTED",
      "ARCHIVED",
    ]),
  );
  assert.equal(
    (
      await api(`ideas/${lifecycle.record_id}/state`, owner, {
        version: lifecycle.version,
        state: "TRIAGE",
        reason: "Archived is terminal",
      })
    ).status,
    409,
  );

  const canonical = await ownerIdea("canonical");
  const duplicate = await ownerIdea("duplicate");
  const merge = await api(`ideas/${duplicate.record_id}/merge`, owner, {
    version: duplicate.version,
    canonical_id: canonical.record_id,
    reason: "Same bounded acceptance fixture",
  });
  assert.equal(merge.status, 200, await merge.clone().text());
  const merged = await merge.json();
  assert.equal(merged.state, "ARCHIVED");
  assert.equal(merged.duplicate_of, canonical.record_id);

  assert.equal(
    (
      await api("records", partner, {
        kind: "idea",
        title: "Generic bypass",
        body: "Generic bypass",
        project_id: p2,
        classification: "USER-SUPPLIED INFORMATION",
        visibility: "project_shared",
        data: {},
      })
    ).status,
    400,
  );
  assert.equal(
    (await api(`ideas/${crypto.randomUUID()}`, partner)).status,
    404,
  );
});
