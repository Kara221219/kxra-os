import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { runtimeFile, testOrigin } from "./support/runtime";
import {
  knowledgeLogin,
  knowledgeOk as ok,
  knowledgeRequest as req,
  knowledgeProject,
} from "./support/team-knowledge";
assert.ok(localModeConfiguration(process.env));
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8")),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username }),
  app = new pg.Pool(cfg);
after(async () => {
  await admin.end();
  await app.end();
});
const uuid = () => crypto.randomUUID(),
  partner = "20000000-0000-4000-8000-000000000002",
  owner = "20000000-0000-4000-8000-000000000001",
  org = "10000000-0000-4000-8000-000000000001";
async function fixtureWrite(sql: string, values: unknown[]) {
  const db = await admin.connect();
  try {
    await db.query("begin");
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
      partner,
    ]);
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
async function setup() {
  const cookie = await knowledgeLogin("partner"),
    room = (
      await ok("", cookie, {
        project_id: knowledgeProject,
        name: "Synthetic handoff " + uuid(),
        guidelines: "Quoted data only",
        access: "PRIVATE",
      })
    ).id;
  const message = (
    await ok(`/${room}/messages`, cookie, {
      request_id: uuid(),
      body: "Synthetic local draft evidence " + uuid(),
    })
  ).id;
  const input = {
    request_id: uuid(),
    adapter: "MANUAL_DRAFT",
    objective: "Synthetic manual checklist " + uuid(),
    message_ids: [message],
  };
  await ok(`/${room}/bridge`, cookie, input);
  return { cookie, room, message, input, id: input.request_id };
}
async function rows(f: any) {
  return (await ok(`/${f.room}/bridge`, f.cookie)).requests;
}
async function review(f: any, version: number, decision: string) {
  return ok(`/${f.room}/bridge/${f.id}/review`, f.cookie, {
    version,
    decision,
  });
}
async function exportOne(f: any) {
  await review(f, 1, "APPROVED");
  return ok(`/${f.room}/bridge/${f.id}/export`, f.cookie, { version: 2 });
}
test("manual bridge persists exact request, concurrent single-use receipts and unverified returned draft through a new session", async () => {
  const f = await setup();
  await ok(`/${f.room}/bridge`, f.cookie, f.input);
  assert.equal((await rows(f)).filter((r: any) => r.id === f.id).length, 1);
  assert.equal(
    (await req(`/${f.room}/bridge/${f.id}/export`, f.cookie, { version: 2 }))
      .status,
    409,
  );
  const view = await ok(`/${f.room}/bridge/${f.id}`, f.cookie);
  assert.equal(
    (
      await req(`/${f.room}/bridge/${f.id}/result`, f.cookie, {
        version: 3,
        result: {
          request_id: f.id,
          packet_sha256: view.packet_sha256,
          draft_text: "Out of order",
        },
      })
    ).status,
    409,
  );
  assert.equal(view.packet.sources[0].id, f.message);
  assert.equal(view.execution_permitted, false);
  await review(f, 1, "APPROVED");
  const receipts = await Promise.all(
    Array.from({ length: 4 }, () =>
      ok(`/${f.room}/bridge/${f.id}/export`, f.cookie, { version: 2 }),
    ),
  );
  assert.equal(receipts.filter((r) => !r.replayed).length, 1);
  assert.equal(new Set(receipts.map((r) => r.packet_sha256)).size, 1);
  assert.equal((await rows(f))[0].export_count, 1);
  assert.equal((await rows(f))[0].version, 3);
  const result = {
    version: 3,
    result: {
      request_id: f.id,
      packet_sha256: view.packet_sha256,
      draft_text: "Synthetic draft, not actual provider output",
    },
  };
  const responses = await Promise.all([
    ok(`/${f.room}/bridge/${f.id}/result`, f.cookie, result),
    ok(`/${f.room}/bridge/${f.id}/result`, f.cookie, result),
  ]);
  assert.equal(responses.filter((r) => !r.replayed).length, 1);
  await review(f, 4, "ACCEPTED");
  await review(f, 4, "ACCEPTED");
  const fresh = await knowledgeLogin("partner"),
    stored = await ok(`/${f.room}/bridge/${f.id}`, fresh);
  assert.equal(stored.result_text, result.result.draft_text);
  assert.equal(stored.provenance, "MANUAL_UNVERIFIED");
  assert.equal((await rows(f))[0].version, 5);
  assert.equal(
    (
      await req(`/${f.room}/bridge/${f.id}/result`, f.cookie, {
        ...result,
        result: {
          ...result.result,
          draft_text: "Changed return cannot reuse accepted review",
        },
      })
    ).status,
    409,
  );
  assert.equal(
    (await req(`/${f.room}/bridge/${f.id}/dispatch`, f.cookie, {})).status,
    503,
  );
});
test("changed payload/source, cancelled review, unknown capabilities and unpaired adapters fail closed", async () => {
  const f = await setup();
  await review(f, 1, "APPROVED");
  assert.equal(
    (
      await req(`/${f.room}/bridge`, f.cookie, {
        ...f.input,
        objective: "Changed purpose",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await req(`/${f.room}/bridge`, f.cookie, {
        ...f.input,
        request_id: uuid(),
        command: "run shell",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req(`/${f.room}/bridge`, f.cookie, {
        ...f.input,
        request_id: uuid(),
        adapter: "CODEX_CLI",
      })
    ).status,
    503,
  );
  const source = await admin.query(
    "select body from kxra.team_messages where id=$1",
    [f.message],
  );
  await admin.query("update kxra.team_messages set body=$2 where id=$1", [
    f.message,
    source.rows[0].body + " changed",
  ]);
  assert.equal(
    (await req(`/${f.room}/bridge/${f.id}/export`, f.cookie, { version: 2 }))
      .status,
    409,
  );
  assert.equal((await req(`/${f.room}/bridge/${f.id}`, f.cookie)).status, 409);
  const newer = { ...f.input, request_id: uuid() };
  await ok(`/${f.room}/bridge`, f.cookie, newer);
  assert.equal(
    (
      await req(`/${f.room}/bridge/${newer.request_id}/export`, f.cookie, {
        version: 2,
      })
    ).status,
    409,
  );
  await review(f, 2, "CANCELLED");
  assert.equal(
    (await req(`/${f.room}/bridge/${f.id}/export`, f.cookie, { version: 2 }))
      .status,
    409,
  );
  const fresh = await setup(),
    receipt = await exportOne(fresh);
  const bad = {
    version: 3,
    result: {
      request_id: fresh.id,
      packet_sha256: receipt.packet_sha256,
      draft_text: "Draft",
      actions: ["send"],
    },
  };
  assert.equal(
    (await req(`/${fresh.room}/bridge/${fresh.id}/result`, fresh.cookie, bad))
      .status,
    400,
  );
});
test("private outsider, room member and same actor in another tenant cannot read source packets or invoke bridge authority", async () => {
  const f = await setup(),
    outsider = await knowledgeLogin("owner");
  assert.equal((await req(`/${f.room}/bridge`, outsider)).status, 404);
  await ok(`/${f.room}/members`, f.cookie, { account_id: owner, active: true });
  assert.deepEqual((await ok(`/${f.room}/bridge`, outsider)).requests, []);
  assert.equal((await req(`/${f.room}/bridge/${f.id}`, outsider)).status, 403);
  assert.equal(
    (
      await req(`/${f.room}/bridge`, outsider, {
        ...f.input,
        request_id: uuid(),
      })
    ).status,
    403,
  );
  const tenant = uuid();
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Synthetic bridge tenant',$2)",
    [tenant, "bridge-" + uuid()],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic','AT_BRIDGE')",
    [tenant, partner],
  );
  try {
    const cookie = await knowledgeLogin("partner"),
      selection = await fetch(testOrigin + "/api/context", {
        method: "POST",
        headers: {
          origin: testOrigin,
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({ organisation_id: tenant }),
      });
    assert.equal(selection.status, 200);
    const context = selection.headers
      .getSetCookie()
      .map((v) => v.split(";", 1)[0])
      .join("; ");
    assert.equal(
      (await req(`/${f.room}/bridge`, cookie + "; " + context)).status,
      404,
    );
    const db = await app.connect();
    try {
      await db.query("begin");
      await db.query("set local role authenticated");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true)",
        [partner, tenant],
      );
      assert.equal(
        (
          await db.query(
            "select id from kxra.team_bridge_requests where id=$1",
            [f.id],
          )
        ).rowCount,
        0,
      );
      await assert.rejects(
        db.query(
          "select packet_text from kxra.team_bridge_requests where id=$1",
          [f.id],
        ),
        (e: any) => e.code === "42501",
      );
    } finally {
      await db.query("rollback");
      db.release();
    }
  } finally {
    await admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1",
      [tenant],
    );
  }
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await assert.rejects(
      db.query("select kxra.team_bridge_create($1,$2,$3)", [
        uuid(),
        f.room,
        "{}",
      ]),
      (e: any) => e.code === "42501",
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
});
test("expiration and source/session revocation prevent reuse while direct writes stay denied", async () => {
  const f = await setup(),
    view = await ok(`/${f.room}/bridge/${f.id}`, f.cookie),
    expiredId = uuid();
  const packet = {
    ...view.packet,
    request_id: expiredId,
    created_at: Date.now() - 700000,
    expires_at: Date.now() - 100000,
  };
  packet.expires_at = packet.created_at + 600000;
  const raw = JSON.stringify(packet),
    hash = crypto.createHash("sha256").update(raw).digest("hex");
  await fixtureWrite(
    `insert into kxra.team_bridge_requests(id,org_id,room_id,requested_by,request_session_version,objective,packet_text,packet_sha256,expires_at,created_at)
  values($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9/1000.0),to_timestamp($10/1000.0))`,
    [
      expiredId,
      org,
      f.room,
      partner,
      packet.session_version,
      packet.objective,
      raw,
      hash,
      packet.expires_at,
      packet.created_at,
    ],
  );
  assert.equal(
    (
      await req(`/${f.room}/bridge/${expiredId}/review`, f.cookie, {
        version: 1,
        decision: "APPROVED",
      })
    ).status,
    409,
  );
  const staleId = uuid(),
    stale = {
      ...view.packet,
      request_id: staleId,
      session_version: packet.session_version + 1,
    },
    staleRaw = JSON.stringify(stale);
  await fixtureWrite(
    `insert into kxra.team_bridge_requests(id,org_id,room_id,requested_by,request_session_version,objective,packet_text,packet_sha256,expires_at)
  values($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9/1000.0))`,
    [
      staleId,
      org,
      f.room,
      partner,
      stale.session_version,
      stale.objective,
      staleRaw,
      crypto.createHash("sha256").update(staleRaw).digest("hex"),
      stale.expires_at,
    ],
  );
  assert.equal(
    (
      await req(`/${f.room}/bridge/${staleId}/review`, f.cookie, {
        version: 1,
        decision: "APPROVED",
      })
    ).status,
    403,
  );
  await review(f, 1, "APPROVED");
  await fixtureWrite(
    "update kxra.team_room_members set active=false where room_id=$1 and account_id=$2",
    [f.room, partner],
  );
  assert.equal(
    (await req(`/${f.room}/bridge/${f.id}/export`, f.cookie, { version: 2 }))
      .status,
    404,
  );
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await assert.rejects(
      db.query(
        "update kxra.team_bridge_requests set state='ACCEPTED' where id=$1",
        [f.id],
      ),
      (e: any) => e.code === "42501",
    );
  } finally {
    await db.query("rollback");
    db.release();
  }
});

test("cancelled paid access blocks new export and acceptance without deleting handoff history", async () => {
  const tenant = uuid(),
    project = uuid(),
    cookie0 = await knowledgeLogin("owner");
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Synthetic bridge billing',$2)",
    [tenant, "bridge-billing-" + uuid()],
  );
  await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic owner','AT_BRIDGE')",
    [tenant, owner],
  );
  try {
    await admin.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'BRIDGE','Synthetic fixture','TEST','ACTIVE','Review')",
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
        name: "Synthetic billing bridge",
        guidelines: "No external actions",
        access: "PRIVATE",
      })
    ).id;
    const message = (
      await ok(`/${room}/messages`, cookie, {
        request_id: uuid(),
        body: "Synthetic billing source",
      })
    ).id;
    const input = {
      request_id: uuid(),
      adapter: "MANUAL_DRAFT",
      objective: "Synthetic billing draft",
      message_ids: [message],
    };
    await ok(`/${room}/bridge`, cookie, input);
    await ok(`/${room}/bridge/${input.request_id}/review`, cookie, {
      version: 1,
      decision: "APPROVED",
    });
    const returned = {
      ...input,
      request_id: uuid(),
      objective: "Pending returned billing draft",
    };
    await ok(`/${room}/bridge`, cookie, returned);
    await ok(`/${room}/bridge/${returned.request_id}/review`, cookie, {
      version: 1,
      decision: "APPROVED",
    });
    const receipt = await ok(
      `/${room}/bridge/${returned.request_id}/export`,
      cookie,
      { version: 2 },
    );
    await ok(`/${room}/bridge/${returned.request_id}/result`, cookie, {
      version: 3,
      result: {
        request_id: returned.request_id,
        packet_sha256: receipt.packet_sha256,
        draft_text: "Synthetic pending draft",
      },
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
        await req(`/${room}/bridge/${input.request_id}/export`, cookie, {
          version: 2,
        })
      ).status,
      409,
    );
    assert.equal(
      (await req(`/${room}/bridge`, cookie, { ...input, request_id: uuid() }))
        .status,
      409,
    );
    assert.equal(
      (
        await req(`/${room}/bridge/${returned.request_id}/review`, cookie, {
          version: 4,
          decision: "ACCEPTED",
        })
      ).status,
      409,
    );
    assert.equal(
      (await ok(`/${room}/bridge`, cookie)).requests.find(
        (r: any) => r.id === input.request_id,
      ).state,
      "APPROVED",
    );
    await ok(`/${room}/bridge/${input.request_id}/review`, cookie, {
      version: 2,
      decision: "CANCELLED",
    });
  } finally {
    await admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1",
      [tenant],
    );
  }
});

test("export and cancellation race has one winner and cannot leave an executable or doubly consumed handoff", async () => {
  const f = await setup();
  await review(f, 1, "APPROVED");
  const outcomes = await Promise.all([
    req(`/${f.room}/bridge/${f.id}/export`, f.cookie, { version: 2 }),
    req(`/${f.room}/bridge/${f.id}/review`, f.cookie, {
      version: 2,
      decision: "CANCELLED",
    }),
  ]);
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [201, 409]);
  const row = (await rows(f)).find((r: any) => r.id === f.id);
  assert.ok(["CANCELLED", "EXPORTED"].includes(row.state));
  assert.ok(row.export_count <= 1);
  if (row.state === "EXPORTED") await review(f, 3, "CANCELLED");
  assert.equal(
    (await req(`/${f.room}/bridge/${f.id}/export`, f.cookie, { version: 2 }))
      .status,
    409,
  );
  assert.equal(
    (await rows(f)).find((r: any) => r.id === f.id).state,
    "CANCELLED",
  );
});
