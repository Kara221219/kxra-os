// Explicit serial window only. Real Next/SDK/actor/query and application126;
// ephemeral loopback Auth STAND-IN, never live Supabase acceptance.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import net from "node:net";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import pg from "pg";
import { chromium } from "@playwright/test";
import { applicationReleaseCohort } from "./application-release-cohort.mjs";
import {
  applicationCatalog,
  validateApplicationProfiles,
} from "./production-application-core.mjs";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import { applicationNext } from "./application-next.mjs";
import { postgresBin } from "./postgres-bin.mjs";
import {
  capturePostgresOwnership,
  assertPostgresOwnership,
  captureDatabaseClientFailure,
  ownedWebSocketUrl,
  assertGeneratedNextEnv,
  safeFailure,
  directoryNavigationKind,
} from "./customer-directory-joined-ownership.mjs";

assert.deepEqual(
  process.argv.slice(2),
  ["--reviewed-local-window"],
  "EXPLICIT_SERIAL_WINDOW_REQUIRED",
);
for (const key of Object.keys(process.env))
  if (
    /^(DATABASE_URL$|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|PGSERVICE|KXRA_|NEXT_PUBLIC_SUPABASE_|SUPABASE_|VERCEL|NODE_OPTIONS$|HTTP_PROXY$|HTTPS_PROXY$|ALL_PROXY$)/i.test(
      key,
    )
  )
    assert.ok(
      !process.env[key],
      "AMBIENT_TARGET_FEATURE_OR_CREDENTIAL_REJECTED: " + key,
    );
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
const git = (...args) =>
  execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  }).trim();
assert.equal(
  git("status", "--porcelain"),
  "",
  "CLEAN_COMMITTED_SOURCE_REQUIRED",
);
assert.equal(
  git(
    "diff",
    "--name-only",
    "1ec4458d428b68e0b3d10fa703b8424c85f3b5af",
    "--",
    "apps",
    "packages",
    "database",
  ),
  "",
  "FROZEN_APPLICATION_SOURCE_REQUIRED",
);
const sourceCommit = git("rev-parse", "HEAD"),
  sourceTree = git("rev-parse", "HEAD^{tree}");
const tracked = git("ls-files", "-z").split("\0").filter(Boolean);
const digest = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const sourceHashes = Object.fromEntries(
  tracked.map((file) => [file, digest(fs.readFileSync(path.join(root, file)))]),
);
const cohort = applicationReleaseCohort(root);
const proposal = fs.readFileSync(
  path.join(root, "database/proposals/customer-directory-metadata-v1.sql"),
  "utf8",
);
const runtime = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-directory-joined-"));
fs.chmodSync(runtime, 0o700);
const source = path.join(runtime, "source"),
  dir = path.join(runtime, "postgres"),
  socket = path.join(runtime, "socket");
fs.mkdirSync(socket, { mode: 0o700 });
// Run an exact tracked-file copy so Next cannot mutate the frozen worktree.
for (const file of tracked) {
  const target = path.join(source, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
}
for (const folder of ["node_modules", "apps/os/node_modules"])
  fs.symlinkSync(
    fs.realpathSync(path.join(root, folder)),
    path.join(source, folder),
    "dir",
  );
const bin = postgresBin(),
  nonce = crypto.randomUUID();
const env = {
  PATH: process.env.PATH,
  HOME: runtime,
  USER: os.userInfo().username,
  TMPDIR: process.env.TMPDIR,
  LANG: "C",
  LC_ALL: "C",
  NEXT_TELEMETRY_DISABLED: "1",
};
const report = {
  classification:
    "LOCAL_JOINED_NEXT_SDK_AUTH_STAND_IN_APPLICATION126_NOT_LIVE_SUPABASE_ACCEPTANCE",
  sourceCommit,
  sourceTree,
  sourceHashes,
  runtime,
  nonce,
  proposalSha256: digest(proposal),
  phases: [],
  passed: false,
  realProviderCalls: 0,
  realCredentialsUsed: false,
  liveSupabaseAcceptance: "NOT_RUN",
  sourceDefaultsChanged: false,
  ephemeralMetadataGrants: false,
};
const write = (name, value) =>
  fs.writeFileSync(
    path.join(runtime, name),
    JSON.stringify(value, null, 2) + "\n",
    { mode: 0o600 },
  );
write("receipt.json", report);
let cancelled = null;
let asynchronousFailure;
const onInt = () => {
  cancelled = "SIGINT";
};
const onTerm = () => {
  cancelled = "SIGTERM";
};
process.on("SIGINT", onInt);
process.on("SIGTERM", onTerm);
function checkCancellation() {
  assert.equal(cancelled, null, "RUN_CANCELLED");
  if (asynchronousFailure) throw asynchronousFailure;
}
async function phase(name, work) {
  report.active = { phase: name, substep: "begin" };
  write("receipt.json", report);
  checkCancellation();
  await work();
  checkCancellation();
  report.phases.push({ name, status: "PASS" });
  write("receipt.json", report);
  console.log("PASS " + name);
}
async function substep(name, work) {
  report.active.substep = name;
  write("receipt.json", report);
  checkCancellation();
  const result = await work();
  (report.steps ||= []).push({ ...report.active, status: "PASS" });
  checkCancellation();
  write("receipt.json", report);
  return result;
}
let release;
let app,
  appError,
  browser,
  auth,
  admin,
  provider,
  postgresAttempted = false,
  postgresPid,
  postgresOwnership;
const clients = [],
  authSockets = new Set();
const children = [];
let dbPort, appPort, authPort, origin, authOrigin;
const pgRun = (name, args, timeout = 60000) =>
  execFileSync(path.join(bin, name), args, {
    env,
    timeout,
    stdio: "pipe",
    maxBuffer: 32 * 1024 * 1024,
  });
function absent(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error.code === "ESRCH";
  }
}
async function port() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const value = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return value;
}
async function connect(user) {
  const client = new pg.Client({
    host: socket,
    port: dbPort,
    database: "postgres",
    user,
    connectionTimeoutMillis: 5000,
    query_timeout: 15000,
  });
  captureDatabaseClientFailure(client, (code) => {
    asynchronousFailure ||= Error(code);
  });
  clients.push(client);
  await client.connect();
  await client.query("set statement_timeout='10s';set timezone='UTC'");
  return client;
}
function processIdentity(pid) {
  return execFileSync("ps", ["-p", String(pid), "-o", "pgid=,lstart="], {
    encoding: "utf8",
    timeout: 5000,
  })
    .trim()
    .replace(/\s+/g, " ");
}
function postgresProcessIdentity(pid) {
  return {
    birth: processIdentity(pid),
    command: execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      timeout: 5000,
    }).trim(),
  };
}
async function bounded(work, milliseconds, name) {
  let timer;
  try {
    return await Promise.race([
      work,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(name)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function stopApp() {
  if (!app) return { clean: true, neverStarted: true };
  const child = app;
  if (!child.pid) {
    assert.ok(appError, "SPAWN_OUTCOME_UNCERTAIN");
    app = undefined;
    return { clean: true, neverStarted: true, spawnError: true };
  }
  const pid = child.pid;
  if (!absent(pid)) {
    assert.ok(child.ownedIdentity, "OWNED_NEXT_BIRTH_IDENTITY_MISSING");
    assert.equal(
      processIdentity(pid),
      child.ownedIdentity,
      "OWNED_NEXT_IDENTITY_CHANGED",
    );
    process.kill(-pid, "SIGTERM");
    const until = Date.now() + 10000;
    while (!absent(pid) && Date.now() < until)
      await new Promise((resolve) => setTimeout(resolve, 100));
    if (!absent(pid)) {
      assert.equal(
        processIdentity(pid),
        child.ownedIdentity,
        "OWNED_NEXT_IDENTITY_CHANGED",
      );
      process.kill(-pid, "SIGKILL");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  let groupAbsent = false;
  try {
    process.kill(-pid, 0);
  } catch (error) {
    groupAbsent = error.code === "ESRCH";
  }
  assert.ok(absent(pid) && groupAbsent, "OWNED_NEXT_GROUP_CLEANUP_UNCERTAIN");
  app = undefined;
  return { clean: true, pid, groupAbsent };
}
async function startApp(enabled) {
  assert.ok(!app);
  checkCancellation();
  const application = applicationNext("os", source);
  const log = fs.openSync(
    path.join(runtime, enabled ? "next-enabled.log" : "next-disabled.log"),
    "a",
    0o600,
  );
  const appEnv = {
    ...env,
    NODE_ENV: "development",
    NODE_OPTIONS:
      "--require=" +
      path.join(source, "scripts/customer-directory-loopback-guard.cjs"),
    KXRA_JOINED_RUNTIME: runtime,
    KXRA_CI_RUN_ID: nonce,
    KXRA_ORIGIN: origin,
    KXRA_NEXT_DIST_DIR: ".next-dev",
    DATABASE_URL: `postgresql://kxra_app@localhost:${dbPort}/postgres?host=${encodeURIComponent(socket)}`,
    NEXT_PUBLIC_SUPABASE_URL: authOrigin,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "SYNTHETIC_LOOPBACK_NOT_A_REAL_KEY",
    ...(enabled ? { KXRA_OWNER_CUSTOMER_DIRECTORY_ENABLED: "true" } : {}),
  };
  for (const forbidden of [
    "KXRA_AUTH_MODE",
    "KXRA_RUNTIME",
    "KXRA_LOCAL_SECRET",
    "KXRA_CUSTOM_APPS_ENABLED",
    "KXRA_HOSTED_SELF_SERVICE_ENABLED",
  ])
    assert.equal(appEnv[forbidden], undefined);
  assert.equal(new URL(appEnv.DATABASE_URL).searchParams.get("host"), socket);
  appError = undefined;
  try {
    app = spawn(
      process.execPath,
      [
        application.binary,
        "dev",
        ...application.webpackArguments,
        "--hostname",
        "127.0.0.1",
        "--port",
        String(appPort),
      ],
      {
        cwd: path.join(source, "apps/os"),
        env: appEnv,
        detached: true,
        stdio: ["ignore", log, log],
      },
    );
    app.on("error", (error) => {
      appError = error;
    });
    const child = app;
    child.once("spawn", () => {
      try {
        child.ownedIdentity = processIdentity(child.pid);
        assert.ok(
          child.ownedIdentity.startsWith(String(child.pid) + " "),
          "OWNED_NEXT_GROUP_REQUIRED",
        );
      } catch (error) {
        appError = error;
      }
    });
    children.push(app);
  } finally {
    fs.closeSync(log);
  }
  const until = Date.now() + 120000;
  while (Date.now() < until) {
    checkCancellation();
    if (appError) throw appError;
    assert.equal(app.exitCode, null, "NEXT_EXITED_BEFORE_READY");
    try {
      const response = await fetch(origin + "/api/health", {
        signal: AbortSignal.timeout(2000),
        redirect: "error",
      });
      if (response.ok && (await response.json()).run_id === nonce) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw Error("OWNED_NEXT_READINESS_TIMEOUT");
}
const signedUsers = new Map(),
  authCounts = { user: 0, jwks: 0, rejected: 0 };
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  kid: crypto.randomUUID(),
  alg: "ES256",
  use: "sig",
  key_ops: ["verify"],
};
async function session(accountId, options = {}) {
  const sessionId = options.sessionId || crypto.randomUUID();
  if (!options.sessionId)
    await provider.query(
      "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())",
      [sessionId, accountId],
    );
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: authOrigin + "/auth/v1",
    aud: "authenticated",
    sub: accountId,
    role: "authenticated",
    iat: now,
    exp: now + 1800,
    aal: "aal2",
    is_anonymous: false,
    session_id: sessionId,
    amr: [{ method: "totp", timestamp: now }],
  };
  // Use the actual application126 hook to derive the original session epoch.
  const hooked = (
    await provider.query(
      "select kxra_private.custom_app_access_token_hook($1::jsonb) value",
      [JSON.stringify({ user_id: accountId, claims })],
    )
  ).rows[0].value.claims;
  Object.assign(hooked, options.claims || {}); // Explicit negative-test variants only.
  const header = Buffer.from(
    JSON.stringify({ alg: "ES256", kid: jwk.kid, typ: "JWT" }),
  ).toString("base64url");
  const unsigned =
    header + "." + Buffer.from(JSON.stringify(hooked)).toString("base64url");
  const token =
    unsigned +
    "." +
    crypto
      .sign("sha256", Buffer.from(unsigned), {
        key: privateKey,
        dsaEncoding: "ieee-p1363",
      })
      .toString("base64url");
  const user = {
    id: accountId,
    aud: "authenticated",
    role: "authenticated",
    email: "synthetic-owner@example.invalid",
    email_confirmed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
  };
  signedUsers.set(token, user);
  const cookie =
    "base64-" +
    Buffer.from(
      JSON.stringify({
        access_token: token,
        refresh_token: "SYNTHETIC_NO_REFRESH",
        expires_at: now + 1800,
        expires_in: 1800,
        token_type: "bearer",
        user,
      }),
    ).toString("base64url");
  return { sessionId, cookie };
}
function noStore(headers) {
  assert.match(
    headers.get
      ? headers.get("cache-control") || ""
      : headers["cache-control"] || "",
    /(?:^|,)\s*no-store(?:,|$)/,
  );
}
async function request(cookie, route = "/os/customer-directory") {
  checkCancellation();
  const response = await fetch(origin + route, {
    headers: cookie ? { cookie: "sb-127-auth-token=" + cookie } : {},
    redirect: "manual",
    signal: AbortSignal.timeout(90000),
  });
  noStore(response.headers);
  const html = await response.text();
  assert.ok(!html.includes("NEVER_EXPOSE_DIRECTORY_PRIVATE"));
  return {
    status: response.status,
    html,
    location: response.headers.get("location"),
  };
}
function unavailable(result) {
  assert.ok(!result.html.includes("<table"));
  assert.ok(!result.html.includes("records on this page"));
  assert.ok(
    result.html.includes("Directory unavailable") ||
      result.html.includes("Access unavailable") ||
      [303, 307, 308, 404].includes(result.status),
  );
}
let owner, staff, ownerOrg, membership, ownerSession;
try {
  release = acquireNativeFixtureLease("customer-directory-joined-" + nonce);
  report.leaseAcquired = true;
  checkCancellation();
  dbPort = await port();
  appPort = await port();
  authPort = await port();
  assert.equal(new Set([dbPort, appPort, authPort]).size, 3);
  origin = `http://127.0.0.1:${appPort}`;
  authOrigin = `http://127.0.0.1:${authPort}`;
  write("ownership.json", {
    nonce,
    harnessPid: process.pid,
    runtime,
    source,
    dir,
    socket,
    databasePort: dbPort,
    httpPorts: [appPort, authPort],
  });
  await phase(
    "isolated application126 and fresh original-session authority",
    async () => {
      pgRun("initdb", [
        "-D",
        dir,
        "-U",
        "postgres",
        "--auth-local=trust",
        "--auth-host=reject",
        "--encoding=UTF8",
        "--no-locale",
      ]);
      postgresAttempted = true;
      pgRun("pg_ctl", [
        "-D",
        dir,
        "-l",
        path.join(runtime, "postgres.log"),
        "-o",
        `-k '${socket}' -p ${dbPort} -h ''`,
        "-w",
        "start",
      ]);
      const pidLines = fs
        .readFileSync(path.join(dir, "postmaster.pid"), "utf8")
        .split("\n");
      postgresPid = Number(pidLines[0]);
      postgresOwnership = capturePostgresOwnership(
        pidLines,
        postgresProcessIdentity(postgresPid),
        { dir, socket, port: dbPort },
      );
      write("postgres-ownership.json", postgresOwnership);
      admin = await connect("postgres");
      assert.equal(
        (await admin.query("show data_directory")).rows[0].data_directory,
        dir,
      );
      assert.equal(
        (await admin.query("show listen_addresses")).rows[0].listen_addresses,
        "",
      );
      for (const role of [
        "anon",
        "authenticated",
        "kxra_app",
        "supabase_auth_admin",
      ])
        await admin.query(
          `create role ${role} ${["kxra_app", "supabase_auth_admin"].includes(role) ? "login" : "nologin"} noinherit nobypassrls`,
        );
      await admin.query(`grant authenticated,anon to kxra_app;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
      grant usage on schema auth to anon,authenticated,supabase_auth_admin;
      grant execute on all functions in schema auth to anon,authenticated;
      create table auth.sessions(id uuid primary key,user_id uuid not null,created_at timestamptz,updated_at timestamptz,not_after timestamptz);
      alter table auth.sessions owner to supabase_auth_admin;
      revoke all on auth.sessions from public,anon,authenticated,kxra_app;`);
      for (const migration of cohort.migrations) {
        checkCancellation();
        await admin.query("begin");
        try {
          await admin.query(migration.sql);
          await admin.query("commit");
        } catch (error) {
          await admin.query("rollback");
          throw error;
        }
      }
      const major = String(
        Math.trunc(
          Number(
            (await admin.query("show server_version_num")).rows[0]
              .server_version_num,
          ) / 10000,
        ),
      );
      const profiles = validateApplicationProfiles(
        JSON.parse(
          fs.readFileSync(
            path.join(
              root,
              "packages/release/production-application-targets-v1.json",
            ),
            "utf8",
          ),
        ),
      );
      assert.equal(
        (await applicationCatalog(admin, 126)).sha256,
        profiles.find((p) => p.serverMajor === major)?.catalogs["126"],
      );
      owner = crypto.randomUUID();
      staff = crypto.randomUUID();
      ownerOrg = crypto.randomUUID();
      membership = crypto.randomUUID();
      await admin.query(
        "insert into kxra.organisations(id,name,slug,organisation_kind,relationship_type) values($1,'Synthetic KXRA owner','synthetic-joined-owner','KXRA','INTERNAL')",
        [ownerOrg],
      );
      for (const who of [owner, staff]) {
        await admin.query(
          "insert into kxra.account_identities(account_id,auth_subject,state,email_verified_at) values($1::uuid,$1::uuid::text,'ACTIVE',clock_timestamp())",
          [who],
        );
        await admin.query(
          "insert into kxra.organisation_memberships(id,org_id,account_id,security_role,relationship_type,display_name) values($1,$2,$3,$4,'INTERNAL',$5)",
          [
            who === owner ? membership : crypto.randomUUID(),
            ownerOrg,
            who,
            who === owner ? "KXRA_OWNER" : "KXRA_STAFF",
            who === owner ? "Synthetic owner" : "Synthetic staff",
          ],
        );
      }
      for (let i = 1; i <= 55; i++)
        await admin.query(
          "insert into kxra.organisations(id,name,slug,state,created_provenance) values($1,$2,$3,$4,$5::jsonb)",
          [
            `30000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
            `Synthetic customer ${i}`,
            `synthetic-customer-${i}`,
            ["ACTIVE", "SUSPENDED", "CLOSED"][(i - 1) % 3],
            JSON.stringify({ private: "NEVER_EXPOSE_DIRECTORY_PRIVATE" }),
          ],
        );
      provider = await connect("supabase_auth_admin");
    },
  );
  await phase("owned loopback synthetic provider", async () => {
    auth = http.createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.setHeader("cache-control", "no-store");
      const target = new URL(req.url || "/", authOrigin);
      if (
        req.method === "GET" &&
        target.pathname === "/auth/v1/.well-known/jwks.json"
      ) {
        authCounts.jwks++;
        return res.end(JSON.stringify({ keys: [jwk] }));
      }
      if (req.method === "GET" && target.pathname === "/auth/v1/user") {
        authCounts.user++;
        const user = signedUsers.get(
          (req.headers.authorization || "").replace(/^Bearer /, ""),
        );
        res.statusCode = user ? 200 : 401;
        return res.end(
          JSON.stringify(user || { message: "Unknown synthetic token" }),
        );
      }
      authCounts.rejected++;
      res.statusCode = 404;
      res.end("{}");
    });
    auth.on("connection", (connection) => {
      authSockets.add(connection);
      connection.on("close", () => authSockets.delete(connection));
    });
    await new Promise((resolve, reject) => {
      auth.once("error", reject);
      auth.listen(authPort, "127.0.0.1", resolve);
    });
    ownerSession = await session(owner);
  });
  await phase(
    "real Next actor renders disabled without metadata RPC",
    async () => {
      await startApp(false);
      const result = await request(ownerSession.cookie);
      assert.equal(result.status, 200);
      assert.ok(result.html.includes("Directory not enabled"));
      assert.ok(!result.html.includes("<table"));
      await stopApp();
    },
  );
  await phase(
    "enabled Next fails closed for missing and ungranted RPC",
    async () => {
      await startApp(true);
      unavailable(await request(ownerSession.cookie));
      await admin.query(proposal);
      const acl = (
        await admin.query(
          "select has_schema_privilege('authenticated','kxra_owner_metadata','usage') usage,has_function_privilege('authenticated','kxra_owner_metadata.customer_directory_page_v1(uuid,integer,integer,jsonb)','execute') execute",
        )
      ).rows[0];
      assert.deepEqual(acl, { usage: false, execute: false });
      unavailable(await request(ownerSession.cookie));
      // Test-only in the verified disposable database. Never application126/proposal defaults.
      await admin.query(
        "grant usage on schema kxra_owner_metadata to authenticated;grant execute on all functions in schema kxra_owner_metadata to authenticated",
      );
      report.ephemeralMetadataGrants = true;
    },
  );
  await phase("real Next and SDK bound positive metadata SSR", async () => {
    const result = await request(ownerSession.cookie);
    assert.equal(result.status, 200);
    assert.ok(result.html.includes("<table"));
    assert.ok(result.html.includes("Synthetic customer 25"));
    assert.ok(!result.html.includes("Synthetic customer 26"));
    assert.ok(authCounts.user > 0 && authCounts.jwks > 0);
    assert.equal(authCounts.rejected, 0);
  });
  await phase(
    "role and original-session negatives through unchanged Next actor/query",
    async () => {
      const staffSession = await session(staff);
      const staffResult = await request(staffSession.cookie);
      assert.equal(staffResult.status, 404);
      assert.ok(!staffResult.html.includes("<table"));
      const foreign = await session(owner, {
        sessionId: staffSession.sessionId,
        claims: { kxra_session_version: 1 },
      });
      unavailable(await request(foreign.cookie));
      const missing = await session(owner, {
        sessionId: crypto.randomUUID(),
        claims: { kxra_session_version: 1 },
      });
      unavailable(await request(missing.cookie));
      const staleMfa = await session(owner, {
        claims: {
          amr: [
            { method: "totp", timestamp: Math.floor(Date.now() / 1000) - 3600 },
          ],
        },
      });
      unavailable(await request(staleMfa.cookie));
      const signedOut = await request();
      assert.ok([303, 307, 308].includes(signedOut.status));
      assert.equal(signedOut.location, "/login");
    },
  );
  browser = await chromium.launch({
    headless: true,
    args: ["--disable-background-networking"],
  });
  const context = await browser.newContext({ serviceWorkers: "block" });
  let browserDenied = 0;
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.username ||
      url.password ||
      ![origin, authOrigin].includes(url.origin)
    ) {
      browserDenied++;
      return route.abort();
    }
    return route.continue();
  });
  await context.routeWebSocket("**/*", (route) => {
    if (
      !ownedWebSocketUrl(route.url(), [
        origin.replace("http:", "ws:"),
        authOrigin.replace("http:", "ws:"),
      ])
    ) {
      browserDenied++;
      route.close({ code: 1008, reason: "Non-owned target" });
      return;
    }
    route.connectToServer();
  });
  await context.addCookies([
    {
      name: "sb-127-auth-token",
      value: ownerSession.cookie,
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(90000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.name));
  const rows = () => page.locator("tbody tr");
  report.browserRequests = [];
  page.on("response", (response) => {
    const kind = directoryNavigationKind(response.url());
    if (kind.directory && report.browserRequests.length < 200)
      report.browserRequests.push({
        ...kind,
        ...report.active,
        status: response.status(),
        document: response.request().isNavigationRequest(),
        noStore: /(?:^|,)\s*no-store(?:,|$)/.test(
          response.headers()["cache-control"] || "",
        ),
      });
  });
  async function documentAction(name, action) {
    return substep(name, async () => {
      const [response] = await Promise.all([
        page.waitForResponse(
          (response) =>
            response.request().isNavigationRequest() &&
            directoryNavigationKind(response.url()).directory,
          { timeout: 30000 },
        ),
        action(),
      ]);
      noStore(response.headers());
      await page.waitForLoadState("domcontentloaded");
      return response;
    });
  }

  await phase(
    "bounded browser pagination filter and navigation history",
    async () => {
      await documentAction("positive-first-document", () =>
        page.goto(origin + "/os/customer-directory"),
      );
      await rows().first().waitFor();
      assert.equal(await rows().count(), 25);
      const first = await page.locator("tbody th").allTextContents();
      await documentAction("positive-next-document", () =>
        page.getByRole("link", { name: "Next page", exact: true }).click(),
      );
      await page.waitForURL(/cursor=/);
      await page.getByText("Synthetic customer 26", { exact: true }).waitFor();
      assert.equal(await rows().count(), 25);
      const second = await page.locator("tbody th").allTextContents();
      assert.ok(second.every((value) => !first.includes(value)));
      await documentAction("positive-next-document", () =>
        page.getByRole("link", { name: "Next page", exact: true }).click(),
      );
      await page.getByText("Synthetic customer 51", { exact: true }).waitFor();
      assert.equal(await rows().count(), 5);
      assert.equal(
        await page
          .getByRole("link", { name: "Next page", exact: true })
          .count(),
        0,
      );
      await documentAction("positive-back-document", () => page.goBack());
      await page.getByText("Synthetic customer 26", { exact: true }).waitFor();
      await documentAction("positive-forward-document", () => page.goForward());
      await page.getByText("Synthetic customer 51", { exact: true }).waitFor();
      await documentAction("positive-refresh-document", () =>
        page.getByRole("link", { name: "Refresh from first page" }).click(),
      );
      await page.waitForURL(origin + "/os/customer-directory");
      await page.getByText("Synthetic customer 1", { exact: true }).waitFor();
      await page
        .getByLabel("Organisation state", { exact: true })
        .selectOption("SUSPENDED");
      await documentAction("positive-filter-document", () =>
        page.getByRole("button", { name: "Apply filter" }).click(),
      );
      await page.waitForURL(/organisation_state=SUSPENDED$/);
      assert.equal(await rows().count(), 18);
      assert.deepEqual(
        [
          ...new Set(
            await page
              .locator('tbody td[data-label="State"]')
              .allTextContents(),
          ),
        ],
        ["SUSPENDED"],
      );
      assert.ok(
        !(await page.content()).includes("NEVER_EXPOSE_DIRECTORY_PRIVATE"),
      );
      for (const width of [1440, 768, 390, 320]) {
        await substep("layout-" + width, async () => {
          await page.setViewportSize({ width, height: 1000 });
          const dimensions = await page.evaluate(() => {
            const table = document
              .querySelector("table")
              .getBoundingClientRect();
            const caption = document
              .querySelector("caption")
              .getBoundingClientRect();
            return {
              viewport: innerWidth,
              scroll: document.documentElement.scrollWidth,
              tableWidth: table.width,
              captionWidth: caption.width,
              captionHeight: caption.height,
            };
          });
          (report.layout ||= []).push(dimensions);
          assert.ok(
            dimensions.scroll <= dimensions.viewport,
            "DIRECTORY_HORIZONTAL_OVERFLOW",
          );
          assert.ok(
            dimensions.captionWidth >= dimensions.tableWidth * 0.9,
            "CAPTION_COLLAPSED_WIDTH",
          );
          assert.ok(
            dimensions.captionHeight <= 180,
            "CAPTION_EXCESSIVE_HEIGHT",
          );
          await page.screenshot({
            path: path.join(runtime, `directory-positive-${width}.png`),
            fullPage: true,
          });
        });
      }
    },
  );
  await phase(
    "native keyboard modified-click and Shell-exit navigation",
    async () => {
      await documentAction("keyboard-refresh-new-document", () =>
        page
          .getByRole("link", { name: "Refresh from first page" })
          .press("Enter"),
      );
      await rows().first().waitFor();
      assert.equal(await rows().count(), 25);
      await substep("modified-click-opens-independent-document", async () => {
        const [popup, response] = await Promise.all([
          context.waitForEvent("page"),
          context.waitForEvent("response", {
            predicate: (response) =>
              response.request().isNavigationRequest() &&
              directoryNavigationKind(response.url()).directory &&
              response.frame().page() !== page,
          }),
          page.getByRole("link", { name: "Refresh from first page" }).click({
            modifiers: [os.platform() === "darwin" ? "Meta" : "Control"],
          }),
        ]);
        try {
          noStore(response.headers());
          await popup.waitForLoadState("domcontentloaded");
          await popup.locator("tbody tr").first().waitFor();
          assert.equal(await popup.locator("tbody tr").count(), 25);
        } finally {
          await popup.close();
        }
      });
      await substep("Shell-organisation-exit-new-document", async () => {
        const [response] = await Promise.all([
          page.waitForResponse(
            (response) =>
              response.request().isNavigationRequest() &&
              new URL(response.url()).pathname === "/select-organisation",
          ),
          page
            .getByRole("link", { name: "Synthetic KXRA owner", exact: true })
            .click(),
        ]);
        assert.equal(response.status(), 200);
        await page.waitForLoadState("domcontentloaded");
      });
      await documentAction("Shell-exit-back-new-directory-document", () =>
        page.goBack(),
      );
      await rows().first().waitFor();
      assert.equal(await rows().count(), 25);
    },
  );
  await phase(
    "no JavaScript and failed hydration do not reveal metadata",
    async () => {
      for (const mode of ["no-javascript", "blocked-hydration"]) {
        await substep(mode, async () => {
          const isolated = await browser.newContext({
            javaScriptEnabled: mode !== "no-javascript",
            serviceWorkers: "block",
          });
          let blockedScripts = 0;
          try {
            await isolated.route("**/*", (route) => {
              const url = new URL(route.request().url());
              if (
                ![origin, authOrigin].includes(url.origin) ||
                url.username ||
                url.password
              ) {
                browserDenied++;
                return route.abort();
              }
              if (
                mode === "blocked-hydration" &&
                url.pathname.endsWith(".js")
              ) {
                blockedScripts++;
                return route.abort();
              }
              return route.continue();
            });
            await isolated.routeWebSocket("**/*", (route) => {
              browserDenied++;
              route.close({
                code: 1008,
                reason: "No socket needed in non-hydrated check",
              });
            });
            await isolated.addCookies([
              {
                name: "sb-127-auth-token",
                value: ownerSession.cookie,
                url: origin,
                httpOnly: true,
                sameSite: "Lax",
              },
            ]);
            const closedPage = await isolated.newPage();
            const response = await closedPage.goto(
              origin + "/os/customer-directory",
              { waitUntil: "load" },
            );
            noStore(response.headers());
            assert.equal(await closedPage.locator("tbody tr").count(), 25);
            assert.equal(
              await closedPage.locator("tbody tr").first().isVisible(),
              false,
            );
            assert.equal(
              await closedPage.getByRole("status").isVisible(),
              true,
            );
            if (mode === "no-javascript")
              assert.equal(
                await closedPage
                  .getByText(
                    "JavaScript is required to display this private directory safely.",
                  )
                  .isVisible(),
                true,
              );
            else assert.ok(blockedScripts > 0, "HYDRATION_BLOCK_NOT_EXERCISED");
            await closedPage.screenshot({
              path: path.join(runtime, mode + ".png"),
              fullPage: true,
            });
          } finally {
            await isolated.close();
          }
        });
      }
    },
  );
  await phase(
    "session deletion denies fresh requests and post-revocation navigation",
    async () => {
      await documentAction("session-before-revocation-first-document", () =>
        page.goto(origin + "/os/customer-directory"),
      );
      await rows().first().waitFor();
      await substep("delete-current-original-session", () =>
        provider.query("delete from auth.sessions where id=$1", [
          ownerSession.sessionId,
        ]),
      );
      await substep("session-revoked-direct-http", async () =>
        unavailable(await request(ownerSession.cookie)),
      );
      await documentAction("session-revoked-next-document", () =>
        page.getByRole("link", { name: "Next page", exact: true }).click(),
      );
      await substep("session-revoked-next-has-no-rows", async () => {
        await page
          .getByRole("heading", { name: "Directory unavailable", exact: true })
          .waitFor();
        assert.equal(await rows().count(), 0);
      });
      // A real document response is required. An outgoing heading cannot satisfy
      // this step; stale restored rows remain a failure, never fixed by a test reload.
      await documentAction("session-revoked-back-document", () =>
        page.goBack(),
      );
      await substep("session-revoked-back-has-no-rows", async () => {
        await page
          .getByRole("heading", { name: "Directory unavailable", exact: true })
          .waitFor();
        assert.equal(await rows().count(), 0);
      });
      await documentAction("session-revoked-forward-document", () =>
        page.goForward(),
      );
      await substep("session-revoked-forward-has-no-rows", async () => {
        await page
          .getByRole("heading", { name: "Directory unavailable", exact: true })
          .waitFor();
        assert.equal(await rows().count(), 0);
      });
    },
  );
  await phase("fresh session recovery then membership revocation", async () => {
    ownerSession = await session(owner);
    await context.clearCookies();
    await context.addCookies([
      {
        name: "sb-127-auth-token",
        value: ownerSession.cookie,
        url: origin,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await documentAction("membership-before-revocation-fresh-document", () =>
      page.goto(origin + "/os/customer-directory"),
    );
    await rows().first().waitFor();
    assert.equal(await rows().count(), 25);
    await substep("revoke-current-membership", () =>
      admin.query(
        "update kxra.organisation_memberships set state='REVOKED',revoked_at=clock_timestamp(),version=version+1 where id=$1",
        [membership],
      ),
    );
    await substep("membership-revoked-direct-http", async () =>
      unavailable(await request(ownerSession.cookie)),
    );
    await documentAction("membership-revoked-next-document", () =>
      page.getByRole("link", { name: "Next page", exact: true }).click(),
    );
    await substep("membership-revoked-next-has-no-rows", async () => {
      await page
        .getByRole("heading", { name: "Access unavailable", exact: true })
        .waitFor();
      assert.equal(await rows().count(), 0);
    });
    await documentAction("membership-revoked-back-document", () =>
      page.goBack(),
    );
    await substep("membership-revoked-back-has-no-rows", async () => {
      await page
        .getByRole("heading", { name: "Access unavailable", exact: true })
        .waitFor();
      assert.equal(await rows().count(), 0);
    });
    await documentAction("membership-revoked-forward-document", () =>
      page.goForward(),
    );
    await substep("membership-revoked-forward-has-no-rows", async () => {
      await page
        .getByRole("heading", { name: "Access unavailable", exact: true })
        .waitFor();
      assert.equal(await rows().count(), 0);
    });
  });
  assert.equal(browserDenied, 0);
  assert.deepEqual(pageErrors, []);
  assert.ok(!fs.existsSync(path.join(runtime, "network-denials.log")));
  report.authRequests = authCounts;
  report.passed = true;
} catch (error) {
  report.failure = { ...safeFailure(error), ...report.active };
  try {
    const visible = browser
      ?.contexts()
      .flatMap((context) => context.pages())
      .find((page) => !page.isClosed());
    if (visible) {
      await visible.screenshot({
        path: path.join(runtime, "failure-state.png"),
        fullPage: true,
        timeout: 5000,
      });
      report.failureScreenshotStored = true;
    }
  } catch {
    report.failureScreenshotStored = false;
  }
} finally {
  const cleanup = { clean: false, leaseReleased: false, errors: [] };
  try {
    if (browser) await bounded(browser.close(), 15000, "BROWSER_CLOSE_TIMEOUT");
    cleanup.browserClosed = true;
  } catch {
    cleanup.errors.push("BROWSER_CLOSE_FAILED");
  }
  try {
    cleanup.next = await stopApp();
  } catch (error) {
    cleanup.errors.push(error.message);
  }
  try {
    for (const connection of authSockets) connection.destroy();
    if (auth?.listening)
      await bounded(
        new Promise((resolve, reject) =>
          auth.close((error) => (error ? reject(error) : resolve())),
        ),
        5000,
        "AUTH_CLOSE_TIMEOUT",
      );
    await new Promise((resolve) => setImmediate(resolve));
    cleanup.authClosed = !auth?.listening && authSockets.size === 0;
  } catch {
    cleanup.errors.push("AUTH_CLOSE_FAILED");
  }
  const closed = await Promise.allSettled(
    clients.map((client) =>
      bounded(client.end(), 10000, "DATABASE_CLIENT_CLOSE_TIMEOUT"),
    ),
  );
  cleanup.databaseClientsClosed = closed.every(
    (entry) => entry.status === "fulfilled",
  );
  try {
    const pidFile = path.join(dir, "postmaster.pid");
    if (fs.existsSync(pidFile)) {
      const lines = fs.readFileSync(pidFile, "utf8").split("\n");
      const pid = Number(lines[0]);
      assertPostgresOwnership(
        postgresOwnership,
        lines,
        postgresProcessIdentity(pid),
      );
      pgRun("pg_ctl", ["-D", dir, "-m", "fast", "-w", "stop"], 30000);
    }
    const status = postgresAttempted
      ? spawnSync(path.join(bin, "pg_ctl"), ["-D", dir, "status"], {
          env,
          timeout: 5000,
        })
      : { status: 3 };
    cleanup.postgresStopped =
      status.status === 3 &&
      !fs.existsSync(pidFile) &&
      (!postgresPid || absent(postgresPid)) &&
      !fs.existsSync(path.join(socket, ".s.PGSQL." + dbPort));
  } catch (error) {
    cleanup.errors.push(error.message);
  }
  try {
    assert.equal(git("status", "--porcelain"), "");
    assert.equal(git("rev-parse", "HEAD"), sourceCommit);
    for (const [file, hash] of Object.entries(sourceHashes))
      assert.equal(digest(fs.readFileSync(path.join(root, file))), hash, file);
    cleanup.frozenSourceUnchanged = true;
    report.generatedSourceReconciliation = [];
    report.executedSourceSha256 = {};
    for (const [file, hash] of Object.entries(sourceHashes)) {
      const actual = fs.readFileSync(path.join(source, file));
      const actualHash = digest(actual);
      report.executedSourceSha256[file] = actualHash;
      if (actualHash !== hash) {
        assertGeneratedNextEnv(
          file,
          fs.readFileSync(path.join(root, file), "utf8"),
          actual.toString("utf8"),
          applicationNext("os", source).version,
        );
        report.generatedSourceReconciliation.push({
          file,
          sourceSha256: hash,
          executedSha256: actualHash,
          classification: "EXACT_NEXT_16_4_3_DEVELOPMENT_TYPE_IMPORTS_ONLY",
        });
      }
    }
    cleanup.runtimeSourceUnchanged =
      report.generatedSourceReconciliation.length === 0;
    cleanup.runtimeSourceVerified = true;
  } catch {
    cleanup.errors.push(
      cleanup.frozenSourceUnchanged
        ? "RUNTIME_SOURCE_CHANGED"
        : "FROZEN_SOURCE_CHANGED",
    );
  }
  cleanup.clean =
    cleanup.browserClosed &&
    cleanup.next?.clean &&
    cleanup.authClosed &&
    cleanup.databaseClientsClosed &&
    cleanup.postgresStopped &&
    cleanup.frozenSourceUnchanged &&
    cleanup.runtimeSourceVerified &&
    cleanup.errors.length === 0;
  report.authRequests = { ...authCounts };
  report.networkDenialObserved = fs.existsSync(
    path.join(runtime, "network-denials.log"),
  );
  report.networkDenials = report.networkDenialObserved
    ? fs
        .readFileSync(path.join(runtime, "network-denials.log"), "utf8")
        .trim()
        .split("\n")
        .slice(0, 100)
        .map((line) => JSON.parse(line))
    : [];
  report.cleanup = cleanup;
  report.cancelled = cancelled;
  report.asynchronousFailure = asynchronousFailure?.message || null;
  report.passed = report.passed && cleanup.clean && !asynchronousFailure;
  write("receipt.json", report);
  write("cleanup.json", cleanup);
  if (cleanup.clean && release) {
    release();
    cleanup.leaseReleased = true;
    write("receipt.json", report);
    write("cleanup.json", cleanup);
  }
  process.removeListener("SIGINT", onInt);
  process.removeListener("SIGTERM", onTerm);
}
console.log(
  JSON.stringify(
    { runtime, sourceCommit, passed: report.passed, cleanup: report.cleanup },
    null,
    2,
  ),
);
if (!report.passed) process.exitCode = 1;
