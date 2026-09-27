import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin } from "./support/runtime";

const fetchWithTimeout: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(20_000) });
const p2 = "30000000-0000-4000-8000-000000000002";
const p3 = "30000000-0000-4000-8000-000000000003";
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });

after(() => admin.end());

async function login(fixture: string) {
  const response = await fetchWithTimeout(`${testOrigin}/api/auth`, {
    method: "POST",
    headers: { origin: testOrigin },
    body: new URLSearchParams({ fixture }),
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

async function api(path: string, cookie?: string, payload?: unknown) {
  return fetchWithTimeout(`${testOrigin}/api/${path}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: testOrigin,
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

test("AT-47 HTTP score approval derives identity and rejects crafted project evidence", async () => {
  const owner = await login("owner");
  const partner = await login("partner");
  const [project, evidence, otherEvidence] = await Promise.all([
    admin.query("select governance_version from kxra.projects where id=$1", [
      p2,
    ]),
    admin.query(
      "select id,version from kxra.records where source_code='PROJECT-002-BRIEF'",
    ),
    admin.query(
      "select id,version from kxra.records where source_code='PROJECT-003-BRIEF'",
    ),
  ]);
  const payload = (record: { id: string; version: number }) => ({
    action: "project.score",
    project_id: p2,
    payload: {
      expected_version: project.rows[0].governance_version,
      reason: "HTTP evidence-bound score request",
      factors: [
        {
          factor_key: "customer_problem",
          rating: 4,
          rationale: "Current accepted project brief supports this rating",
          confidence: null,
          evidence: [{ record_id: record.id, version: record.version }],
        },
      ],
    },
  });

  assert.equal(
    (await api("approvals", undefined, payload(evidence.rows[0]))).status,
    401,
  );
  assert.equal(
    (await api("approvals", partner, payload(evidence.rows[0]))).status,
    403,
  );
  assert.equal(
    (await api("approvals", owner, payload(otherEvidence.rows[0]))).status,
    409,
  );
  assert.equal(
    (
      await api("approvals", owner, {
        ...payload(evidence.rows[0]),
        project_id: p3,
      })
    ).status,
    409,
  );

  const createdResponse = await api(
    "approvals",
    owner,
    payload(evidence.rows[0]),
  );
  assert.equal(
    createdResponse.status,
    201,
    await createdResponse.clone().text(),
  );
  const created = await createdResponse.json();
  assert.equal(created.action, "project.score");
  assert.equal(created.payload.envelope_version, 2);
  assert.equal(created.payload.after.venture_score, null);
  assert.equal(Number(created.payload.after.score_coverage), 0.15);

  try {
    const ownerResponse = await api(`project-workspaces/${p2}`, owner);
    assert.equal(ownerResponse.status, 200, await ownerResponse.clone().text());
    const ownerWorkspace = await ownerResponse.json();
    assert.ok(
      ownerWorkspace.scoreAssessments.some(
        (assessment: { id: string; state: string }) =>
          assessment.id === created.payload.assessment_id &&
          assessment.state === "REQUESTED",
      ),
    );
    const partnerResponse = await api(`project-workspaces/${p2}`, partner);
    assert.equal(
      partnerResponse.status,
      200,
      await partnerResponse.clone().text(),
    );
    const partnerWorkspace = await partnerResponse.json();
    assert.ok(
      partnerWorkspace.scoreAssessments.every(
        (assessment: { id: string }) =>
          assessment.id !== created.payload.assessment_id,
      ),
    );
  } finally {
    await admin.query("begin");
    await admin.query(
      "delete from kxra.project_score_factor_evidence where assessment_id=$1",
      [created.payload.assessment_id],
    );
    await admin.query(
      "delete from kxra.project_score_factors where assessment_id=$1",
      [created.payload.assessment_id],
    );
    await admin.query(
      "delete from kxra.project_score_assessments where id=$1",
      [created.payload.assessment_id],
    );
    await admin.query("delete from kxra.audit_events where resource_id=$1", [
      created.id,
    ]);
    await admin.query("delete from kxra.approvals where id=$1", [created.id]);
    await admin.query("commit");
  }
});
