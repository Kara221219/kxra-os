import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import {
  spawn,
  spawnSync,
  execFileSync,
  type ChildProcess,
} from "node:child_process";
import pg from "pg";
import { chromium, type Browser } from "@playwright/test";
import {
  hostedMigrationManifest,
  assertNoHostedFixtureObjects,
} from "./hosted-release-guard.mjs";
import {
  productionOperationsPayload,
  productionOperationsSource,
  productionOperationsUpgrade,
} from "./production-operations-review.mjs";
import { integrationCatalog, integrationData } from "./integration-catalog.mjs";
import { applicationNext } from "./application-next.mjs";
import { postgresBin } from "./postgres-bin.mjs";
async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-ro-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/review-operations");
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  async function port() {
    const s = net.createServer();
    await new Promise<void>((r, j) => {
      s.once("error", j);
      s.listen(0, "127.0.0.1", r);
    });
    const p = (s.address() as net.AddressInfo).port;
    await new Promise<void>((r, j) => s.close((e) => (e ? j(e) : r())));
    return p;
  }
  const appPort = await port(),
    origin = `http://127.0.0.1:${appPort}`,
    env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: runtime,
      USER: os.userInfo().username,
      TMPDIR: process.env.TMPDIR,
      NODE_ENV: "development",
      NODE_OPTIONS: "--conditions=development",
      NEXT_TELEMETRY_DISABLED: "1",
      KXRA_AUTH_MODE: "fixture",
      KXRA_RUNTIME: runtime,
      KXRA_ORIGIN: origin,
      KXRA_PG_PORT: String(await port()),
      KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
      KXRA_MODERN_BILLING_TEST_MODE: "STAGING_SANDBOX",
      KXRA_CI_RUN_ID: crypto.randomUUID(),
      KXRA_NEXT_DIST_DIR: ".next-review-operations",
    };
  Object.assign(process.env, env);
  function run(args: string[]) {
    const r = spawnSync(process.execPath, args, {
      cwd: root,
      env,
      stdio: "inherit",
      timeout: 120_000,
    });
    assert.equal(r.status, 0, args.join(" "));
  }
  let db: pg.Client | undefined,
    browser: Browser | undefined,
    server: ChildProcess | undefined,
    log: number | undefined;
  let cfg: any;
  const generated = ["tsconfig.json", "next-env.d.ts"].map((n) => ({
    file: path.join(root, "apps/os", n),
    bytes: fs.readFileSync(path.join(root, "apps/os", n)),
  }));
  async function stop() {
    if (!server || server.exitCode !== null || server.signalCode !== null)
      return true;
    const child = server,
      exited = new Promise<boolean>((r) => child.once("exit", () => r(true)));
    const wait = async (ms: number) => {
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          exited,
          new Promise<boolean>((r) => {
            timer = setTimeout(() => r(false), ms);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    child.kill("SIGTERM");
    if (await wait(5000)) return true;
    child.kill("SIGKILL");
    return await wait(2000);
  }
  const write = (n: string, v: unknown) =>
    fs.writeFileSync(path.join(runtime, n), JSON.stringify(v, null, 2) + "\n", {
      mode: 0o600,
    });
  try {
    assert.ok(!fs.existsSync(path.join(runtime, "postgres")));
    const baseline = hostedMigrationManifest(root);
    assert.equal(baseline.length, 117);
    run(["scripts/database.mjs", "start"]);
    cfg = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    );
    assert.equal(cfg.host, path.join(runtime, "socket"));
    assert.equal(cfg.database, "postgres");
    assert.ok(!cfg.password && !cfg.ssl && !cfg.connectionString);
    db = new pg.Client({ ...cfg, user: os.userInfo().username });
    await db.connect();
    assert.equal(
      fs.realpathSync(
        (await db.query("show data_directory")).rows[0].data_directory,
      ),
      path.join(runtime, "postgres"),
    );
    assert.equal(
      (await db.query("show listen_addresses")).rows[0].listen_addresses,
      "",
    );
    const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim();
    const payload = productionOperationsPayload(root);
    await db.query(
      "create table public.kxra_schema_migrations(name text primary key,sha256 text not null,source_commit text not null)",
    );
    for (const m of baseline)
      await db.query(
        "insert into public.kxra_schema_migrations values($1,$2,$3)",
        [m.name, m.sha256, sourceCommit],
      );
    for (const [name, bytes] of [
      [payload.ai.spec.candidateMigration.name, payload.ai.bytes],
      [payload.spec.candidateMigration.name, payload.bytes],
    ])
      fs.writeFileSync(path.join(root, "supabase/migrations", name), bytes, {
        flag: "wx",
      });
    const manifest = productionOperationsSource(root);
    const ledger = async (c: pg.Client = db!) =>
      (
        await c.query(
          "select * from public.kxra_schema_migrations order by name",
        )
      ).rows;
    assert.equal(
      productionOperationsUpgrade(root, {
        managed: true,
        applied: await ledger(),
      }).pending.length,
      2,
    );
    async function apply(rows: any[], fail = false) {
      await db!.query("begin");
      try {
        for (const m of rows) {
          await db!.query(m.sql);
          await db!.query(
            "insert into public.kxra_local_migrations values($1)",
            [m.name],
          );
          await db!.query(
            "insert into public.kxra_schema_migrations values($1,$2,$3)",
            [m.name, m.sha256, sourceCommit],
          );
        }
        if (fail) await db!.query("select 1/0");
        await db!.query("commit");
      } catch (e) {
        await db!.query("rollback");
        throw e;
      }
    }
    const ledgers = async (c: pg.Client = db!) => ({
      hashed: await ledger(c),
      local: (
        await c.query(
          "select * from public.kxra_local_migrations order by name",
        )
      ).rows,
    });
    const originalLedgers = await ledgers();
    const originalCatalog = await integrationCatalog(db),
      originalData = await integrationData(db, originalCatalog);
    await assert.rejects(apply(manifest.slice(117), true), { code: "22012" });
    assert.deepEqual(await integrationCatalog(db), originalCatalog);
    assert.deepEqual(await integrationData(db, originalCatalog), originalData);
    assert.deepEqual(await ledgers(), originalLedgers);
    await apply([manifest[117]]);
    assert.equal(
      productionOperationsUpgrade(root, {
        managed: true,
        applied: await ledger(),
      }).pending.length,
      1,
    );
    const ai118Ledgers = await ledgers();
    const before = await integrationCatalog(db),
      beforeData = await integrationData(db, before);
    await assert.rejects(apply([manifest[118]], true), { code: "22012" });
    assert.deepEqual(await integrationCatalog(db), before);
    assert.deepEqual(await integrationData(db, before), beforeData);
    assert.deepEqual(await ledgers(), ai118Ledgers);
    await apply([manifest[118]]);
    assert.equal(
      productionOperationsUpgrade(root, {
        managed: true,
        applied: await ledger(),
      }).pending.length,
      0,
    );
    assert.throws(() => hostedMigrationManifest(root), /UNKNOWN_MIGRATION/);
    for (const table of [
      "review_operator_grants",
      "review_requests",
      "review_operation_receipts",
    ])
      assert.equal(
        (await db.query("select count(*)::int n from kxra_private." + table))
          .rows[0].n,
        0,
      );
    const freshName =
      "kxra_review_fresh_" + crypto.randomBytes(6).toString("hex");
    await db.query(`create database "${freshName}" template template0`);
    const fresh = new pg.Client({
      ...cfg,
      user: os.userInfo().username,
      database: freshName,
    });
    await fresh.connect();
    try {
      for (const [table, column] of [
        ["pg_class", "relnamespace"],
        ["pg_proc", "pronamespace"],
      ])
        assert.equal(
          (
            await fresh.query(
              `select count(*)::int n from ${table} x join pg_namespace n on n.oid=x.${column} where n.nspname not like 'pg_%' and n.nspname<>'information_schema'`,
            )
          ).rows[0].n,
          0,
        );
      await fresh.query(
        `create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;create table public.kxra_local_migrations(name text primary key);create table public.kxra_schema_migrations(name text primary key,sha256 text not null,source_commit text not null);`,
      );
      for (const m of manifest) {
        await fresh.query("begin");
        try {
          await fresh.query(m.sql);
          await fresh.query(
            "insert into public.kxra_local_migrations values($1)",
            [m.name],
          );
          await fresh.query(
            "insert into public.kxra_schema_migrations values($1,$2,$3)",
            [m.name, m.sha256, sourceCommit],
          );
          await fresh.query("commit");
        } catch (e) {
          await fresh.query("rollback");
          throw e;
        }
      }
      const upgraded = await integrationCatalog(db),
        freshCatalog = await integrationCatalog(fresh);
      assert.deepEqual(freshCatalog, upgraded);
      assert.deepEqual(await ledgers(fresh), await ledgers());
      write("fresh119-catalogue.json", freshCatalog);
      write("fresh119-ledgers.json", await ledgers(fresh));
      await assertNoHostedFixtureObjects(fresh);
    } finally {
      await fresh.end();
    }
    write("migration-path.json", {
      sourceCommit,
      production117To118To119: true,
      atomic117Through119FailureRollback: true,
      atomic118To119FailureRollback: true,
      ddlLedgerDataAclRollback: true,
      fresh119EmptyTarget: true,
      freshAndUpgradeCataloguesEqual: true,
      noOperatorAuthoritySeeded: true,
      hostedGuardStillRefuses: true,
      authorization: false,
      defaultEnabled: false,
      pre117Ledgers: originalLedgers,
      pre118Ledgers: ai118Ledgers,
      post119Ledgers: await ledgers(),
      manifest: manifest.map(({ name, sha256 }: any) => ({ name, sha256 })),
    });
    const installed = await integrationCatalog(db);
    const newTables = installed.tables.filter(
      (r: any) =>
        r.kind === "r" &&
        !before.tables.some(
          (b: any) => b.schema === r.schema && b.name === r.name,
        ),
    );
    assert.deepEqual(
      newTables.map((r: any) => r.schema + "." + r.name).sort(),
      [
        "kxra_private.review_operation_receipts",
        "kxra_private.review_operator_grants",
        "kxra_private.review_requests",
      ],
    );
    for (const table of newTables) {
      assert.equal(table.rls, true);
      for (const p of table.effective_table_privileges)
        assert.equal(p.reachable, false);
    }
    for (const role of ["app", "authenticated", "anon"])
      assert.deepEqual(
        installed.functions
          .filter(
            (r: any) => r.schema === "kxra_private" && r[role + "_reachable"],
          )
          .map((r: any) => r.name + "(" + r.arguments + ")"),
        before.functions
          .filter(
            (r: any) => r.schema === "kxra_private" && r[role + "_reachable"],
          )
          .map((r: any) => r.name + "(" + r.arguments + ")"),
      );
    await assertNoHostedFixtureObjects(db);
    write("installed-catalogue.json", installed);
    run([
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=1",
      "tests/review-operations.test.ts",
      "tests/review-operations-api.test.ts",
      "tests/review-operations/review-operations.db.test.ts",
    ]);
    const fixture = JSON.parse(
      fs.readFileSync(path.join(runtime, "browser-fixture.json"), "utf8"),
    );
    env.KXRA_REVIEW_OPERATIONS_ENABLED = "true";
    env.KXRA_REVIEW_OPERATIONS_POLICY_SHA256 = fixture.policySha;
    log = fs.openSync(path.join(runtime, "application.log"), "w", 0o600);
    server = spawn(
      process.execPath,
      [
        applicationNext("os").binary,
        "dev",
        ...applicationNext("os").webpackArguments,
        "--hostname",
        "127.0.0.1",
        "--port",
        String(appPort),
      ],
      { cwd: path.join(root, "apps/os"), env, stdio: ["ignore", log, log] },
    );
    const deadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < deadline) {
      assert.equal(server.exitCode, null);
      try {
        const r = await fetch(origin + "/api/health", {
          signal: AbortSignal.timeout(1500),
        });
        if (r.ok && (await r.json()).run_id === env.KXRA_CI_RUN_ID) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(ready);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ timezoneId: "UTC" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    let external = 0;
    await page.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.hostname !== "127.0.0.1") {
        external++;
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(origin + "/login");
    await page.getByText("Local fixture identities", { exact: true }).click();
    await page.getByLabel("Synthetic identity").selectOption("owner");
    await page
      .getByRole("button", { name: "Use fixture", exact: true })
      .click();
    await page.waitForURL(/\/os/);
    const initialQueue = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/review-operations" &&
        r.request().method() === "GET",
    );
    await page.goto(origin + "/os/review-operations");
    assert.equal((await initialQueue).status(), 200);
    await page
      .getByRole("button", { name: "Refresh review queue", exact: true })
      .waitFor();
    async function customer(sql: string, values: unknown[] = []) {
      const c = new pg.Client(cfg);
      await c.connect();
      try {
        await c.query("begin");
        await c.query("set local role authenticated");
        await c.query(
          "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true),set_config('request.kxra.execution_mode','hosted',true)",
          [
            fixture.customer,
            fixture.org,
            JSON.stringify({
              sub: fixture.customer,
              aal: "aal2",
              auth_time: Math.floor(Date.now() / 1000),
              session_version: 1,
            }),
          ],
        );
        const value = (await c.query(sql, values)).rows[0]?.value;
        await c.query("commit");
        return value;
      } catch (e) {
        await c.query("rollback");
        throw e;
      } finally {
        await c.end();
      }
    }
    async function openSubject(id: string) {
      const button = page.getByRole("button", {
        name: "Open exact review · " + id,
        exact: true,
      });
      for (let n = 0; n < 10; n++) {
        if (await button.count()) {
          await button.click();
          await page
            .getByRole("heading", { name: "Exact review request", exact: true })
            .waitFor();
          return;
        }
        const next = page.getByRole("button", {
          name: "Next review page",
          exact: true,
        });
        if (!(await next.count())) {
          await button.waitFor({ state: "visible", timeout: 10000 });
          continue;
        }
        await next.click();
        await page
          .getByRole("status")
          .filter({ hasText: "Checking current authority" })
          .waitFor({ state: "hidden" });
      }
      throw Error("Granted subject not found");
    }
    await openSubject(fixture.declaration);
    for (const name of ["legal", "payment", "provider", "tax"]) {
      await page.locator(`select[name=${name}_status]`).selectOption("CLEARED");
      await page
        .locator(`input[name=${name}_evidence_sha256]`)
        .fill(fixture.policySha);
    }
    await page
      .locator("input[name=expires_at]")
      .fill(new Date(Date.now() + 300_000).toISOString().slice(0, 16));
    await page
      .getByLabel(
        "I independently reviewed this exact request under the named policy and am authorised to record these findings.",
        { exact: true },
      )
      .check();
    const posted = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/review-operations" &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Record exact decision", exact: true })
      .click();
    const businessResponse = await posted;
    assert.equal(businessResponse.status(), 200, await businessResponse.text());
    const businessCommand = businessResponse.request().postDataJSON();
    const businessReceipt = (await businessResponse.json()).result;
    await page.getByText("Recorded receipt:", { exact: false }).waitFor();
    assert.equal(
      (await customer("select kxra.business_admission_status() value")).state,
      "ELIGIBLE",
    );
    const aiId = crypto.randomUUID();
    await customer(
      "select kxra.ai_connection_admission($1,'OPENAI','synthetic-model','',$2,$3) value",
      [aiId, fixture.fingerprint, fixture.ep],
    );
    await page
      .getByRole("button", { name: "Refresh review queue", exact: true })
      .click();
    await openSubject(aiId);
    await page.locator("select[name=state]").selectOption("ELIGIBLE");
    await page
      .locator("select[name=account_mode]")
      .selectOption("CUSTOMER_BILLED");
    await page
      .locator("input[name=account_reference_sha256]")
      .fill(fixture.policySha);
    await page
      .locator("input[name=provider_evidence_sha256]")
      .fill(fixture.policySha);
    await page
      .locator("input[name=expires_at]")
      .fill(new Date(Date.now() + 300_000).toISOString().slice(0, 16));
    await page
      .getByLabel(
        "I independently reviewed this exact request under the named policy and am authorised to record these findings.",
        { exact: true },
      )
      .check();
    let lostCommand: any,
      decisionPosts = 0;
    await page.route(origin + "/api/review-operations", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.postDataJSON()?.action === "DECIDE") {
        decisionPosts++;
        lostCommand = req.postDataJSON();
        const committed = await route.fetch();
        assert.equal(committed.status(), 200, await committed.text());
        await route.abort("failed");
        return;
      }
      await route.continue();
    });
    await page
      .getByRole("button", { name: "Record exact decision", exact: true })
      .click();
    await page
      .getByRole("status")
      .filter({ hasText: "Outcome not confirmed" })
      .waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "Record exact decision", exact: true })
        .count(),
      0,
    );
    assert.equal(decisionPosts, 1);
    await page
      .getByLabel("Review request reference", { exact: true })
      .fill(lostCommand.request_id);
    await page
      .getByRole("button", { name: "Check review request", exact: true })
      .click();
    await page.getByText("Recorded receipt:", { exact: false }).waitFor();
    assert.equal(
      decisionPosts,
      1,
      "read-only lost-ack recovery must not repeat a decision POST",
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from kxra_private.review_operation_receipts where id=$1",
          [lostCommand.operation_id],
        )
      ).rows[0].n,
      1,
    );
    await page.unroute(origin + "/api/review-operations");
    assert.equal(
      (await customer("select kxra.ai_connection_status($1) value", [aiId]))
        .state,
      "ELIGIBLE",
    );
    await page
      .getByRole("button", { name: "Open current subject again", exact: true })
      .click();
    await page
      .getByLabel(
        "I am authorised to withdraw this exact review and have verified the scope and consequence.",
        { exact: true },
      )
      .check();
    await page
      .getByRole("button", { name: "Withdraw exact review", exact: true })
      .click();
    await page.getByText("Recorded receipt:", { exact: false }).waitFor();
    assert.equal(
      (await customer("select kxra.ai_connection_status($1) value", [aiId]))
        .reason,
      "REVIEW_WITHDRAWN",
    );
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
    }
    assert.equal(
      (
        await page.request.get(
          origin +
            "/api/review-operations?request_id=" +
            aiId +
            "&request_id=" +
            aiId,
        )
      ).status(),
      400,
    );
    assert.equal(
      (
        await page.request.post(origin + "/api/review-operations", {
          headers: { origin: "https://wrong.invalid" },
          data: { action: "OPEN", kind: "AI", subject_id: aiId },
        })
      ).status(),
      403,
    );
    assert.equal(external, 0);
    assert.deepEqual(errors, []);
    await browser.close();
    browser = undefined;
    assert.equal(await stop(), true);
    server = undefined;
    const withdrawnReceipt = (
      await db.query(
        "select result from kxra_private.review_operation_receipts where result->>'subject_id'=$1 and result->>'state'='WITHDRAWN'",
        [aiId],
      )
    ).rows[0].result;
    await db.query(
      "update kxra_private.review_operator_grants set revoked_at=clock_timestamp() where id=$1",
      [fixture.aiGrant],
    );
    // Full installed-schema backup/restore, including operator grants, frozen requests and receipts.
    const catalog = await integrationCatalog(db),
      data = await integrationData(db, catalog);
    write("catalogue-source.json", catalog);
    write("data-source.json", data);
    const sourceLedgers = await ledgers();
    write("ledger-source.json", sourceLedgers);
    const pass = path.join(runtime, "empty-libpq");
    fs.writeFileSync(pass, "", { mode: 0o600, flag: "wx" });
    const subEnv: NodeJS.ProcessEnv = {
        NODE_ENV: "production",
        PATH: env.PATH,
        HOME: runtime,
        PGPASSFILE: pass,
        PGSERVICEFILE: pass,
        PGSYSCONFDIR: runtime,
      },
      opts = [
        "--no-password",
        "-h",
        cfg.host,
        "-p",
        String(cfg.port),
        "-U",
        os.userInfo().username,
      ],
      dump = path.join(runtime, "review-operations.dump");
    execFileSync(
      path.join(postgresBin(env), "pg_dump"),
      [...opts, "-d", "postgres", "--format=custom", "--file", dump],
      { env: subEnv, stdio: "inherit", timeout: 120_000 },
    );
    const target =
      "kxra_review_restore_" + crypto.randomBytes(6).toString("hex");
    await db.query(`create database "${target}" template template0`);
    const restored = new pg.Client({
      ...cfg,
      user: os.userInfo().username,
      database: target,
    });
    await restored.connect();
    try {
      for (const table of ["pg_class", "pg_proc"])
        assert.equal(
          (
            await restored.query(
              `select count(*)::int n from ${table} x join pg_namespace n on n.oid=x.${table === "pg_class" ? "relnamespace" : "pronamespace"} where n.nspname not like 'pg_%' and n.nspname<>'information_schema'`,
            )
          ).rows[0].n,
          0,
        );
      execFileSync(
        path.join(postgresBin(env), "pg_restore"),
        [
          ...opts,
          "-d",
          target,
          "--single-transaction",
          "--exit-on-error",
          dump,
        ],
        { env: subEnv, stdio: "inherit", timeout: 120_000 },
      );
      const rc = await integrationCatalog(restored),
        rd = await integrationData(restored, rc);
      assert.deepEqual(rc, catalog);
      assert.deepEqual(rd, data);
      write("catalogue-restored.json", rc);
      write("data-restored.json", rd);
      assert.deepEqual(await ledgers(restored), sourceLedgers);
      write("ledger-restored.json", await ledgers(restored));
      async function recoveredCommand(action: string, input: unknown) {
        const c = new pg.Client({ ...cfg, database: target });
        await c.connect();
        try {
          await c.query("begin");
          await c.query("set local role authenticated");
          await c.query(
            "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true),set_config('request.kxra.execution_mode','hosted',true)",
            [
              fixture.operator,
              fixture.platform,
              JSON.stringify({
                sub: fixture.operator,
                aal: "aal2",
                session_version: 1,
                auth_time: Math.floor(Date.now() / 1000),
              }),
            ],
          );
          const v = (
            await c.query(
              "select kxra.review_operations($1,$2::jsonb,$3) value",
              [action, JSON.stringify(input), fixture.policySha],
            )
          ).rows[0].value;
          await c.query("commit");
          return v;
        } finally {
          await c.query("rollback");
          await c.end();
        }
      }
      const { action: ignored, ...replayed } = businessCommand;
      assert.deepEqual(
        await recoveredCommand("DECIDE", replayed),
        businessReceipt,
      );
      await assert.rejects(
        recoveredCommand("DECIDE", {
          ...replayed,
          decision: { ...replayed.decision, legal_status: "BLOCKED" },
        }),
      );
      await assert.rejects(
        recoveredCommand("VIEW", { request_id: withdrawnReceipt.request_id }),
        { code: "42501" },
      );
      assert.deepEqual(
        await integrationData(restored, rc),
        rd,
        "restored replay and denials must preserve every row/sequence",
      );
    } finally {
      await restored.end();
    }
    write("acceptance.json", {
      status: "PASS_LOCAL_REVIEW_OPERATIONS_WIRING",
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      production117To118To119MigrationPath: true,
      atomicDdlLedgerDataAclRollback: true,
      fresh119AndUpgradeCataloguesEqual: true,
      customerBusinessReviewRecorded: true,
      customerAiReviewRecordedAndWithdrawn: true,
      actualBrowserHttpDatabase: true,
      externalRequests: external,
      restoredTarget: target,
      fullCatalogueDataSequencesEqual: true,
      grantsAndReceiptsRecovered: true,
      committedDecisionLostAckReadOnlyRecovery: true,
      decisionPostsAfterLostAck: decisionPosts,
      restoredHistoricalReplayNoDuplicate: true,
      restoredRevokedGrantDenied: true,
      providerAcceptance: false,
      paymentAuthority: false,
      fullFeatureLaunchRequired: true,
      hostedChanges: false,
    });
    console.log("REVIEW_OPERATIONS_BROWSER_RECOVERY_PASS " + runtime);
  } finally {
    let clean = true;
    try {
      if (browser) {
        await browser.close();
        assert.equal(browser.isConnected(), false);
      }
    } catch {
      clean = false;
    }
    try {
      if (!(await stop())) clean = false;
    } catch {
      clean = false;
    }
    try {
      if (db) await db.end();
    } catch {
      clean = false;
    }
    try {
      if (log !== undefined) fs.closeSync(log);
    } catch {
      clean = false;
    }
    for (const g of generated) {
      try {
        fs.writeFileSync(g.file, g.bytes);
      } catch {
        clean = false;
      }
    }
    const stopped = spawnSync(
        process.execPath,
        ["scripts/database.mjs", "stop"],
        { cwd: root, env, stdio: "inherit", timeout: 30_000 },
      ),
      status = spawnSync(
        path.join(postgresBin(env), "pg_ctl"),
        ["-D", path.join(runtime, "postgres"), "status"],
        { stdio: "ignore", timeout: 5000 },
      );
    let appPortFree = false;
    const portProbe = net.createServer();
    try {
      await new Promise<void>((r, j) => {
        portProbe.once("error", j);
        portProbe.listen(appPort, "127.0.0.1", r);
      });
      appPortFree = true;
    } catch {
    } finally {
      if (portProbe.listening)
        await new Promise<void>((r) => portProbe.close(() => r()));
    }
    clean =
      appPortFree &&
      clean &&
      stopped.status === 0 &&
      status.status === 3 &&
      !fs.existsSync(path.join(runtime, "postgres/postmaster.pid"));
    write("cleanup.json", {
      clean,
      appPortFree,
      postgresStop: stopped.status,
      postgresStatus: status.status,
      postmasterPidAbsent: !fs.existsSync(
        path.join(runtime, "postgres/postmaster.pid"),
      ),
      appExited:
        !server || server.exitCode !== null || server.signalCode !== null,
      browserClosed: !browser || !browser.isConnected(),
    });
    assert.ok(clean, "OWNED_RESOURCE_CLEANUP_UNCERTAIN");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
