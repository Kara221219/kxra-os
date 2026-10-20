import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin as base } from "./support/runtime";
import {
  knowledgeFixture,
  knowledgeLogin,
  knowledgeOk as ok,
  knowledgeRequest as req,
} from "./support/team-knowledge";
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8")),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username });
after(() => admin.end());
const org = "10000000-0000-4000-8000-000000000001",
  owner = "20000000-0000-4000-8000-000000000001",
  partner = "20000000-0000-4000-8000-000000000002";
async function as(
  pool: pg.Pool,
  actor: string,
  sql: string,
  values: unknown[] = [],
  tenant = org,
) {
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        actor,
        JSON.stringify({
          sub: actor,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
        }),
        tenant,
      ],
    );
    const result = await db.query(sql, values);
    await db.query("commit");
    return result;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
const proposal = (agent: string, title: string, body: string) => ({
  request_id: crypto.randomUUID(),
  agent_id: agent,
  kind: "PREFERENCE",
  title,
  body,
});
const runInput = (f: Awaited<ReturnType<typeof knowledgeFixture>>) => ({
  request_id: crypto.randomUUID(),
  agent_id: f.agent,
  message_id: f.message,
  use_memory: true,
});

test("room memory requires review and explicit opt-in; immutable versions, no summary chains and removal redaction", async () => {
  const f = await knowledgeFixture(false),
    ownerCookie = await knowledgeLogin("owner"),
    marker = "memoryprivate" + crypto.randomUUID().replaceAll("-", "");
  const input = proposal(
    f.agent,
    "Response preference",
    marker + " Prefer concise evidence-linked drafts.",
  );
  const memory = await ok(`/${f.room}/memories`, f.cookie, input);
  assert.equal(
    (await ok(`/${f.room}/memories`, f.cookie, input)).id,
    memory.id,
  );
  for (const cookie of [undefined, ownerCookie, await knowledgeLogin("viewer")])
    for (const path of [
      `/${f.room}/memories`,
      `/${f.room}/memory-recall?agent_id=${f.agent}`,
    ])
      assert.equal((await req(path, cookie)).status, cookie ? 404 : 401);
  assert.equal(
    (
      await as(
        admin,
        owner,
        "select id,body from kxra.team_memory_versions where id=$1",
        [memory.id],
      )
    ).rowCount,
    0,
    "organisation owner has no private-room memory bypass",
  );
  assert.equal(
    (
      await req(`/${f.room}/memories`, f.cookie, {
        ...input,
        scope: "WORKSPACE",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req(`/${f.room}/memories`, f.cookie, {
        ...input,
        created_by: owner,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req(`/${f.room}/memories`, f.cookie, {
        ...input,
        state: "APPROVED",
      })
    ).status,
    400,
  );
  assert.deepEqual(
    await ok(`/${f.room}/memory-recall?agent_id=${f.agent}`, f.cookie),
    [],
  );
  const draftRun = await ok(`/${f.room}/run`, f.cookie, runInput(f));
  assert.deepEqual(draftRun.memories, []);
  assert.ok(!draftRun.output.includes(marker));
  await ok(`/${f.room}/members`, f.cookie, { account_id: owner, active: true });
  assert.equal(
    (
      await req(`/${f.room}/memory-review`, ownerCookie, {
        memory_id: memory.id,
        state: "APPROVED",
      })
    ).status,
    403,
  );
  await ok(`/${f.room}/memory-review`, f.cookie, {
    memory_id: memory.id,
    state: "APPROVED",
  });
  const recalled = await ok(
    `/${f.room}/memory-recall?agent_id=${f.agent}`,
    f.cookie,
  );
  assert.equal(recalled[0].id, memory.id);
  assert.ok(recalled[0].body.includes(marker));
  const admission =
      "select kxra.team_run_start_memory($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
    app = new pg.Pool(cfg);
  const admissionArgs = [
    crypto.randomUUID(),
    f.room,
    f.agent,
    f.message,
    [f.message],
    "e".repeat(64),
    [],
    [],
    [],
    [],
    [memory.id],
    [recalled[0].content_sha256],
  ];
  try {
    await assert.rejects(
      as(admin, partner, admission, admissionArgs),
      { code: "42501" },
      "authenticated role alone cannot admit model work",
    );
    await assert.rejects(
      as(app, partner, admission, [
        ...admissionArgs.slice(0, 11),
        ["0".repeat(64)],
      ]),
      { code: "42501" },
      "forged memory hash is denied",
    );
    await assert.rejects(
      as(app, partner, admission, [
        ...admissionArgs.slice(0, 10),
        Array(6).fill(memory.id),
        Array(6).fill(recalled[0].content_sha256),
      ]),
      { code: "42501" },
      "duplicate or excessive memory is denied",
    );
    await assert.rejects(
      as(app, partner, admission, [
        admissionArgs[0],
        f.room,
        crypto.randomUUID(),
        ...admissionArgs.slice(3),
      ]),
      { code: "42501" },
      "memory cannot be assigned to another agent",
    );
  } finally {
    await app.end();
  }
  assert.equal(
    (
      await req(`/${f.room}/run`, f.cookie, {
        ...runInput(f),
        context: "MESSAGE_ONLY",
      })
    ).status,
    400,
  );
  const defaultRun = await ok(`/${f.room}/run`, f.cookie, {
    ...runInput(f),
    use_memory: false,
  });
  assert.deepEqual(defaultRun.memories, []);
  assert.ok(!defaultRun.output.includes(marker));
  const learned = await ok(`/${f.room}/run`, f.cookie, runInput(f));
  assert.equal(learned.memories[0].id, memory.id);
  assert.ok(learned.output.includes(marker));
  assert.deepEqual(
    (
      await admin.query(
        "select memory_ids,memory_hashes from kxra.team_runs where id=$1",
        [learned.id],
      )
    ).rows[0],
    { memory_ids: [memory.id], memory_hashes: [recalled[0].content_sha256] },
  );
  assert.equal(
    (
      await req(`/${f.room}/memories`, f.cookie, {
        ...input,
        request_id: crypto.randomUUID(),
        title: "Recursive summary",
        source_run_id: learned.id,
      })
    ).status,
    403,
    "memory-derived runs cannot seed summary chains",
  );
  assert.ok(
    !(await ok(`/${f.room}/memories`, f.cookie)).origins.some(
      (run: { id: string }) => run.id === learned.id,
    ),
  );
  await assert.rejects(
    admin.query(
      "update kxra.team_memory_versions set body='changed',content_sha256=encode(sha256(convert_to('changed','UTF8')),'hex') where id=$1",
      [memory.id],
    ),
    /immutable/i,
  );
  const next = await ok(`/${f.room}/memories`, f.cookie, {
    ...input,
    request_id: crypto.randomUUID(),
    body: "Replacement preference",
  });
  assert.equal(
    (
      await req(`/${f.room}/memory-review`, f.cookie, {
        memory_id: next.id,
        state: "APPROVED",
      })
    ).status,
    409,
  );
  assert.equal(
    (await ok(`/${f.room}/memory-recall?agent_id=${f.agent}`, f.cookie))[0].id,
    memory.id,
  );
  await ok(`/${f.room}/memory-review`, f.cookie, {
    memory_id: memory.id,
    state: "REVOKED",
  });
  await ok(`/${f.room}/memory-review`, f.cookie, {
    memory_id: next.id,
    state: "APPROVED",
  });
  assert.ok(
    !(await ok(`/${f.room}`, f.cookie)).runs.some(
      (run: { id: string }) => run.id === learned.id,
    ),
  );
  for (const id of [memory.id, next.id])
    await ok(`/${f.room}/memory-review`, f.cookie, {
      memory_id: id,
      state: "DELETED",
    });
  const removed = (await ok(`/${f.room}/memories`, f.cookie)).entries;
  assert.ok(
    removed.every(
      (row: { body: string; title: string; content_sha256: null }) =>
        row.body === "" &&
        row.title === "Removed memory" &&
        row.content_sha256 === null,
    ),
  );
  assert.ok(!JSON.stringify(removed).includes(marker));
  assert.deepEqual(
    await ok(`/${f.room}/memory-recall?agent_id=${f.agent}`, f.cookie),
    [],
  );
  for (const column of ["content_sha256", "title_key"])
    await assert.rejects(
      as(
        admin,
        partner,
        `select ${column} from kxra.team_memory_versions where id=$1`,
        [memory.id],
      ),
      { code: "42501" },
    );
  await assert.rejects(
    as(admin, partner, "delete from kxra.team_memory_versions where id=$1", [
      memory.id,
    ]),
    { code: "42501" },
  );
  await ok(`/${f.room}/members`, f.cookie, {
    account_id: owner,
    active: false,
  });
  assert.equal((await req(`/${f.room}/memories`, ownerCookie)).status, 404);
});

test("run-backed memory cannot carry revoked source data into recall, dispatch, completion or history", async () => {
  const f = await knowledgeFixture(true, "owner"),
    marker = "runmemoryprivate" + crypto.randomUUID().replaceAll("-", "");
  const source = await ok(`/${f.room}/run`, f.cookie, {
    ...runInput(f),
    use_memory: false,
    chunk_ids: [f.chunks[0].id],
  });
  const memory = await ok(`/${f.room}/memories`, f.cookie, {
    ...proposal(f.agent, "Evidence reference", marker),
    kind: "REFERENCE",
    source_run_id: source.id,
  });
  await ok(`/${f.room}/memory-review`, f.cookie, {
    memory_id: memory.id,
    state: "APPROVED",
  });
  const learned = await ok(`/${f.room}/run`, f.cookie, runInput(f));
  assert.ok(learned.output.includes(marker));
  const recall = await ok(
      `/${f.room}/memory-recall?agent_id=${f.agent}`,
      f.cookie,
    ),
    app = new pg.Pool(cfg),
    pending = crypto.randomUUID();
  const args = [
    pending,
    f.room,
    f.agent,
    f.message,
    [f.message],
    "c".repeat(64),
    [],
    [],
    [],
    [],
    [memory.id],
    [recall[0].content_sha256],
  ];
  try {
    await as(
      app,
      owner,
      "select kxra.team_run_start_memory($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      args,
    );
    await ok(`/${f.room}/files`, f.cookie, {
      file_version_id: f.version,
      active: false,
    });
    assert.deepEqual((await ok(`/${f.room}/memories`, f.cookie)).entries, []);
    assert.deepEqual(
      await ok(`/${f.room}/memory-recall?agent_id=${f.agent}`, f.cookie),
      [],
    );
    assert.equal(
      (
        await as(
          admin,
          owner,
          "select id,body from kxra.team_memory_versions where id=$1",
          [memory.id],
        )
      ).rowCount,
      0,
    );
    assert.equal(
      (await as(app, owner, "select kxra.team_run_ready($1) ready", [pending]))
        .rows[0].ready,
      false,
    );
    await as(
      app,
      owner,
      "select kxra.team_run_finish($1,'must withhold',null,1,1)",
      [pending],
    );
    assert.deepEqual(
      (
        await admin.query(
          "select status,output,error_code from kxra.team_runs where id=$1",
          [pending],
        )
      ).rows[0],
      { status: "CANCELLED", output: "", error_code: "ACCESS_CHANGED" },
    );
    await assert.rejects(
      as(
        app,
        owner,
        "select kxra.team_run_start_memory($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [crypto.randomUUID(), ...args.slice(1)],
      ),
      { code: "42501" },
    );
    assert.ok(
      !(await ok("/overview", f.cookie)).runs.some(
        (run: { id: string }) => run.id === learned.id,
      ),
    );
    const fresh = await ok(`/${f.room}/run`, f.cookie, runInput(f));
    assert.deepEqual(fresh.memories, []);
    assert.ok(!fresh.output.includes(marker));
    const peer = await knowledgeLogin("partner");
    assert.equal((await req(`/${f.room}/memories`, peer)).status, 404);
    await ok(`/${f.room}/members`, f.cookie, {
      account_id: partner,
      active: true,
    });
    assert.deepEqual((await ok(`/${f.room}/memories`, peer)).entries, []);
    await ok(`/${f.room}/members`, f.cookie, {
      account_id: partner,
      active: false,
    });
    assert.equal(
      (await req(`/${f.room}/memory-recall?agent_id=${f.agent}`, peer)).status,
      404,
    );
  } finally {
    await app.end();
  }
});

test("memory expiry and removal invalidate in-flight requests and redact retained fingerprints", async () => {
  const f = await knowledgeFixture(false, "owner"),
    app = new pg.Pool(cfg);
  try {
    for (const mode of ["expiry", "removal"]) {
      const memoryId = crypto.randomUUID(),
        body = "Temporal memory " + mode;
      const expiry =
        mode === "expiry" ? new Date(Date.now() + 2000).toISOString() : null;
      await as(
        admin,
        owner,
        "select kxra.team_memory_propose($1,$2,$3,'CONTEXT',$4,$5,null,$6)",
        [memoryId, f.room, f.agent, "Temporal " + mode, body, expiry],
      );
      await ok(`/${f.room}/memory-review`, f.cookie, {
        memory_id: memoryId,
        state: "APPROVED",
      });
      const hash = crypto.createHash("sha256").update(body).digest("hex"),
        run = crypto.randomUUID();
      const args = [
        run,
        f.room,
        f.agent,
        f.message,
        [f.message],
        "d".repeat(64),
        [],
        [],
        [],
        [],
        [memoryId],
        [hash],
      ];
      await as(
        app,
        owner,
        "select kxra.team_run_start_memory($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        args,
      );
      if (mode === "expiry")
        await new Promise((resolve) => setTimeout(resolve, 2100));
      else
        await ok(`/${f.room}/memory-review`, f.cookie, {
          memory_id: memoryId,
          state: "DELETED",
        });
      assert.equal(
        (await as(app, owner, "select kxra.team_run_ready($1) ready", [run]))
          .rows[0].ready,
        false,
      );
      await as(
        app,
        owner,
        "select kxra.team_run_finish($1,'must not publish',null,1,1)",
        [run],
      );
      assert.equal(
        (
          await admin.query("select status from kxra.team_runs where id=$1", [
            run,
          ])
        ).rows[0].status,
        "CANCELLED",
      );
      assert.equal(
        (
          await as(app, owner, "select id from kxra.team_runs where id=$1", [
            run,
          ])
        ).rowCount,
        0,
      );
      assert.deepEqual(
        await ok(`/${f.room}/memory-recall?agent_id=${f.agent}`, f.cookie),
        [],
      );
    }
  } finally {
    await app.end();
  }
});

test("active second-tenant context has no room memory summary or recall path", async (t) => {
  const f = await knowledgeFixture(false),
    input = proposal(
      f.agent,
      "Tenant preference",
      "Original tenant private memory",
    ),
    entry = await ok(`/${f.room}/memories`, f.cookie, input);
  await ok(`/${f.room}/memory-review`, f.cookie, {
    memory_id: entry.id,
    state: "APPROVED",
  });
  assert.equal(
    (
      await as(
        admin,
        partner,
        "select id from kxra.team_memory_versions where id=$1",
        [entry.id],
      )
    ).rowCount,
    1,
  );
  const other = crypto.randomUUID();
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Synthetic memory tenant',$2)",
    [other, "memory-" + crypto.randomUUID()],
  );
  const member = (
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Memory fixture','AT_MEMORY') returning id",
      [other, partner],
    )
  ).rows[0].id;
  t.after(() =>
    admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where id=$1",
      [member],
    ),
  );
  const session = await knowledgeLogin(),
    selected = await fetch(base + "/api/context", {
      method: "POST",
      headers: {
        origin: base,
        cookie: session,
        "content-type": "application/json",
      },
      body: JSON.stringify({ organisation_id: other }),
    });
  assert.equal(selected.status, 200);
  const jar = new Map(
    session.split("; ").map((value) => {
      const n = value.indexOf("=");
      return [value.slice(0, n), value.slice(n + 1)];
    }),
  );
  for (const cookie of selected.headers.getSetCookie()) {
    const pair = cookie.split(";", 1)[0],
      n = pair.indexOf("=");
    jar.set(pair.slice(0, n), pair.slice(n + 1));
  }
  const cookie = [...jar].map(([key, value]) => key + "=" + value).join("; ");
  for (const path of [
    `/${f.room}/memories`,
    `/${f.room}/memory-recall?agent_id=${f.agent}`,
  ])
    assert.equal((await req(path, cookie)).status, 404);
  assert.equal(
    (
      await as(
        admin,
        partner,
        "select id,body from kxra.team_memory_versions where id=$1",
        [entry.id],
        other,
      )
    ).rowCount,
    0,
  );
  assert.equal((await req(`/${f.room}/run`, cookie, runInput(f))).status, 404);
});
