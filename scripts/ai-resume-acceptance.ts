// Offline Auth stand-in + unchanged Next/SDK/routes + real disposable Postgres.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import net from "node:net";
import {
  spawn,
  spawnSync,
  execFileSync,
  type ChildProcess,
} from "node:child_process";
import pg from "pg";
import { chromium, type Browser, type Page } from "@playwright/test";
import { seedAiResumeFixture } from "../tests/support/ai-resume-fixture";
import { integrationCatalog, integrationData } from "./integration-catalog.mjs";
import { applicationNext } from "./application-next.mjs";
import { postgresBin } from "./postgres-bin.mjs";
async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/private\/tmp\/kxra-ar-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/ai-resume");
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
    authPort = await port(),
    origin = `http://127.0.0.1:${appPort}`,
    authOrigin = `http://127.0.0.1:${authPort}`;
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: runtime,
    USER: os.userInfo().username,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development",
    NODE_OPTIONS: "--conditions=development",
    NEXT_TELEMETRY_DISABLED: "1",
    KXRA_AUTH_MODE: "fixture",
    KXRA_RUNTIME: runtime,
    KXRA_PG_PORT: String(await port()),
    KXRA_ORIGIN: origin,
    KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
    KXRA_CI_RUN_ID: crypto.randomUUID(),
    KXRA_MODERN_BILLING_TEST_MODE: "STAGING_SANDBOX",
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
  let app: ChildProcess | undefined,
    browser: Browser | undefined,
    auth: http.Server | undefined,
    admin: pg.Client | undefined,
    log: number | undefined;
  const generated = ["tsconfig.json", "next-env.d.ts"].map((n) => ({
    file: path.join(root, "apps/os", n),
    bytes: fs.readFileSync(path.join(root, "apps/os", n)),
  }));
  async function stop(child: ChildProcess | undefined) {
    if (!child || child.exitCode !== null || child.signalCode !== null)
      return true;
    const exit = new Promise<boolean>((r) =>
      child!.once("exit", () => r(true)),
    );
    async function wait(ms: number) {
      let timer: NodeJS.Timeout | undefined;
      try {
        return await Promise.race([
          exit,
          new Promise<boolean>((r) => {
            timer = setTimeout(() => r(false), ms);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    child.kill("SIGTERM");
    if (await wait(5000)) return true;
    child.kill("SIGKILL");
    return await wait(2000);
  }
  const phases: any[] = [];
  let cfg: any,
    fixture: Awaited<ReturnType<typeof seedAiResumeFixture>>,
    appEnv: NodeJS.ProcessEnv;
  async function refreshPaid(db: pg.Client) {
    await db.query(
      "update kxra_private.live_paid_access set checked_at=clock_timestamp(),valid_until=clock_timestamp()+interval '45 seconds' where org_id=$1",
      [fixture.org],
    );
  }
  async function startApp(database: string) {
    env.KXRA_CI_RUN_ID = crypto.randomUUID();
    appEnv = {
      ...env,
      KXRA_AUTH_MODE: undefined,
      KXRA_LOCAL_SECRET: undefined,
      KXRA_RUNTIME: undefined,
      DATABASE_URL: `postgresql://kxra_app@localhost:${cfg.port}/${database}?host=${encodeURIComponent(cfg.host)}`,
      NEXT_PUBLIC_SUPABASE_URL: authOrigin,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "SYNTHETIC_OFFLINE_ANON",
      KXRA_MODEL_VAULT_KEY: crypto
        .createHash("sha256")
        .update("SYNTHETIC_DISPOSABLE_VAULT_ONLY")
        .digest("hex"),
      KXRA_NEXT_DIST_DIR: ".next-ai-resume",
    };
    assert.equal(
      new URL(appEnv.DATABASE_URL!).searchParams.get("host"),
      cfg.host,
    );
    app = spawn(
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
      {
        cwd: path.join(root, "apps/os"),
        env: appEnv,
        stdio: ["ignore", log!, log!],
      },
    );
    const until = Date.now() + 90_000;
    while (Date.now() < until) {
      assert.equal(app.exitCode, null);
      try {
        const r = await fetch(origin + "/api/health", {
          signal: AbortSignal.timeout(1500),
        });
        if (r.ok && (await r.json()).run_id === env.KXRA_CI_RUN_ID) {
          phases.push({
            phase: "application-start",
            runId: env.KXRA_CI_RUN_ID,
            database,
            pid: app.pid,
          });
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    throw Error("NEXT_READINESS_TIMEOUT");
  }
  async function appClient(database = "postgres") {
    const c = new pg.Client({ ...cfg, database });
    await c.connect();
    await c.query("begin");
    await c.query("set local statement_timeout=\'5s\'");
    await c.query("set local role authenticated");
    await c.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true),set_config('request.kxra.execution_mode','hosted',true)",
      [
        fixture.actor,
        fixture.org,
        JSON.stringify({
          sub: fixture.actor,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
          session_version: 1,
        }),
      ],
    );
    return c;
  }
  async function dbStatus(id: string, database = "postgres") {
    const c = await appClient(database);
    try {
      return (await c.query("select kxra.ai_connection_status($1) value", [id]))
        .rows[0].value;
    } finally {
      await c.query("rollback");
      await c.end();
    }
  }
  const signedUsers = new Map<string, any>();
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: "jwk" }),
    kid: "offline-disposable",
    alg: "RS256",
    use: "sig",
  };
  function session(actor: string) {
    const user = {
      id: actor,
      aud: "authenticated",
      role: "authenticated",
      email: "synthetic-resume@example.invalid",
      email_confirmed_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    };
    const now = Math.floor(Date.now() / 1000),
      head = Buffer.from(
        JSON.stringify({ alg: "RS256", kid: jwk.kid, typ: "JWT" }),
      ).toString("base64url"),
      body = Buffer.from(
        JSON.stringify({
          iss: authOrigin + "/auth/v1",
          sub: actor,
          aud: "authenticated",
          role: "authenticated",
          iat: now,
          exp: now + 3600,
          aal: "aal2",
          amr: [{ method: "totp", timestamp: now }],
        }),
      ).toString("base64url");
    const unsigned = head + "." + body,
      token =
        unsigned +
        "." +
        crypto
          .sign("RSA-SHA256", Buffer.from(unsigned), privateKey)
          .toString("base64url");
    signedUsers.set(token, user);
    return (
      "base64-" +
      Buffer.from(
        JSON.stringify({
          access_token: token,
          refresh_token: "SYNTHETIC_NO_REFRESH",
          expires_at: now + 3600,
          expires_in: 3600,
          token_type: "bearer",
          user,
        }),
      ).toString("base64url")
    );
  }
  let providerAttempts = 0;
  const authCounts: { [key: string]: number } = {};
  async function browserPhase(page: Page, phase: string, connection?: string) {
    await refreshPaid(admin!);
    await page.goto(origin + "/os/workspace");
    await page.getByText(/Model connections \(/).click();
    await page
      .getByRole("heading", {
        name: "Connect or resume a reviewed AI account",
        exact: true,
      })
      .waitFor();
    if (connection) {
      await page
        .getByRole("heading", { name: "Connection recorded", exact: true })
        .waitFor();
      assert.equal(
        (
          await dbStatus(
            connection,
            phase === "restored" ? restoredTarget : "postgres",
          )
        ).state,
        "SAVED",
      );
      return connection;
    }
    await page.locator("input[name=key]").waitFor();
    await page
      .getByLabel("Connection name", { exact: true })
      .fill("Synthetic browser resume");
    await page.locator("input[name=model]").fill("synthetic-model");
    await page
      .locator("input[name=key]")
      .fill("SYNTHETIC_BROWSER_ONLY_NOT_A_CREDENTIAL");
    await page.locator("input[name=customer_billed_acknowledged]").check();
    const response = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/team-space/connections" &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Request connection review", exact: true })
      .click();
    const pending = await response;
    assert.equal(pending.status(), 409, await pending.text());
    const status = (await pending.json()).admission;
    assert.equal(status.reason, "AWAITING_PROVIDER_REVIEW");
    await page
      .getByText("This request is awaiting a provider/account review.", {
        exact: false,
      })
      .waitFor();
    assert.equal(
      (
        await admin!.query(
          "select count(*)::int n from kxra.team_connections where id=$1",
          [status.admission_id],
        )
      ).rows[0].n,
      0,
    );
    await page.reload();
    await page.getByText(/Model connections \(/).click();
    await page
      .getByText("This request is awaiting a provider/account review.", {
        exact: false,
      })
      .waitFor();
    await fixture.reviewAi(status.admission_id);
    await page
      .getByRole("button", { name: "Check review status", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Ready to resubmit", exact: true })
      .waitFor();
    assert.equal(await page.locator("input[name=key]").inputValue(), "");
    assert.equal(
      await page.locator("input[name=model]").getAttribute("readonly"),
      "",
    );
    await page
      .getByLabel("Connection name", { exact: true })
      .fill("Synthetic browser resume");
    await page
      .locator("input[name=key]")
      .fill("SYNTHETIC_BROWSER_ONLY_NOT_A_CREDENTIAL");
    await page.locator("input[name=customer_billed_acknowledged]").check();
    const saved = page.waitForResponse(
      (r) =>
        r.url() === origin + "/api/team-space/connections" &&
        r.request().method() === "POST",
    );
    await page
      .getByRole("button", {
        name: "Resubmit reviewed connection",
        exact: true,
      })
      .click();
    const r = await saved;
    assert.equal(r.status(), 201, await r.text());
    assert.equal((await r.json()).id, status.admission_id);
    await page
      .getByRole("heading", { name: "Connection recorded", exact: true })
      .waitFor();
    assert.equal(await page.locator("input[name=key]").count(), 0);
    assert.equal(
      await page.evaluate(() => localStorage.length + sessionStorage.length),
      0,
    );
    return status.admission_id;
  }
  let restoredTarget = "";
  try {
    assert.ok(!fs.existsSync(path.join(runtime, "postgres")));
    run(["scripts/database.mjs", "start"]);
    cfg = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    );
    assert.equal(fs.realpathSync(cfg.host), path.join(runtime, "socket"));
    assert.ok(!cfg.password && !cfg.ssl && !cfg.connectionString);
    admin = new pg.Client({ ...cfg, user: os.userInfo().username });
    await admin.connect();
    assert.equal(
      fs.realpathSync(
        (await admin.query("show data_directory")).rows[0].data_directory,
      ),
      path.join(runtime, "postgres"),
    );
    assert.equal(
      (await admin.query("show listen_addresses")).rows[0].listen_addresses,
      "",
    );
    run(["scripts/integration-install.mjs"]);
    await admin.query("begin");
    fixture = await seedAiResumeFixture(admin);
    await admin.query("commit");
    const catalog = await integrationCatalog(admin);
    assert.deepEqual(
      catalog.tables
        .filter((t: any) => t.kind === "r" && !t.rls)
        .map((t: any) => t.schema + "." + t.name),
      ["kxra_private.deployment"],
    );
    const acl = JSON.parse(
      fs.readFileSync(
        "packages/integration/canonical-private-function-acl.json",
        "utf8",
      ),
    );
    for (const role of ["app", "authenticated", "anon"])
      assert.deepEqual(
        catalog.functions
          .filter(
            (f: any) =>
              ["kxra_private", "kxra_pairing", "kxra_github_receipt"].includes(
                f.schema,
              ) && f[role + "_reachable"],
          )
          .map((f: any) => f.schema + "." + f.name + "(" + f.arguments + ")"),
        [...acl.roles[role], ...acl.extensionRoles[role]].sort(),
      );
    for (const table of catalog.tables.filter(
      (t: any) => t.schema === "kxra_private",
    ))
      for (const p of table.effective_table_privileges || [])
        assert.equal(p.reachable, false, table.name + JSON.stringify(p));
    auth = http.createServer((req, res) => {
      const p = new URL(req.url!, authOrigin).pathname;
      authCounts[p] = (authCounts[p] || 0) + 1;
      res.setHeader("content-type", "application/json");
      if (p === "/auth/v1/.well-known/jwks.json")
        return res.end(JSON.stringify({ keys: [jwk] }));
      if (p === "/auth/v1/user") {
        const user = signedUsers.get(
          (req.headers.authorization || "").replace(/^Bearer /, ""),
        );
        res.statusCode = user ? 200 : 401;
        return res.end(
          JSON.stringify(user || { message: "Invalid synthetic token" }),
        );
      }
      res.statusCode = 404;
      res.end("{}");
    });
    await new Promise<void>((r, j) => {
      auth!.once("error", j);
      auth!.listen(authPort, "127.0.0.1", r);
    });
    log = fs.openSync(path.join(runtime, "application.log"), "w", 0o600);
    await startApp("postgres");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value: session(fixture.actor),
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (e) => pageErrors.push(e.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
        providerAttempts++;
        return route.abort();
      }
      return route.continue();
    });
    const savedId = await browserPhase(page, "initial");
    const savedCipher = (
      await admin.query(
        "select encrypted_key from kxra.team_connections where id=$1",
        [savedId],
      )
    ).rows[0].encrypted_key;
    assert.ok(
      savedCipher &&
        !savedCipher.includes("SYNTHETIC_BROWSER_ONLY_NOT_A_CREDENTIAL"),
    );
    const savedRun = await fixture.start(savedId);
    assert.equal(
      await fixture.gate(savedRun.run, fixture.ep, fixture.sha(savedCipher)),
      true,
    );
    phases.push({
      phase: "actual-browser-http-db",
      savedId,
      unreviewedKeyNotPersisted: true,
      exactReviewedReference: true,
      encryptedKeySaved: true,
    });
    assert.ok(
      authCounts["/auth/v1/user"] > 0 &&
        authCounts["/auth/v1/.well-known/jwks.json"] > 0,
    );
    assert.equal(await stop(app), true);
    app = undefined;
    await admin.end();
    admin = undefined;
    run(["scripts/database.mjs", "stop"]);
    run(["scripts/database.mjs", "start"]);
    admin = new pg.Client({ ...cfg, user: os.userInfo().username });
    await admin.connect();
    await startApp("postgres");
    await browserPhase(page, "restart", savedId);
    phases.push({ phase: "actual-restart-browser", status: "PASS" });
    assert.equal(await stop(app), true);
    app = undefined;
    await refreshPaid(admin);
    const beforeCatalog = await integrationCatalog(admin),
      beforeData = await integrationData(admin, beforeCatalog);
    fs.writeFileSync(
      path.join(runtime, "catalogue-source.json"),
      JSON.stringify(beforeCatalog, null, 2) + "\n",
      { mode: 0o600 },
    );
    fs.writeFileSync(
      path.join(runtime, "data-source.json"),
      JSON.stringify(beforeData, null, 2) + "\n",
      { mode: 0o600 },
    );
    const dump = path.join(runtime, "ai-resume-extensions.dump"),
      passfile = path.join(runtime, "empty-libpq");
    fs.writeFileSync(passfile, "", { mode: 0o600, flag: "wx" });
    const dumpEnv = {
      NODE_ENV: "production" as const,
      PATH: process.env.PATH,
      HOME: runtime,
      PGPASSFILE: passfile,
      PGSERVICEFILE: passfile,
      PGSYSCONFDIR: runtime,
    };
    const options = [
      "--no-password",
      "-h",
      cfg.host,
      "-p",
      String(cfg.port),
      "-U",
      os.userInfo().username,
    ];
    execFileSync(
      path.join(postgresBin(env), "pg_dump"),
      [...options, "-d", "postgres", "--format=custom", "--file", dump],
      { env: dumpEnv, stdio: "inherit", timeout: 120_000 },
    );
    restoredTarget = "kxra_ai_restore_" + crypto.randomBytes(6).toString("hex");
    await admin.query(`create database "${restoredTarget}" template template0`);
    const restored = new pg.Client({
      ...cfg,
      user: os.userInfo().username,
      database: restoredTarget,
    });
    await restored.connect();
    try {
      assert.equal(
        (
          await restored.query(
            "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema'",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (
          await restored.query(
            "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema'",
          )
        ).rows[0].n,
        0,
      );
      execFileSync(
        path.join(postgresBin(env), "pg_restore"),
        [
          ...options,
          "-d",
          restoredTarget,
          "--single-transaction",
          "--exit-on-error",
          dump,
        ],
        { env: dumpEnv, stdio: "inherit", timeout: 120_000 },
      );
      const restoredCatalog = await integrationCatalog(restored),
        restoredData = await integrationData(restored, beforeCatalog);
      assert.deepEqual(restoredCatalog, beforeCatalog);
      assert.deepEqual(restoredData, beforeData);
      fs.writeFileSync(
        path.join(runtime, "catalogue-restored.json"),
        JSON.stringify(restoredCatalog, null, 2) + "\n",
        { mode: 0o600 },
      );
      fs.writeFileSync(
        path.join(runtime, "data-restored.json"),
        JSON.stringify(restoredData, null, 2) + "\n",
        { mode: 0o600 },
      );
      // Fixture-only post-comparison marker; preserve the real audit trigger and actor.
      await restored.query("begin");
      await restored.query(
        "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true)",
        [fixture.actor, fixture.org],
      );
      await restored.query(
        "update kxra.team_connections set name='Restored synthetic connection marker' where id=$1",
        [savedId],
      );
      await restored.query("commit");
      phases.push({
        phase: "extension-restore",
        target: restoredTarget,
        verifiedEmpty: true,
        tables: beforeCatalog.tables.filter((t: any) => t.kind === "r").length,
        functions: beforeCatalog.functions.length,
        exactCatalogAndData: true,
      });
    } finally {
      await restored.end();
    }
    const restoredScope = await appClient(restoredTarget);
    try {
      assert.equal(
        (
          await restoredScope.query(
            "select kxra.ai_run_admission($1,$2,$3) value",
            [savedRun.run, fixture.ep, fixture.sha(savedCipher)],
          )
        ).rows[0].value,
        true,
      );
    } finally {
      await restoredScope.query("rollback");
      await restoredScope.end();
    }
    await startApp(restoredTarget);
    await browserPhase(page, "restored", savedId);
    await page
      .getByText("Restored synthetic connection marker · synthetic-model", {
        exact: true,
      })
      .waitFor();
    assert.equal(
      (
        await admin.query(
          "select name from kxra.team_connections where id=$1",
          [savedId],
        )
      ).rows[0].name,
      "Synthetic browser resume",
    );
    assert.equal(await stop(app), true);
    app = undefined;
    // Deterministic barriers: final save is queued behind its own intent row while an independent transaction commits revocation.
    for (const kind of [
      "review-withdrawal",
      "business-withdrawal",
      "session-change",
      "membership-revoke",
      "review-expiry",
    ]) {
      await admin.query("begin");
      fixture = await seedAiResumeFixture(admin, false);
      await admin.query("commit");
      const id = crypto.randomUUID();
      await fixture.register(id);
      const reviewId = await fixture.reviewAi(
        id,
        "ELIGIBLE",
        "CUSTOMER_BILLED",
        kind === "review-expiry" ? "1 second" : "1 hour",
      );
      const locker = new pg.Client({ ...cfg, user: os.userInfo().username }),
        racer = await appClient();
      await locker.connect();
      try {
        await locker.query("begin");
        await locker.query(
          "select id from kxra_private.ai_connection_intents where id=$1 for update",
          [id],
        );
        const pid = (await racer.query("select pg_backend_pid() pid")).rows[0]
          .pid;
        const attempt = racer
          .query(
            "select kxra.team_connection_save_admitted($1,'Synthetic race','OPENAI','synthetic-model','',$2,$3)",
            [id, fixture.cipher, fixture.fingerprint],
          )
          .then(
            () => ({ ok: true, code: "" }),
            (e) => ({ ok: false, code: e.code }),
          );
        let blocked = false;
        for (let n = 0; n < 100; n++) {
          if (
            (
              await admin.query(
                "select wait_event_type from pg_stat_activity where pid=$1",
                [pid],
              )
            ).rows[0]?.wait_event_type === "Lock"
          ) {
            blocked = true;
            break;
          }
          await new Promise((r) => setTimeout(r, 10));
        }
        assert.ok(blocked, "Expected genuine concurrent lock wait");
        if (kind === "review-withdrawal")
          await admin.query(
            "update kxra_private.ai_connection_reviews set withdrawn_at=clock_timestamp() where id=$1",
            [reviewId],
          );
        if (kind === "business-withdrawal")
          await admin.query(
            "update kxra_private.business_eligibility_reviews set withdrawn_at=clock_timestamp() where id=$1",
            [fixture.eligibility],
          );
        if (kind === "session-change")
          await admin.query(
            "update kxra.account_identities set session_version=session_version+1 where account_id=$1",
            [fixture.actor],
          );
        if (kind === "membership-revoke")
          await admin.query(
            "update kxra.organisation_memberships set state='REVOKED',revoked_at=clock_timestamp() where account_id=$1 and org_id=$2",
            [fixture.actor, fixture.org],
          );
        if (kind === "review-expiry") {
          while (
            !(
              await admin.query(
                "select expires_at<=clock_timestamp() expired from kxra_private.ai_connection_reviews where id=$1",
                [reviewId],
              )
            ).rows[0].expired
          )
            await new Promise((r) => setTimeout(r, 20));
        }
        await locker.query("commit");
        const outcome = await attempt;
        assert.equal(outcome.ok, false, kind);
        assert.equal(outcome.code, "42501", kind);
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from kxra.team_connections where id=$1",
              [id],
            )
          ).rows[0].n,
          0,
        );
        assert.equal(
          (
            await admin.query(
              "select count(*)::int n from kxra_private.ai_connection_bindings where connection_id=$1",
              [id],
            )
          ).rows[0].n,
          0,
        );
        phases.push({
          phase: "concurrent-save",
          kind,
          blockedObserved: true,
          denied: true,
          noCredentialOrBinding: true,
        });
      } finally {
        let cleanupError;
        try {
          try {
            await locker.query("rollback");
          } finally {
            await locker.end();
          }
        } catch (e) {
          cleanupError = e;
        }
        try {
          try {
            await racer.query("rollback");
          } finally {
            await racer.end();
          }
        } catch (e) {
          cleanupError ||= e;
        }
        if (cleanupError) throw cleanupError;
      }
    }
    assert.equal(providerAttempts, 0);
    assert.deepEqual(pageErrors, []);
    await browser.close();
    browser = undefined;
    fs.writeFileSync(
      path.join(runtime, "acceptance.json"),
      JSON.stringify(
        {
          status: "PASS",
          sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: root,
            encoding: "utf8",
          }).trim(),
          snapshotHashes: Object.fromEntries(
            [
              "catalogue-source.json",
              "catalogue-restored.json",
              "data-source.json",
              "data-restored.json",
              "ai-resume-extensions.dump",
            ].map((name) => [
              name,
              crypto
                .createHash("sha256")
                .update(fs.readFileSync(path.join(runtime, name)))
                .digest("hex"),
            ]),
          ),
          proposalSha256: crypto
            .createHash("sha256")
            .update(
              fs.readFileSync("database/proposals/ai-business-admission.sql"),
            )
            .digest("hex"),
          phases,
          authCounts,
          providerAttempts,
          fullCatalogueCompared: true,
          claims:
            "Offline stand-in Auth only; real SDK signature verification, application HTTP and disposable database. No provider/inference/commercial acceptance.",
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    console.log("AI_RESUME_BROWSER_RACES_RECOVERY_PASS " + runtime);
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
      if (!(await stop(app))) clean = false;
    } catch {
      clean = false;
    }
    try {
      if (auth) {
        auth.closeAllConnections();
        await new Promise<void>((r, j) => auth!.close((e) => (e ? j(e) : r())));
      }
    } catch {
      clean = false;
    }
    try {
      if (admin) await admin.end();
    } catch {
      clean = false;
    }
    try {
      if (log !== undefined) fs.closeSync(log);
    } catch {
      clean = false;
    }
    for (const item of generated) {
      try {
        fs.writeFileSync(item.file, item.bytes);
      } catch {
        clean = false;
      }
    }
    try {
      const probe = net.createServer();
      await new Promise<void>((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(appPort, "127.0.0.1", resolve);
      });
      await new Promise<void>((resolve, reject) =>
        probe.close((e) => (e ? reject(e) : resolve())),
      );
    } catch {
      clean = false;
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
    clean =
      clean &&
      stopped.status === 0 &&
      status.status === 3 &&
      !fs.existsSync(path.join(runtime, "postgres/postmaster.pid"));
    fs.writeFileSync(
      path.join(runtime, "cleanup.json"),
      JSON.stringify({
        clean,
        postgresStop: stopped.status,
        postgresStatus: status.status,
        postmasterPidAbsent: !fs.existsSync(
          path.join(runtime, "postgres/postmaster.pid"),
        ),
        browserClosed: !browser || !browser.isConnected(),
        appExited: !app || app.exitCode !== null || app.signalCode !== null,
        authClosed: !auth || !auth.listening,
      }) + "\n",
      { mode: 0o600 },
    );
    assert.ok(clean, "OWNED_RESOURCE_CLEANUP_UNCERTAIN");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
