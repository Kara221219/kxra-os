import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { runtimeFile, testOrigin } from "./support/runtime";
import {
  knowledgeFixture,
  knowledgeLogin,
  knowledgeOk as ok,
  knowledgeRequest as req,
  knowledgeProject,
} from "./support/team-knowledge";
const uuid = () => crypto.randomUUID();
assert.ok(localModeConfiguration(process.env), "Cases require a local fixture");
const cfg = JSON.parse(fs.readFileSync(runtimeFile("database.json"), "utf8")),
  admin = new pg.Pool({ ...cfg, user: os.userInfo().username }),
  app = new pg.Pool(cfg);
after(async () => {
  await admin.end();
  await app.end();
});
const fields = (
  title: string,
  details: Record<string, unknown>,
  parent_id: string | null = null,
) => ({
  request_id: uuid(),
  version: 0,
  title,
  body: "Synthetic local case",
  responsible: "Maya",
  next_step: "Human review",
  due_on: null,
  details,
  parent_id,
});
const remodel = {
  property: "Synthetic garden room",
  scope: "Record the agreed survey scope",
  exclusions: "No contract or services",
  estimate_amount: "1250.45",
  milestone: "Review design constraints",
};
const role = {
  role_brief: "Synthetic operations role",
  criteria: "Review recorded relevant experience",
};
const application = {
  application_reference: "SYNTHETIC-JORDAN-01",
  evidence: "Fictional application evidence",
  review_note: "Human note only; no eligibility decision",
};
const travel = {
  traveller_reference: "Synthetic party A",
  destination: "Fictional coastal itinerary",
  starts_on: "2026-12-01",
  ends_on: "2026-12-04",
  proposal: "Versioned local itinerary record",
  exclusions: "No booking, passport/visa advice or payments",
};
async function record(f: any, prefix: string, id: string) {
  return (await ok(`/${f.room}/${prefix}-records`, f.cookie)).records.find(
    (r: any) => r.id === id,
  );
}
async function step(f: any, prefix: string, id: string, target: string) {
  const r = await record(f, prefix, id),
    a = {
      request_id: uuid(),
      source_id: id,
      source_version: r.version,
      target_stage: target,
      note: "Synthetic human-reviewed local case step",
    };
  await ok(`/${f.room}/${prefix}-propose`, f.cookie, a);
  await ok(`/${f.room}/${prefix}-review`, f.cookie, {
    action_id: a.request_id,
    version: 1,
    decision: "APPROVED",
  });
  const result = await ok(`/${f.room}/${prefix}-execute`, f.cookie, {
    action_id: a.request_id,
    version: 2,
  });
  return { a, result };
}
test("remodeling scope and exact decimal estimate require versioned review before milestone handoff", async () => {
  const f = await knowledgeFixture(false),
    input = fields("Synthetic remodeling " + uuid(), remodel);
  await ok(`/${f.room}/remodel-save`, f.cookie, input);
  await ok(`/${f.room}/remodel-save`, f.cookie, input);
  assert.equal(
    (await record(f, "remodel", input.request_id)).details.estimate_pence,
    125045,
  );
  await step(f, "remodel", input.request_id, "ESTIMATE_DRAFT");
  await step(f, "remodel", input.request_id, "SCOPE_REVIEWED");
  await ok(`/${f.room}/remodel-save`, f.cookie, {
    ...input,
    version: 3,
    details: {
      ...remodel,
      estimate_amount: "1300.01",
      scope: "Changed scope requires fresh review",
    },
  });
  const changed = await record(f, "remodel", input.request_id);
  assert.equal(changed.stage, "ESTIMATE_DRAFT");
  assert.equal(changed.details.estimate_pence, 130001);
  assert.equal(
    (
      await req(`/${f.room}/remodel-propose`, f.cookie, {
        request_id: uuid(),
        source_id: input.request_id,
        source_version: 4,
        target_stage: "HANDOFF",
        note: "Cannot skip review",
      })
    ).status,
    409,
  );
  for (const target of [
    "SCOPE_REVIEWED",
    "MILESTONE_PLANNED",
    "HANDOFF",
    "ARCHIVED",
  ])
    await step(f, "remodel", input.request_id, target);
  assert.equal(
    (await record(f, "remodel", input.request_id)).stage,
    "ARCHIVED",
  );
  assert.equal(
    (
      await req(
        `/${f.room}/remodel-save`,
        f.cookie,
        fields("Invalid estimate", { ...remodel, estimate_amount: "1.001" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        `/${f.room}/remodel-save`,
        f.cookie,
        fields("Negative estimate", { ...remodel, estimate_amount: "-1.00" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        `/${f.room}/remodel-save`,
        f.cookie,
        fields("Forged detail", { ...remodel, paid: true }),
      )
    ).status,
    400,
  );
});
test("travel proposal changes fence approval and reset review; local agreement never makes a booking", async () => {
  const f = await knowledgeFixture(false),
    input = fields("Synthetic travel " + uuid(), travel);
  await ok(`/${f.room}/travel-save`, f.cookie, input);
  await step(f, "travel", input.request_id, "PROPOSAL_DRAFT");
  const a = {
    request_id: uuid(),
    source_id: input.request_id,
    source_version: 2,
    target_stage: "REVIEWED",
    note: "Review exact itinerary",
  };
  await ok(`/${f.room}/travel-propose`, f.cookie, a);
  await ok(`/${f.room}/travel-review`, f.cookie, {
    action_id: a.request_id,
    version: 1,
    decision: "APPROVED",
  });
  await ok(`/${f.room}/travel-save`, f.cookie, {
    ...input,
    version: 2,
    details: { ...travel, ends_on: "2026-12-05" },
  });
  assert.equal(
    (
      await req(`/${f.room}/travel-execute`, f.cookie, {
        action_id: a.request_id,
        version: 2,
      })
    ).status,
    409,
  );
  for (const target of ["REVIEWED", "NEXT_STEP_AGREED", "ARCHIVED"]) {
    const { a, result } = await step(f, "travel", input.request_id, target);
    const replay = await ok(`/${f.room}/travel-execute`, f.cookie, {
      action_id: a.request_id,
      version: 2,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.version, result.version);
  }
  const fresh = await knowledgeLogin("partner");
  assert.equal(
    (await ok(`/${f.room}/travel-records`, fresh)).records[0].stage,
    "ARCHIVED",
  );
  assert.equal(
    (
      await req(
        `/${f.room}/travel-save`,
        f.cookie,
        fields("Bad dates", { ...travel, ends_on: "2026-11-30" }),
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        `/${f.room}/travel-save`,
        f.cookie,
        fields("Impossible date", { ...travel, starts_on: "2026-02-30" }),
      )
    ).status,
    400,
  );
});
test("private recruiting roles govern distinct applications and changes invalidate recorded human review", async () => {
  const f = await knowledgeFixture(false),
    r = fields("Synthetic role " + uuid(), role);
  await ok(`/${f.room}/role-save`, f.cookie, r);
  const input = fields(
    "Fictional Jordan / Operations",
    application,
    r.request_id,
  );
  assert.equal(
    (await req(`/${f.room}/application-save`, f.cookie, input)).status,
    409,
  );
  await step(f, "role", r.request_id, "OPEN");
  await ok(`/${f.room}/application-save`, f.cookie, input);
  const proposed = {
    request_id: uuid(),
    source_id: input.request_id,
    source_version: 1,
    target_stage: "REVIEW",
    note: "Synthetic confidential review record",
  };
  await ok(`/${f.room}/application-propose`, f.cookie, proposed);
  await ok(`/${f.room}/application-review`, f.cookie, {
    action_id: proposed.request_id,
    version: 1,
    decision: "APPROVED",
  });
  await ok(`/${f.room}/role-save`, f.cookie, {
    ...r,
    version: 2,
    details: {
      ...role,
      criteria: "Changed criteria require fresh opening review",
    },
  });
  assert.equal((await record(f, "role", r.request_id)).stage, "DRAFT");
  assert.equal(
    (
      await req(`/${f.room}/application-execute`, f.cookie, {
        action_id: proposed.request_id,
        version: 2,
      })
    ).status,
    409,
  );
  await step(f, "role", r.request_id, "OPEN");
  for (const target of ["REVIEW", "INTERVIEW", "DECISION_RECORDED"])
    await step(f, "application", input.request_id, target);
  assert.equal(
    (
      await req(`/${f.room}/application-save`, f.cookie, {
        ...input,
        version: 4,
        details: {
          ...application,
          review_note: "Cannot rewrite recorded human decision",
        },
      })
    ).status,
    409,
  );
  await step(f, "application", input.request_id, "ARCHIVED");
  await step(f, "role", r.request_id, "CLOSED");
  assert.equal(
    (
      await req(
        `/${f.room}/application-save`,
        f.cookie,
        fields("Closed role request", application, r.request_id),
      )
    ).status,
    409,
  );
  const projectRoom = await ok("", f.cookie, {
    project_id: knowledgeProject,
    name: "Project-visible room",
    guidelines: "No confidential recruiting",
    access: "PROJECT",
  });
  assert.equal(
    (
      await req(
        `/${projectRoom.id}/role-save`,
        f.cookie,
        fields("Must stay private", role),
      )
    ).status,
    409,
  );
  const outsider = await knowledgeLogin("owner");
  assert.equal(
    (await req(`/${f.room}/application-records`, outsider)).status,
    404,
  );
  await ok(`/${f.room}/members`, f.cookie, {
    account_id: "20000000-0000-4000-8000-000000000001",
    active: true,
  });
  const next = fields("Review permission role", role);
  await ok(`/${f.room}/role-save`, f.cookie, next);
  const a = {
    request_id: uuid(),
    source_id: next.request_id,
    source_version: 1,
    target_stage: "OPEN",
    note: "Creator-only review",
  };
  await ok(`/${f.room}/role-propose`, f.cookie, a);
  assert.equal(
    (
      await req(`/${f.room}/role-review`, outsider, {
        action_id: a.request_id,
        version: 1,
        decision: "APPROVED",
      })
    ).status,
    403,
  );
});

test("case records and reviews remain isolated after room revocation and tenant-context changes at HTTP and SQL layers", async () => {
  const f = await knowledgeFixture(false),
    input = fields("Synthetic isolated case", remodel),
    owner = "20000000-0000-4000-8000-000000000001",
    partner = "20000000-0000-4000-8000-000000000002",
    org = "10000000-0000-4000-8000-000000000001";
  await ok(`/${f.room}/remodel-save`, f.cookie, input);
  const action = {
    request_id: uuid(),
    source_id: input.request_id,
    source_version: 1,
    target_stage: "ESTIMATE_DRAFT",
    note: "Synthetic isolation check",
  };
  await ok(`/${f.room}/remodel-propose`, f.cookie, action);
  await ok(`/${f.room}/members`, f.cookie, { account_id: owner, active: true });
  const db = await app.connect();
  async function visible(actor: string, tenant: string) {
    await db.query("begin");
    try {
      await db.query("set local role authenticated");
      await db.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true)",
        [actor, tenant],
      );
      const counts = [];
      for (const table of ["team_case_records", "team_case_actions"])
        counts.push(
          (
            await db.query(`select id from kxra.${table} where room_id=$1`, [
              f.room,
            ])
          ).rowCount,
        );
      return counts;
    } finally {
      await db.query("rollback");
    }
  }
  try {
    assert.deepEqual(await visible(owner, org), [1, 1]);
    await ok(`/${f.room}/members`, f.cookie, {
      account_id: owner,
      active: false,
    });
    assert.deepEqual(await visible(owner, org), [0, 0]);
    const outsider = await knowledgeLogin("owner");
    assert.equal(
      (await req(`/${f.room}/remodel-records`, outsider)).status,
      404,
    );
    assert.equal(
      (await req(`/${f.room}/remodel-actions`, outsider)).status,
      404,
    );
    const tenant = uuid();
    await admin.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic cases tenant',$2)",
      [tenant, "cases-" + uuid()],
    );
    await admin.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic','AT_CASES')",
      [tenant, partner],
    );
    try {
      assert.deepEqual(await visible(partner, tenant), [0, 0]);
      const cookie = await knowledgeLogin("partner"),
        selected = await fetch(testOrigin + "/api/context", {
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
      for (const collection of ["records", "actions"])
        assert.equal(
          (
            await req(
              `/${f.room}/remodel-${collection}`,
              cookie + "; " + context,
            )
          ).status,
          404,
        );
    } finally {
      await admin.query(
        "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where org_id=$1",
        [tenant],
      );
    }
  } finally {
    db.release();
  }
});
