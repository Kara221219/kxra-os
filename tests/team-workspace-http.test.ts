import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin as base } from "./support/runtime";
const config = JSON.parse(
    fs.readFileSync(runtimeFile("database.json"), "utf8"),
  ),
  admin = new pg.Pool({ ...config, user: os.userInfo().username });
after(() => admin.end());
const p2 = "30000000-0000-4000-8000-000000000002",
  p3 = "30000000-0000-4000-8000-000000000003",
  ownerId = "20000000-0000-4000-8000-000000000001",
  partnerId = "20000000-0000-4000-8000-000000000002";
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
  return fetch(base + "/api/team-space" + path, {
    method: value === undefined ? "GET" : "POST",
    headers: {
      origin: base,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: value === undefined ? undefined : JSON.stringify(value),
  });
}
async function ok(path: string, cookie: string, value?: unknown) {
  const r = await req(path, cookie, value);
  assert.ok(r.ok, `${path}: ${r.status} ${await r.clone().text()}`);
  return r.json();
}
test("room history uses precise stable cursors, includes historical runs and rejects inaccessible cursors", async () => {
  const partner = await login("partner"),
    owner = await login("owner"),
    viewer = await login("viewer");
  const { id: room } = await ok("", partner, {
    project_id: p2,
    name: "Paged history regression",
    guidelines: "",
    access: "PRIVATE",
  });
  const { id: otherRoom } = await ok("", partner, {
    project_id: p2,
    name: "Unrelated cursor room",
    guidelines: "",
    access: "PRIVATE",
  });
  const { id: otherMessage } = await ok(`/${otherRoom}/messages`, partner, {
    request_id: crypto.randomUUID(),
    body: "Must not become a history boundary in another room",
  });
  const db = await admin.connect();
  let expected: { id: string }[];
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        partnerId,
        JSON.stringify({ sub: partnerId, aal: "aal2" }),
        "10000000-0000-4000-8000-000000000001",
      ],
    );
    // All 205 messages have exactly the same PostgreSQL timestamp. UUID is the
    // tie-breaker; JS millisecond conversion or timestamp-only paging loses rows.
    await db.query(
      "select kxra.team_message_send(gen_random_uuid(),$1,'Paged history '||n,null) from generate_series(1,205) n",
      [room],
    );
    expected = (
      await db.query(
        "select id from kxra.team_messages where room_id=$1 order by created_at,id",
        [room],
      )
    ).rows;
    assert.equal(
      (
        await db.query(
          "select count(distinct created_at)::int count from kxra.team_messages where room_id=$1",
          [room],
        )
      ).rows[0].count,
      1,
    );
    await db.query("commit");
    for (const denied of [ownerId, "20000000-0000-4000-8000-000000000004"]) {
      await db.query("begin");
      await db.query("set local role authenticated");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
        [
          denied,
          JSON.stringify({ sub: denied, aal: "aal2" }),
          "10000000-0000-4000-8000-000000000001",
        ],
      );
      const deniedRows = await db.query(
        `select id from kxra.team_messages where room_id=$1 and
         (created_at,id)<=(select created_at,id from kxra.team_messages where room_id=$1 and id=$2)`,
        [room, expected[0].id],
      );
      assert.equal(
        deniedRows.rowCount,
        0,
        "RLS protects cursor and message rows",
      );
      await db.query("rollback");
    }
  } finally {
    await db.query("rollback");
    db.release();
  }
  const { id: connection } = await ok("/connections", partner, {
    name: "Historical run fixture",
    provider: "FIXTURE",
    model: "fixture-draft",
    key: "local-fixture",
  });
  const { id: agent } = await ok(`/${room}/agents`, partner, {
    connection_id: connection,
    name: "History analyst",
    instructions: "Draft only.",
  });
  const run = await ok(`/${room}/run`, partner, {
    request_id: crypto.randomUUID(),
    agent_id: agent,
    message_id: expected![0].id,
    context: "MESSAGE_ONLY",
  });
  assert.equal(run.status, "SUCCEEDED");
  const initial = await ok("/" + room, partner);
  assert.equal(initial.messages.length, 100);
  assert.deepEqual(
    initial.messages.map((m: { id: string }) => m.id),
    expected!.slice(105).map((m) => m.id),
  );
  assert.equal(initial.next_before, expected![105].id);
  const response = await req(
    `/${room}/messages?before=${initial.next_before}`,
    partner,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  const middle = await response.json();
  assert.equal(middle.messages.length, 100);
  const final = await ok(
    `/${room}/messages?before=${middle.next_before}`,
    partner,
  );
  assert.equal(final.messages.length, 5);
  assert.equal(final.next_before, null);
  assert.deepEqual(
    [...final.messages, ...middle.messages, ...initial.messages].map(
      (m: { id: string }) => m.id,
    ),
    expected!.map((m) => m.id),
  );
  assert.ok(
    final.runs.some(
      (r: { id: string; output: string }) =>
        r.id === run.id && r.output.includes("LOCAL DEMONSTRATION"),
    ),
  );
  assert.deepEqual(
    await ok(`/${room}/messages?before=${middle.next_before}`, partner),
    final,
    "same cursor is repeatable",
  );
  const empty = await ok(
    `/${room}/messages?before=${expected![0].id}`,
    partner,
  );
  assert.deepEqual(empty.messages, []);
  assert.equal(empty.next_before, null);
  assert.deepEqual(empty.runs, []);
  for (const cookie of [undefined, owner, viewer]) {
    assert.equal(
      (await req(`/${room}/messages?before=${initial.next_before}`, cookie))
        .status,
      cookie ? 404 : 401,
    );
  }
  for (const cursor of [otherMessage, crypto.randomUUID()])
    assert.equal(
      (await req(`/${room}/messages?before=${cursor}`, partner)).status,
      404,
    );
  for (const query of [
    "before=invalid",
    "limit=100000",
    `before=${initial.next_before}&before=${middle.next_before}`,
    `before=${initial.next_before}&org_id=${p2}`,
  ])
    assert.equal(
      (await req(`/${room}/messages?${query}`, partner)).status,
      400,
    );
  // Inserting at the head does not shift or duplicate an existing older page.
  await ok(`/${room}/messages`, partner, {
    request_id: crypto.randomUUID(),
    body: "New head while browsing older history",
  });
  assert.deepEqual(
    await ok(`/${room}/messages?before=${middle.next_before}`, partner),
    final,
  );
  await ok(`/${room}/members`, partner, { account_id: ownerId, active: true });
  assert.equal(
    (await req(`/${room}/messages?before=${middle.next_before}`, owner)).status,
    200,
  );
  await ok(`/${room}/members`, partner, { account_id: ownerId, active: false });
  assert.equal(
    (await req(`/${room}/messages?before=${middle.next_before}`, owner)).status,
    404,
    "previously valid cursor cannot survive revocation",
  );
});
test("team workspace: private room isolation, BYOK metadata safety, thread-scoped agent runs, approvals and revocation", async () => {
  const owner = await login("owner"),
    partner = await login("partner"),
    viewer = await login("viewer");
  assert.equal((await req("")).status, 401);
  assert.equal((await req("/overview")).status, 401);
  const roomInput = {
    project_id: p2,
    name: "Customer operations test",
    guidelines: "Use evidence; propose one action.",
    access: "PRIVATE",
  };
  assert.equal(
    (await req("", partner, { ...roomInput, project_id: p3 })).status,
    403,
  );
  assert.equal(
    (await req("", partner, { ...roomInput, created_by: ownerId })).status,
    400,
  );
  const { id: r } = await ok("", partner, roomInput);
  assert.equal(
    (await req("/" + r, owner)).status,
    404,
    "Owner cannot bypass private room membership",
  );
  assert.equal((await req("/" + r, viewer)).status, 404);
  await ok(`/${r}/members`, partner, { account_id: ownerId, active: true });
  assert.equal((await req("/" + r, owner)).status, 200);
  assert.equal(
    (
      await req(`/${r}/members`, owner, {
        account_id: partnerId,
        active: false,
      })
    ).status,
    403,
    "Only creator manages room",
  );
  assert.equal(
    (
      await req("/connections", partner, {
        name: "Real keys prohibited in fixture",
        provider: "OPENAI",
        model: "x",
        key: "synthetic-secret",
      })
    ).status,
    400,
  );
  const { id: c } = await ok("/connections", partner, {
    name: "Test local model",
    provider: "FIXTURE",
    model: "fixture-draft",
    key: "local-fixture",
  });
  const connections = await ok("/connections", partner);
  assert.ok(connections.some((row: { id: string }) => row.id === c));
  assert.doesNotMatch(
    JSON.stringify(connections),
    /encrypted_key|local-fixture/,
  );
  assert.ok(
    !(await ok("/connections", owner)).some(
      (row: { id: string }) => row.id === c,
    ),
  );
  const { id: agent } = await ok(`/${r}/agents`, partner, {
    connection_id: c,
    name: "Operations analyst",
    instructions: "Find a bottleneck and draft the next step.",
  });
  const message = {
    request_id: crypto.randomUUID(),
    body: "Review the enquiry handoff.",
  };
  await ok(`/${r}/messages`, partner, message);
  await ok(`/${r}/messages`, partner, message);
  assert.equal(
    (await req(`/${r}/messages`, partner, { ...message, body: "Changed" }))
      .status,
    409,
  );
  await ok(`/${r}/messages`, owner, {
    request_id: crypto.randomUUID(),
    body: "Never include this unrelated thread marker.",
  });
  await ok(`/${r}/messages`, owner, {
    request_id: crypto.randomUUID(),
    body: "Shared reply evidence.",
    parent_id: message.request_id,
  });
  const runInput = {
    request_id: crypto.randomUUID(),
    agent_id: agent,
    message_id: message.request_id,
    context: "MESSAGE_ONLY",
  };
  const run = await ok(`/${r}/run`, owner, runInput);
  assert.equal(run.status, "SUCCEEDED");
  assert.match(run.output, /LOCAL DEMONSTRATION/);
  assert.match(run.output, /1 authorised message/);
  assert.doesNotMatch(run.output, /unrelated thread marker/);
  assert.equal(
    (await req(`/${r}/agent-state`, owner, { agent_id: agent, enabled: false }))
      .status,
    403,
  );
  await ok(`/${r}/agent-state`, partner, { agent_id: agent, enabled: false });
  assert.equal(
    (
      await req(`/${r}/run`, owner, {
        ...runInput,
        request_id: crypto.randomUUID(),
      })
    ).status,
    404,
  );
  await ok(`/${r}/agent-state`, partner, { agent_id: agent, enabled: true });
  assert.equal(
    (await req(`/${r}/run`, owner, runInput)).status,
    409,
    "Never dispatch twice on retry",
  );
  const logs = await admin.query(
    "select context_ids,context_sha256 from kxra.team_runs where id=$1",
    [run.id],
  );
  assert.deepEqual(logs.rows[0].context_ids, [message.request_id]);
  assert.match(logs.rows[0].context_sha256, /^[a-f0-9]{64}$/);
  const { id: other } = await ok("", owner, {
    ...roomInput,
    name: "Another private room",
  });
  const otherMessage = crypto.randomUUID();
  await ok(`/${other}/messages`, owner, {
    request_id: otherMessage,
    body: "Other project context",
  });
  assert.equal(
    (
      await req(`/${r}/run`, partner, {
        ...runInput,
        request_id: crypto.randomUUID(),
        message_id: otherMessage,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await req(`/${r}/messages`, partner, {
        request_id: crypto.randomUUID(),
        body: "Forged parent",
        parent_id: otherMessage,
      })
    ).status,
    409,
  );
  const { id: task } = await ok(`/${r}/items`, owner, {
    title: "Operations owner to validate the next step",
  });
  const sharedOverview = await ok("/overview", owner);
  assert.ok(
    sharedOverview.runs.some((row: { id: string }) => row.id === run.id),
  );
  assert.equal(
    sharedOverview.tasks.find((row: { id: string }) => row.id === task)
      .can_review,
    false,
  );
  assert.doesNotMatch(
    JSON.stringify(sharedOverview),
    /LOCAL DEMONSTRATION|encrypted_key|context_sha256/,
  );
  const creatorOverview = await ok("/overview", partner);
  assert.equal(
    creatorOverview.tasks.find((row: { id: string }) => row.id === task)
      .can_review,
    true,
  );
  assert.equal(
    (
      await req(`/${r}/decide`, owner, {
        item_id: task,
        version: 1,
        state: "APPROVED",
      })
    ).status,
    409,
  );
  await ok(`/${r}/decide`, partner, {
    item_id: task,
    version: 1,
    state: "APPROVED",
  });
  assert.equal(
    (
      await req(`/${r}/decide`, partner, {
        item_id: task,
        version: 1,
        state: "DONE",
      })
    ).status,
    409,
  );
  await ok(`/${r}/decide`, partner, {
    item_id: task,
    version: 2,
    state: "DONE",
  });
  await ok("/connections/" + c, partner, { enabled: false });
  assert.equal(
    (
      await req(`/${r}/run`, owner, {
        ...runInput,
        request_id: crypto.randomUUID(),
      })
    ).status,
    403,
  );
  await ok(`/${r}/members`, partner, { account_id: ownerId, active: false });
  assert.equal((await req("/" + r, owner)).status, 404);
  for (const cookie of [owner, viewer]) {
    const overview = await ok("/overview", cookie);
    assert.ok(!overview.tasks.some((row: { id: string }) => row.id === task));
    assert.ok(!overview.runs.some((row: { id: string }) => row.id === run.id));
  }
  const ownerTasks = await fetch(base + "/os/tasks", {
    headers: { cookie: owner },
  });
  assert.equal(ownerTasks.status, 200);
  assert.ok(
    !(await ownerTasks.text()).includes(task),
    "HTML task view cannot leak private room task IDs",
  );
  const ownerRuns = await fetch(base + "/os/runs", {
    headers: { cookie: owner },
  });
  assert.equal(ownerRuns.status, 200);
  assert.ok(
    !(await ownerRuns.text()).includes(run.id),
    "HTML run view cannot bypass private room membership",
  );
  // Real database-role assertions, independent from the HTTP handlers.
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        ownerId,
        JSON.stringify({
          sub: ownerId,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
        }),
        "10000000-0000-4000-8000-000000000001",
      ],
    );
    assert.equal(
      (await db.query("select id from kxra.team_rooms where id=$1", [r]))
        .rowCount,
      0,
    );
    assert.equal(
      (
        await db.query("select id from kxra.team_messages where room_id=$1", [
          r,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (await db.query("select id from kxra.team_runs where room_id=$1", [r]))
        .rowCount,
      0,
    );
    assert.equal(
      (await db.query("select id from kxra.team_events where room_id=$1", [r]))
        .rowCount,
      0,
    );
    for (const actorId of [
      partnerId,
      ownerId,
      "20000000-0000-4000-8000-000000000003",
      "20000000-0000-4000-8000-000000000004",
      crypto.randomUUID(),
    ]) {
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true)",
        [
          actorId,
          JSON.stringify({
            sub: actorId,
            aal: "aal2",
            auth_time: Math.floor(Date.now() / 1000),
          }),
        ],
      );
      for (const table of [
        "team_rooms",
        "team_room_members",
        "team_connections",
        "team_agents",
        "team_messages",
        "team_runs",
        "team_items",
        "team_events",
      ]) {
        const key =
          table === "team_rooms" || table === "team_connections"
            ? "id"
            : "room_id";
        const result = await db.query(
          `select ${key} from kxra.${table} where ${key}=$1`,
          [table === "team_connections" ? c : r],
        );
        if (actorId === partnerId)
          assert.ok(result.rowCount! > 0, `positive ${table}`);
        else assert.equal(result.rowCount, 0, `isolated ${actorId}:${table}`);
      }
    }
    await assert.rejects(
      db.query("select encrypted_key from kxra.team_connections"),
      { code: "42501" },
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
  try {
    await admin.query(
      "update kxra.project_memberships set active=false where project_id=$1 and user_id=$2",
      [p2, partnerId],
    );
    assert.equal((await req("/" + r, partner)).status, 404);
    assert.equal(
      (
        await req(`/${r}/messages`, partner, {
          request_id: crypto.randomUUID(),
          body: "Denied after revocation",
        })
      ).status,
      404,
    );
  } finally {
    await admin.query(
      "update kxra.project_memberships set active=true where project_id=$1 and user_id=$2",
      [p2, partnerId],
    );
  }
});

test("delegated model runs discard results and refuse new dispatch when connection authority is withdrawn", async () => {
  const owner = await login("owner"),
    partner = await login("partner");
  const { id: room } = await ok("", partner, {
    project_id: p2,
    name: "Revocation regression",
    guidelines: "",
    access: "PRIVATE",
  });
  await ok(`/${room}/members`, partner, { account_id: ownerId, active: true });
  const { id: connection } = await ok("/connections", partner, {
    name: "Revocation fixture",
    provider: "FIXTURE",
    model: "fixture-draft",
    key: "local-fixture",
  });
  const { id: agent } = await ok(`/${room}/agents`, partner, {
    connection_id: connection,
    name: "Revocation agent",
    instructions: "Draft only.",
  });
  const message = crypto.randomUUID();
  await ok(`/${room}/messages`, owner, {
    request_id: message,
    body: "Authorised synthetic input",
  });
  // Use the application's actual database login, not a superuser completion.
  assert.equal(config.user, "kxra_app");
  const app = new pg.Pool(config);
  async function applicationQuery(sql: string, values: unknown[]) {
    const db = await app.connect();
    try {
      await db.query("begin");
      await db.query("set local role authenticated");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
        [
          ownerId,
          JSON.stringify({
            sub: ownerId,
            aal: "aal2",
            auth_time: Math.floor(Date.now() / 1000),
          }),
          "10000000-0000-4000-8000-000000000001",
        ],
      );
      const result = await db.query(sql, values);
      await db.query("commit");
      return result;
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  }
  const changes = [
    {
      name: "model disconnected",
      sql: "update kxra.team_connections set enabled=$2 where id=$1",
      values: [connection],
    },
    {
      name: "agent paused",
      sql: "update kxra.team_agents set enabled=$2 where id=$1",
      values: [agent],
    },
    {
      name: "connection owner project access withdrawn",
      sql: "update kxra.project_memberships set active=$2 where project_id=$1 and user_id=$3",
      values: [p2, partnerId],
    },
    {
      name: "connection owner private membership withdrawn",
      sql: "update kxra.team_room_members set active=$2 where room_id=$1 and account_id=$3",
      values: [room, partnerId],
    },
    {
      name: "connection owner organisation access withdrawn",
      sql: "update kxra.organisation_memberships set state=case when $2 then 'ACTIVE' else 'REVOKED' end,revoked_at=case when $2 then null else now() end where account_id=$1 and org_id='10000000-0000-4000-8000-000000000001'",
      values: [partnerId],
    },
    {
      name: "requester private membership withdrawn",
      sql: "update kxra.team_room_members set active=$2 where room_id=$1 and account_id=$3",
      values: [room, ownerId],
    },
  ];
  // Audit triggers need a verified synthetic actor even for administrative test mutations.
  async function change(sql: string, values: unknown[]) {
    const db = await admin.connect();
    try {
      await db.query("begin");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        ownerId,
      ]);
      await db.query(sql, values);
      await db.query("commit");
    } catch (error) {
      await db.query("rollback");
      throw error;
    } finally {
      db.release();
    }
  }
  try {
    for (const scenario of changes) {
      const run = crypto.randomUUID();
      const args = [run, room, agent, message, [message], "a".repeat(64)];
      await applicationQuery(
        "select kxra.team_run_start($1,$2,$3,$4,$5,$6)",
        args,
      );
      const [first, ...rest] = scenario.values;
      try {
        await change(scenario.sql, [first, false, ...rest]);
        await applicationQuery("select kxra.team_run_finish($1,$2,null,4,2)", [
          run,
          "Must not publish",
        ]);
        const stored = (
          await admin.query(
            "select status,output,error_code from kxra.team_runs where id=$1",
            [run],
          )
        ).rows[0];
        assert.deepEqual(
          stored,
          { status: "CANCELLED", output: "", error_code: "ACCESS_CHANGED" },
          scenario.name,
        );
        await assert.rejects(
          applicationQuery("select kxra.team_run_start($1,$2,$3,$4,$5,$6)", [
            crypto.randomUUID(),
            ...args.slice(1),
          ]),
          { code: "42501" },
        );
      } finally {
        await change(scenario.sql, [first, true, ...rest]);
      }
    }
  } finally {
    await app.end();
  }
});
