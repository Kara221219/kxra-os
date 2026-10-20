import { test, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import fs from "node:fs";
import os from "node:os";
import { runtimeFile, testOrigin as base } from "./support/runtime";
const p2 = "30000000-0000-4000-8000-000000000002",
  p3 = "30000000-0000-4000-8000-000000000003";
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
after(() => admin.end());
async function login(fixture: string) {
  const r = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { origin: base },
    body: new URLSearchParams({ fixture }),
    redirect: "manual",
  });
  assert.equal(r.status, 303);
  return r.headers
    .getSetCookie()
    .map((v) => v.split(";", 1)[0])
    .join("; ");
}
function req(path: string, cookie?: string, value?: unknown) {
  return fetch(base + path, {
    method: value === undefined ? "GET" : "POST",
    headers: {
      origin: base,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}
test("workrooms persist shared threads, reject forged scopes, exclude private evidence and revoke access", async () => {
  const owner = await login("owner"),
    partner = await login("partner"),
    viewer = await login("viewer");
  const path = `/api/workrooms/${p2}/threads`,
    input = {
      request_id: crypto.randomUUID(),
      title: "Room acceptance",
      body: "Shared context acceptance",
    };
  assert.equal((await req(path, undefined, input)).status, 401);
  assert.equal(
    (await req(`/api/workrooms/${p3}/threads`, partner, input)).status,
    404,
  );
  assert.equal(
    (await req(`/api/workrooms/${p3}/threads`, viewer, input)).status,
    403,
  );
  assert.equal(
    (await req(path, partner, { ...input, created_by: "forged" })).status,
    400,
  );
  let r = await req(path, partner, input);
  assert.equal(r.status, 201, await r.clone().text());
  const thread = await r.json();
  assert.equal(thread.created_by, "20000000-0000-4000-8000-000000000002");
  assert.equal((await req(path, partner, input)).status, 201);
  assert.equal(
    (await req(path, partner, { ...input, body: "Changed payload" })).status,
    409,
  );
  const detail = path + "/" + thread.id;
  const reply = { request_id: crypto.randomUUID(), body: "Owner reply" };
  assert.equal((await req(detail + "/messages", owner, reply)).status, 201);
  assert.equal(
    (
      await req(`/api/workrooms/${p3}/threads/${thread.id}/messages`, owner, {
        ...reply,
        request_id: crypto.randomUUID(),
      })
    ).status,
    404,
  );
  const output = await (await req(detail, partner)).json();
  assert.equal(output.messages.length, 1);
  const privateRecord = await req("/api/records", owner, {
    kind: "note",
    title: "Private secret",
    body: "privateboardmarker",
    project_id: p2,
    classification: "USER-SUPPLIED INFORMATION",
    visibility: "owner_only",
  });
  assert.equal(privateRecord.status, 201);
  const exported = await req(detail + "/context", partner);
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("cache-control") || "", /no-store/);
  const text = await exported.text();
  assert.match(text, /Owner reply/);
  assert.doesNotMatch(text, /privateboardmarker/);
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        "20000000-0000-4000-8000-000000000003",
        JSON.stringify({
          sub: "20000000-0000-4000-8000-000000000003",
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
        }),
        "10000000-0000-4000-8000-000000000001",
      ],
    );
    assert.equal(
      (await db.query("select id from kxra.records where id=$1", [thread.id]))
        .rowCount,
      0,
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
  const membership = await admin.query(
    "select active from kxra.project_memberships where project_id=$1 and user_id=$2",
    [p2, "20000000-0000-4000-8000-000000000002"],
  );
  try {
    await admin.query(
      "update kxra.project_memberships set active=false where project_id=$1 and user_id=$2",
      [p2, "20000000-0000-4000-8000-000000000002"],
    );
    assert.equal((await req(detail, partner)).status, 404);
    assert.equal((await req(detail + "/context", partner)).status, 404);
  } finally {
    await admin.query(
      "update kxra.project_memberships set active=$3 where project_id=$1 and user_id=$2",
      [p2, "20000000-0000-4000-8000-000000000002", membership.rows[0].active],
    );
  }
});
test("advisory board is owner-only with durable reviews, stale-update protection and private export", async () => {
  const owner = await login("owner"),
    partner = await login("partner");
  const input = {
    request_id: crypto.randomUUID(),
    title: "Owner-only council marker",
    question: "Which bounded test should we run?",
    evidence: "No demand evidence yet",
    constraints: "No new spend",
    options: ["Interview buyers", "Build more tools"],
  };
  assert.equal((await req("/api/advisory-board")).status, 401);
  assert.equal((await req("/api/advisory-board", partner, input)).status, 403);
  const created = await req("/api/advisory-board", owner, input);
  assert.equal(created.status, 201, await created.clone().text());
  const record = await created.json();
  const path = `/api/advisory-board/${record.id}`;
  assert.equal((await req(path, partner)).status, 403);
  assert.equal((await req(`/api/records/${record.id}`, partner)).status, 404);
  const review = {
    version: 1,
    source: "OWNER_REVIEW",
    rationale: "Synthetic assessment based on the supplied limits.",
    uncertainty: "Validate customer demand before committing.",
    scores: [
      [4, 3, 4, 4, 4],
      [1, 1, 2, 1, 2],
    ],
  };
  const saved = await req(path + "/review", owner, review);
  assert.equal(saved.status, 200, await saved.clone().text());
  assert.equal((await req(path + "/review", owner, review)).status, 409);
  const downloaded = await req(path + "/export", owner);
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers.get("cache-control") || "", /no-store/);
  const pack = await downloaded.json();
  assert.equal(pack.review.ranking.recommendation, "Interview buyers");
  assert.equal(pack.review.source, "OWNER_REVIEW");
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        "20000000-0000-4000-8000-000000000002",
        JSON.stringify({
          sub: "20000000-0000-4000-8000-000000000002",
          aal: "aal2",
        }),
        "10000000-0000-4000-8000-000000000001",
      ],
    );
    assert.equal(
      (await db.query("select id from kxra.records where id=$1", [record.id]))
        .rowCount,
      0,
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
});
