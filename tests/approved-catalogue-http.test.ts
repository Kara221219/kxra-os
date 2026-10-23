import { test, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin as base } from "./support/runtime";
import {
  knowledgeLogin,
  knowledgeOk as ok,
  knowledgeRequest as req,
} from "./support/team-knowledge";
import { approvedCatalogue } from "../packages/workspace/approved-catalogue";
const config = JSON.parse(
    fs.readFileSync(runtimeFile("database.json"), "utf8"),
  ),
  admin = new pg.Pool({ ...config, user: os.userInfo().username }),
  app = new pg.Pool(config),
  owner = "20000000-0000-4000-8000-000000000001",
  partner = "20000000-0000-4000-8000-000000000002";
const ownedMemberships: string[] = [];
after(async () => {
  if (ownedMemberships.length)
    await admin.query(
      "update kxra.organisation_memberships set state='REVOKED',revoked_at=now() where id=any($1::uuid[])",
      [ownedMemberships],
    );
  await admin.end();
  await app.end();
});
const uuid = () => crypto.randomUUID();
async function tenant() {
  const org = uuid(),
    project = uuid(),
    fresh = await knowledgeLogin("owner");
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'Synthetic catalogue',$2)",
    [org, "catalogue-" + uuid()],
  );
  const membership = await admin.query(
    "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic catalogue owner','CATALOGUE_TEST') returning id",
    [org, owner],
  );
  ownedMemberships.push(membership.rows[0].id);
  await admin.query(
    "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'CATALOGUE','Synthetic catalogue','TEST','ACTIVE','Review')",
    [project, org],
  );
  const response = await fetch(base + "/api/context", {
    method: "POST",
    headers: {
      origin: base,
      cookie: fresh,
      "content-type": "application/json",
    },
    body: JSON.stringify({ organisation_id: org }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const jar = new Map(
    fresh.split("; ").map((v) => {
      const n = v.indexOf("=");
      return [v.slice(0, n), v.slice(n + 1)];
    }),
  );
  for (const raw of response.headers.getSetCookie()) {
    const p = raw.split(";", 1)[0],
      n = p.indexOf("=");
    jar.set(p.slice(0, n), p.slice(n + 1));
  }
  return {
    org,
    project,
    cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
  };
}
async function as(
  actor: string,
  org: string,
  sql: string,
  args: unknown[] = [],
  mode = "fixture",
  fresh = true,
) {
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query("set local role authenticated");
    await db.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.execution_mode',$4,true)",
      [
        actor,
        JSON.stringify({
          sub: actor,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000) - (fresh ? 0 : 7200),
        }),
        org,
        mode,
      ],
    );
    const result = await db.query(sql, args);
    await db.query("commit");
    return result.rows;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
async function invite(org: string, project: string, email: string) {
  return as(
    owner,
    org,
    "select * from kxra.create_invitation($1,$2,'contributor',$3,now()+interval '1 day')",
    [project, email, crypto.randomBytes(32).toString("hex")],
  );
}

for (const plan of approvedCatalogue)
  test(`${plan.name} persists an explicit pending plan and enforces ${plan.people} seats under concurrent admission`, async () => {
    const f = await tenant(),
      id = uuid(),
      body = { request_id: id, offer_key: plan.offer_key };
    const results = await Promise.all([
      ok("/pilot/catalogue", f.cookie, body),
      ok("/pilot/catalogue", f.cookie, body),
    ]);
    assert.equal(results[0].subscription.version, 1);
    assert.equal(results[1].subscription.version, 1);
    let s = await ok("/pilot", f.cookie);
    assert.deepEqual(s.approved_catalogue, approvedCatalogue);
    assert.equal(s.offer.offer_key, plan.offer_key);
    assert.equal(s.offer.monthly_amount_minor, plan.monthly_amount_minor);
    assert.equal(s.seat_capacity, plan.people);
    assert.equal(s.subscription.state, "PENDING");
    assert.equal(s.entitled, false);
    assert.equal(s.checkout_enabled, false);
    assert.equal(
      Number(
        (
          await admin.query(
            "select count(*) n from kxra.workspace_pilot_events where id=$1",
            [id],
          )
        ).rows[0].n,
      ),
      1,
    );
    assert.equal(
      (
        await req("", f.cookie, {
          project_id: f.project,
          name: "Pending plan cannot work",
          guidelines: "",
          access: "PRIVATE",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await req("/pilot/catalogue", f.cookie, {
          ...body,
          offer_key:
            plan.offer_key === "KXRA_TEAM_V1"
              ? "KXRA_BUSINESS_V1"
              : "KXRA_TEAM_V1",
        })
      ).status,
      409,
    );
    for (const extra of [
      { people: 99 },
      { amount: 1 },
      { org_id: uuid() },
      { state: "ACTIVE" },
    ])
      assert.equal(
        (await req("/pilot/catalogue", f.cookie, { ...body, ...extra })).status,
        400,
      );
    await ok("/pilot/events", f.cookie, {
      request_id: uuid(),
      version: 1,
      action: "ACTIVATE",
    });
    s = await ok("/pilot", f.cookie);
    assert.equal(s.entitled, true);
    assert.equal(s.subscription.version, 2);
    await ok("", f.cookie, {
      project_id: f.project,
      name: "Approved local plan room",
      guidelines: "Synthetic only",
      access: "PRIVATE",
    });
    if (plan.people === 1) {
      await assert.rejects(
        () => invite(f.org, f.project, uuid() + "@fixture.invalid"),
        /seat admission/,
      );
    } else {
      for (let i = 0; i < plan.people - 2; i++)
        await invite(f.org, f.project, `${uuid()}@fixture.invalid`);
      const race = await Promise.allSettled([
        invite(f.org, f.project, `${uuid()}@fixture.invalid`),
        invite(f.org, f.project, `${uuid()}@fixture.invalid`),
      ]);
      assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(race.filter((r) => r.status === "rejected").length, 1);
    }
    s = await ok("/pilot", f.cookie);
    assert.equal(s.seats_reserved, plan.people);
    await ok("/pilot/events", f.cookie, {
      request_id: uuid(),
      version: s.subscription.version,
      action: "CANCEL_NOW",
    });
    assert.equal(
      (
        await req("", f.cookie, {
          project_id: f.project,
          name: "Cancelled cannot work",
          guidelines: "",
          access: "PRIVATE",
        })
      ).status,
      409,
    );
    assert.equal((await ok("/pilot", f.cookie)).entitled, false);
    assert.equal(
      (await ok("/pilot", f.cookie)).offer.offer_key,
      plan.offer_key,
    );
  });
test("selection denies unauthenticated, cross-tenant, stale MFA, non-owner, hosted and provider-bound requests", async () => {
  const f = await tenant(),
    i = uuid();
  assert.equal(
    (
      await req("/pilot/catalogue", undefined, {
        request_id: i,
        offer_key: "KXRA_TEAM_V1",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await req("/pilot/catalogue", f.cookie, {
        request_id: i,
        offer_key: "__proto__",
      })
    ).status,
    400,
  );
  for (const [actor, mode, fresh] of [
    [partner, "fixture", true],
    [owner, "hosted", true],
    [owner, "fixture", false],
  ] as const)
    await assert.rejects(
      () =>
        as(
          actor,
          f.org,
          "select kxra.workspace_catalogue_select($1,$2)",
          [i, "KXRA_TEAM_V1"],
          mode,
          fresh,
        ),
      { code: "42501" },
    );
  await ok("/pilot/catalogue", f.cookie, {
    request_id: i,
    offer_key: "KXRA_TEAM_V1",
  });
  const other = await tenant();
  assert.equal(
    (
      await req("/pilot/catalogue", other.cookie, {
        request_id: i,
        offer_key: "KXRA_TEAM_V1",
      })
    ).status,
    409,
  );
  assert.equal((await ok("/pilot", other.cookie)).assigned, false);
  await admin.query(
    "insert into kxra.pilot_stripe_bindings(org_id,customer_id) values($1,$2)",
    [other.org, "cus_Synthetic" + uuid().replaceAll("-", "")],
  );
  assert.equal(
    (
      await req("/pilot/catalogue", other.cookie, {
        request_id: uuid(),
        offer_key: "KXRA_TEAM_V1",
      })
    ).status,
    409,
  );
});
test("legacy pilot remains unchanged and pending selection is immutable and denies unapproved conversion", async () => {
  const legacy = await tenant();
  await ok("/pilot/events", legacy.cookie, {
    request_id: uuid(),
    version: 0,
    action: "ACTIVATE",
  });
  const before = await ok("/pilot", legacy.cookie);
  assert.equal(before.offer.offer_key, "WORKSPACE_PILOT_V1");
  assert.equal(before.offer.monthly_amount_minor, 4900);
  assert.equal(before.seat_capacity, 5);
  assert.equal(
    (
      await req("/pilot/catalogue", legacy.cookie, {
        request_id: uuid(),
        offer_key: "KXRA_BUSINESS_V1",
      })
    ).status,
    409,
  );
  const after = await ok("/pilot", legacy.cookie);
  assert.deepEqual(after.subscription, before.subscription);
  await assert.rejects(
    () =>
      as(
        owner,
        legacy.org,
        "update kxra.workspace_pilots set offer_key='KXRA_BUSINESS_V1' where org_id=$1",
        [legacy.org],
      ),
    { code: "42501" },
  );
  await assert.rejects(
    () =>
      admin.query(
        "update kxra.workspace_pilots set offer_key='KXRA_BUSINESS_V1' where org_id=$1",
        [legacy.org],
      ),
    /immutable/,
  );
});
