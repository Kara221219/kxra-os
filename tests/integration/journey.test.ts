import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import pg from "pg";
import { spawn } from "node:child_process";
import { testOrigin as base, runtimeFile } from "../support/runtime";
import {
  knowledgeLogin,
  knowledgeOk,
  knowledgeProject,
} from "../support/team-knowledge";
import { exampleCustomApp } from "../../packages/custom-apps/contract";
const id = () => crypto.randomUUID();
async function post(
  path: string,
  body: unknown,
  cookie = "",
  headers: Record<string, string> = {},
) {
  return fetch(base + path, {
    method: "POST",
    headers: {
      cookie,
      origin: base,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
async function ok(p: Promise<Response>) {
  const r = await p;
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
}
async function fixture() {
  const cookie = await knowledgeLogin("owner");
  const room = (
    await knowledgeOk("", cookie, {
      project_id: knowledgeProject,
      name: "Integrated synthetic " + id(),
      guidelines: "Review all proposals",
      access: "PRIVATE",
    })
  ).id;
  const message = (
    await knowledgeOk("/" + room + "/messages", cookie, {
      request_id: id(),
      body: "Synthetic source for connector and app",
    })
  ).id;
  const agent = id(),
    task = id();
  const ctl = (operation: string, payload: unknown) =>
    ok(post("/api/team-space/paired-agents", { operation, payload }, cookie));
  await ctl("CREATE", {
    room_id: room,
    agent_id: agent,
    name: "Integrated fixture",
  });
  const code = (await ctl("INVITE", { room_id: room, agent_id: agent }))
    .pairing_code;
  const dev = (operation: string, payload: unknown, token: string) =>
    ok(
      post("/api/paired-device", { operation, payload }, "", {
        authorization: "Bearer " + token,
      }),
    );
  const token = (await dev("REDEEM", {}, code)).session_token;
  const proposal = await ctl("PROPOSE", {
    room_id: room,
    agent_id: agent,
    request_id: task,
    objective: "Read scoped comments, propose a comment and intake schema",
    message_ids: [message],
  });
  await ctl("APPROVE", {
    room_id: room,
    agent_id: agent,
    task_id: task,
    content_hash: proposal.content_hash,
  });
  const github = (body: unknown) =>
    ok(post("/api/customer-connectors/github", body, cookie));
  const connection = (
    await github({ action: "connect_fixture", allow_write: true })
  ).result;
  const delegation = await ok(
    post(
      "/api/paired-integration",
      {
        operation: "DELEGATE",
        task_id: task,
        connection_id: connection.id,
        allow_proposal: true,
      },
      cookie,
    ),
  );
  const leased = (await dev("POLL", { request_id: id() }, token)).task;
  await dev("START", { task_id: task, fence: leased.fence }, token);
  const invoke = (
    command: unknown,
    delegationToken = delegation.delegation_token,
    sessionToken = token,
  ) =>
    post(
      "/api/paired-integration/device",
      { task_id: task, fence: leased.fence, command },
      "",
      {
        authorization: "Bearer " + sessionToken,
        "x-kxra-delegation": delegationToken,
      },
    );
  return {
    cookie,
    room,
    agent,
    task,
    token,
    leased,
    delegation,
    connection,
    github,
    invoke,
    ctl,
  };
}
test("dual-credential scoped read -> exact human approval -> single fake dispatch -> receipt; app schema awaits human publication", async () => {
  const f = await fixture(),
    cid = f.connection.id;
  assert.notEqual(
    (
      await f.invoke(
        { action: "read", connection_id: cid },
        f.token,
        f.delegation.delegation_token,
      )
    ).status,
    200,
  );
  assert.notEqual(
    (await f.invoke({ action: "read", connection_id: id() })).status,
    200,
  );
  assert.notEqual(
    (
      await f.invoke({
        action: "approve",
        connection_id: cid,
        write_id: id(),
        digest: "a".repeat(64),
      })
    ).status,
    200,
  );
  const read = (await ok(f.invoke({ action: "read", connection_id: cid })))
    .result;
  assert.equal(read.untrusted_content, true);
  const w = (
    await ok(
      f.invoke({
        action: "prepare",
        connection_id: cid,
        read_id: read.receipt.id,
        note: "Reviewed integration comment",
      }),
    )
  ).result;
  assert.equal(w.state, "PENDING");
  assert.equal(
    (
      await ok(
        f.invoke({ action: "dispatch", connection_id: cid, write_id: w.id }),
      )
    ).result.state,
    "PENDING",
  );
  assert.notEqual(
    (
      await post(
        "/api/customer-connectors/github",
        {
          action: "approve",
          connection_id: cid,
          write_id: w.id,
          digest: "a".repeat(64),
        },
        f.cookie,
      )
    ).status,
    200,
  );
  await f.github({
    action: "approve",
    connection_id: cid,
    write_id: w.id,
    digest: w.digest,
  });
  await f.github({
    action: "enqueue",
    connection_id: cid,
    write_id: w.id,
    digest: w.digest,
  });
  const receipt = (
    await ok(
      f.invoke({ action: "dispatch", connection_id: cid, write_id: w.id }),
    )
  ).result;
  assert.equal(receipt.state, "ACCEPTED");
  assert.equal(
    (
      await ok(
        f.invoke({ action: "dispatch", connection_id: cid, write_id: w.id }),
      )
    ).result.provider_comment_id,
    receipt.provider_comment_id,
  );
  const read2 = (await ok(f.invoke({ action: "read", connection_id: cid })))
    .result;
  const uncertain = (
    await ok(
      f.invoke({
        action: "prepare",
        connection_id: cid,
        read_id: read2.receipt.id,
        note: "Crash recovery integration comment",
      }),
    )
  ).result;
  await f.github({
    action: "approve",
    connection_id: cid,
    write_id: uncertain.id,
    digest: uncertain.digest,
  });
  await f.github({
    action: "enqueue",
    connection_id: cid,
    write_id: uncertain.id,
    digest: uncertain.digest,
  });
  const modeFile = path.join(
    process.env.KXRA_GITHUB_FAKE_RUNTIME!,
    "github-provider-mode",
  );
  const providerFile = path.join(
    process.env.KXRA_GITHUB_FAKE_RUNTIME!,
    "github-provider-store.json",
  );
  const beforePosts = JSON.parse(fs.readFileSync(providerFile, "utf8")).posts;
  fs.writeFileSync(modeFile, "hang-after-commit");
  fs.writeFileSync(
    runtimeFile("paired-dispatch-plan.json"),
    JSON.stringify({
      token: f.token,
      delegation: f.delegation.delegation_token,
      request: {
        task_id: f.task,
        fence: f.leased.fence,
        command: {
          action: "dispatch",
          connection_id: cid,
          write_id: uncertain.id,
        },
      },
    }),
    { mode: 0o600 },
  );
  const worker = spawn(
    process.execPath,
    [
      "--conditions=development",
      "--import",
      "tsx",
      "scripts/integration-device-worker-fixture.ts",
    ],
    { env: process.env, stdio: "ignore" },
  );
  try {
    for (
      let n = 0;
      n < 150 &&
      JSON.parse(fs.readFileSync(providerFile, "utf8")).posts === beforePosts;
      n++
    ) {
      assert.equal(
        worker.exitCode,
        null,
        "Worker exited before provider commit",
      );
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(
      JSON.parse(fs.readFileSync(providerFile, "utf8")).posts,
      beforePosts + 1,
    );
    const exited = new Promise((resolve) => worker.once("exit", resolve));
    worker.kill("SIGKILL");
    await exited;
  } finally {
    if (worker.exitCode === null && worker.signalCode === null)
      worker.kill("SIGKILL");
  }
  const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8"));
  const crashDb = new pg.Client({ ...cfg, user: os.userInfo().username });
  await crashDb.connect();
  try {
    assert.equal(
      (
        await crashDb.query(
          "select state from kxra_private.github_writes where id=$1",
          [uncertain.id],
        )
      ).rows[0].state,
      "DISPATCHING",
    );
    await crashDb.query(
      "update kxra_private.github_writes set dispatch_at=clock_timestamp()-interval '10 seconds' where id=$1",
      [uncertain.id],
    );
  } finally {
    await crashDb.end();
  }
  await f.github({ action: "recover", connection_id: cid });
  assert.equal(
    (
      await ok(
        f.invoke({
          action: "dispatch",
          connection_id: cid,
          write_id: uncertain.id,
        }),
      )
    ).result.state,
    "UNCERTAIN",
  );
  assert.equal(
    JSON.parse(fs.readFileSync(providerFile, "utf8")).posts,
    beforePosts + 1,
  );
  fs.writeFileSync(modeFile, "normal");
  const schema = (
    await ok(f.invoke({ action: "app_propose", schema: exampleCustomApp }))
  ).result;
  const app = id();
  await ok(
    post(
      "/api/paired-integration",
      {
        operation: "IMPORT_APP",
        task_id: f.task,
        delegation_id: f.delegation.result.id,
        proposal_id: schema.id,
        digest: schema.digest,
        app_id: app,
        expected_revision: 0,
      },
      f.cookie,
    ),
  );
  const detail = await (
    await fetch(base + "/api/custom-apps/" + f.room + "/" + app, {
      headers: { cookie: f.cookie },
    })
  ).json();
  assert.equal(detail.app.active_version, null);
  assert.deepEqual(detail.versions[0].artifact.schema, exampleCustomApp);
  await ok(
    post(
      "/api/custom-apps/" + f.room,
      {
        operation: "PUBLISH_LOCAL",
        app_id: app,
        expected_revision: 1,
        version: 1,
      },
      f.cookie,
    ),
  );
  const record = id(),
    operation = id();
  await ok(
    post(
      "/api/custom-apps/" + f.room + "/" + app + "/records",
      {
        operation_id: operation,
        record_id: record,
        expected_app_revision: 2,
        schema_version: 1,
        expected_record_revision: 0,
        data: {
          brief: "Integrated persistent value",
          priority: "High",
          reviewed: true,
        },
      },
      f.cookie,
    ),
  );
  const revisionOperation = id();
  await ok(
    post(
      "/api/custom-apps/" + f.room + "/" + app + "/records",
      {
        operation_id: revisionOperation,
        record_id: record,
        expected_app_revision: 2,
        schema_version: 1,
        expected_record_revision: 1,
        data: {
          brief: "Revised integrated persistent value",
          priority: "Normal",
          reviewed: true,
        },
      },
      f.cookie,
    ),
  );
  await ok(
    post(
      "/api/paired-integration",
      {
        operation: "REVOKE",
        task_id: f.task,
        delegation_id: f.delegation.result.id,
      },
      f.cookie,
    ),
  );
  assert.notEqual(
    (await f.invoke({ action: "read", connection_id: cid })).status,
    200,
  );
  fs.writeFileSync(
    runtimeFile("integration-journey.json"),
    JSON.stringify({
      room: f.room,
      task: f.task,
      connection: cid,
      write: w.id,
      comment: receipt.provider_comment_id,
      uncertain: uncertain.id,
      record,
      operation,
      revisionOperation,
      app,
    }),
  );
});
test("task cancellation fences delegation, changed payloads and connector requests", async () => {
  const f = await fixture();
  await f.ctl("CANCEL", {
    room_id: f.room,
    agent_id: f.agent,
    task_id: f.task,
  });
  assert.notEqual(
    (await f.invoke({ action: "read", connection_id: f.connection.id })).status,
    200,
  );
  assert.notEqual(
    (
      await post(
        "/api/paired-integration",
        {
          operation: "DELEGATE",
          task_id: f.task,
          connection_id: f.connection.id,
          allow_proposal: false,
        },
        f.cookie,
      )
    ).status,
    200,
  );
});

test("expired lease without heartbeat rejects app import, renewed delegation and device read", async () => {
  const f = await fixture();
  const proposal = (
    await ok(f.invoke({ action: "app_propose", schema: exampleCustomApp }))
  ).result;
  const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8"));
  const db = new pg.Client({ ...cfg, user: os.userInfo().username });
  await db.connect();
  try {
    await db.query(
      "update kxra.paired_tasks set lease_until=clock_timestamp()-interval '1 second' where id=$1",
      [f.task],
    );
  } finally {
    await db.end();
  }
  assert.notEqual(
    (
      await post(
        "/api/paired-integration",
        {
          operation: "IMPORT_APP",
          task_id: f.task,
          delegation_id: f.delegation.result.id,
          proposal_id: proposal.id,
          digest: proposal.digest,
          app_id: id(),
          expected_revision: 0,
        },
        f.cookie,
      )
    ).status,
    200,
  );
  assert.notEqual(
    (
      await post(
        "/api/paired-integration",
        {
          operation: "DELEGATE",
          task_id: f.task,
          connection_id: f.connection.id,
          allow_proposal: true,
        },
        f.cookie,
      )
    ).status,
    200,
  );
  assert.notEqual(
    (await f.invoke({ action: "read", connection_id: f.connection.id })).status,
    200,
  );
});
