import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin } from "./support/runtime";
import {
  knowledgeFixture,
  knowledgeLogin,
  knowledgeOk as ok,
  knowledgeRequest as req,
} from "./support/team-knowledge";
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8")),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username }),
  app = new pg.Pool(cfg);
after(async () => {
  await admin.end();
  await app.end();
});
const uuid = () => crypto.randomUUID(),
  owner = "20000000-0000-4000-8000-000000000001",
  partner = "20000000-0000-4000-8000-000000000002",
  org = "10000000-0000-4000-8000-000000000001";
const fields = (title: string) => ({
  request_id: uuid(),
  version: 0,
  title,
  body: "Synthetic brief / recorded evidence",
  responsible: "Maya",
  next_step: "Review recorded context",
  due_on: "2026-11-10",
});
async function move(
  room: string,
  cookie: string,
  prefix: string,
  record: any,
  target: string,
) {
  const action = {
    request_id: uuid(),
    source_id: record.id,
    source_version: record.version,
    target_stage: target,
    note: "Human-reviewed local step; no external action",
  };
  await ok(`/${room}/${prefix}-propose`, cookie, action);
  await ok(`/${room}/${prefix}-review`, cookie, {
    action_id: action.request_id,
    version: 1,
    decision: "APPROVED",
  });
  const receipt = await ok(`/${room}/${prefix}-execute`, cookie, {
    action_id: action.request_id,
    version: 2,
  });
  return { action, receipt };
}
test("creator roster and linked sample progress persist through exact reviews, duplicate acknowledgements and one-time receipts", async () => {
  const f = await knowledgeFixture(false),
    creator = fields("Synthetic creator " + uuid());
  const created = await ok(`/${f.room}/creator-save`, f.cookie, creator);
  assert.deepEqual(
    await ok(`/${f.room}/creator-save`, f.cookie, creator),
    created,
  );
  let roster = (await ok(`/${f.room}/creator-records`, f.cookie)).records;
  assert.equal(roster.length, 1);
  assert.equal(roster[0].stage, "RESEARCH");
  const m = await move(f.room, f.cookie, "creator", roster[0], "SHORTLIST");
  const replay = await ok(`/${f.room}/creator-execute`, f.cookie, {
    action_id: m.action.request_id,
    version: 2,
  });
  assert.equal(replay.replayed, true);
  assert.equal(replay.version, 2);
  assert.equal(
    (
      await req(`/${f.room}/creator-execute`, f.cookie, {
        action_id: m.action.request_id,
        version: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(`/${f.room}/creator-propose`, f.cookie, {
        ...m.action,
        target_stage: "ARCHIVED",
      })
    ).status,
    409,
  );
  const sample = {
    ...fields("Synthetic sample " + uuid()),
    creator_id: creator.request_id,
  };
  await Promise.all([
    ok(`/${f.room}/sample-save`, f.cookie, sample),
    ok(`/${f.room}/sample-save`, f.cookie, sample),
  ]);
  for (const target of ["PREPARED", "DELIVERED", "POST_REVIEW", "COMPLETE"]) {
    const record = (await ok(`/${f.room}/sample-records`, f.cookie)).records[0];
    await move(f.room, f.cookie, "sample", record, target);
  }
  const fresh = await knowledgeLogin("partner");
  const records = (await ok(`/${f.room}/sample-records`, fresh)).records;
  assert.equal(records.length, 1);
  assert.equal(records[0].stage, "COMPLETE");
  assert.equal(records[0].version, 5);
  const actions = (await ok(`/${f.room}/sample-actions`, fresh)).actions;
  assert.equal(actions.length, 4);
  assert.ok(
    actions.every(
      (a: any) =>
        a.state === "EXECUTED" && a.result.record_id === sample.request_id,
    ),
  );
  assert.equal(
    (
      await req(`/${f.room}/sample-save`, fresh, {
        ...sample,
        version: 5,
        title: "Cannot edit completion",
      })
    ).status,
    409,
  );
  for (const target of [
    "BRIEF_REVIEW",
    "COLLABORATING",
    "COMPLETE",
    "ARCHIVED",
  ]) {
    const record = (await ok(`/${f.room}/creator-records`, fresh)).records[0];
    await move(f.room, fresh, "creator", record, target);
  }
  assert.equal(
    (await ok(`/${f.room}/creator-records`, fresh)).records[0].stage,
    "ARCHIVED",
  );
  assert.equal(
    (
      await req(`/${f.room}/sample-save`, fresh, {
        ...fields("Archived creator cannot receive another sample"),
        creator_id: creator.request_id,
      })
    ).status,
    409,
  );
});
test("source edits, linked creator edits, stale revisions, invalid stages and payload changes cannot reuse an approval", async () => {
  const f = await knowledgeFixture(false),
    creator = fields("Versioned creator");
  await ok(`/${f.room}/creator-save`, f.cookie, creator);
  const proposal = {
    request_id: uuid(),
    source_id: creator.request_id,
    source_version: 1,
    target_stage: "SHORTLIST",
    note: "Exact source review",
  };
  await ok(`/${f.room}/creator-propose`, f.cookie, proposal);
  await ok(`/${f.room}/creator-save`, f.cookie, {
    ...creator,
    version: 1,
    body: "Changed brief",
  });
  assert.equal(
    (
      await req(`/${f.room}/creator-review`, f.cookie, {
        action_id: proposal.request_id,
        version: 1,
        decision: "APPROVED",
      })
    ).status,
    409,
  );
  const sample = { ...fields("Linked sample"), creator_id: creator.request_id };
  await ok(`/${f.room}/sample-save`, f.cookie, sample);
  const pending = {
    request_id: uuid(),
    source_id: sample.request_id,
    source_version: 1,
    target_stage: "PREPARED",
    note: "Record sample preparation",
  };
  await ok(`/${f.room}/sample-propose`, f.cookie, pending);
  await ok(`/${f.room}/sample-review`, f.cookie, {
    action_id: pending.request_id,
    version: 1,
    decision: "APPROVED",
  });
  await ok(`/${f.room}/creator-save`, f.cookie, {
    ...creator,
    version: 2,
    body: "Changed linked creator context",
  });
  assert.equal(
    (
      await req(`/${f.room}/sample-execute`, f.cookie, {
        action_id: pending.request_id,
        version: 2,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(`/${f.room}/sample-propose`, f.cookie, {
        ...pending,
        request_id: uuid(),
        target_stage: "COMPLETE",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(`/${f.room}/sample-save`, f.cookie, {
        ...sample,
        due_on: "2026-02-30",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req(`/${f.room}/creator-save`, f.cookie, {
        ...creator,
        role: "owner",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req(`/${f.room}/creator-save`, f.cookie, {
        ...creator,
        version: 1,
        body: "Stale edit",
      })
    ).status,
    409,
  );
  // Snapshot fields cannot be edited, even through a privileged SQL statement.
  await assert.rejects(
    admin.query(
      "update kxra.team_collaboration_actions set note='Changed payload' where id=$1",
      [pending.request_id],
    ),
    /immutable/,
  );
});
test("room membership, creator-only review, cross-tenant context and direct SQL policies enforce both app boundaries", async () => {
  const f = await knowledgeFixture(false),
    other = await knowledgeFixture(false),
    creator = fields("Private roster");
  await ok(`/${f.room}/creator-save`, f.cookie, creator);
  const outsider = await knowledgeLogin("owner");
  assert.equal((await req(`/${f.room}/creator-records`, outsider)).status, 404);
  await ok(`/${f.room}/members`, f.cookie, { account_id: owner, active: true });
  const proposal = {
    request_id: uuid(),
    source_id: creator.request_id,
    source_version: 1,
    target_stage: "SHORTLIST",
    note: "Review authority",
  };
  await ok(`/${f.room}/creator-propose`, f.cookie, proposal);
  assert.equal(
    (
      await req(`/${f.room}/creator-review`, outsider, {
        action_id: proposal.request_id,
        version: 1,
        decision: "APPROVED",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await req(`/${other.room}/sample-save`, f.cookie, {
        ...fields("Wrong creator"),
        creator_id: creator.request_id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(
        `/${other.room}/creator-records?before=${creator.request_id}&band=0`,
        f.cookie,
      )
    ).status,
    404,
  );
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        owner,
        JSON.stringify({
          sub: owner,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
        }),
        org,
      ],
    );
    assert.equal(
      (
        await db.query(
          "select id from kxra.team_collaboration_records where id=$1",
          [creator.request_id],
        )
      ).rows.length,
      1,
    );
    await db.query("rollback");
    await ok(`/${f.room}/members`, f.cookie, {
      account_id: owner,
      active: false,
    });
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true)",
      [owner, org],
    );
    assert.equal(
      (
        await db.query(
          "select id from kxra.team_collaboration_records where id=$1",
          [creator.request_id],
        )
      ).rows.length,
      0,
    );
    await db.query("rollback");
  } finally {
    db.release();
  }
  assert.equal((await req(`/${f.room}/creator-records`, outsider)).status, 404);
  // Same valid actor in another real organisation cannot read this room.
  const tenant = uuid();
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Synthetic isolated tenant',$2)",
    [tenant, "collab-" + uuid()],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic','AT_COLLAB')",
    [tenant, partner],
  );
  try {
    const cookie = await knowledgeLogin("partner");
    const selected = await fetch(testOrigin + "/api/context", {
      method: "POST",
      headers: {
        origin: testOrigin,
        "content-type": "application/json",
        cookie,
      },
      body: JSON.stringify({ organisation_id: tenant }),
    });
    assert.equal(selected.status, 200);
    const context = selected.headers
      .getSetCookie()
      .map((v) => v.split(";", 1)[0])
      .join("; ");
    assert.equal(
      (await req(`/${f.room}/creator-records`, cookie + "; " + context)).status,
      404,
    );
  } finally {
    await admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1",
      [tenant],
    );
  }
});
test("expired review and cancelled entitlement cannot apply a new stage; existing history and receipts remain readable", async () => {
  const tenant = uuid(),
    project = uuid(),
    cookie0 = await knowledgeLogin("owner");
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Synthetic collaboration billing',$2)",
    [tenant, "collab-billing-" + uuid()],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic owner','AT_COLLAB')",
    [tenant, owner],
  );
  try {
    await admin.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'COLLAB','Synthetic fixture','TEST','ACTIVE','Review')",
      [project, tenant],
    );
    const selected = await fetch(testOrigin + "/api/context", {
      method: "POST",
      headers: {
        origin: testOrigin,
        "content-type": "application/json",
        cookie: cookie0,
      },
      body: JSON.stringify({ organisation_id: tenant }),
    });
    assert.equal(selected.status, 200);
    const cookie =
      cookie0 +
      "; " +
      selected.headers
        .getSetCookie()
        .map((v) => v.split(";", 1)[0])
        .join("; ");
    const room = (
      await ok("", cookie, {
        project_id: project,
        name: "Synthetic creator/sample billing",
        guidelines: "No external action",
        access: "PRIVATE",
      })
    ).id;
    const creator = fields("Billing creator");
    await ok(`/${room}/creator-save`, cookie, creator);
    const expired = uuid(),
      db = await admin.connect();
    try {
      await db.query("begin");
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
        owner,
      ]);
      await db.query(
        "insert into kxra.team_collaboration_actions(id,org_id,room_id,kind,source_id,source_version,source_hash,source_snapshot,target_stage,note,requested_by,created_at,expires_at) values($1,$2,$3,'CREATOR',$4,1,kxra_private.collaboration_hash($4),kxra_private.collaboration_snapshot($4),'SHORTLIST','Synthetic expired fixture',$5,now()-interval '8 days',now()-interval '1 day')",
        [expired, tenant, room, creator.request_id, owner],
      );
      await db.query("commit");
    } finally {
      db.release();
    }
    assert.equal(
      (
        await req(`/${room}/creator-review`, cookie, {
          action_id: expired,
          version: 1,
          decision: "APPROVED",
        })
      ).status,
      409,
    );
    const proposed = {
      request_id: uuid(),
      source_id: creator.request_id,
      source_version: 1,
      target_stage: "SHORTLIST",
      note: "Recorded before cancellation",
    };
    await ok(`/${room}/creator-propose`, cookie, proposed);
    await ok(`/${room}/creator-review`, cookie, {
      action_id: proposed.request_id,
      version: 1,
      decision: "APPROVED",
    });
    await ok("/pilot/events", cookie, {
      request_id: uuid(),
      version: 0,
      action: "ACTIVATE",
    });
    await ok("/pilot/events", cookie, {
      request_id: uuid(),
      version: 1,
      action: "CANCEL_NOW",
    });
    assert.equal(
      (
        await req(`/${room}/creator-execute`, cookie, {
          action_id: proposed.request_id,
          version: 2,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await req(
          `/${room}/creator-save`,
          cookie,
          fields("Blocked after cancellation"),
        )
      ).status,
      409,
    );
    assert.equal(
      (await ok(`/${room}/creator-records`, cookie)).records[0].stage,
      "RESEARCH",
    );
    const direct = await app.connect();
    try {
      await direct.query("begin");
      await direct.query("set local role authenticated");
      await assert.rejects(
        direct.query(
          "update kxra.team_collaboration_records set title='Forged' where id=$1",
          [creator.request_id],
        ),
        (e) => (e as { code: string }).code === "42501",
      );
      await direct.query("rollback");
    } finally {
      direct.release();
    }
  } finally {
    await admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1",
      [tenant],
    );
  }
});
test("catalogs load earlier records without duplicates; rejected and cancelled reviews cannot execute", async () => {
  const f = await knowledgeFixture(false),
    creator = fields("Oldest retained creator");
  await ok(`/${f.room}/creator-save`, f.cookie, creator);
  for (const decision of ["REJECTED", "CANCELLED"]) {
    const a = {
      request_id: uuid(),
      source_id: creator.request_id,
      source_version: 1,
      target_stage: "SHORTLIST",
      note: "Synthetic " + decision,
    };
    await ok(`/${f.room}/creator-propose`, f.cookie, a);
    await ok(`/${f.room}/creator-review`, f.cookie, {
      action_id: a.request_id,
      version: 1,
      decision,
    });
    await ok(`/${f.room}/creator-review`, f.cookie, {
      action_id: a.request_id,
      version: 1,
      decision,
    });
    assert.equal(
      (
        await req(`/${f.room}/creator-execute`, f.cookie, {
          action_id: a.request_id,
          version: 2,
        })
      ).status,
      409,
    );
  }
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      partner,
    ]);
    await db.query(
      "insert into kxra.team_collaboration_records(id,org_id,room_id,kind,title,responsible,next_step,stage,created_by,updated_by) select gen_random_uuid(),$1,$2,'CREATOR','Synthetic page '||n,'Maya','Review','RESEARCH',$3,$3 from generate_series(1,101) n",
      [org, f.room, partner],
    );
    await db.query("commit");
  } finally {
    db.release();
  }
  const first = await ok(`/${f.room}/creator-records`, f.cookie);
  assert.equal(first.records.length, 100);
  assert.ok(first.next_cursor);
  const second = await ok(
    `/${f.room}/creator-records?before=${first.next_cursor.before}&band=0`,
    f.cookie,
  );
  assert.equal(second.records.length, 2);
  assert.equal(second.next_cursor, null);
  assert.equal(
    new Set([...first.records, ...second.records].map((r: any) => r.id)).size,
    102,
  );
  assert.ok(second.records.some((r: any) => r.id === creator.request_id));
  assert.equal(
    (
      await req(
        `/${f.room}/creator-records?before=${creator.request_id}&band=2`,
        f.cookie,
      )
    ).status,
    400,
  );
});
