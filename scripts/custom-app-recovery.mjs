import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import pg from "pg";
import { chromium } from "@playwright/test";
import { applicationNext } from "./application-next.mjs";
import { postgresBin } from "./postgres-bin.mjs";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import {
  loadCustomAppExtension,
  assertRecoveryConfiguration,
  recoveryCatalog,
  assertExtensionCatalog,
  customAppRecoveryEvidence,
  assertFreshRestoreTarget,
  recoveryNativeOptions,
  cleanupRecoveryCluster,
  waitForRecoveryLease,
} from "./custom-app-recovery-evidence.mjs";
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
assert.equal(
  process.argv.length,
  2,
  "Recovery accepts no runtime, source, target or credential arguments",
);
for (const key of [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VERCEL",
  "VERCEL_ENV",
])
  assert.ok(!process.env[key], "Synthetic local recovery only");
for (const folder of [root, path.join(root, "apps/os")])
  for (const name of [
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
  ])
    assert.ok(
      !fs.existsSync(path.join(folder, name)),
      "Recovery refuses environment files; use a clean fixture checkout",
    );
const extension = loadCustomAppExtension(root),
  bin = postgresBin({ PATH: process.env.PATH });
const runtimeRoot = path.join(root, ".runtime");
fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
assert.equal(fs.realpathSync(runtimeRoot), runtimeRoot);
const runtime = path.join(
  runtimeRoot,
  "cr-" + crypto.randomBytes(3).toString("hex"),
);
fs.mkdirSync(runtime, { mode: 0o700 });
const runId = crypto.randomUUID(),
  targetName = "kxra_app_restore_" + crypto.randomBytes(6).toString("hex"),
  sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
const receipt = {
  schema: "KXRA_CUSTOM_APP_RECOVERY_V1",
  run_id: runId,
  runtime,
  started_at: new Date().toISOString(),
  source_head: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  extension_manifest_sha256: sha(
    fs.readFileSync(
      path.join(root, "packages/custom-apps/local-extension-manifest.json"),
    ),
  ),
  proof_sources: {},
  phases: {},
  result: "PENDING",
  provider_calls: false,
};
for (const f of [
  "scripts/custom-app-recovery.mjs",
  "scripts/custom-app-recovery-evidence.mjs",
  "packages/custom-apps/local-schema.sql",
  "packages/custom-apps/local-records-schema.sql",
])
  receipt.proof_sources[f] = sha(fs.readFileSync(path.join(root, f)));
const write = (name, value) =>
  // codeql[js/http-to-file-access]
  fs.writeFileSync(
    path.join(runtime, name),
    JSON.stringify(value, null, 2) + "\n",
    { mode: 0o600, flag: "wx" },
  );
const save = () =>
  fs.writeFileSync(
    path.join(runtime, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 },
  );
async function port() {
  const s = net.createServer();
  await new Promise((r, j) => {
    s.once("error", j);
    s.listen(0, "127.0.0.1", r);
  });
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
}
const pgPort = await port();
const passfile = path.join(runtime, "empty.pgpass");
fs.writeFileSync(passfile, "", { flag: "wx", mode: 0o600 });
const baseEnv = {
  PATH: process.env.PATH,
  HOME: os.homedir(),
  USER: os.userInfo().username,
  TMPDIR: os.tmpdir(),
  LANG: "C",
  LC_ALL: "C",
  PGPASSFILE: passfile,
  NODE_ENV: "development",
  NODE_OPTIONS: "--conditions=development",
  NEXT_TELEMETRY_DISABLED: "1",
  KXRA_AUTH_MODE: "fixture",
  KXRA_RUNTIME: runtime,
  KXRA_ORIGIN: `http://127.0.0.1:${await port()}`,
  KXRA_PG_BIN: bin,
  KXRA_PG_PORT: String(pgPort),
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  KXRA_CI_RUN_ID: runId,
  KXRA_NEXT_DIST_DIR: ".next-ci-app-recovery",
};
function run(args, env = baseEnv) {
  const r = spawnSync(process.execPath, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  assert.equal(r.status, 0, `Owned recovery command failed: ${args[0]}`);
}
let config,
  app,
  appLog,
  installedCatalog,
  started = false;
const generated = ["tsconfig.json", "next-env.d.ts"].map((n) => ({
  file: path.join(root, "apps/os", n),
  bytes: fs.readFileSync(path.join(root, "apps/os", n)),
}));
async function adminWork(database, work) {
  const c = new pg.Client({
    ...config,
    user: os.userInfo().username,
    database,
  });
  await c.connect();
  try {
    return await work(c);
  } finally {
    await c.end();
  }
}
async function actorWork(
  database,
  actor,
  org,
  work,
  rollback = true,
  mode = "fixture",
) {
  const c = new pg.Client({ ...config, database });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claims',$2,true),set_config('request.kxra.org_id',$3,true),set_config('request.kxra.execution_mode',$4,true)",
      [
        actor,
        JSON.stringify({
          sub: actor,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
        }),
        org,
        mode,
      ],
    );
    const v = await work(c);
    await c.query(rollback ? "rollback" : "commit");
    return v;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    await c.end();
  }
}
async function stopApp() {
  if (!app) return;
  if (app.exitCode === null && app.signalCode === null) {
    const child = app;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(
          Error(
            "Owned application did not stop gracefully; cleanup requires review",
          ),
        );
      }, 10000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }
  app = null;
  if (appLog !== undefined) {
    fs.closeSync(appLog);
    appLog = undefined;
  }
}
async function startApp(stage, database) {
  assert.ok(!app, "An owned application is already running");
  const stageRoot = path.join(runtime, stage);
  fs.mkdirSync(stageRoot, { mode: 0o700 });
  fs.writeFileSync(
    path.join(stageRoot, "database.json"),
    JSON.stringify({ ...config, database }),
    { mode: 0o600, flag: "wx" },
  );
  const origin = `http://127.0.0.1:${await port()}`,
    env = { ...baseEnv, KXRA_RUNTIME: stageRoot, KXRA_ORIGIN: origin };
  appLog = fs.openSync(path.join(stageRoot, "application.log"), "wx", 0o600);
  app = spawn(
    process.execPath,
    [
      applicationNext("os").binary,
      "dev",
      ...applicationNext("os").webpackArguments,
      "--hostname",
      "127.0.0.1",
      "--port",
      new URL(origin).port,
    ],
    { cwd: path.join(root, "apps/os"), env, stdio: ["ignore", appLog, appLog] },
  );
  let ready = false;
  for (let n = 0; n < 150; n++) {
    assert.equal(app.exitCode, null, "Application exited during readiness");
    try {
      const r = await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(1500),
      });
      const b = await r.json();
      if (r.ok && b.run_id === runId) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  assert.ok(ready, "Owned application readiness timed out");
  return { origin, stageRoot };
}
async function request(
  origin,
  url,
  cookie,
  body,
  expected = url === "/api/team-space" && body !== undefined ? 201 : 200,
) {
  const r = await fetch(origin + url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(
    r.status,
    expected,
    `${url}: expected ${expected}, received ${r.status}`,
  );
  return r;
}
async function json(...args) {
  return (await request(...args)).json();
}
const partner = "20000000-0000-4000-8000-000000000002",
  owner = "20000000-0000-4000-8000-000000000001",
  mainOrg = "10000000-0000-4000-8000-000000000001",
  project = "30000000-0000-4000-8000-000000000002",
  uuid = () => crypto.randomUUID();
async function login(origin, fixture, org) {
  const r = await fetch(origin + "/api/auth", {
    method: "POST",
    headers: { origin },
    body: new URLSearchParams({ fixture }),
    redirect: "manual",
  });
  assert.equal(r.status, 303);
  const jar = new Map();
  const merge = (response) => {
    for (const raw of response.headers.getSetCookie()) {
      const v = raw.split(";", 1)[0],
        n = v.indexOf("=");
      jar.set(v.slice(0, n), v.slice(n + 1));
    }
  };
  const value = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  merge(r);
  const selected = await request(origin, "/api/context", value(), {
    organisation_id: org,
  });
  merge(selected);
  return value();
}
const schema1 = {
  format: "kxra.form.v1",
  title: "Recovery form",
  description: "Synthetic recovery fixture only",
  fields: [
    { key: "brief", type: "textarea", label: "Recovery brief", required: true },
    {
      key: "priority",
      type: "select",
      label: "Priority",
      required: true,
      options: ["Normal", "High"],
    },
    { key: "reviewed", type: "checkbox", label: "Reviewed", required: false },
  ],
};
const schema2 = {
  format: "kxra.form.v1",
  title: "Recovery schema two",
  description: "Synthetic historical schema",
  fields: [
    {
      key: "followup",
      type: "text",
      label: "Historical follow-up",
      required: true,
    },
  ],
};
async function mutate(origin, cookie, room, body) {
  return json(origin, `/api/custom-apps/${room}`, cookie, body);
}
const records = (p) => `/api/custom-apps/${p.room}/${p.app}/records`,
  receiptPath = (p, op) => `/api/custom-apps/${p.room}/${p.app}/receipts/${op}`;
function body(revision = 5) {
  return {
    operation_id: uuid(),
    record_id: uuid(),
    expected_app_revision: revision,
    schema_version: 1,
    expected_record_revision: 0,
    data: {
      brief: "Synthetic pending recovery record",
      priority: "High",
      reviewed: true,
    },
  };
}
async function rollbackSave(database, p, b) {
  await actorWork(database, partner, mainOrg, (c) =>
    c.query("select kxra.custom_app_record_save($1,$2,$3,$4,$5,$6,$7,$8)", [
      b.operation_id,
      b.record_id,
      p.app,
      p.room,
      b.expected_app_revision,
      b.schema_version,
      b.expected_record_revision,
      b.data,
    ]),
  );
}
async function interruptedBrowserSave(origin, cookie, p) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(
      cookie
        .split("; ")
        .filter(Boolean)
        .map((x) => {
          const n = x.indexOf("=");
          return { name: x.slice(0, n), value: x.slice(n + 1), url: origin };
        }),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(`${origin}/os/apps/${p.room}/${p.app}`);
    let pending, committed;
    await page.route(`**${records(p)}`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      pending = route.request().postDataJSON();
      const response = await route.fetch();
      assert.equal(response.status(), 200);
      committed = await response.json();
      await route.abort("failed");
    });
    await page
      .getByLabel("Recovery brief (required)")
      .fill("Interrupted synthetic recovery marker");
    await page.getByLabel("Priority (required)").selectOption("High");
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Save outcome is unknown" })
      .waitFor();
    assert.ok(pending && committed);
    await page.screenshot({
      path: path.join(runtime, "source-interrupted-save.png"),
      fullPage: true,
    });
    return { body: pending, receipt: committed };
  } finally {
    await browser.close();
  }
}
async function seed(origin) {
  const cookie = await login(origin, "partner", mainOrg),
    room = (
      await json(origin, "/api/team-space", cookie, {
        project_id: project,
        name: "Recovery primary room",
        guidelines: "Synthetic only",
        access: "PRIVATE",
      })
    ).id,
    p = { room, app: uuid() };
  await mutate(origin, cookie, room, {
    operation: "register",
    app_id: p.app,
    expected_revision: 0,
    schema: schema1,
  });
  await mutate(origin, cookie, room, {
    operation: "PUBLISH_LOCAL",
    app_id: p.app,
    expected_revision: 1,
    version: 1,
  });
  const first = body(2);
  first.data.brief = "Original immutable recovery record";
  await json(origin, records(p), cookie, first);
  const edit = {
    ...first,
    operation_id: uuid(),
    expected_record_revision: 1,
    data: { ...first.data, brief: "Edited immutable recovery record" },
  };
  await json(origin, records(p), cookie, edit);
  const interrupted = await interruptedBrowserSave(origin, cookie, p);
  await mutate(origin, cookie, room, {
    operation: "register",
    app_id: p.app,
    expected_revision: 2,
    schema: schema2,
  });
  await mutate(origin, cookie, room, {
    operation: "PUBLISH_LOCAL",
    app_id: p.app,
    expected_revision: 3,
    version: 2,
  });
  const historical = {
    ...body(4),
    schema_version: 2,
    data: { followup: "Historical version two record" },
  };
  await json(origin, records(p), cookie, historical);
  await mutate(origin, cookie, room, {
    operation: "ROLLBACK_LOCAL",
    app_id: p.app,
    expected_revision: 4,
    version: 1,
  });
  const foreignOrg = uuid(),
    foreignProject = uuid();
  await adminWork("postgres", async (c) => {
    await c.query(
      "insert into kxra.organisations(id,name,slug) values($1,'Synthetic recovery tenant',$2)",
      [foreignOrg, "recovery-" + uuid()],
    );
    await c.query(
      "insert into kxra.organisation_memberships(org_id,account_id,security_role,relationship_type,state,display_name,grant_source) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','Synthetic recovery owner','RECOVERY_FIXTURE')",
      [foreignOrg, owner],
    );
    await c.query(
      "insert into kxra.projects(id,org_id,code,name,stage,status,next_action) values($1,$2,'RECOVERY','Synthetic recovery project','TEST','ACTIVE','Review')",
      [foreignProject, foreignOrg],
    );
  });
  const foreignCookie = await login(origin, "owner", foreignOrg),
    foreign = {
      room: (
        await json(origin, "/api/team-space", foreignCookie, {
          project_id: foreignProject,
          name: "Recovery foreign room",
          guidelines: "Synthetic only",
          access: "PRIVATE",
        })
      ).id,
      app: uuid(),
    };
  await mutate(origin, foreignCookie, foreign.room, {
    operation: "register",
    app_id: foreign.app,
    expected_revision: 0,
    schema: schema1,
  });
  await mutate(origin, foreignCookie, foreign.room, {
    operation: "PUBLISH_LOCAL",
    app_id: foreign.app,
    expected_revision: 1,
    version: 1,
  });
  const foreignBody = body(2);
  foreignBody.data.brief = "Foreign tenant recovery marker";
  await json(origin, records(foreign), foreignCookie, foreignBody);
  const uncommitted = body();
  await rollbackSave("postgres", p, uncommitted);
  await request(
    origin,
    receiptPath(p, uncommitted.operation_id),
    cookie,
    undefined,
    404,
  );
  return {
    primary: p,
    foreign,
    foreignOrg,
    first,
    edit,
    historical,
    interrupted,
    uncommitted,
  };
}
async function snapshot(database, baseline) {
  return adminWork(database, async (c) => {
    const catalog = await recoveryCatalog(c);
    assertExtensionCatalog(baseline, catalog, extension, installedCatalog);
    const evidence = await customAppRecoveryEvidence(c, extension);
    const migrations = (
      await c.query(
        "select name from public.kxra_local_migrations order by name",
      )
    ).rows.map((r) => r.name);
    assert.deepEqual(
      migrations,
      fs
        .readdirSync(path.join(root, "supabase/migrations"))
        .filter((n) => n.endsWith(".sql"))
        .sort(),
    );
    assert.equal(migrations.length, extension.canonical_migrations);
    return { catalog, evidence, migrations };
  });
}
async function probe(origin, database, state, stage) {
  const p = state.primary,
    cookie = await login(origin, "partner", mainOrg),
    foreignCookie = await login(origin, "owner", state.foreignOrg);
  const page = await json(origin, records(p), cookie);
  assert.equal(page.app.active_version, 1);
  assert.equal(page.app.revision, 5);
  assert.equal(
    page.records.find((r) => r.id === state.first.record_id).version,
    2,
  );
  assert.equal(
    page.records.find((r) => r.id === state.historical.record_id)
      .schema_version,
    2,
  );
  assert.equal(
    page.records.find((r) => r.id === state.historical.record_id).schema
      .fields[0].key,
    "followup",
  );
  assert.ok(!JSON.stringify(page).includes("Foreign tenant recovery marker"));
  const detail = await json(
    origin,
    `/api/custom-apps/${p.room}/${p.app}`,
    cookie,
  );
  assert.equal(detail.versions.length, 2);
  assert.deepEqual(
    detail.releases.map((r) => r.version),
    [1, 2, 1],
  );
  for (let n = 0; n < 3; n++)
    assert.deepEqual(
      await json(origin, records(p), cookie, state.interrupted.body),
      state.interrupted.receipt,
    );
  assert.deepEqual(
    await json(
      origin,
      receiptPath(p, state.interrupted.body.operation_id),
      cookie,
    ),
    state.interrupted.receipt,
  );
  await request(origin, records(p), undefined, undefined, 401);
  await request(origin, records(p), foreignCookie, undefined, 404);
  await request(origin, records(state.foreign), cookie, undefined, 404);
  await request(
    origin,
    records(p),
    cookie,
    {
      ...state.interrupted.body,
      data: { ...state.interrupted.body.data, brief: "Changed replay" },
    },
    409,
  );
  await request(
    origin,
    records(p),
    cookie,
    { ...state.edit, operation_id: uuid() },
    409,
  );
  await actorWork(database, partner, state.foreignOrg, async (c) => {
    assert.equal(
      (
        await c.query(
          "select * from kxra.custom_app_record_versions where app_id=$1",
          [state.foreign.app],
        )
      ).rowCount,
      0,
    );
    await assert.rejects(
      c.query("select kxra.custom_app_record_save($1,$2,$3,$4,2,1,0,$5)", [
        uuid(),
        uuid(),
        state.foreign.app,
        state.foreign.room,
        state.first.data,
      ]),
      { code: "42501" },
    );
  });
  for (const table of ["custom_app_versions", "custom_app_record_versions"]) {
    await actorWork(database, partner, mainOrg, (c) =>
      assert.rejects(
        c.query(`delete from kxra.${table} where app_id=$1`, [p.app]),
        { code: "42501" },
      ),
    );
  }
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.addCookies(
      cookie
        .split("; ")
        .filter(Boolean)
        .map((x) => {
          const n = x.indexOf("=");
          return { name: x.slice(0, n), value: x.slice(n + 1), url: origin };
        }),
    );
    const tab = await context.newPage();
    tab.setDefaultTimeout(15000);
    await tab.goto(`${origin}/os/apps/${p.room}/${p.app}`);
    await tab
      .getByRole("heading", { name: "Saved records", exact: true })
      .waitFor();
    assert.ok(
      (await tab.locator("article").allTextContents()).some((t) =>
        t.includes("Interrupted synthetic recovery marker"),
      ),
    );
    assert.ok(
      (await tab.locator("article").allTextContents()).some((t) =>
        t.includes("Historical version two record"),
      ),
    );
    await tab.screenshot({
      path: path.join(runtime, `${stage}-records.png`),
      fullPage: true,
    });
    await tab.reload();
    await tab
      .getByRole("heading", { name: "Saved records", exact: true })
      .waitFor();
  } finally {
    await browser.close();
  }
  return {
    app_revision: page.app.revision,
    active_version: page.app.active_version,
    record_count: page.records.length,
    schema_versions: detail.versions.length,
    releases: detail.releases.length,
    interrupted_receipt_replayed: 3,
    tenant_denials: true,
    immutable_denials: true,
    browser_rendered: true,
  };
}
const releaseLease = await waitForRecoveryLease(
  () => acquireNativeFixtureLease("custom-app-disaster-recovery"),
  () => {
    try {
      fs.lstatSync("/tmp/kxra-native-serial.lock");
      return true;
    } catch (e) {
      if (e.code === "ENOENT") return false;
      throw e;
    }
  },
);
save();
console.log(`CUSTOM_APP_RECOVERY_RUNTIME ${runtime}`);
try {
  started = true;
  run(["scripts/database.mjs", "start"]);
  config = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  assertRecoveryConfiguration(root, runtime, config);
  assert.equal(fs.realpathSync(config.host), config.host);
  await adminWork("postgres", async (c) => {
    assert.equal(
      fs.realpathSync(
        (await c.query("show data_directory")).rows[0].data_directory,
      ),
      path.join(runtime, "postgres"),
    );
  });
  const baseline = await adminWork("postgres", recoveryCatalog);
  write("canonical-catalog.json", baseline);
  run(["--import", "tsx", "scripts/custom-apps-install.ts"]);
  const installed = await adminWork("postgres", recoveryCatalog);
  installedCatalog = installed;
  assertExtensionCatalog(baseline, installed, extension);
  write("extension-catalog.json", installed);
  await adminWork("postgres", async (c) => {
    for (const sql of [
      "create table kxra.unexpected_recovery_probe(id integer)",
      "create function kxra.unexpected_recovery_probe() returns integer language sql as 'select 1'",
      "create view kxra.unexpected_recovery_probe as select 1 value",
      "create materialized view kxra.unexpected_recovery_probe as select 1 value",
      "create sequence kxra.unexpected_recovery_probe",
      "create aggregate kxra.unexpected_recovery_probe(integer) (sfunc=int4pl,stype=integer,initcond='0')",
      "grant select on kxra.custom_apps to kxra_app",
      "grant execute on function kxra.custom_app_register(uuid,uuid,integer,jsonb) to kxra_app",
      "alter table kxra.custom_apps owner to kxra_app",
      "grant delete on kxra.team_rooms to kxra_app",
      "alter table kxra.custom_apps add constraint changed_recovery_check check(revision>1)",
      "alter policy custom_apps_read on kxra.custom_apps using (true)",
      "create or replace function kxra.custom_app_register(i uuid,r uuid,expected integer,s jsonb) returns uuid language plpgsql security definer set search_path='' as $$ begin return i;end $$",
    ]) {
      await c.query("begin");
      try {
        await c.query(sql);
        const unexpected = await recoveryCatalog(c);
        assert.throws(() =>
          assertExtensionCatalog(baseline, unexpected, extension, installed),
        );
      } finally {
        await c.query("rollback");
      }
    }
  });
  const sourceApp = await startApp("source", "postgres"),
    state = await seed(sourceApp.origin);
  write("synthetic-dataset.json", state);
  await probe(sourceApp.origin, "postgres", state, "source");
  await stopApp();
  const before = await snapshot("postgres", baseline);
  write("before-restart.json", before);
  run(["scripts/database.mjs", "stop"]);
  run(["scripts/database.mjs", "start"]);
  const after = await snapshot("postgres", baseline);
  assert.deepEqual(after, before);
  write("after-restart.json", after);
  receipt.phases.restart = { exact_match: true, evidence: after.evidence };
  const restarted = await startApp("restarted", "postgres");
  receipt.phases.restart.behavior = await probe(
    restarted.origin,
    "postgres",
    state,
    "restarted",
  );
  const cookie = await login(restarted.origin, "partner", mainOrg);
  const retryReceipt = await json(
    restarted.origin,
    records(state.primary),
    cookie,
    state.uncommitted,
  );
  assert.deepEqual(
    await json(
      restarted.origin,
      records(state.primary),
      cookie,
      state.uncommitted,
    ),
    retryReceipt,
  );
  state.postRestartReceipt = retryReceipt;
  state.restorePending = body();
  await rollbackSave("postgres", state.primary, state.restorePending);
  await request(
    restarted.origin,
    receiptPath(state.primary, state.restorePending.operation_id),
    cookie,
    undefined,
    404,
  );
  write("post-restart-dataset.json", state);
  await stopApp();
  const backupSnapshot = await snapshot("postgres", baseline);
  write("backup-source.json", backupSnapshot);
  const dump = path.join(runtime, "database.dump");
  execFileSync(
    path.join(bin, "pg_dump"),
    [
      "-h",
      config.host,
      "-p",
      String(config.port),
      "-U",
      os.userInfo().username,
      "-d",
      "postgres",
      "--format=custom",
      "--file",
      dump,
    ],
    recoveryNativeOptions(baseEnv),
  );
  assert.deepEqual(await snapshot("postgres", baseline), backupSnapshot);
  fs.chmodSync(dump, 0o600);
  receipt.database_dump_sha256 = sha(fs.readFileSync(dump));
  await adminWork("postgres", async (c) => {
    assertFreshRestoreTarget(
      targetName,
      (await c.query("select datname from pg_database")).rows.map(
        (r) => r.datname,
      ),
    );
    await c.query(`create database "${targetName}" template template0`);
  });
  receipt.restore_target = targetName;
  save();
  const empty = await adminWork(targetName, recoveryCatalog);
  assert.equal(
    empty.tables.length,
    0,
    "Fresh restore target contains user tables",
  );
  assert.equal(
    empty.functions.length,
    0,
    "Fresh restore target contains user functions",
  );
  execFileSync(
    path.join(bin, "pg_restore"),
    [
      "-h",
      config.host,
      "-p",
      String(config.port),
      "-U",
      os.userInfo().username,
      "-d",
      targetName,
      "--exit-on-error",
      "--single-transaction",
      dump,
    ],
    recoveryNativeOptions(baseEnv),
  );
  const restored = await snapshot(targetName, baseline);
  assert.deepEqual(restored, backupSnapshot);
  write("restored-before-probes.json", restored);
  receipt.phases.restore = {
    target_was_empty: true,
    exact_match: true,
    evidence: restored.evidence,
  };
  const restoredApp = await startApp("restored", targetName);
  receipt.phases.restore.behavior = await probe(
    restoredApp.origin,
    targetName,
    state,
    "restored",
  );
  const restoredCookie = await login(restoredApp.origin, "partner", mainOrg);
  assert.deepEqual(
    await json(
      restoredApp.origin,
      records(state.primary),
      restoredCookie,
      state.uncommitted,
    ),
    state.postRestartReceipt,
  );
  await request(
    restoredApp.origin,
    receiptPath(state.primary, state.restorePending.operation_id),
    restoredCookie,
    undefined,
    404,
  );
  const restoredRetry = await json(
    restoredApp.origin,
    records(state.primary),
    restoredCookie,
    state.restorePending,
  );
  assert.deepEqual(
    await json(
      restoredApp.origin,
      records(state.primary),
      restoredCookie,
      state.restorePending,
    ),
    restoredRetry,
  );
  receipt.phases.restore.rolled_back_request_recovered = restoredRetry;
  await stopApp();
  write("restored-after-probes.json", await snapshot(targetName, baseline));
  assert.deepEqual(
    await snapshot("postgres", baseline),
    backupSnapshot,
    "Restore probes changed original source data",
  );
  receipt.result = "PASS";
} catch (e) {
  receipt.result = "FAIL";
  receipt.failure = e instanceof Error ? e.message : "Unknown failure";
  throw e;
} finally {
  try {
    await stopApp();
    for (const f of generated) fs.writeFileSync(f.file, f.bytes);
    cleanupRecoveryCluster(
      started,
      () =>
        spawnSync(
          path.join(bin, "pg_ctl"),
          ["-D", path.join(runtime, "postgres"), "status"],
          recoveryNativeOptions(baseEnv, "ignore"),
        ).status,
      () =>
        spawnSync(process.execPath, ["scripts/database.mjs", "stop"], {
          cwd: root,
          ...recoveryNativeOptions(baseEnv),
        }).status,
    );
    receipt.owned_services_stopped = true;
    releaseLease();
    receipt.lease_released = true;
  } catch (e) {
    receipt.result = "FAIL";
    receipt.cleanup_failure =
      e instanceof Error ? e.message : "Unknown cleanup failure";
    process.exitCode = 1;
  }
  receipt.finished_at = new Date().toISOString();
  save();
}
assert.equal(receipt.result, "PASS");
console.log(`CUSTOM_APP_RECOVERY_PASS ${path.join(runtime, "receipt.json")}`);
