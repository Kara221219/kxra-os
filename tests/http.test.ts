import { test } from "node:test";
import assert from "node:assert/strict";
const nativeFetch = globalThis.fetch;
const fetch: typeof nativeFetch = (input, init) =>
  nativeFetch(input, { ...init, signal: AbortSignal.timeout(20000) });
const base = "http://127.0.0.1:3210";
const p2 = "30000000-0000-4000-8000-000000000002",
  p3 = "30000000-0000-4000-8000-000000000003";
async function login(fixture: string) {
  const r = await fetch(base + "/api/auth", {
    method: "POST",
    headers: { origin: base },
    body: new URLSearchParams({ fixture }),
    redirect: "manual",
  });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), base + "/os");
  const cookie = r.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}
async function req(
  url: string,
  cookie?: string,
  body?: unknown,
  method = "POST",
) {
  return fetch(base + "/api/" + url, {
    method: body === undefined ? "GET" : method,
    headers: {
      ...(cookie ? { cookie } : {}),
      origin: base,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
test("HTTP unauthenticated direct API calls cannot read or write", async () => {
  for (const endpoint of [
    "projects",
    "records",
    "files",
    "search?q=project",
    "partners",
    "approvals",
  ])
    assert.equal((await req(endpoint)).status, 401);
  assert.equal(
    (await req("records", undefined, { title: "test" })).status,
    401,
  );
});
test("HTTP owner sees five, partner sees one, revoked sees zero projects", async () => {
  for (const [who, count] of [
    ["owner", 5],
    ["partner", 1],
    ["revoked", 0],
  ] as const) {
    const cookie = await login(who),
      r = await req("projects", cookie);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).length, count);
  }
});
test("HTTP crafted project IDs, owner routes and forged identities rejected", async () => {
  const c = await login("partner");
  assert.equal((await req("projects/" + p3, c)).status, 404);
  assert.equal((await req("projects/not-a-uuid", c)).status, 404);
  assert.equal((await req("partners", c)).status, 403);
  assert.equal((await req("approvals", c)).status, 403);
  const data = {
    kind: "note",
    title: "HTTP security fixture",
    body: "isolationevidence",
    project_id: p3,
    classification: "USER-SUPPLIED INFORMATION",
    visibility: "project_shared",
    data: {},
  };
  assert.equal((await req("records", c, data)).status, 404);
  assert.equal(
    (await req("records", c, { ...data, project_id: p2, user_id: "owner" }))
      .status,
    400,
  );
});
test("HTTP create, read, update with version conflict, retrieve evidence within assignment", async () => {
  const c = await login("partner");
  const r = await req("records", c, {
    kind: "note",
    title: "HTTP security fixture",
    body: "isolationevidence",
    project_id: p2,
    classification: "USER-SUPPLIED INFORMATION",
    visibility: "project_shared",
    data: {},
  });
  assert.equal(r.status, 201, await r.clone().text());
  const row = await r.json();
  const edit = {
    title: row.title,
    body: "isolationevidence amended",
    data: {},
    version: row.version,
  };
  assert.equal((await req("records/" + row.id, c, edit, "PATCH")).status, 200);
  assert.equal((await req("records/" + row.id, c, edit, "PATCH")).status, 409);
  const asked = await req("ask", c, {
    question: "isolationevidence",
    project_id: p2,
  });
  assert.equal(asked.status, 200);
  assert.ok(
    (await asked.json()).citations.some(
      (x: { record_id: string }) => x.record_id === row.id,
    ),
  );
  const viewer = await login("viewer");
  assert.equal((await req("records/" + row.id, viewer)).status, 404);
});
test("HTTP cross-project search and Ask reject inaccessible scope", async () => {
  const c = await login("partner");
  assert.equal((await req("search?q=project&project_id=" + p3, c)).status, 404);
  assert.equal(
    (await req("ask", c, { question: "project", project_id: p3 })).status,
    404,
  );
  const r = await req("search?q=project", c);
  assert.equal(r.status, 200);
  assert.ok(
    (await r.json()).every((x: { project_id: string }) => x.project_id === p2),
  );
  const revoked = await login("revoked");
  assert.deepEqual(await (await req("search?q=project", revoked)).json(), []);
});
test("HTTP cross-project files hidden; all bytes quarantined", async () => {
  const owner = await login("owner");
  const f = new FormData();
  f.set("project_id", p3);
  f.set(
    "file",
    new File(["synthetic security test"], "security-fixture.txt", {
      type: "text/plain",
    }),
  );
  const uploaded = await fetch(base + "/api/files", {
    method: "POST",
    headers: { cookie: owner, origin: base },
    body: f,
  });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const file = await uploaded.json();
  const partner = await login("partner");
  assert.equal((await req("files/" + file.id, partner)).status, 404);
  const visible = await (await req("files", partner)).json();
  assert.ok(!visible.some((x: { id: string }) => x.id === file.id));
  assert.equal((await req("files/" + file.id, owner)).status, 423);
});
test("HTTP CSRF and tampered sessions fail closed", async () => {
  const cookie = await login("owner");
  const r = await fetch(base + "/api/records", {
    method: "POST",
    headers: {
      cookie,
      origin: "https://attacker.invalid",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
  assert.equal((await req("projects", cookie + "tampered")).status, 401);
});
test("HTTP exact approval acceptance works once and accepted evidence cannot be edited", async () => {
  const c = await login("owner");
  const draft = await (
    await req("records", c, {
      kind: "decision",
      title: "HTTP acceptance fixture",
      body: "Synthetic approval exercise",
      classification: "DECISION",
      visibility: "owner_only",
      data: {},
    })
  ).json();
  const requested = await req("approvals", c, {
    action: "record.accept",
    project_id: null,
    payload: { record_id: draft.id, version: draft.version },
  });
  assert.equal(requested.status, 201);
  const a = await requested.json();
  assert.equal(
    (await req("approvals/" + a.id, c, { hash: a.payload_hash, approve: true }))
      .status,
    200,
  );
  assert.equal(
    (await req("approvals/" + a.id + "/execute", c, {})).status,
    200,
  );
  assert.equal(
    (await req("approvals/" + a.id + "/execute", c, {})).status,
    409,
  );
  assert.equal(
    (
      await req(
        "records/" + draft.id,
        c,
        {
          title: "changed",
          body: "changed",
          data: {},
          version: draft.version + 1,
        },
        "PATCH",
      )
    ).status,
    409,
  );
});
