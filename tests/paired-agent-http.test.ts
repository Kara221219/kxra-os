import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { testOrigin as base, runtimeFile } from "./support/runtime";
import {
  knowledgeLogin,
  knowledgeOk,
  knowledgeProject,
} from "./support/team-knowledge";
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8")),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username }),
  app = new pg.Pool(cfg),
  uuid = () => crypto.randomUUID();
after(async () => {
  await admin.end();
  await app.end();
});
const owner = "20000000-0000-4000-8000-000000000001",
  org = "10000000-0000-4000-8000-000000000001";
async function ctl(op: string, payload: unknown, cookie: string) {
  return fetch(base + "/api/team-space/paired-agents", {
    method: "POST",
    headers: { cookie, origin: base, "content-type": "application/json" },
    body: JSON.stringify({ operation: op, payload }),
  });
}
async function dev(op: string, token: string, payload: unknown = {}) {
  return fetch(base + "/api/paired-device", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
    },
    body: JSON.stringify({ operation: op, payload }),
  });
}
async function ok(r: Promise<Response>) {
  const p = await r;
  assert.equal(p.status, 200, await p.clone().text());
  return p.json();
}
async function fixture() {
  const cookie = await knowledgeLogin("owner"),
    room = (
      await knowledgeOk("", cookie, {
        project_id: knowledgeProject,
        name: "Paired fixture " + uuid(),
        guidelines: "Text only",
        access: "PRIVATE",
      })
    ).id,
    message = (
      await knowledgeOk("/" + room + "/messages", cookie, {
        request_id: uuid(),
        body: "Room evidence " + uuid(),
      })
    ).id,
    agent = uuid();
  await ok(
    ctl(
      "CREATE",
      { room_id: room, agent_id: agent, name: "Private synthetic agent" },
      cookie,
    ),
  );
  return { cookie, room, message, agent };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function adminWrite(sql: string, values: unknown[]) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      owner,
    ]);
    await db.query(sql, values);
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}

async function invite(f: Fixture) {
  return (
    await ok(ctl("INVITE", { room_id: f.room, agent_id: f.agent }, f.cookie))
  ).pairing_code as string;
}
async function pair(f: Fixture) {
  return (await ok(dev("REDEEM", await invite(f)))).session_token as string;
}
async function task(f: Fixture, approve = true) {
  const id = uuid();
  await ok(
    ctl(
      "PROPOSE",
      {
        room_id: f.room,
        agent_id: f.agent,
        request_id: id,
        objective: "Draft " + id,
        message_ids: [f.message],
      },
      f.cookie,
    ),
  );
  const view = await ok(
    ctl("VIEW", { room_id: f.room, agent_id: f.agent, task_id: id }, f.cookie),
  );
  if (approve)
    await ok(
      ctl(
        "APPROVE",
        {
          room_id: f.room,
          agent_id: f.agent,
          task_id: id,
          content_hash: view.content_hash,
        },
        f.cookie,
      ),
    );
  return { id, view };
}
async function list(f: Fixture) {
  const r = await fetch(
    base + "/api/team-space/paired-agents?room_id=" + f.room,
    { headers: { cookie: f.cookie } },
  );
  assert.equal(r.status, 200);
  return r.json();
}
test("owner private pairing redeems once and exact approved text returns to its original thread exactly once", async () => {
  const f = await fixture(),
    code = await invite(f),
    redeemed = await Promise.all([dev("REDEEM", code), dev("REDEEM", code)]);
  assert.equal(redeemed.filter((r) => r.status === 200).length, 1);
  const token = (await redeemed.find((r) => r.status === 200)!.json())
    .session_token;
  assert.equal((await dev("REDEEM", code)).status, 401);
  assert.equal((await dev("REDEEM", token)).status, 401);
  assert.equal((await dev("POLL", code, { request_id: uuid() })).status, 401);
  const t = await task(f, false);
  assert.equal(
    (await ok(dev("POLL", token, { request_id: uuid() }))).task,
    null,
  );
  assert.equal(
    (
      await ctl(
        "APPROVE",
        {
          room_id: f.room,
          agent_id: f.agent,
          task_id: t.id,
          content_hash: "0".repeat(64),
        },
        f.cookie,
      )
    ).status,
    409,
  );
  await ok(
    ctl(
      "APPROVE",
      {
        room_id: f.room,
        agent_id: f.agent,
        task_id: t.id,
        content_hash: t.view.content_hash,
      },
      f.cookie,
    ),
  );
  const poll = uuid(),
    [a, b] = await Promise.all([
      ok(dev("POLL", token, { request_id: poll })),
      ok(dev("POLL", token, { request_id: poll })),
    ]);
  assert.equal(a.task.id, t.id);
  assert.equal(a.task.fence, b.task.fence);
  const input = { task_id: t.id, fence: a.task.fence },
    starts = await Promise.all([
      ok(dev("START", token, input)),
      ok(dev("START", token, input)),
    ]);
  assert.equal(starts.filter((s) => s.dispatched === true).length, 1);
  assert.equal(starts.filter((s) => s.dispatched === false).length, 1);
  const result = { ...input, draft_text: "Bounded paired draft" },
    results = await Promise.all([
      ok(dev("RESULT", token, result)),
      ok(dev("RESULT", token, result)),
    ]);
  assert.equal(results[0].message_id, results[1].message_id);
  assert.equal(
    (await dev("RESULT", token, { ...result, draft_text: "Different" })).status,
    409,
  );
  const message = (
    await admin.query(
      "select room_id,parent_id,body from kxra.team_messages where id=$1",
      [results[0].message_id],
    )
  ).rows[0];
  assert.equal(message.room_id, f.room);
  assert.equal(message.parent_id, f.message);
  assert.match(message.body, /PAIRED SYNTHETIC DRAFT/);
});
test("expired/replaced invitations, foreign member/tenant/task and general-login bearer reuse fail closed", async () => {
  const f = await fixture(),
    code = await invite(f);
  await admin.query(
    "update kxra_private.paired_invitations set expires_at=clock_timestamp()-interval '1 second' where agent_id=$1",
    [f.agent],
  );
  assert.equal((await dev("REDEEM", code)).status, 401);
  const replaced = await invite(f),
    current = await invite(f);
  assert.equal((await dev("REDEEM", replaced)).status, 401);
  const token = (await ok(dev("REDEEM", current))).session_token;
  const partner = await knowledgeLogin("partner");
  assert.equal(
    (await ctl("INVITE", { room_id: f.room, agent_id: f.agent }, partner))
      .status,
    403,
  );
  assert.equal(
    (
      await ctl(
        "PROPOSE",
        {
          room_id: f.room,
          agent_id: f.agent,
          request_id: uuid(),
          objective: "Foreign",
          message_ids: [uuid()],
          owner_id: owner,
        },
        f.cookie,
      )
    ).status,
    400,
  );
  const foreign = await fixture();
  assert.equal(
    (
      await ctl(
        "INVITE",
        { room_id: foreign.room, agent_id: f.agent },
        foreign.cookie,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await dev("RESULT", token, {
        task_id: uuid(),
        fence: uuid(),
        draft_text: "Foreign",
      })
    ).status,
    403,
  );
  for (const headers of [
    { authorization: "Bearer " + token },
    { cookie: f.cookie.split("=", 1)[0] + "=" + token },
  ] as Record<string, string>[]) {
    assert.equal(
      (await fetch(base + "/api/team-space/connections", { headers })).status,
      401,
    );
  }
  assert.equal(
    (
      await fetch(base + "/api/team-space", {
        headers: { authorization: "Bearer " + token },
      })
    ).status,
    401,
  );
  assert.equal(
    (await dev("POLL", token, { request_id: uuid(), room_id: foreign.room }))
      .status,
    400,
  );
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await assert.rejects(
      db.query("select * from kxra_pairing.paired_resolve($1,'SESSION')", [
        "a".repeat(64),
      ]),
      { code: "42501" },
    );
    await db.query("rollback");
    await db.query("begin");
    await db.query("set local role authenticated");
    await assert.rejects(
      db.query("insert into kxra.paired_agents default values"),
      { code: "42501" },
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
});
test("offline/reconnect and uncertain dispatch never requeue; cancellation and revocation fence late results", async () => {
  const f = await fixture(),
    token = await pair(f);
  await admin.query(
    "update kxra_private.paired_sessions set last_seen=clock_timestamp()-interval '1 minute' where agent_id=$1",
    [f.agent],
  );
  assert.equal((await list(f)).agents[0].presence, "OFFLINE");
  await ok(dev("HEARTBEAT", token));
  assert.equal((await list(f)).agents[0].presence, "ONLINE");
  const t = await task(f),
    lease = (await ok(dev("POLL", token, { request_id: uuid() }))).task;
  await ok(dev("START", token, { task_id: t.id, fence: lease.fence }));
  await admin.query(
    "update kxra.paired_tasks set lease_until=clock_timestamp()-interval '1 second' where id=$1",
    [t.id],
  );
  assert.equal(
    (await ok(dev("POLL", token, { request_id: uuid() }))).task,
    null,
  );
  assert.equal(
    (await list(f)).tasks.find((x: any) => x.id === t.id).state,
    "UNCERTAIN",
  );
  assert.equal(
    (
      await ok(
        dev("RESULT", token, {
          task_id: t.id,
          fence: lease.fence,
          draft_text: "Late",
        }),
      )
    ).accepted,
    false,
  );
  const cancelled = await task(f),
    c = (await ok(dev("POLL", token, { request_id: uuid() }))).task;
  await ok(dev("START", token, { task_id: cancelled.id, fence: c.fence }));
  await ok(
    ctl(
      "CANCEL",
      { room_id: f.room, agent_id: f.agent, task_id: cancelled.id },
      f.cookie,
    ),
  );
  assert.equal(
    (
      await dev("RESULT", token, {
        task_id: cancelled.id,
        fence: c.fence,
        draft_text: "Cancelled",
      })
    ).status,
    409,
  );
  const revoked = await task(f),
    r = (await ok(dev("POLL", token, { request_id: uuid() }))).task;
  await ok(dev("START", token, { task_id: revoked.id, fence: r.fence }));
  await ok(ctl("REVOKE", { room_id: f.room, agent_id: f.agent }, f.cookie));
  assert.equal((await dev("POLL", token, { request_id: uuid() })).status, 401);
  assert.equal(
    (
      await dev("RESULT", token, {
        task_id: revoked.id,
        fence: r.fence,
        draft_text: "Revoked",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from kxra.team_messages where parent_id=$1",
        [f.message],
      )
    ).rows[0].n,
    0,
  );
});
test("private membership withdrawal and session expiry reject device polling and all late publication", async () => {
  const f = await fixture(),
    token = await pair(f),
    t = await task(f),
    lease = (await ok(dev("POLL", token, { request_id: uuid() }))).task;
  await ok(dev("START", token, { task_id: t.id, fence: lease.fence }));
  await adminWrite(
    "update kxra.team_room_members set active=false where room_id=$1 and account_id=$2",
    [f.room, owner],
  );
  assert.equal((await dev("POLL", token, { request_id: uuid() })).status, 403);
  assert.equal(
    (
      await dev("RESULT", token, {
        task_id: t.id,
        fence: lease.fence,
        draft_text: "Lost membership",
      })
    ).status,
    403,
  );
  const other = await fixture(),
    expired = await pair(other);
  await admin.query(
    "update kxra_private.paired_sessions set expires_at=clock_timestamp()-interval '1 second' where agent_id=$1",
    [other.agent],
  );
  assert.equal(
    (await dev("POLL", expired, { request_id: uuid() })).status,
    401,
  );
});

test("source changes invalidate review and do not block the next eligible draft; foreign active tenant remains isolated", async () => {
  const f = await fixture(),
    token = await pair(f),
    stale = await task(f);
  await adminWrite("update kxra.team_messages set body=$1 where id=$2", [
    "Changed quoted evidence",
    f.message,
  ]);
  const next = await task(f),
    lease = (await ok(dev("POLL", token, { request_id: uuid() }))).task;
  assert.equal(lease.id, next.id);
  assert.equal(
    (await list(f)).tasks.find((t: any) => t.id === stale.id).state,
    "CANCELLED",
  );
  await ok(dev("START", token, { task_id: next.id, fence: lease.fence }));
  await adminWrite("update kxra.team_messages set body=$1 where id=$2", [
    "Changed after dispatch",
    f.message,
  ]);
  assert.equal(
    (
      await dev("RESULT", token, {
        task_id: next.id,
        fence: lease.fence,
        draft_text: "Stale source",
      })
    ).status,
    409,
  );
  const tenant = uuid();
  await adminWrite(
    "insert into kxra.organisations(id,name,slug) values($1,'Foreign paired fixture',$2)",
    [tenant, "paired-" + uuid()],
  );
  await adminWrite(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Foreign context','PAIRED_FIXTURE')",
    [tenant, owner],
  );
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true),set_config('request.kxra.execution_mode','fixture',true)",
      [
        owner,
        tenant,
        JSON.stringify({
          sub: owner,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
          session_version: (
            await admin.query(
              "select session_version from kxra.account_identities where account_id=$1",
              [owner],
            )
          ).rows[0].session_version,
        }),
      ],
    );
    assert.equal(
      (await db.query("select kxra_private.member_org() id")).rows[0].id,
      tenant,
    );
    assert.equal(
      (
        await db.query("select id from kxra.paired_agents where id=$1", [
          f.agent,
        ])
      ).rowCount,
      0,
    );
    await assert.rejects(
      db.query("select kxra.paired_control('LIST',$1::jsonb)", [
        JSON.stringify({ room_id: f.room }),
      ]),
    );
  } finally {
    await db.query("rollback");
    db.release();
    await adminWrite(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=clock_timestamp() where org_id=$1",
      [tenant],
    );
  }
});

test("foreground device client executes a stub CLI through real HTTP authority and discards revoked session", async () => {
  const { PairedDeviceClient } =
    await import("../packages/workspace/paired-device-client");
  const { CodexStdioProcessAdapter } =
    await import("../packages/workspace/codex-stdio-transport");
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const f = await fixture(),
    client = new PairedDeviceClient(base);
  const adapter = new CodexStdioProcessAdapter(
    {
      executable: "/operator/codex",
      workingDirectory: "/tmp",
      environment: { PATH: "/usr/bin:/bin", HOME: "/tmp", CODEX_HOME: "/tmp" },
    },
    (_exe, args, options) =>
      spawn(
        process.execPath,
        [
          fileURLToPath(
            new URL("./support/paired-codex-process.mjs", import.meta.url),
          ),
          "success",
          ...args,
        ],
        options,
      ),
  );
  try {
    await client.setup(await invite(f));
    await task(f);
    assert.equal((await client.runOnce(adapter)).state, "DONE");
    assert.equal(client.state, "ONLINE");
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra.team_messages where parent_id=$1",
          [f.message],
        )
      ).rows[0].n,
      1,
    );
    await ok(ctl("REVOKE", { room_id: f.room, agent_id: f.agent }, f.cookie));
    await assert.rejects(client.reconnect());
    assert.equal(client.state, "REVOKED");
    await assert.rejects(client.runOnce(adapter));
  } finally {
    client.close();
  }
});

test("app login effective private ACL surface is confined to one resolver schema", async () => {
  const inventory = (
    await admin.query(
      `select p.oid::regprocedure::text signature,has_function_privilege('kxra_app',p.oid,'EXECUTE') executable,has_schema_privilege('kxra_app',n.oid,'USAGE') usable,p.prosecdef security_definer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('kxra_private','kxra_pairing') order by 1`,
    )
  ).rows;
  assert.ok(inventory.length > 100);
  assert.deepEqual(
    inventory.filter((r) => r.executable && r.usable).map((r) => r.signature),
    ["kxra_pairing.paired_resolve(text,text)"],
  );
  const audit = await admin.connect();
  let before: unknown;
  try {
    await audit.query("begin");
    await audit.query("grant usage on schema kxra_private to kxra_app");
    before = (
      await audit.query(
        `select p.oid::regprocedure::text signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra_private' and has_function_privilege('kxra_app',p.oid,'EXECUTE') and has_schema_privilege('kxra_app',n.oid,'USAGE') order by 1`,
      )
    ).rows;
  } finally {
    await audit.query("rollback");
    audit.release();
  }
  fs.writeFileSync(
    runtimeFile("paired-private-acl.json"),
    JSON.stringify(
      {
        inventory,
        simulated_0118_usage_grant_unrelated_surface: before,
        simulation: "transaction rolled back; moved resolver excluded",
      },
      null,
      2,
    ),
  );
  for (const sql of [
    "select kxra_private.member_org()",
    "select kxra_private.guard_invitation_email_reconciliation()",
    "select kxra_private.bridge_paid(null::uuid)",
    "select kxra_private.paired_current(null::uuid)",
  ])
    await assert.rejects(app.query(sql), { code: "42501" });
  await assert.rejects(
    app.query("select * from kxra_pairing.paired_resolve($1,'SESSION')", [
      "a".repeat(64),
    ]),
  ); // fixture context absent
});
test("owner cancellation during stub generation aborts subprocess via exact task status", async () => {
  const { PairedDeviceClient } =
    await import("../packages/workspace/paired-device-client");
  const { CodexStdioProcessAdapter } =
    await import("../packages/workspace/codex-stdio-transport");
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const f = await fixture(),
    c = new PairedDeviceClient(base);
  await c.setup(await invite(f));
  const t = await task(f);
  let spawned!: () => void;
  const ready = new Promise<void>((r) => {
    spawned = r;
  });
  let child:
    import("node:child_process").ChildProcessWithoutNullStreams | undefined;
  const adapter = new CodexStdioProcessAdapter(
    {
      executable: "/operator/codex",
      workingDirectory: "/tmp",
      environment: { PATH: "/usr/bin:/bin", HOME: "/tmp", CODEX_HOME: "/tmp" },
    },
    (_e, args, options) => {
      child = spawn(
        process.execPath,
        [
          fileURLToPath(
            new URL("./support/paired-codex-process.mjs", import.meta.url),
          ),
          "hang",
          ...args,
        ],
        options,
      );
      spawned();
      return child;
    },
  );
  try {
    const running = c.runOnce(adapter);
    await Promise.race([
      ready,
      running.then(() => {
        throw Error("Generation did not start");
      }),
    ]);
    await ok(
      ctl(
        "CANCEL",
        { room_id: f.room, agent_id: f.agent, task_id: t.id },
        f.cookie,
      ),
    );
    assert.equal((await running).state, "UNCERTAIN");
    assert.ok(child && (child.exitCode !== null || child.signalCode !== null));
    assert.equal(
      (await list(f)).tasks.find((x: any) => x.id === t.id).state,
      "CANCELLED",
    );
  } finally {
    c.close();
  }
});

test("foreground executable stub-only command interface pairs, reconnects, runs once and closes", async () => {
  const { spawn } = await import("node:child_process");
  const { fileURLToPath } = await import("node:url");
  const f = await fixture(),
    code = await invite(f);
  await task(f);
  const p = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(
        new URL("../scripts/paired-device-foreground.ts", import.meta.url),
      ),
      "--stub-only",
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
    },
  );
  let text = "";
  let buffer = "";
  const frames: any[] = [];
  let notify: (() => void) | undefined;
  p.stdout.on("data", (bytes) => {
    text += bytes.toString();
    buffer += bytes.toString();
    while (buffer.includes("\n")) {
      const at = buffer.indexOf("\n");
      frames.push(JSON.parse(buffer.slice(0, at)));
      buffer = buffer.slice(at + 1);
      notify?.();
    }
  });
  p.stderr.resume();
  p.on("error", () => notify?.());
  const exited = new Promise<void>((resolve) =>
    p.once("close", () => resolve()),
  );
  const next = async () => {
    while (!frames.length) {
      if (p.exitCode !== null) throw Error("Foreground runner exited");
      await Promise.race([
        new Promise<void>((r) => {
          notify = r;
        }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(Error("Foreground response deadline")), 5000),
        ),
      ]);
    }
    return frames.shift();
  };
  const send = (value: unknown) => p.stdin.write(JSON.stringify(value) + "\n");
  try {
    send({
      operation: "SETUP",
      origin: base,
      invitation: code,
      executable: "/stub/codex",
      workingDirectory: "/tmp",
      environment: { PATH: "/usr/bin:/bin", HOME: "/tmp", CODEX_HOME: "/tmp" },
    });
    assert.equal((await next()).state, "ONLINE");
    send({ operation: "RECONNECT" });
    assert.equal((await next()).state, "ONLINE");
    send({ operation: "RUN_ONCE" });
    assert.equal((await next()).receipt.state, "DONE");
    send({ operation: "CLOSE" });
    assert.equal((await next()).state, "CLOSED");
    p.stdin.end();
    await exited;
    assert.equal(text.includes(code), false);
    assert.equal(p.exitCode, 0);
  } finally {
    if (p.exitCode === null && p.signalCode === null) p.kill("SIGTERM");
    await exited;
  }
  // A CLOSE line must interrupt a running command rather than queue behind it.
  const nextTask = await task(f),
    newCode = await invite(f);
  const p2 = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      fileURLToPath(
        new URL("../scripts/paired-device-foreground.ts", import.meta.url),
      ),
      "--stub-only",
      "--stub-hang",
    ],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
    },
  );
  const interruptedFrames: any[] = [];
  let interruptedBuffer = "";
  p2.stdout.on("data", (bytes) => {
    interruptedBuffer += bytes.toString();
    while (interruptedBuffer.includes("\n")) {
      const at = interruptedBuffer.indexOf("\n");
      interruptedFrames.push(JSON.parse(interruptedBuffer.slice(0, at)));
      interruptedBuffer = interruptedBuffer.slice(at + 1);
    }
  });
  p2.stderr.resume();
  const interruptedExit = new Promise<void>((resolve) =>
    p2.once("close", () => resolve()),
  );
  const frame = async () => {
    for (let i = 0; i < 100; i++) {
      if (interruptedFrames.length) return interruptedFrames.shift();
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("Interrupted foreground response deadline");
  };
  try {
    p2.stdin.write(
      JSON.stringify({
        operation: "SETUP",
        origin: base,
        invitation: newCode,
        executable: "/stub/codex",
        workingDirectory: "/tmp",
        environment: {
          PATH: "/usr/bin:/bin",
          HOME: "/tmp",
          CODEX_HOME: "/tmp",
        },
      }) + "\n",
    );
    assert.equal((await frame()).state, "ONLINE");
    p2.stdin.write(JSON.stringify({ operation: "RUN_ONCE" }) + "\n");
    let running = false;
    for (let i = 0; i < 100; i++) {
      if (
        (
          await admin.query("select state from kxra.paired_tasks where id=$1", [
            nextTask.id,
          ])
        ).rows[0].state === "RUNNING"
      ) {
        running = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.equal(running, true);
    p2.stdin.write(JSON.stringify({ operation: "CLOSE" }) + "\n");
    assert.equal((await frame()).state, "CLOSED");
    p2.stdin.end();
    await interruptedExit;
    assert.equal(p2.exitCode, 0);
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra.team_messages where parent_id=$1",
          [f.message],
        )
      ).rows[0].n,
      1,
    );
  } finally {
    if (p2.exitCode === null && p2.signalCode === null) p2.kill("SIGTERM");
    await interruptedExit;
  }
});
