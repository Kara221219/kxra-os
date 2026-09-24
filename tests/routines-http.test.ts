import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin } from "./support/runtime";

const nativeFetch = globalThis.fetch;
const fetch: typeof nativeFetch = (input, init) =>
  nativeFetch(input, { ...init, signal: AbortSignal.timeout(20000) });
const base = testOrigin;
const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });

after(() => admin.end());

async function login(fixture: string) {
  const response = await fetch(base + "/api/auth", {
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

async function req(path: string, cookie?: string, payload?: unknown) {
  return fetch(`${base}/api/${path}`, {
    method: payload === undefined ? "GET" : "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: base,
      "Content-Type": "application/json",
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

test("AT-14 HTTP routine registry is owner-only and rejects crafted versions", async () => {
  assert.equal((await req("routines")).status, 401);
  const partner = await login("partner");
  assert.equal((await req("routines", partner)).status, 403);
  assert.equal(
    (
      await req(`routines/versions/${crypto.randomUUID()}/approve`, partner, {
        expected_sha256: "0".repeat(64),
        note: "Forged routine approval",
        request_id: crypto.randomUUID(),
      })
    ).status,
    403,
  );
});

test("AT-14 HTTP exact approval enables one idempotent local slot without delivery", async () => {
  const owner = await login("owner");
  const routinesResponse = await req("routines", owner);
  assert.equal(routinesResponse.status, 200);
  const routines = await routinesResponse.json();
  assert.equal(routines.length, 9);
  const routine = routines.find(
    (item: { code: string }) => item.code === "RTN-001",
  );
  assert.ok(routine);
  let runId: string | null = null;
  try {
    const wrongHash = await req(
      `routines/versions/${routine.version_id}/approve`,
      owner,
      {
        expected_sha256: "0".repeat(64),
        note: "Wrong hash must fail",
        request_id: crypto.randomUUID(),
      },
    );
    assert.equal(wrongHash.status, 409);

    const approved = await req(
      `routines/versions/${routine.version_id}/approve`,
      owner,
      {
        expected_sha256: routine.version_sha256,
        note: "Exact local routine contract reviewed",
        request_id: crypto.randomUUID(),
      },
    );
    assert.equal(approved.status, 200, await approved.clone().text());
    assert.equal((await approved.json()).status, "APPROVED");

    const enabled = await req(
      `routines/versions/${routine.version_id}/state`,
      owner,
      {
        expected_sha256: routine.version_sha256,
        enabled: true,
        request_id: crypto.randomUUID(),
      },
    );
    assert.equal(enabled.status, 200, await enabled.clone().text());
    assert.equal((await enabled.json()).enabled, true);

    const payload = {
      local_date: "2026-03-30",
      project_id: null,
      request_id: crypto.randomUUID(),
    };
    const planned = await req(
      `routines/versions/${routine.version_id}/slots`,
      owner,
      payload,
    );
    assert.equal(planned.status, 200, await planned.clone().text());
    const run = await planned.json();
    assert.equal(run.created, true);
    assert.equal(run.disposition, "QUEUED");
    runId = run.run_id;

    const duplicate = await req(
      `routines/versions/${routine.version_id}/slots`,
      owner,
      { ...payload, request_id: crypto.randomUUID() },
    );
    assert.equal(duplicate.status, 200);
    const existing = await duplicate.json();
    assert.equal(existing.created, false);
    assert.equal(existing.run_id, runId);

    const evidence = await admin.query(
      `select run.state,count(intent.id)::int as notifications
       from kxra.routine_runs run left join kxra.routine_notification_intents intent on intent.run_id=run.id
       where run.id=$1 group by run.state`,
      [runId],
    );
    assert.deepEqual(evidence.rows[0], { state: "QUEUED", notifications: 0 });
  } finally {
    await admin.query("begin");
    try {
      if (runId)
        await admin.query("delete from kxra.routine_runs where id=$1", [runId]);
      await admin.query(
        "update kxra.routine_manifests set enabled=false where id=$1",
        [routine.id],
      );
      await admin.query(
        "update kxra.routine_manifest_versions set status='DRAFT',approved_by=null,approved_at=null where id=$1",
        [routine.version_id],
      );
      await admin.query("commit");
    } catch (error) {
      await admin.query("rollback");
      throw error;
    }
  }
});
