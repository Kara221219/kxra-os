import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { chromium } from "@playwright/test";
import type { AppRecord } from "../../packages/custom-apps/records";
import { installCustomApps } from "../../scripts/custom-apps-install";
import { exampleCustomApp } from "../../packages/custom-apps/contract";
import {
  knowledgeLogin,
  knowledgeOk,
  knowledgeProject,
} from "../support/team-knowledge";
import { testOrigin, runtimeFile } from "../support/runtime";
const config = JSON.parse(
    fs.readFileSync(runtimeFile("database.json"), "utf8"),
  ),
  db = new pg.Pool(config),
  admin = new pg.Pool({ ...config, user: os.userInfo().username });
const partner = "20000000-0000-4000-8000-000000000002",
  owner = "20000000-0000-4000-8000-000000000001",
  org = "10000000-0000-4000-8000-000000000001",
  uuid = () => crypto.randomUUID();
before(installCustomApps);
after(async () => {
  await db.end();
  await admin.end();
});
async function req(
  room: string,
  app: string,
  cookie?: string,
  body?: unknown,
  path = "records",
  origin = testOrigin,
) {
  return fetch(`${testOrigin}/api/custom-apps/${room}/${app}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function ok(
  room: string,
  app: string,
  cookie: string,
  body?: unknown,
  path = "records",
) {
  const r = await req(room, app, cookie, body, path);
  assert.equal(r.status, 200, await r.clone().text());
  assert.match(r.headers.get("cache-control") || "", /no-store/);
  return r.json();
}
async function appMutation(room: string, cookie: string, body: unknown) {
  const r = await fetch(`${testOrigin}/api/custom-apps/${room}`, {
    method: "POST",
    headers: { cookie, origin: testOrigin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
}
async function fixture(
  access = "PRIVATE",
  who = "partner",
  project = knowledgeProject,
) {
  const cookie = await knowledgeLogin(who),
    r = await knowledgeOk("", cookie, {
      project_id: project,
      name: "Synthetic data app " + uuid(),
      guidelines: "Fixture only",
      access,
    }),
    app = uuid();
  await appMutation(r.id, cookie, {
    operation: "register",
    app_id: app,
    expected_revision: 0,
    schema: exampleCustomApp,
  });
  await appMutation(r.id, cookie, {
    operation: "PUBLISH_LOCAL",
    app_id: app,
    expected_revision: 1,
    version: 1,
  });
  return { cookie, room: r.id, app };
}
function body() {
  return {
    operation_id: uuid(),
    record_id: uuid(),
    expected_app_revision: 2,
    schema_version: 1,
    expected_record_revision: 0,
    data: {
      brief: "Synthetic persisted brief",
      priority: "High",
      reviewed: true,
    },
  };
}
async function as(
  actor: string | null,
  sql: string,
  values: unknown[] = [],
  mode?: string,
  organisation = org,
  rollback = false,
) {
  const c = await db.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${actor ? "authenticated" : "anon"}`);
    await c.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true)",
      [
        actor || "",
        JSON.stringify({
          sub: actor,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
        }),
        organisation,
      ],
    );
    if (mode !== undefined)
      await c.query(
        "select set_config('request.kxra.execution_mode',$1,true)",
        [mode],
      );
    const r = await c.query(sql, values);
    await c.query(rollback ? "rollback" : "commit");
    return r.rows;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
function args(
  f: Awaited<ReturnType<typeof fixture>>,
  b: ReturnType<typeof body>,
) {
  return [
    b.operation_id,
    b.record_id,
    f.app,
    f.room,
    b.expected_app_revision,
    b.schema_version,
    b.expected_record_revision,
    b.data,
  ];
}
const saveSql =
  "select kxra.custom_app_record_save($1,$2,$3,$4,$5,$6,$7,$8) receipt";
test("typed records persist immutable revisions, exact repeats and one concurrent winner", async () => {
  const f = await fixture(),
    b = body(),
    receipts = await Promise.all(
      Array.from({ length: 4 }, () => ok(f.room, f.app, f.cookie, b)),
    );
  for (const r of receipts) assert.deepEqual(r, receipts[0]);
  let page = await ok(f.room, f.app, f.cookie);
  assert.equal(page.records.length, 1);
  assert.deepEqual(page.records[0].data, b.data);
  const update = {
    ...b,
    operation_id: uuid(),
    expected_record_revision: 1,
    data: { ...b.data, brief: "Updated synthetic brief" },
  };
  const results = await Promise.all([
    req(f.room, f.app, f.cookie, update),
    req(f.room, f.app, f.cookie, {
      ...update,
      operation_id: uuid(),
      data: { ...update.data, brief: "Competing brief" },
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  page = await ok(f.room, f.app, f.cookie);
  assert.equal(page.records[0].version, 2);
  const versions = await as(
    partner,
    "select version,data from kxra.custom_app_record_versions where record_id=$1 order by version",
    [b.record_id],
    "fixture",
  );
  assert.equal(versions.length, 2);
  assert.deepEqual(versions[0].data, b.data);
  assert.deepEqual(
    await ok(f.room, f.app, f.cookie, undefined, `receipts/${b.operation_id}`),
    receipts[0],
  );
  assert.equal(
    (
      await req(f.room, f.app, f.cookie, {
        ...b,
        data: { ...b.data, brief: "Changed replay" },
      })
    ).status,
    409,
  );
  assert.equal(
    (await req(f.room, f.app, f.cookie, { ...b, operation_id: uuid() })).status,
    409,
  );
  for (const table of ["custom_app_records", "custom_app_record_versions"]) {
    const column = table === "custom_app_records" ? "id" : "record_id";
    await assert.rejects(
      as(
        partner,
        `delete from kxra.${table} where ${column}=$1`,
        [b.record_id],
        "fixture",
      ),
      { code: "42501" },
    );
    await assert.rejects(
      admin.query(`delete from kxra.${table} where ${column}=$1`, [
        b.record_id,
      ]),
      /Immutable/,
    );
  }
  await installCustomApps();
  assert.equal((await ok(f.room, f.app, f.cookie)).records[0].version, 2);
});
test("publication and rollback preserve original schema and reject stale or unpublished writes", async () => {
  const f = await fixture(),
    b = body(),
    first = await ok(f.room, f.app, f.cookie, b);
  const v2 = {
    ...exampleCustomApp,
    title: "Schema two",
    fields: [
      { key: "other", type: "text", label: "Different field", required: true },
    ],
  };
  await appMutation(f.room, f.cookie, {
    operation: "register",
    app_id: f.app,
    expected_revision: 2,
    schema: v2,
  });
  await appMutation(f.room, f.cookie, {
    operation: "PUBLISH_LOCAL",
    app_id: f.app,
    expected_revision: 3,
    version: 2,
  });
  let page = await ok(f.room, f.app, f.cookie);
  assert.equal(page.records[0].schema.fields[0].key, "brief");
  assert.deepEqual(page.records[0].data, b.data);
  assert.equal(page.active_schema.title, "Schema two");
  assert.equal(
    (
      await req(f.room, f.app, f.cookie, {
        ...b,
        operation_id: uuid(),
        expected_record_revision: 1,
        expected_app_revision: 4,
      })
    ).status,
    409,
  );
  // Exact committed receipt remains recoverable after publication changes; no new revision is appended.
  assert.deepEqual(await ok(f.room, f.app, f.cookie, b), first);
  await appMutation(f.room, f.cookie, {
    operation: "ROLLBACK_LOCAL",
    app_id: f.app,
    expected_revision: 4,
    version: 1,
  });
  assert.equal(
    (
      await req(f.room, f.app, f.cookie, {
        ...b,
        operation_id: uuid(),
        expected_record_revision: 1,
      })
    ).status,
    409,
  );
  await ok(f.room, f.app, f.cookie, {
    ...b,
    operation_id: uuid(),
    expected_record_revision: 1,
    expected_app_revision: 5,
    data: { ...b.data, brief: "Edited under rollback" },
  });
  page = await ok(f.room, f.app, f.cookie);
  assert.equal(page.records[0].version, 2);
  assert.equal(page.app.active_version, 1);
  const id = uuid();
  await appMutation(f.room, f.cookie, {
    operation: "register",
    app_id: id,
    expected_revision: 0,
    schema: exampleCustomApp,
  });
  assert.equal(
    (await req(f.room, id, f.cookie, { ...body(), expected_app_revision: 1 }))
      .status,
    409,
  );
});
test("HTTP and SQL enforce tenant, app, active room membership and writer identity", async () => {
  const f = await fixture(),
    other = await fixture(),
    b = body();
  await ok(f.room, f.app, f.cookie, b);
  assert.equal((await req(f.room, f.app)).status, 401);
  const outsider = await knowledgeLogin("owner");
  assert.equal((await req(f.room, f.app, outsider)).status, 404);
  assert.equal((await req(other.room, f.app, other.cookie)).status, 404);
  assert.equal(
    (
      await req(other.room, other.app, other.cookie, {
        ...b,
        operation_id: uuid(),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await req(
        other.room,
        other.app,
        other.cookie,
        undefined,
        `receipts/${b.operation_id}`,
      )
    ).status,
    404,
  );
  assert.equal(
    (await req(f.room, f.app, f.cookie, { ...body(), actor_id: owner })).status,
    400,
  );
  assert.equal(
    (
      await req(
        f.room,
        f.app,
        f.cookie,
        body(),
        "records",
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  for (const mode of [undefined, "hosted", ""]) {
    assert.deepEqual(
      await as(
        partner,
        "select record_id from kxra.custom_app_record_versions where app_id=$1",
        [f.app],
        mode,
      ),
      [],
    );
    await assert.rejects(as(partner, saveSql, args(f, body()), mode), {
      code: "42501",
    });
  }
  assert.deepEqual(
    await as(
      partner,
      "select record_id from kxra.custom_app_record_versions where app_id=$1",
      [f.app],
      "fixture",
      uuid(),
    ),
    [],
  );
  await assert.rejects(
    as(partner, saveSql, args(f, body()), "fixture", uuid()),
    { code: "42501" },
  );
  await assert.rejects(as(null, "select * from kxra.custom_app_records"), {
    code: "42501",
  });
  await as(
    partner,
    "select kxra.team_room_member($1,$2,true)",
    [f.room, owner],
    "fixture",
  );
  assert.equal((await req(f.room, f.app, outsider)).status, 200);
  assert.equal(
    (
      await req(
        f.room,
        f.app,
        outsider,
        undefined,
        `receipts/${b.operation_id}`,
      )
    ).status,
    404,
  );
  // A room writer may use the customer form without becoming its schema/release manager.
  await ok(f.room, f.app, outsider, body());
  await as(
    partner,
    "select kxra.team_room_member($1,$2,false)",
    [f.room, owner],
    "fixture",
  );
  assert.equal((await req(f.room, f.app, outsider)).status, 404);
  assert.deepEqual(
    await as(
      owner,
      "select record_id from kxra.custom_app_record_versions where app_id=$1",
      [f.app],
      "fixture",
    ),
    [],
  );
  const readOnly = await fixture("PROJECT", "owner"),
    viewer = await knowledgeLogin("viewer");
  // Partner can write PROJECT-002, but cannot repin another app's existing record ID.
  assert.equal(
    (
      await req(readOnly.room, readOnly.app, f.cookie, {
        ...b,
        operation_id: uuid(),
      })
    ).status,
    403,
  );
  const viewed = await fixture(
    "PROJECT",
    "owner",
    "30000000-0000-4000-8000-000000000003",
  );
  assert.equal((await ok(viewed.room, viewed.app, viewer)).can_write, false);
  assert.equal(
    (await req(viewed.room, viewed.app, viewer, body())).status,
    403,
  );
});
test("malformed record types fail independently in HTTP and SQL; rolled-back operations can retry", async () => {
  const f = await fixture(),
    b = body();
  for (const data of [
    null,
    [],
    {},
    { ...b.data, unknown: "extra" },
    { ...b.data, reviewed: "true" },
    { ...b.data, priority: "not-an-option" },
    { ...b.data, brief: " " },
    { ...b.data, brief: "\t\n\r" },
    { ...b.data, brief: "\u00a0\ufeff" },
    { ...b.data, brief: "x".repeat(4001) },
  ]) {
    const v = { ...b, operation_id: uuid(), data };
    assert.equal((await req(f.room, f.app, f.cookie, v)).status, 400);
    await assert.rejects(
      as(
        partner,
        saveSql,
        [v.operation_id, v.record_id, f.app, f.room, 2, 1, 0, data],
        "fixture",
      ),
      /Invalid typed record/,
    );
  }
  await as(partner, saveSql, args(f, b), "fixture", org, true);
  assert.equal((await ok(f.room, f.app, f.cookie)).records.length, 0);
  assert.equal(
    (
      await req(
        f.room,
        f.app,
        f.cookie,
        undefined,
        `receipts/${b.operation_id}`,
      )
    ).status,
    404,
  );
  await ok(f.room, f.app, f.cookie, b);
  assert.equal((await ok(f.room, f.app, f.cookie)).records.length, 1);
});
test("record pages use app-bound stable cursors and enforce the immutable revision cap", async () => {
  const f = await fixture(),
    other = await fixture();
  for (let n = 0; n < 51; n++)
    await as(partner, saveSql, args(f, body()), "fixture");
  const p1 = await ok(f.room, f.app, f.cookie);
  assert.equal(p1.records.length, 50);
  assert.ok(p1.next_cursor);
  const p2 = await ok(
    f.room,
    f.app,
    f.cookie,
    undefined,
    `records?before=${p1.next_cursor}`,
  );
  assert.equal(p2.records.length, 1);
  assert.equal(p2.next_cursor, null);
  assert.equal(
    new Set([...p1.records, ...p2.records].map((x) => x.id)).size,
    51,
  );
  assert.equal(
    (
      await req(
        other.room,
        other.app,
        other.cookie,
        undefined,
        `records?before=${p1.next_cursor}`,
      )
    ).status,
    404,
  );
  assert.equal(
    (await req(f.room, f.app, f.cookie, undefined, "records?before=bad"))
      .status,
    400,
  );
  assert.equal(
    (
      await req(
        f.room,
        f.app,
        f.cookie,
        undefined,
        `records?before=${p1.next_cursor}&before=${p1.next_cursor}`,
      )
    ).status,
    400,
  );
  assert.equal(
    (await req(f.room, f.app, f.cookie, undefined, "records?before=")).status,
    400,
  );
  assert.equal(
    (await req(f.room, f.app, f.cookie, undefined, "records?extra=1")).status,
    400,
  );
  const b = body();
  for (let n = 0; n < 100; n++)
    await as(
      partner,
      saveSql,
      args(f, { ...b, operation_id: uuid(), expected_record_revision: n }),
      "fixture",
    );
  await assert.rejects(
    as(
      partner,
      saveSql,
      args(f, { ...b, operation_id: uuid(), expected_record_revision: 100 }),
      "fixture",
    ),
    /Invalid record request/,
  );
  for (let n = 52; n < 500; n++)
    await as(partner, saveSql, args(f, body()), "fixture");
  await assert.rejects(
    as(partner, saveSql, args(f, body()), "fixture"),
    /Local record limit/,
  );
});
test("browser saves, edits, renders escaped values and recovers interrupted/repeated saves without preview leakage", async () => {
  const f = await fixture(),
    browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(
      f.cookie.split("; ").map((x) => {
        const n = x.indexOf("=");
        return { name: x.slice(0, n), value: x.slice(n + 1), url: testOrigin };
      }),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(`${testOrigin}/os/custom-apps/${f.room}`);
    await page
      .getByRole("button", { name: exampleCustomApp.title, exact: true })
      .click();
    await page.getByRole("button", { name: "Preview v1", exact: true }).click();
    await page
      .frameLocator("iframe")
      .getByLabel("Project brief (required)")
      .fill("Preview must never persist");
    assert.equal((await ok(f.room, f.app, f.cookie)).records.length, 0);
    await page.goto(`${testOrigin}/os/apps/${f.room}/${f.app}`);
    await page
      .getByLabel("Project brief (required)")
      .fill('<script>alert("x")</script> Synthetic customer record');
    await page.getByLabel("Priority (required)").selectOption("High");
    await page.getByLabel("Ready for review").check();
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Saved record revision 1." })
      .waitFor();
    let records = await ok(f.room, f.app, f.cookie);
    assert.equal(records.records.length, 1);
    assert.equal(records.records[0].data.reviewed, true);
    assert.equal(await page.locator("article script").count(), 0);
    assert.ok(
      await page
        .locator("article")
        .innerText()
        .then((s) => s.includes('<script>alert("x")</script>')),
    );
    await page
      .getByRole("button", {
        name: `Edit record ${records.records[0].id}`,
        exact: true,
      })
      .click();
    await page
      .getByLabel("Project brief (required)")
      .fill("Edited saved result");
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Saved record revision 2." })
      .waitFor();
    // Abort before dispatch; retry preserves one operation and record identity.
    const pattern = `**/api/custom-apps/${f.room}/${f.app}/records`;
    let intercepted: any;
    await page.route(pattern, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      intercepted = route.request().postDataJSON();
      await route.abort("failed");
    });
    await page
      .getByLabel("Project brief (required)")
      .fill("Retried after network interruption");
    await page.getByLabel("Priority (required)").selectOption("Normal");
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Save outcome is unknown" })
      .waitFor();
    await page.getByRole("button", { name: "Retry exact save" }).waitFor();
    assert.equal((await ok(f.room, f.app, f.cookie)).records.length, 1);
    await page.unroute(pattern);
    await page.getByRole("button", { name: "Retry exact save" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Saved record revision 1." })
      .waitFor();
    records = await ok(f.room, f.app, f.cookie);
    assert.equal(records.records.length, 2);
    assert.ok(
      records.records.some((r: AppRecord) => r.id === intercepted.record_id),
    );
    // Drop a committed response. Exact retry must return the original receipt, not append a revision.
    await page.route(pattern, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      intercepted = route.request().postDataJSON();
      await route.abort("failed");
    });
    await page
      .getByLabel("Project brief (required)")
      .fill("Committed but response interrupted");
    await page.getByLabel("Priority (required)").selectOption("High");
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Save outcome is unknown" })
      .waitFor();
    await page.getByRole("button", { name: "Retry exact save" }).waitFor();
    await page.unroute(pattern);
    // A later denial cannot disprove a previous unknown committed outcome.
    await page.route(pattern, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Write access withdrawn" }),
      });
    });
    await page.getByRole("button", { name: "Retry exact save" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Save outcome is unknown" })
      .waitFor();
    await page
      .getByRole("alert")
      .filter({ hasText: "Save outcome is unknown" })
      .waitFor();
    await page.getByRole("button", { name: "Retry exact save" }).waitFor();
    await page.unroute(pattern);
    await page.getByRole("button", { name: "Check save result" }).click();
    await page
      .getByRole("status")
      .filter({ hasText: "Saved record revision 1." })
      .waitFor();
    assert.deepEqual(
      await ok(f.room, f.app, f.cookie, intercepted),
      await ok(
        f.room,
        f.app,
        f.cookie,
        undefined,
        `receipts/${intercepted.operation_id}`,
      ),
    );
    await page.reload();
    await page
      .getByRole("heading", { name: "Saved records", exact: true })
      .waitFor();
    assert.equal(await page.locator("article").count(), 3);
    assert.equal((await ok(f.room, f.app, f.cookie)).records.length, 3);
    await context.close();
  } finally {
    await browser.close();
  }
});
