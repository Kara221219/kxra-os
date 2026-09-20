import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { moneyUnits } from "../packages/domain";
import { processFileJobs } from "../packages/storage/worker";
import { runtimeFile, testOrigin } from "./support/runtime";
const nativeFetch = globalThis.fetch;
const fetch: typeof nativeFetch = (input, init) =>
  nativeFetch(input, { ...init, signal: AbortSignal.timeout(20000) });
const base = testOrigin;
const p2 = "30000000-0000-4000-8000-000000000002",
  p3 = "30000000-0000-4000-8000-000000000003",
  p4 = "30000000-0000-4000-8000-000000000004",
  p5 = "30000000-0000-4000-8000-000000000005";
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
function fakeEmailAction(operationKey: string) {
  const state = JSON.parse(
    fs.readFileSync(runtimeFile("fake-email.json"), "utf8"),
  ) as {
    messages: { operationKey: string; text: string }[];
  };
  const message = state.messages.find(
    (candidate) => candidate.operationKey === operationKey,
  );
  assert.ok(message);
  const action = message.text.match(/Continue securely: (https?:\/\/\S+)/)?.[1];
  assert.ok(action);
  return action;
}
async function upload(
  cookie: string,
  projectId: string,
  filename: string,
  visibility?: "owner_only" | "project_shared",
  extra?: [string, string],
) {
  const form = new FormData();
  form.set("project_id", projectId);
  if (visibility) form.set("visibility", visibility);
  if (extra) form.set(extra[0], extra[1]);
  form.set(
    "file",
    new File([`synthetic ${filename}`], filename, { type: "text/plain" }),
  );
  return fetch(base + "/api/files", {
    method: "POST",
    headers: { cookie, origin: base },
    body: form,
  });
}
test("HTTP unauthenticated direct API calls cannot read or write", async () => {
  for (const endpoint of [
    "dashboard",
    "portfolio",
    "ideas",
    "work-log",
    "admin",
    "summary",
    "finance-totals",
    "projects",
    `projects/${p2}`,
    "invitations",
    `project-gates?project_id=${p2}`,
    `workflow?project_id=${p2}`,
    "records",
    "files",
    "search?q=project",
    "partners",
    "approvals",
    "whatsapp",
  ])
    assert.equal((await req(endpoint)).status, 401);
  for (const [endpoint, body] of [
    ["ideas", { project_id: p2, title: "test", raw_idea: "test" }],
    ["ideas/00000000-0000-4000-8000-000000000000/state", {}],
    ["ideas/00000000-0000-4000-8000-000000000000/merge", {}],
    ["ideas/00000000-0000-4000-8000-000000000000/share-approval", {}],
    ["records", { title: "test" }],
    ["invitations", { project_id: p2 }],
    ["invitations/redeem", { token: "invalid" }],
    ["project-gates/evidence", { project_id: p2 }],
    ["workflow/ideas/00000000-0000-4000-8000-000000000000/submit", {}],
    ["workflow/experiments", { project_id: p2 }],
    ["workflow/experiments/00000000-0000-4000-8000-000000000000/results", {}],
    ["workflow/tasks", { project_id: p2 }],
    ["workflow/tasks/00000000-0000-4000-8000-000000000000/complete", {}],
    ["workflow/decisions", { project_id: p2 }],
    ["ask", { question: "private" }],
    ["approvals", { action: "record.accept" }],
    ["approvals/00000000-0000-4000-8000-000000000000", {}],
    ["approvals/00000000-0000-4000-8000-000000000000/execute", {}],
  ] as const)
    assert.equal((await req(endpoint, undefined, body)).status, 401, endpoint);
});
test("HTTP owner and active partners see assigned projects; revoked access fails closed", async () => {
  for (const [who, count] of [
    ["owner", 5],
    ["partner", 1],
  ] as const) {
    const cookie = await login(who),
      r = await req("projects", cookie);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).length, count);
  }
  const revoked = await login("revoked");
  assert.equal((await req("projects", revoked)).status, 403);
});
test("AT-03 invitation token stays in delivery and the legacy redeem API is retired", async () => {
  const owner = await login("owner");
  const created = await req("invitations", owner, {
    email: "invitee@fixture.invalid",
    grants: [{ project_id: p3, role: "viewer" }],
    note: "Synthetic HTTP invitation",
    expires_hours: 1,
  });
  assert.equal(created.status, 201, await created.clone().text());
  const invitation = await created.json();
  assert.equal("token" in invitation, false);
  assert.equal(invitation.project_count, 1);
  const listed = await (await req("invitations", owner)).json();
  const listedInvitation = listed.find(
    (row: { id: string }) => row.id === invitation.id,
  );
  assert.ok(listedInvitation);
  assert.deepEqual(listedInvitation.grants, [
    {
      project_id: p3,
      project_code: "PROJECT-003",
      project_name: "AI Property Fly-Through",
      role: "viewer",
      expires_at: null,
    },
  ]);
  assert.ok(listed.every((row: Record<string, unknown>) => !("token" in row)));

  const action = fakeEmailAction(`invitation:${invitation.id}:v1`);
  const actionUrl = new URL(action);
  assert.equal(actionUrl.pathname, "/join");
  assert.equal(actionUrl.search, "");
  const rawToken = new URLSearchParams(actionUrl.hash.slice(1)).get("token");
  assert.ok(rawToken);

  assert.equal(
    (
      await req("invitations/redeem", owner, {
        token: rawToken,
      })
    ).status,
    404,
  );
  const unchanged = (await (await req("invitations", owner)).json()).find(
    (row: { id: string }) => row.id === invitation.id,
  );
  assert.equal(unchanged.state, "SENT");
});
test("HTTP crafted project IDs, owner routes and forged identities rejected", async () => {
  const c = await login("partner");
  assert.equal((await req("projects/" + p3, c)).status, 404);
  assert.equal((await req("projects/not-a-uuid", c)).status, 404);
  assert.equal((await req("partners", c)).status, 403);
  assert.equal((await req("approvals", c)).status, 403);
  assert.equal((await req("dashboard", c)).status, 403);
  assert.equal((await req("portfolio", c)).status, 403);
  assert.equal((await req("work-log", c)).status, 403);
  assert.equal((await req("admin", c)).status, 403);
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
  for (const payload of [
    { question: "project" },
    { question: "project", project_id: null },
    { question: "project", project_id: [p2, p3] },
    { question: "project", project_ids: [p2, p3] },
  ])
    assert.equal((await req("ask", c, payload)).status, 400);
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
  assert.equal((await req("search?q=project", revoked)).status, 403);
  assert.equal(
    (await req("ask", revoked, { question: "project", project_id: p2 })).status,
    403,
  );
});
test("AT-11 Ask is one-project only and returns the exact insufficiency phrase", async () => {
  const c = await login("partner");
  const response = await req("ask", c, {
    question: "term-that-cannot-exist-9f4620c0",
    project_id: p2,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    mode: "evidence-only",
    model: null,
    question: "term-that-cannot-exist-9f4620c0",
    answer: "INSUFFICIENT KXRA EVIDENCE.",
    citations: [],
  });
});
test("HTTP cross-project files stay hidden and indexed bytes require current access", async () => {
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
  await processFileJobs({ workerReference: "http-file-lifecycle" });
  const partner = await login("partner");
  assert.equal((await req("files/" + file.id, partner)).status, 404);
  const visible = await (await req("files", partner)).json();
  assert.ok(!visible.some((x: { id: string }) => x.id === file.id));
  const delivered = await req("files/" + file.id, owner);
  assert.equal(delivered.status, 200, await delivered.clone().text());
  assert.equal(await delivered.text(), "synthetic security test");
});
test("AT-04 owner uploads default private and sharing remains explicit and scoped", async () => {
  const owner = await login("owner");
  const partner = await login("partner");
  const privateUpload = await upload(
    owner,
    p2,
    "privateuploadmarker evidence.txt",
  );
  assert.equal(privateUpload.status, 201, await privateUpload.clone().text());
  const privateFile = await privateUpload.json();
  await processFileJobs({ workerReference: "http-private-file" });
  const partnerFiles = await (await req("files", partner)).json();
  assert.ok(
    !partnerFiles.some((row: { id: string }) => row.id === privateFile.id),
  );
  assert.deepEqual(
    await (await req("search?q=privateuploadmarker", partner)).json(),
    [],
  );
  assert.equal((await req("files/" + privateFile.id, partner)).status, 404);
  assert.equal((await req("files/" + privateFile.id, owner)).status, 200);

  const sharedUpload = await upload(
    owner,
    p2,
    "shareduploadmarker evidence.txt",
    "project_shared",
  );
  assert.equal(sharedUpload.status, 201, await sharedUpload.clone().text());
  const sharedFile = await sharedUpload.json();
  await processFileJobs({ workerReference: "http-shared-file" });
  const sharedList = await (await req("files", partner)).json();
  assert.ok(sharedList.some((row: { id: string }) => row.id === sharedFile.id));
  assert.ok(
    (await (await req("search?q=shareduploadmarker", partner)).json()).some(
      (row: { title: string }) =>
        row.title === "shareduploadmarker evidence.txt",
    ),
  );
  assert.equal((await req("files/" + sharedFile.id, partner)).status, 200);

  assert.equal(
    (await upload(partner, p2, "forged-private.txt", "owner_only")).status,
    403,
  );
  assert.equal(
    (await upload(partner, p3, "forged-project.txt", "project_shared")).status,
    404,
  );
  assert.equal(
    (
      await upload(owner, p2, "forged-key.txt", "owner_only", [
        "object_key",
        "attacker-selected",
      ])
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "files/" + sharedFile.id,
        partner,
        { scan_status: "clean" },
        "PATCH",
      )
    ).status,
    404,
  );
});
test("AT-10 HTTP upload retries, malware rejection and chunk-scoped Ask fail closed", async () => {
  const owner = await login("owner");
  const partner = await login("partner");
  const requestId = crypto.randomUUID();
  const marker = `chunkonly${Date.now()}evidence`;
  const cleanForm = () => {
    const form = new FormData();
    form.set("project_id", p2);
    form.set("visibility", "project_shared");
    form.set("request_id", requestId);
    form.set(
      "file",
      new File([marker], "bounded-evidence.txt", { type: "text/plain" }),
    );
    return form;
  };
  const first = await fetch(base + "/api/files", {
    method: "POST",
    headers: { cookie: owner, origin: base },
    body: cleanForm(),
  });
  assert.equal(first.status, 201, await first.clone().text());
  const firstFile = await first.json();
  const retry = await fetch(base + "/api/files", {
    method: "POST",
    headers: { cookie: owner, origin: base },
    body: cleanForm(),
  });
  assert.equal(retry.status, 201, await retry.clone().text());
  assert.equal((await retry.json()).id, firstFile.id);
  await processFileJobs({ workerReference: "http-at10-clean" });

  const answer = await req("ask", partner, {
    question: marker,
    project_id: p2,
  });
  assert.equal(answer.status, 200, await answer.clone().text());
  const envelope = await answer.json();
  assert.ok(
    envelope.citations.some(
      (citation: { citation_type: string; file_id: string }) =>
        citation.citation_type === "CHUNK" && citation.file_id === firstFile.id,
    ),
  );

  const malwareMarker = `malware${Date.now()}marker`;
  const malicious = new FormData();
  malicious.set("project_id", p2);
  malicious.set("visibility", "project_shared");
  malicious.set(
    "file",
    new File(
      [
        `${malwareMarker} X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*`,
      ],
      "malware-fixture.txt",
      { type: "text/plain" },
    ),
  );
  const maliciousUpload = await fetch(base + "/api/files", {
    method: "POST",
    headers: { cookie: owner, origin: base },
    body: malicious,
  });
  assert.equal(
    maliciousUpload.status,
    201,
    await maliciousUpload.clone().text(),
  );
  const maliciousFile = await maliciousUpload.json();
  await processFileJobs({ workerReference: "http-at10-malware" });
  assert.equal((await req(`files/${maliciousFile.id}`, owner)).status, 404);
  const rejected = (await (await req("files", owner)).json()).find(
    (row: { id: string }) => row.id === maliciousFile.id,
  );
  assert.equal(rejected.lifecycle_state, "REJECTED");
  assert.equal(rejected.state_reason_code, "MALWARE_DETECTED");
  assert.deepEqual(
    await (
      await req("ask", partner, {
        question: malwareMarker,
        project_id: p2,
      })
    ).json(),
    {
      mode: "evidence-only",
      model: null,
      question: malwareMarker,
      answer: "INSUFFICIENT KXRA EVIDENCE.",
      citations: [],
    },
  );
});
test("AT-07 HTTP finance validation and uncapped aggregate endpoint use exact decimals", async () => {
  const owner = await login("owner");
  const partner = await login("partner");
  const readTotals = async () => {
    const response = await req("finance-totals", owner);
    assert.equal(response.status, 200);
    return response.json();
  };
  const before = await readTotals();
  const beforeEur = before.find(
    (row: { currency: string }) => row.currency === "EUR",
  );
  const beforeUnits = beforeEur ? moneyUnits(beforeEur.total) : 0n;
  const entry = (amount: string, data: Record<string, unknown> = {}) => ({
    kind: "finance",
    title: "HTTP decimal finance fixture",
    body: "Synthetic deterministic arithmetic test",
    project_id: null,
    classification: "ESTIMATE",
    visibility: "owner_only",
    data: {
      amount,
      currency: "EUR",
      entry_type: "actual",
      direction: "income",
      ...data,
    },
  });
  for (const amount of ["0.1", "0.2"])
    assert.equal((await req("records", owner, entry(amount))).status, 201);
  const after = await readTotals();
  const afterEur = after.find(
    (row: { currency: string }) => row.currency === "EUR",
  );
  assert.ok(afterEur);
  assert.equal(moneyUnits(afterEur.total) - beforeUnits, 3000n);
  assert.equal((await req("finance-totals", partner)).status, 403);

  for (const invalid of [
    entry("10", { direction: null }),
    entry("10", { currency: {} }),
    entry("10", { entry_type: "unknown" }),
    entry("1e3"),
    { ...entry("10"), data: { amount: "10", currency: "EUR" } },
  ])
    assert.equal((await req("records", owner, invalid)).status, 400);
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
      kind: "note",
      title: "HTTP acceptance fixture",
      body: "Synthetic approval exercise",
      classification: "USER-SUPPLIED INFORMATION",
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
test("AT-02 HTTP concurrent approval execution succeeds exactly once", async () => {
  const cookie = await login("owner");
  const created = await req("records", cookie, {
    kind: "note",
    title: "HTTP concurrent approval fixture",
    body: "Synthetic exact-once exercise",
    classification: "USER-SUPPLIED INFORMATION",
    visibility: "owner_only",
    data: {},
  });
  assert.equal(created.status, 201);
  const draft = await created.json();
  const requested = await req("approvals", cookie, {
    action: "record.accept",
    project_id: null,
    payload: { record_id: draft.id, version: draft.version },
  });
  assert.equal(requested.status, 201);
  const approval = await requested.json();
  assert.equal(
    (
      await req("approvals/" + approval.id, cookie, {
        hash: approval.payload_hash,
        approve: true,
      })
    ).status,
    200,
  );
  const attempts = await Promise.all([
    req("approvals/" + approval.id + "/execute", cookie, {}),
    req("approvals/" + approval.id + "/execute", cookie, {}),
  ]);
  assert.deepEqual(
    attempts.map((response) => response.status).sort(),
    [200, 409],
  );
});
test("AT-08 HTTP completes the P002 idea-to-accepted-decision loop", async () => {
  const ownerCookie = await login("owner");
  const partnerCookie = await login("partner");
  const partnerId = "20000000-0000-4000-8000-000000000002";
  const ideaResponse = await req("ideas", partnerCookie, {
    title: "HTTP bounded fitment idea",
    raw_idea: "Validate one synthetic supplier packet",
    project_id: p2,
    evidence: [],
  });
  assert.equal(ideaResponse.status, 201, await ideaResponse.clone().text());
  const typedIdea = await ideaResponse.json();
  const idea = { ...typedIdea, id: typedIdea.record_id };
  const submitted = { version: idea.version, status: "submitted" };

  const initial = await req(`workflow?project_id=${p2}`, ownerCookie);
  assert.equal(initial.status, 200);
  const initialLoop = await initial.json();
  const evidence = initialLoop.records.find(
    (row: { source_code: string; status: string }) =>
      row.source_code === "PROJECT-002-BRIEF" && row.status === "accepted",
  );
  assert.ok(evidence);
  const refs = [{ record_id: evidence.id, version: evidence.version }];
  const experimentResponse = await req("workflow/experiments", ownerCookie, {
    project_id: p2,
    idea_id: idea.id,
    idea_version: submitted.version,
    title: "HTTP exact-version fitment experiment",
    hypothesis:
      "One synthetic packet can satisfy the specified evidence fields",
    cost_cap: "25.0000",
    currency: "GBP",
    success_criteria: "All synthetic fields are attributable",
    stop_criteria: "Stop on any missing synthetic source",
    evidence: refs,
  });
  assert.equal(
    experimentResponse.status,
    201,
    await experimentResponse.clone().text(),
  );
  const experiment = await experimentResponse.json();

  assert.equal(
    (
      await req("records", ownerCookie, {
        kind: "experiment",
        title: "Generic bypass",
        body: "Must fail",
        project_id: p2,
        classification: "HYPOTHESIS",
        visibility: "project_shared",
        data: {},
      })
    ).status,
    400,
  );
  const taskResponse = await req("workflow/tasks", ownerCookie, {
    context_id: experiment.id,
    context_version: 1,
    assignee_id: partnerId,
    title: "Record the HTTP experiment result",
    acceptance_criteria: "Save an attributable result against experiment v1",
  });
  assert.equal(taskResponse.status, 201, await taskResponse.clone().text());
  const task = await taskResponse.json();
  const resultResponse = await req(
    `workflow/experiments/${experiment.id}/results`,
    partnerCookie,
    {
      version: 1,
      outcome: "success",
      observations: "All synthetic fields were present.",
      metric_value: "1 of 1 complete",
      evidence: refs,
    },
  );
  assert.equal(resultResponse.status, 201, await resultResponse.clone().text());
  const result = await resultResponse.json();
  assert.equal(
    (
      await req(`workflow/tasks/${task.id}/complete`, partnerCookie, {
        version: 1,
        completion_note: "Saved the synthetic result.",
      })
    ).status,
    200,
  );
  const decisionResponse = await req("workflow/decisions", ownerCookie, {
    project_id: p2,
    experiment_id: experiment.id,
    experiment_version: 1,
    result_id: result.id,
    title: "HTTP bounded prototype decision",
    decision: "Permit one local synthetic prototype within the tested scope.",
    evidence: refs,
    supersedes_id: null,
  });
  assert.equal(
    decisionResponse.status,
    201,
    await decisionResponse.clone().text(),
  );
  const decision = await decisionResponse.json();
  const approvalResponse = await req("approvals", ownerCookie, {
    action: "record.accept",
    project_id: p2,
    payload: { record_id: decision.id, version: 1 },
  });
  assert.equal(approvalResponse.status, 201);
  const approval = await approvalResponse.json();
  assert.equal(
    (
      await req(`approvals/${approval.id}`, ownerCookie, {
        hash: approval.payload_hash,
        approve: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await req(`approvals/${approval.id}/execute`, ownerCookie, {})).status,
    200,
  );
  const completed = await (
    await req(`workflow?project_id=${p2}`, ownerCookie)
  ).json();
  const accepted = completed.records.find(
    (row: { id: string }) => row.id === decision.id,
  );
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.version, 2);
  assert.ok(
    completed.links.some(
      (link: {
        from_record_id: string;
        from_version: number;
        relation: string;
      }) =>
        link.from_record_id === decision.id &&
        link.from_version === 2 &&
        link.relation === "decides_experiment",
    ),
  );
  assert.equal(
    completed.tasks.find((row: { id: string }) => row.id === task.id).state,
    "completed",
  );

  const supersedingResponse = await req("workflow/decisions", ownerCookie, {
    project_id: p2,
    experiment_id: experiment.id,
    experiment_version: 1,
    result_id: result.id,
    title: "HTTP refined prototype decision",
    decision:
      "Keep the exact evidence boundary and require another synthetic review.",
    evidence: refs,
    supersedes_id: decision.id,
  });
  assert.equal(
    supersedingResponse.status,
    201,
    await supersedingResponse.clone().text(),
  );
  const superseding = await supersedingResponse.json();
  const supersedingApprovalResponse = await req("approvals", ownerCookie, {
    action: "record.accept",
    project_id: p2,
    payload: { record_id: superseding.id, version: 1 },
  });
  assert.equal(supersedingApprovalResponse.status, 201);
  const supersedingApproval = await supersedingApprovalResponse.json();
  assert.equal(
    (
      await req(`approvals/${supersedingApproval.id}`, ownerCookie, {
        hash: supersedingApproval.payload_hash,
        approve: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await req(`approvals/${supersedingApproval.id}/execute`, ownerCookie, {}))
      .status,
    200,
  );
  const supersededLoop = await (
    await req(`workflow?project_id=${p2}`, ownerCookie)
  ).json();
  assert.ok(
    supersededLoop.links.some(
      (link: {
        from_record_id: string;
        from_version: number;
        relation: string;
        to_record_id: string;
        to_version: number;
      }) =>
        link.from_record_id === superseding.id &&
        link.from_version === 2 &&
        link.relation === "supersedes" &&
        link.to_record_id === decision.id &&
        link.to_version === 2,
    ),
  );

  const viewer = await login("viewer");
  const revoked = await login("revoked");
  assert.equal((await req(`workflow?project_id=${p2}`, viewer)).status, 404);
  assert.equal((await req(`workflow?project_id=${p2}`, revoked)).status, 403);
  assert.equal(
    (
      await req("workflow/experiments", partnerCookie, {
        project_id: p2,
        idea_id: idea.id,
        idea_version: submitted.version,
        title: "Forged owner action",
        hypothesis: "forged",
        cost_cap: "0",
        currency: "GBP",
        success_criteria: "forged",
        stop_criteria: "forged",
        evidence: refs,
      })
    ).status,
    403,
  );
});
test("AT-09 HTTP P005 gate permits only an approved local prototype record", async () => {
  const owner = await login("owner");
  const partner = await login("partner");
  const initial = await (await req(`workflow?project_id=${p5}`, owner)).json();
  const source = initial.records.find(
    (row: { source_code: string }) => row.source_code === "PROJECT-005-BRIEF",
  );
  assert.ok(source);
  const evidence = [{ record_id: source.id, version: source.version }];
  assert.equal(
    (
      await req("project-gates/evidence", owner, {
        project_id: p5,
        gate: "P005_LOCAL_PROTOTYPE",
        title: "Invalid unreviewed demand packet",
        summary: "Must remain blocked",
        claims: { buyer_problem: "Synthetic problem", demand_reviewed: false },
        evidence,
      })
    ).status,
    400,
  );
  const packetResponse = await req("project-gates/evidence", owner, {
    project_id: p5,
    gate: "P005_LOCAL_PROTOTYPE",
    title: "HTTP reviewed synthetic demand packet",
    summary: "Local test evidence only; no market demand is claimed.",
    claims: {
      buyer_problem: "Synthetic buyer needs a bounded local workflow",
      demand_reviewed: true,
    },
    evidence,
  });
  assert.equal(packetResponse.status, 201, await packetResponse.clone().text());
  const packet = await packetResponse.json();
  assert.equal(
    (
      await req("approvals", owner, {
        action: "project.gate",
        project_id: p5,
        payload: {
          gate: "P005_LOCAL_PROTOTYPE",
          evidence_id: packet.id,
          evidence_version: 1,
        },
      })
    ).status,
    409,
  );

  const acceptanceResponse = await req("approvals", owner, {
    action: "record.accept",
    project_id: p5,
    payload: { record_id: packet.id, version: 1 },
  });
  assert.equal(acceptanceResponse.status, 201);
  const acceptance = await acceptanceResponse.json();
  assert.equal(
    (
      await req(`approvals/${acceptance.id}`, owner, {
        hash: acceptance.payload_hash,
        approve: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await req(`approvals/${acceptance.id}/execute`, owner, {})).status,
    200,
  );
  const gateResponse = await req("approvals", owner, {
    action: "project.gate",
    project_id: p5,
    payload: {
      gate: "P005_LOCAL_PROTOTYPE",
      evidence_id: packet.id,
      evidence_version: 2,
    },
  });
  assert.equal(gateResponse.status, 201, await gateResponse.clone().text());
  const gateApproval = await gateResponse.json();
  assert.equal(
    (
      await req(`approvals/${gateApproval.id}`, owner, {
        hash: gateApproval.payload_hash,
        approve: true,
      })
    ).status,
    200,
  );
  assert.equal(
    (await req(`approvals/${gateApproval.id}/execute`, owner, {})).status,
    200,
  );
  const gateState = await (
    await req(`project-gates?project_id=${p5}`, owner)
  ).json();
  assert.ok(
    gateState.authorizations.some(
      (row: { gate_code: string; evidence_id: string; scope: string }) =>
        row.gate_code === "P005_LOCAL_PROTOTYPE" &&
        row.evidence_id === packet.id &&
        row.scope === "local_only",
    ),
  );
  const project = await (await req(`projects/${p5}`, owner)).json();
  assert.equal(project.product_creation_enabled, false);
  assert.equal(project.live_execution_enabled, false);
  assert.deepEqual(
    (
      await (await req(`project-gates?project_id=${p4}`, owner)).json()
    ).policies.map((row: { gate_code: string; threshold_state: string }) => ({
      gate_code: row.gate_code,
      threshold_state: row.threshold_state,
    })),
    [
      {
        gate_code: "P004_PAPER_READINESS",
        threshold_state: "proposed_unset",
      },
    ],
  );
  assert.equal(
    (
      await req("project-gates/evidence", partner, {
        project_id: p5,
        gate: "P005_LOCAL_PROTOTYPE",
        title: "Forged packet",
        summary: "Forged",
        claims: { buyer_problem: "Forged", demand_reviewed: true },
        evidence,
      })
    ).status,
    403,
  );
  assert.equal((await req("product-creation", owner)).status, 404);
  assert.equal((await req("publish", owner, {})).status, 404);
});
