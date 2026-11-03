import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { chromium } from "@playwright/test";
import { installCustomApps } from "../../scripts/custom-apps-install";
import {
  customAppSchema,
  exampleCustomApp,
} from "../../packages/custom-apps/contract";
import {
  knowledgeLogin,
  knowledgeOk,
  knowledgeProject,
} from "../support/team-knowledge";
import { runtimeFile, testOrigin } from "../support/runtime";
const config = JSON.parse(
    fs.readFileSync(runtimeFile("database.json"), "utf8"),
  ),
  app = new pg.Pool(config),
  admin = new pg.Pool({ ...config, user: os.userInfo().username });
before(installCustomApps);
after(async () => {
  await app.end();
  await admin.end();
});
const uuid = () => crypto.randomUUID();
async function room(cookie: string, access = "PRIVATE") {
  return knowledgeOk("", cookie, {
    project_id: knowledgeProject,
    name: "Synthetic custom app " + uuid(),
    guidelines: "Fixture only",
    access,
  });
}
async function request(
  room: string,
  cookie?: string,
  body?: unknown,
  suffix = "",
  origin = testOrigin,
) {
  return fetch(`${testOrigin}/api/custom-apps/${room}${suffix}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function ok(room: string, cookie: string, body?: unknown, suffix = "") {
  const r = await request(room, cookie, body, suffix);
  assert.equal(r.status, 200, await r.clone().text());
  assert.match(r.headers.get("cache-control") || "", /no-store/);
  return r.json();
}
async function as(
  actor: string | null,
  sql: string,
  values: unknown[] = [],
  mode?: string,
  organisation = "10000000-0000-4000-8000-000000000001",
) {
  const db = await app.connect();
  try {
    await db.query("begin");
    await db.query(`set local role ${actor ? "authenticated" : "anon"}`);
    await db.query(
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
      await db.query(
        "select set_config('request.kxra.execution_mode',$1,true)",
        [mode],
      );
    const result = await db.query(sql, values);
    await db.query("commit");
    return result.rows;
  } catch (e) {
    await db.query("rollback");
    throw e;
  } finally {
    db.release();
  }
}
const partner = "20000000-0000-4000-8000-000000000002",
  owner = "20000000-0000-4000-8000-000000000001";
test("installer rejects foreign runtime paths, socket symlinks and redirected database sockets", async () => {
  const saved = process.env.KXRA_RUNTIME!,
    foreign = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-app-deny-")),
    local = fs.mkdtempSync(path.join(process.cwd(), ".runtime/deny-"));
  try {
    process.env.KXRA_RUNTIME = foreign;
    await assert.rejects(installCustomApps(), /Runtime must belong/);
    const caller = process.cwd();
    fs.mkdirSync(path.join(foreign, ".runtime"));
    try {
      process.chdir(foreign);
      process.env.KXRA_RUNTIME = path.join(foreign, ".runtime");
      await assert.rejects(installCustomApps(), /Runtime must belong/);
    } finally {
      process.chdir(caller);
    }
    process.env.KXRA_RUNTIME = local;
    fs.symlinkSync(path.join(saved, "socket"), path.join(local, "socket"));
    await assert.rejects(installCustomApps(), /Disposable socket directory/);
    fs.unlinkSync(path.join(local, "socket"));
    fs.mkdirSync(path.join(local, "socket"));
    // Even a socket-file redirect inside an ordinary directory must fail the data-dir attestation.
    fs.symlinkSync(
      path.join(saved, "socket", `.s.PGSQL.${config.port}`),
      path.join(local, "socket", `.s.PGSQL.${config.port}`),
    );
    fs.writeFileSync(
      path.join(local, "database.json"),
      JSON.stringify({ ...config, host: path.join(local, "socket") }),
    );
    await assert.rejects(installCustomApps(), /database directory mismatch/);
  } finally {
    process.env.KXRA_RUNTIME = saved;
    fs.rmSync(foreign, { recursive: true, force: true });
    fs.rmSync(local, { recursive: true, force: true });
  }
});
test("register, preview artifact, publish locally, rollback and retain immutable history", async () => {
  const cookie = await knowledgeLogin(),
    r = await room(cookie),
    id = uuid();
  const register = (expected: number, schema = exampleCustomApp) => ({
    operation: "register",
    app_id: id,
    expected_revision: expected,
    schema,
  });
  let data = await ok(r.id, cookie, register(0));
  assert.equal(data.app.revision, 1);
  assert.equal(data.app.active_version, null);
  const bytes = JSON.stringify(data.versions[0].artifact),
    digest = data.versions[0].sha256;
  const dbDigest = (
    await as(
      partner,
      "select encode(sha256(convert_to(artifact::text,'UTF8')),'hex') hash from kxra.custom_app_versions where app_id=$1",
      [id],
      "fixture",
    )
  )[0].hash;
  assert.equal(digest, dbDigest);
  const release = (
    expected: number,
    version: number,
    operation = "PUBLISH_LOCAL",
  ) => ({ operation, app_id: id, expected_revision: expected, version });
  data = await ok(r.id, cookie, release(1, 1));
  assert.equal(data.app.active_version, 1);
  data = await ok(
    r.id,
    cookie,
    register(2, { ...exampleCustomApp, title: "Synthetic v2" }),
  );
  assert.equal(data.app.latest_version, 2);
  assert.equal(data.app.active_version, 1);
  assert.equal(
    (await request(r.id, cookie, release(3, 2, "ROLLBACK_LOCAL"))).status,
    409,
  );
  data = await ok(r.id, cookie, release(3, 2));
  data = await ok(r.id, cookie, release(4, 1, "ROLLBACK_LOCAL"));
  assert.equal(data.app.revision, 5);
  assert.equal(data.app.active_version, 1);
  assert.equal(data.versions[1].sha256, digest);
  assert.equal(JSON.stringify(data.versions[1].artifact), bytes);
  assert.deepEqual(
    data.releases.map((x: any) => x.version),
    [1, 2, 1],
  );
  assert.equal((await request(r.id, cookie, release(3, 2))).status, 409);
  assert.equal((await request(r.id, cookie, release(5, 99))).status, 409);
  // One contender wins; the stale revision cannot overwrite it.
  const concurrent = await Promise.all([
    request(r.id, cookie, register(5)),
    request(r.id, cookie, register(5)),
  ]);
  assert.deepEqual(concurrent.map((x) => x.status).sort(), [200, 409]);
  for (const table of ["custom_app_versions", "custom_app_releases"]) {
    await assert.rejects(
      as(partner, `delete from kxra.${table} where app_id=$1`, [id], "fixture"),
      { code: "42501" },
    );
    await assert.rejects(
      admin.query(`delete from kxra.${table} where app_id=$1`, [id]),
      /Immutable custom app artifact/,
    );
  }
  await assert.rejects(
    as(
      partner,
      "update kxra.custom_apps set active_version=99 where id=$1",
      [id],
      "fixture",
    ),
    { code: "42501" },
  );
});
test("HTTP and DB deny anonymous, non-manager, hidden room, cross-app and hosted access", async () => {
  const cookie = await knowledgeLogin(),
    own = await knowledgeLogin("owner"),
    r = await room(cookie),
    other = await room(cookie),
    id = uuid();
  const body = {
    operation: "register",
    app_id: id,
    expected_revision: 0,
    schema: exampleCustomApp,
  };
  await ok(r.id, cookie, body);
  assert.equal((await request(r.id)).status, 401);
  assert.equal((await request(r.id, own)).status, 404);
  assert.equal(
    (await request(other.id, cookie, undefined, `/${id}`)).status,
    404,
  );
  assert.equal(
    (await request(other.id, cookie, { ...body, expected_revision: 1 })).status,
    403,
  );
  assert.equal(
    (
      await request(
        r.id,
        cookie,
        { ...body, app_id: uuid() },
        "",
        "https://attacker.invalid",
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(r.id, cookie, { ...body, app_id: uuid(), user_id: partner }))
      .status,
    400,
  );
  const publicRoom = await room(own, "PROJECT");
  assert.equal(
    (await request(publicRoom.id, cookie, { ...body, app_id: uuid() })).status,
    403,
  );
  for (const mode of [undefined, "hosted", ""]) {
    await assert.rejects(
      as(
        partner,
        "select kxra.custom_app_register($1,$2,0,$3)",
        [uuid(), r.id, exampleCustomApp],
        mode,
      ),
      { code: "42501" },
    );
    assert.deepEqual(
      await as(
        partner,
        "select id from kxra.custom_apps where id=$1",
        [id],
        mode,
      ),
      [],
    );
    await assert.rejects(
      as(
        partner,
        "select kxra.custom_app_release($1,$2,1,1,'PUBLISH_LOCAL')",
        [id, r.id],
        mode,
      ),
      { code: "42501" },
    );
  }
  assert.deepEqual(
    await as(
      owner,
      "select * from kxra.custom_app_versions where app_id=$1",
      [id],
      "fixture",
    ),
    [],
  );
  await assert.rejects(as(null, "select * from kxra.custom_apps"), {
    code: "42501",
  });
  const foreignOrganisation = uuid();
  assert.deepEqual(
    await as(
      partner,
      "select * from kxra.custom_app_versions where app_id=$1",
      [id],
      "fixture",
      foreignOrganisation,
    ),
    [],
  );
  await assert.rejects(
    as(
      partner,
      "select kxra.custom_app_register($1,$2,0,$3)",
      [uuid(), r.id, exampleCustomApp],
      "fixture",
      foreignOrganisation,
    ),
    { code: "42501" },
  );
  // A shared room member can read, but only the creator can manage versions.
  await as(
    partner,
    "select kxra.team_room_member($1,$2,true)",
    [r.id, owner],
    "fixture",
  );
  assert.equal((await request(r.id, own, undefined, `/${id}`)).status, 200);
  assert.equal(
    (await request(r.id, own, { ...body, expected_revision: 1 })).status,
    403,
  );
  await as(
    partner,
    "select kxra.team_room_member($1,$2,false)",
    [r.id, owner],
    "fixture",
  );
  assert.equal((await request(r.id, own, undefined, `/${id}`)).status, 404);
  assert.deepEqual(
    await as(
      owner,
      "select * from kxra.custom_app_versions where app_id=$1",
      [id],
      "fixture",
    ),
    [],
  );
});
test("database independently rejects malformed schemas, including nulls and key abuse", async () => {
  const cookie = await knowledgeLogin(),
    r = await room(cookie);
  const schemas: unknown[] = [
    null,
    {},
    { ...exampleCustomApp, format: null },
    { ...exampleCustomApp, extra: 1 },
    ...[null, "script", 1].map((type) => ({
      ...exampleCustomApp,
      fields: [{ ...exampleCustomApp.fields[0], type }],
    })),
    {
      ...exampleCustomApp,
      fields: [exampleCustomApp.fields[0], exampleCustomApp.fields[0]],
    },
    {
      ...exampleCustomApp,
      fields: [
        { key: "constructor", type: "text", label: "x", required: true },
      ],
    },
    {
      ...exampleCustomApp,
      fields: [
        {
          key: "x",
          type: "select",
          label: "x",
          required: true,
          options: [null],
        },
      ],
    },
    {
      ...exampleCustomApp,
      fields: [
        {
          key: "x",
          type: "select",
          label: "x",
          required: true,
          options: ["a", "a"],
        },
      ],
    },
    { ...exampleCustomApp, fields: Array(21).fill(exampleCustomApp.fields[0]) },
    { ...exampleCustomApp, description: "x".repeat(1001) },
    {
      ...exampleCustomApp,
      fields: [{ ...exampleCustomApp.fields[0], options: ["x"] }],
    },
  ];
  for (const schema of schemas) {
    assert.equal(customAppSchema.safeParse(schema).success, false);
    await assert.rejects(
      as(
        partner,
        "select kxra.custom_app_register($1,$2,0,$3)",
        [uuid(), r.id, schema],
        "fixture",
      ),
      /Invalid custom app/,
    );
    assert.equal(
      (
        await request(r.id, cookie, {
          operation: "register",
          app_id: uuid(),
          expected_revision: 0,
          schema,
        })
      ).status,
      400,
    );
  }
  const huge = await request(r.id, cookie, { padding: "x".repeat(40000) });
  assert.equal(huge.status, 413);
});
test("per-room app count and per-app immutable version limits are enforced", async () => {
  const cookie = await knowledgeLogin(),
    r = await room(cookie),
    id = uuid();
  for (let i = 0; i < 100; i++)
    await as(
      partner,
      "select kxra.custom_app_register($1,$2,$3,$4)",
      [id, r.id, i, exampleCustomApp],
      "fixture",
    );
  await assert.rejects(
    as(
      partner,
      "select kxra.custom_app_register($1,$2,100,$3)",
      [id, r.id, exampleCustomApp],
      "fixture",
    ),
    /version limit/,
  );
  for (let i = 1; i < 20; i++)
    await as(
      partner,
      "select kxra.custom_app_register($1,$2,0,$3)",
      [uuid(), r.id, exampleCustomApp],
      "fixture",
    );
  await assert.rejects(
    as(
      partner,
      "select kxra.custom_app_register($1,$2,0,$3)",
      [uuid(), r.id, exampleCustomApp],
      "fixture",
    ),
    /app limit/,
  );
  const data = await ok(r.id, cookie, undefined, `/${id}`);
  assert.equal(data.app.latest_version, 100);
  assert.equal(data.versions.length, 100);
});
test("browser uses opaque sandbox, blocks network/storage/parent access, and completes local lifecycle", async () => {
  const cookie = await knowledgeLogin(),
    r = await room(cookie),
    browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(
      cookie.split("; ").map((x) => {
        const n = x.indexOf("=");
        return { name: x.slice(0, n), value: x.slice(n + 1), url: testOrigin };
      }),
    );
    const page = await context.newPage();
    await page.goto(`${testOrigin}/os/custom-apps/${r.id}`);
    await page
      .getByRole("button", { name: "Register app", exact: true })
      .click();
    await page.getByRole("heading", { name: "Immutable versions" }).waitFor();
    await page
      .getByRole("button", { name: "Publish locally v1", exact: true })
      .click();
    await page
      .getByText("Revision 2. Active local release: 1.", { exact: true })
      .waitFor();
    await page.getByRole("button", { name: "Preview v1", exact: true }).click();
    const iframe = page.locator("iframe");
    assert.equal(await iframe.getAttribute("sandbox"), "");
    const frame = page.frameLocator("iframe");
    await frame
      .getByLabel("Project brief (required)")
      .fill("Synthetic transient input");
    await frame
      .getByLabel("Priority (required)")
      .selectOption({ label: "High" });
    const handle = await iframe.elementHandle(),
      child = await handle!.contentFrame();
    assert.ok(child);
    assert.deepEqual(
      await child.evaluate(async () => {
        let parentBlocked = false,
          storageBlocked = false,
          networkBlocked = false;
        try {
          void window.parent.document.body;
        } catch {
          parentBlocked = true;
        }
        try {
          localStorage.setItem("test", "x");
        } catch {
          storageBlocked = true;
        }
        try {
          await fetch("https://example.invalid/forbidden");
        } catch {
          networkBlocked = true;
        }
        return { parentBlocked, storageBlocked, networkBlocked };
      }),
      { parentBlocked: true, storageBlocked: true, networkBlocked: true },
    );
    await frame.getByRole("button", { name: "Reset preview entries" }).click();
    assert.equal(
      await frame.getByLabel("Project brief (required)").inputValue(),
      "",
    );
    await page
      .getByLabel("Declarative schema (kxra.form.v1)")
      .fill(JSON.stringify({ ...exampleCustomApp, title: "Browser v2" }));
    await page
      .getByRole("button", { name: "Register new version", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Publish locally v2", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Rollback locally v1", exact: true })
      .click();
    await page
      .getByText("Revision 5. Active local release: 1.", { exact: true })
      .waitFor();
    await page.reload();
    await page.getByRole("button", { name: "Browser v2", exact: true }).click();
    await page
      .getByText("Revision 5. Active local release: 1.", { exact: true })
      .waitFor();
  } finally {
    await browser.close();
  }
});
