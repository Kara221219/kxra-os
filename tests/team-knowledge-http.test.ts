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
  knowledgeUpload,
} from "./support/team-knowledge";
const config = JSON.parse(
    fs.readFileSync(runtimeFile("database.json"), "utf8"),
  ),
  admin = new pg.Pool({ ...config, user: os.userInfo().username });
after(() => admin.end());
const partnerId = "20000000-0000-4000-8000-000000000002",
  ownerId = "20000000-0000-4000-8000-000000000001",
  org = "10000000-0000-4000-8000-000000000001";
async function actorQuery(
  pool: pg.Pool,
  actor: string,
  sql: string,
  args: unknown[] = [],
  organisationId = org,
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
        organisationId,
      ],
    );
    const result = await db.query(sql, args);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
async function adminChange(sql: string, args: unknown[]) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      ownerId,
    ]);
    await db.query(sql, args);
    await db.query("commit");
  } catch (error) {
    await db.query("rollback");
    throw error;
  } finally {
    db.release();
  }
}
test("room knowledge: indexed shared sources, search, scoped bytes, reviewed skills and provenance execute end to end", async () => {
  const f = await knowledgeFixture(),
    owner = await knowledgeLogin("owner"),
    viewer = await knowledgeLogin("viewer");
  assert.equal(f.chunks.length, 1);
  const chunk = f.chunks[0];
  for (const cookie of [undefined, owner, viewer]) {
    for (const path of [
      `/${f.room}/knowledge`,
      `/${f.room}/search?q=${f.marker}`,
      `/${f.room}/files/${f.version}`,
    ])
      assert.equal((await req(path, cookie)).status, cookie ? 404 : 401);
  }
  const downloaded = await req(`/${f.room}/files/${f.version}`, f.cookie);
  assert.equal(downloaded.status, 200);
  assert.ok((await downloaded.text()).includes(f.marker));
  assert.match(downloaded.headers.get("cache-control") || "", /no-store/);
  const other = await ok("", f.cookie, {
    project_id: "30000000-0000-4000-8000-000000000002",
    name: "No attachment",
    guidelines: "",
    access: "PRIVATE",
  });
  assert.deepEqual(await ok(`/${other.id}/search?q=${f.marker}`, f.cookie), []);
  assert.equal(
    (await req(`/${other.id}/files/${f.version}`, f.cookie)).status,
    404,
  );
  const runInput = {
    request_id: crypto.randomUUID(),
    agent_id: f.agent,
    message_id: f.message,
    chunk_ids: [chunk.id],
  };
  assert.equal((await req(`/${other.id}/run`, f.cookie, runInput)).status, 404);
  assert.equal(
    (
      await req(`/${f.room}/run`, f.cookie, {
        ...runInput,
        context: "MESSAGE_ONLY",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req(`/${f.room}/run`, f.cookie, {
        ...runInput,
        chunk_ids: [crypto.randomUUID()],
      })
    ).status,
    404,
  );
  assert.equal(
    (await req(`/${f.room}/search?q=${f.marker}&org_id=${org}`, f.cookie))
      .status,
    400,
  );
  assert.equal(
    (await req(`/${f.room}/search?q=${"x".repeat(201)}`, f.cookie)).status,
    400,
  );
  assert.deepEqual(
    await ok(`/${f.room}/search?q=noevidencematchabcdef`, f.cookie),
    [],
  );
  const proposal = {
    request_id: crypto.randomUUID(),
    name: "Review checklist",
    instructions:
      "Always distinguish evidence from assumptions. Propose one human-reviewed next step.",
  };
  const skill = await ok(`/${f.room}/skills`, f.cookie, proposal);
  assert.equal(
    (await ok(`/${f.room}/skills`, f.cookie, proposal)).id,
    skill.id,
    "proposal retries do not create extra versions",
  );
  assert.equal(
    (
      await req(`/${f.room}/agent-skill`, f.cookie, {
        agent_id: f.agent,
        skill_id: skill.id,
        enabled: true,
      })
    ).status,
    403,
    "unreviewed skills cannot execute",
  );
  await ok(`/${f.room}/skill-review`, f.cookie, {
    skill_id: skill.id,
    state: "APPROVED",
  });
  await ok(`/${f.room}/agent-skill`, f.cookie, {
    agent_id: f.agent,
    skill_id: skill.id,
    enabled: true,
  });
  const run = await ok(`/${f.room}/run`, f.cookie, runInput);
  assert.equal(run.status, "SUCCEEDED");
  assert.ok(run.output.includes(f.marker));
  assert.ok(run.output.includes("Review checklist v1"));
  assert.equal(run.sources[0].file_version_id, f.version);
  assert.equal(run.skills[0].id, skill.id);
  const stored = (
    await admin.query(
      "select chunk_ids,chunk_hashes,skill_ids,skill_hashes,context_sha256 from kxra.team_runs where id=$1",
      [run.id],
    )
  ).rows[0];
  assert.deepEqual(stored.chunk_ids, [chunk.id]);
  assert.deepEqual(stored.chunk_hashes, [chunk.content_sha256]);
  assert.deepEqual(stored.skill_ids, [skill.id]);
  assert.match(stored.context_sha256, /^[a-f0-9]{64}$/);
  const independent = await ok(`/${f.room}/run`, f.cookie, {
    ...runInput,
    request_id: crypto.randomUUID(),
    chunk_ids: [],
    context: "MESSAGE_ONLY",
  });
  assert.deepEqual(independent.sources, []);
  assert.deepEqual(independent.skills, []);
  assert.ok(!independent.output.includes(f.marker));
  const v2 = await ok(`/${f.room}/skills`, f.cookie, {
    ...proposal,
    request_id: crypto.randomUUID(),
    instructions: "New draft, not automatically released.",
  });
  let knowledge = await ok(`/${f.room}/knowledge`, f.cookie);
  assert.equal(
    knowledge.skills.find((row: { id: string }) => row.id === v2.id).version,
    2,
  );
  assert.equal(knowledge.bindings[0].skill_id, skill.id);
  await ok(`/${f.room}/skill-review`, f.cookie, {
    skill_id: v2.id,
    state: "APPROVED",
  });
  assert.equal(
    (
      await req(`/${f.room}/agent-skill`, f.cookie, {
        agent_id: f.agent,
        skill_id: v2.id,
        enabled: true,
      })
    ).status,
    409,
    "a new version cannot silently replace attached instructions",
  );
  assert.deepEqual(
    (
      await admin.query("select skill_ids from kxra.team_runs where id=$1", [
        run.id,
      ])
    ).rows[0].skill_ids,
    [skill.id],
  );
  const pinned = await ok(`/${f.room}/run`, f.cookie, {
    ...runInput,
    request_id: crypto.randomUUID(),
    chunk_ids: [],
  });
  assert.ok(pinned.output.includes("Review checklist v1"));
  assert.ok(!pinned.output.includes("New draft, not automatically released."));
  await assert.rejects(
    adminChange(
      "update kxra.team_skill_versions set instructions='tampered' where id=$1",
      [skill.id],
    ),
  );
  await ok(`/${f.room}/members`, f.cookie, {
    account_id: ownerId,
    active: true,
  });
  const unreviewed = await ok(`/${f.room}/skills`, f.cookie, {
    request_id: crypto.randomUUID(),
    name: "Creator review boundary",
    instructions: "Remain a draft until room creator review.",
  });
  assert.equal(
    (
      await req(`/${f.room}/skill-review`, owner, {
        skill_id: unreviewed.id,
        state: "APPROVED",
      })
    ).status,
    409,
    "room member cannot approve creator-owned skill decisions",
  );
  assert.equal(
    (await ok(`/${f.room}/knowledge`, f.cookie)).skills.find(
      (row: { id: string }) => row.id === unreviewed.id,
    ).state,
    "DRAFT",
  );
  for (const table of [
    "team_room_files",
    "team_skill_versions",
    "team_agent_skills",
  ]) {
    assert.ok(
      (
        await actorQuery(
          admin,
          partnerId,
          `select id from kxra.${table} where room_id=$1`,
          [f.room],
        )
      ).rowCount! > 0,
    );
    assert.equal(
      (
        await actorQuery(
          admin,
          "20000000-0000-4000-8000-000000000004",
          `select id from kxra.${table} where room_id=$1`,
          [f.room],
        )
      ).rowCount,
      0,
    );
    await assert.rejects(
      actorQuery(
        admin,
        partnerId,
        `delete from kxra.${table} where room_id=$1`,
        [f.room],
      ),
      { code: "42501" },
    );
  }
  await ok(`/${f.room}/members`, f.cookie, {
    account_id: ownerId,
    active: false,
  });
  for (const table of [
    "team_room_files",
    "team_skill_versions",
    "team_agent_skills",
    "team_runs",
  ])
    assert.equal(
      (
        await actorQuery(
          admin,
          ownerId,
          `select ${table === "team_runs" ? "id" : "id"} from kxra.${table} where room_id=$1`,
          [f.room],
        )
      ).rowCount,
      0,
      "owner has no private-room bypass",
    );
  await ok(`/${f.room}/skill-review`, f.cookie, {
    skill_id: skill.id,
    state: "REVOKED",
  });
  await ok(`/${f.room}/agent-skill`, f.cookie, {
    agent_id: f.agent,
    skill_id: skill.id,
    enabled: false,
  });
  await ok(`/${f.room}/agent-skill`, f.cookie, {
    agent_id: f.agent,
    skill_id: v2.id,
    enabled: true,
  });
  assert.ok(
    !(await ok(`/${f.room}`, f.cookie)).runs.some(
      (row: { id: string }) => row.id === run.id,
    ),
  );
  assert.ok(
    !(await ok("/overview", f.cookie)).runs.some(
      (row: { id: string }) => row.id === run.id,
    ),
  );
  await ok(`/${f.room}/files`, f.cookie, {
    file_version_id: f.version,
    active: false,
  });
  assert.deepEqual(await ok(`/${f.room}/search?q=${f.marker}`, f.cookie), []);
  assert.equal(
    (await req(`/${f.room}/files/${f.version}`, f.cookie)).status,
    404,
  );
  assert.equal(
    (
      await req(`/${f.room}/run`, f.cookie, {
        ...runInput,
        request_id: crypto.randomUUID(),
      })
    ).status,
    404,
  );
  const privateFile = await knowledgeUpload(
    owner,
    "Owner only.txt",
    "Owner-private source",
    "30000000-0000-4000-8000-000000000002",
    "owner_only",
  );
  const privateVersion = (
    await admin.query("select id from kxra.file_versions where file_id=$1", [
      privateFile.id,
    ])
  ).rows[0].id;
  await ok(`/${f.room}/members`, f.cookie, {
    account_id: ownerId,
    active: true,
  });
  assert.equal(
    (
      await req(`/${f.room}/files`, owner, {
        file_version_id: privateVersion,
        active: true,
      })
    ).status,
    403,
    "source owner cannot widen an owner-only file into room context",
  );
  await ok(`/${f.room}/members`, f.cookie, {
    account_id: ownerId,
    active: false,
  });
  await assert.rejects(
    adminChange("update kxra.records set visibility='owner_only' where id=$1", [
      f.file.record_id,
    ]),
    /Immutable/,
  );
  assert.equal(
    (
      await req(`/${f.room}/files`, f.cookie, {
        file_version_id: privateVersion,
        active: true,
      })
    ).status,
    403,
  );
  const wrongProject = await knowledgeUpload(
    owner,
    "Different project.txt",
    "Wrong project source",
    "30000000-0000-4000-8000-000000000003",
  );
  const wrongVersion = (
    await admin.query("select id from kxra.file_versions where file_id=$1", [
      wrongProject.id,
    ])
  ).rows[0].id;
  assert.equal(
    (
      await req(`/${f.room}/files`, f.cookie, {
        file_version_id: wrongVersion,
        active: true,
      })
    ).status,
    403,
  );
  const pending = await knowledgeUpload(
    f.cookie,
    "Not indexed.txt",
    "Unprocessed evidence",
    undefined,
    undefined,
    false,
  );
  const pendingVersion = (
    await admin.query("select id from kxra.file_versions where file_id=$1", [
      pending.id,
    ])
  ).rows[0].id;
  assert.equal(
    (
      await req(`/${f.room}/files`, f.cookie, {
        file_version_id: pendingVersion,
        active: true,
      })
    ).status,
    403,
  );
});

test("file and skill provenance is rechecked before dispatch, completion and historical output reads", async () => {
  const f = await knowledgeFixture(),
    chunk = f.chunks[0];
  const skill = await ok(`/${f.room}/skills`, f.cookie, {
    request_id: crypto.randomUUID(),
    name: "Revocable instruction",
    instructions: "Review source evidence.",
  });
  await ok(`/${f.room}/skill-review`, f.cookie, {
    skill_id: skill.id,
    state: "APPROVED",
  });
  await ok(`/${f.room}/agent-skill`, f.cookie, {
    agent_id: f.agent,
    skill_id: skill.id,
    enabled: true,
  });
  const hash = (
    await admin.query(
      "select content_sha256 from kxra.team_skill_versions where id=$1",
      [skill.id],
    )
  ).rows[0].content_sha256;
  const app = new pg.Pool(config);
  assert.equal(config.user, "kxra_app");
  const invalidArgs = [
    crypto.randomUUID(),
    f.room,
    f.agent,
    f.message,
    [f.message],
    "a".repeat(64),
    [chunk.id],
    ["0".repeat(64)],
    [skill.id],
    [hash],
  ];
  await assert.rejects(
    actorQuery(
      app,
      partnerId,
      "select kxra.team_run_start_context($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      invalidArgs,
    ),
    { code: "42501" },
  );
  await assert.rejects(
    actorQuery(
      admin,
      partnerId,
      "select kxra.team_run_start_context($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        crypto.randomUUID(),
        ...invalidArgs.slice(1, 7),
        [chunk.content_sha256],
        [skill.id],
        [hash],
      ],
    ),
    { code: "42501" },
    "an authenticated role without the app session cannot admit resource runs",
  );
  const changes = [
    {
      sql: "update kxra.files set current_version=case when $2 then $3::integer else $3::integer+1 end where id=$1",
      args: [f.file.id, 1],
    },
    {
      sql: "update kxra.team_room_files set active=$2 where file_version_id=$1 and room_id=$3",
      args: [f.version, f.room],
    },
    {
      sql: "update kxra.file_versions set lifecycle_state=case when $2 then 'INDEXED' else 'REJECTED' end,indexed_at=case when $2 then now() else null end where id=$1",
      args: [f.version],
    },
    {
      sql: "update kxra.team_agent_skills set enabled=$2 where skill_id=$1",
      args: [skill.id],
    },
    {
      sql: "update kxra.team_skill_versions set state=case when $2 then 'APPROVED' else 'REVOKED' end where id=$1",
      args: [skill.id],
    },
  ];
  try {
    for (const change of changes) {
      const run = crypto.randomUUID(),
        args = [
          run,
          f.room,
          f.agent,
          f.message,
          [f.message],
          "b".repeat(64),
          [chunk.id],
          [chunk.content_sha256],
          [skill.id],
          [hash],
        ];
      await actorQuery(
        app,
        partnerId,
        "select kxra.team_run_start_context($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
        args,
      );
      const [first, ...rest] = change.args;
      try {
        await adminChange(change.sql, [first, false, ...rest]);
        assert.equal(
          (
            await actorQuery(
              app,
              partnerId,
              "select kxra.team_run_ready($1) ready",
              [run],
            )
          ).rows[0].ready,
          false,
        );
        await actorQuery(
          app,
          partnerId,
          "select kxra.team_run_finish($1,'must withhold',null,2,1)",
          [run],
        );
        assert.deepEqual(
          (
            await admin.query(
              "select status,output,error_code from kxra.team_runs where id=$1",
              [run],
            )
          ).rows[0],
          { status: "CANCELLED", output: "", error_code: "ACCESS_CHANGED" },
        );
        assert.equal(
          (
            await actorQuery(
              app,
              partnerId,
              "select id from kxra.team_runs where id=$1",
              [run],
            )
          ).rowCount,
          0,
        );
        await assert.rejects(
          actorQuery(
            app,
            partnerId,
            "select kxra.team_run_start_context($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
            [crypto.randomUUID(), ...args.slice(1)],
          ),
        );
      } finally {
        await adminChange(change.sql, [first, true, ...rest]);
      }
    }
  } finally {
    await app.end();
  }
});

test("active membership in another tenant cannot recover room resources or derived runs", async (t) => {
  const f = await knowledgeFixture(),
    otherOrg = crypto.randomUUID(),
    otherProject = crypto.randomUUID();
  const skill = await ok(`/${f.room}/skills`, f.cookie, {
    request_id: crypto.randomUUID(),
    name: "Tenant scoped skill",
    instructions: "Use authorised evidence only.",
  });
  await ok(`/${f.room}/skill-review`, f.cookie, {
    skill_id: skill.id,
    state: "APPROVED",
  });
  await ok(`/${f.room}/agent-skill`, f.cookie, {
    agent_id: f.agent,
    skill_id: skill.id,
    enabled: true,
  });
  await ok(`/${f.room}/run`, f.cookie, {
    request_id: crypto.randomUUID(),
    agent_id: f.agent,
    message_id: f.message,
    chunk_ids: [f.chunks[0].id],
  });
  for (const table of [
    "team_room_files",
    "team_skill_versions",
    "team_agent_skills",
    "team_runs",
  ])
    assert.ok(
      (
        await actorQuery(
          admin,
          partnerId,
          `select id from kxra.${table} where room_id=$1`,
          [f.room],
        )
      ).rowCount! > 0,
    );
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Synthetic knowledge tenant',$2)",
    [otherOrg, "knowledge-" + crypto.randomUUID()],
  );
  const membership = (
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic knowledge member','AT_KNOWLEDGE') returning id",
      [otherOrg, partnerId],
    )
  ).rows[0].id;
  t.after(() =>
    admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where id=$1",
      [membership],
    ),
  );
  await admin.query(
    "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'KNOWLEDGE-OTHER','Other tenant project','test','active','Test scoped retrieval')",
    [otherProject, otherOrg],
  );
  const session = await knowledgeLogin();
  const selected = await fetch(base + "/api/context", {
    method: "POST",
    headers: {
      origin: base,
      cookie: session,
      "content-type": "application/json",
    },
    body: JSON.stringify({ organisation_id: otherOrg }),
  });
  assert.equal(selected.status, 200, await selected.clone().text());
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
    `/${f.room}/knowledge`,
    `/${f.room}/search?q=${f.marker}`,
    `/${f.room}/files/${f.version}`,
  ])
    assert.equal((await req(path, cookie)).status, 404);
  assert.equal(
    (
      await req(`/${f.room}/run`, cookie, {
        request_id: crypto.randomUUID(),
        agent_id: f.agent,
        message_id: f.message,
        chunk_ids: [f.chunks[0].id],
      })
    ).status,
    404,
  );
  for (const table of [
    "team_room_files",
    "team_skill_versions",
    "team_agent_skills",
    "team_runs",
  ])
    assert.equal(
      (
        await actorQuery(
          admin,
          partnerId,
          `select id from kxra.${table} where room_id=$1`,
          [f.room],
          otherOrg,
        )
      ).rowCount,
      0,
    );
  const otherRoom = await ok("", cookie, {
    project_id: otherProject,
    name: "Other tenant knowledge room",
    guidelines: "",
    access: "PRIVATE",
  });
  assert.equal(
    (
      await req(`/${otherRoom.id}/files`, cookie, {
        file_version_id: f.version,
        active: true,
      })
    ).status,
    403,
  );
});
