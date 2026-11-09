import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  capturePostgresOwnership,
  assertPostgresOwnership,
  captureDatabaseClientFailure,
  ownedWebSocketUrl,
  assertGeneratedNextEnv,
  safeFailure,
  directoryNavigationKind,
  joinedProofAcceptance,
} from "../scripts/customer-directory-joined-ownership.mjs";

const root = path.resolve(import.meta.dirname, "..");
test("joined proof cannot run implicitly or borrow fixture/auth or customer-directory ports", () => {
  const source = fs.readFileSync(
    path.join(root, "scripts/verify-customer-directory-joined.mjs"),
    "utf8",
  );
  assert.ok(
    source.indexOf('"EXPLICIT_SERIAL_WINDOW_REQUIRED"') <
      source.indexOf("fs.mkdtempSync"),
  );
  assert.ok(source.includes('git("status", "--porcelain")'));
  assert.ok(source.includes("applicationCatalog(admin, 126)"));
  assert.ok(source.includes('applicationNext("os", source)'));
  assert.ok(source.includes("custom_app_access_token_hook"));
  assert.ok(!source.includes("readCustomerDirectory("));
  assert.ok(!source.includes("resolveVerifiedSupabasePrincipal("));
  assert.ok(!source.includes("identity: async"));
  assert.ok(source.includes("sourceHashes"));
  assert.ok(source.includes("RUNTIME_SOURCE_CHANGED"));
  assert.ok(source.includes("OWNED_NEXT_GROUP_CLEANUP_UNCERTAIN"));
  assert.ok(source.includes("OWNED_NEXT_IDENTITY_CHANGED"));
  assert.ok(source.includes("if (cleanup.clean && release)"));
  assert.ok(source.includes('"KXRA_CUSTOM_APPS_ENABLED"'));
  assert.ok(!source.includes('KXRA_CUSTOM_APPS_ENABLED: "true"'));
});

test("loopback preload rejects foreign targets before any IO and preserves approved targets", () => {
  const runtime = fs.realpathSync(
    fs.mkdtempSync("/tmp/kxra-directory-joined-"),
  );
  fs.chmodSync(runtime, 0o700);
  const nonce = "synthetic-pure-guard-test";
  fs.writeFileSync(
    path.join(runtime, "ownership.json"),
    JSON.stringify({
      nonce,
      socket: runtime + "/socket",
      databasePort: 55510,
      httpPorts: [32210, 32211],
    }),
    { mode: 0o600 },
  );
  const program = `
    const assert = require('node:assert/strict');
    const net = require('node:net');
    const http = require('node:http');
    // Stub actual transports BEFORE the guard. This pure test opens no socket/server.
    globalThis.fetch = async () => new Response('synthetic-allowed');
    net.Socket.prototype.connect = function() { return this; };
    http.request = http.get = () => 'synthetic-http';
    require(${JSON.stringify(path.join(root, "scripts/customer-directory-loopback-guard.cjs"))});
    (async () => {
      assert.equal(await (await fetch('http://127.0.0.1:32210/owned')).text(), 'synthetic-allowed');
      assert.equal(await (await fetch(new Request('http://127.0.0.1:32211/auth/v1/user'))).text(), 'synthetic-allowed');
      assert.equal(http.request({ hostname: '127.0.0.1', port: 32210 }), 'synthetic-http');
      const s = new net.Socket();
      assert.equal(s.connect({ path: ${JSON.stringify(runtime + "/socket/.s.PGSQL.55510")} }), s);
      assert.equal(s.connect([{ host: '127.0.0.1', port: 32210 }]), s);
      assert.equal(s.connect({ host: '127.0.0.1', port: 55510 }), s);
      assert.equal(http.request('http://127.0.0.1:32210/owned', { headers: { accept: 'text/plain' } }), 'synthetic-http');
      const forbidden = [
        () => fetch('http://127.0.0.1:55510'),
        () => http.request({ hostname: '127.0.0.1', port: 55510 }),
        () => s.connect({ host: '127.0.0.1', port: 55511 }),
        () => fetch('https://example.invalid'),
        () => fetch('http://example.invalid:32210'),
        () => fetch('http://127.0.0.1:32212'),
        () => fetch('http://user:secret@127.0.0.1:32210'),
        () => http.get({ hostname: 'example.invalid', port: 32210 }),
        () => require('node:https').request('https://127.0.0.1:32210'),
        () => s.connect({ path: '/tmp/foreign.sock' }),
        () => s.connect({ host: 'example.invalid', port: 32210 }),
        () => s.connect({ host: 'localhost', port: 32210, lookup: (_, __, done) => done(null, '192.0.2.1', 4) }),
        () => s.connect({ host: '127.0.0.1', port: 32210, lookup: () => {} }),
        () => http.request('http://127.0.0.1:32210', { hostname: '192.0.2.1' }),
        () => http.request('http://127.0.0.1:32210', { port: 443 }),
        () => http.request({ hostname: '127.0.0.1', port: 32210, agent: { createConnection() {} } }),
        () => http.request({ hostname: '127.0.0.1', port: 32210, createConnection() {} }),
        () => http.request({ hostname: '127.0.0.1', port: 32210, lookup() {} }),
        () => fetch('http://127.0.0.1:32210', { dispatcher: { dispatch() {} } }),
        () => http.request('http://127.0.0.1:32210', { createConnection() {} }),
        () => s.connect({ host: '127.0.0.1', port: 32210, fd: 8 }),
        () => http.request({ hostname: '127.0.0.1', host: '192.0.2.1', port: 32210 }),
        () => fetch('http://localhost:32210'),
        () => http.request('http://127.0.0.1:32210', { socketPath: '/tmp/foreign.sock' }),
        () => s.connect({ host: 'localhost', port: 32210 }),
      ];
      for (const action of forbidden) assert.throws(action, /NON_OWNED_NETWORK_TARGET/);
    })().catch(() => { process.exitCode = 1; });
  `;
  try {
    const result = spawnSync(process.execPath, ["-e", program], {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        KXRA_JOINED_RUNTIME: runtime,
        KXRA_CI_RUN_ID: nonce,
      },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    const denied = fs.readFileSync(
      path.join(runtime, "network-denials.log"),
      "utf8",
    );
    assert.equal(denied.trim().split("\n").length, 25);
    assert.ok(!denied.includes("secret"));
    assert.ok(!denied.includes("example"));
    for (const line of denied.trim().split("\n")) {
      const record = JSON.parse(line);
      assert.deepEqual(Object.keys(record).sort(), [
        "caller",
        "reason",
        "targetClass",
      ]);
      assert.match(record.reason, /^[A-Z_]+$/);
      assert.match(record.targetClass, /^[A-Z_]+$/);
    }
  } finally {
    // Exact temporary directory made by this pure test only, never a native lease.
    fs.rmSync(runtime, { recursive: true });
  }
});

test("PostgreSQL stop requires the captured PID, birth, epoch, command and owned tuple", () => {
  const expected = {
    dir: "/private/tmp/synthetic/postgres",
    socket: "/private/tmp/synthetic/socket",
    port: 55510,
  };
  const lines = ["1234", expected.dir, "1780000000", "55510", expected.socket];
  const process = {
    birth: "1234 Mon Nov 9 12:00:00 2026",
    command: "postgres -D " + expected.dir,
  };
  const record = capturePostgresOwnership(lines, process, expected);
  assert.equal(Object.isFrozen(record), true);
  assert.doesNotThrow(() => assertPostgresOwnership(record, lines, process));
  assert.throws(
    () => assertPostgresOwnership(undefined, lines, process),
    /BIRTH_IDENTITY_MISSING/,
  );
  for (const [index, value] of [
    [0, "9999"],
    [1, "/tmp/foreign"],
    [2, "1780000001"],
    [3, "55511"],
    [4, "/tmp/foreign-socket"],
  ] as const) {
    const changed = [...lines];
    changed[index] = value;
    assert.throws(() => assertPostgresOwnership(record, changed, process));
  }
  // A recycled PID still has the same PID-file tuple but a different birth.
  assert.throws(
    () =>
      assertPostgresOwnership(record, lines, {
        ...process,
        birth: "1234 Mon Nov 9 13:00:00 2026",
      }),
    /IDENTITY_CHANGED/,
  );
  assert.throws(
    () =>
      assertPostgresOwnership(record, lines, {
        ...process,
        command: "unrelated-process",
      }),
    /IDENTITY_UNCERTAIN/,
  );
});

test("idle database errors are captured without uncaught EventEmitter errors or raw detail", () => {
  const client = new EventEmitter();
  const failures: string[] = [];
  captureDatabaseClientFailure(client, (code: string) => failures.push(code));
  assert.doesNotThrow(() =>
    client.emit("error", Error("synthetic-private-connection-detail")),
  );
  assert.deepEqual(failures, ["ASYNC_DATABASE_CLIENT_FAILURE"]);
});

test("WebSocket routing allows only exact owned literal origins without credentials", () => {
  const allowed = ["ws://127.0.0.1:32210", "ws://127.0.0.1:32211"];
  assert.equal(
    ownedWebSocketUrl(allowed[0] + "/_next/webpack-hmr", allowed),
    true,
  );
  for (const value of [
    "ws://localhost:32210",
    "ws://127.0.0.1:32212",
    "wss://127.0.0.1:32210",
    "ws://user:secret@127.0.0.1:32210",
    "ws://example.invalid:32210",
    "not-a-url",
  ])
    assert.equal(ownedWebSocketUrl(value, allowed), false);
  const source = fs.readFileSync(
    path.join(root, "scripts/verify-customer-directory-joined.mjs"),
    "utf8",
  );
  assert.ok(
    source.indexOf('context.routeWebSocket("**/*"') <
      source.indexOf("context.newPage()"),
  );
  assert.ok(source.includes('serviceWorkers: "block"'));
});

test("only exact observed Next16 development import generation is reconciled", () => {
  const original = fs.readFileSync(
    path.join(root, "apps/os/next-env.d.ts"),
    "utf8",
  );
  const generated = original.replaceAll(
    '"./.next/types/',
    '"./.next-dev/dev/types/',
  );
  assert.doesNotThrow(() =>
    assertGeneratedNextEnv(
      "apps/os/next-env.d.ts",
      original,
      generated,
      "16.4.3",
    ),
  );
  for (const actual of [
    generated + "\n",
    generated.replace("root-params", "different"),
    generated.replace("next/image", "foreign/image"),
  ])
    assert.throws(() =>
      assertGeneratedNextEnv(
        "apps/os/next-env.d.ts",
        original,
        actual,
        "16.4.3",
      ),
    );
  assert.throws(() =>
    assertGeneratedNextEnv("apps/os/other.ts", original, generated, "16.4.3"),
  );
  assert.throws(() =>
    assertGeneratedNextEnv(
      "apps/os/next-env.d.ts",
      original + "\n",
      generated,
      "16.4.3",
    ),
  );
  assert.throws(() =>
    assertGeneratedNextEnv(
      "apps/os/next-env.d.ts",
      original,
      generated,
      "16.4.4",
    ),
  );
});
test("failure and navigation diagnostics retain useful location without raw secrets or URLs", () => {
  const failure = safeFailure({
    name: "AssertionError",
    message:
      "synthetic-secret https://user:secret@example.invalid/?cursor=private",
    actual: 25,
    expected: 0,
    stack:
      "Error: secret\n at step (/private/tmp/private-source/scripts/verify-customer-directory-joined.mjs:900:12)",
  });
  assert.deepEqual(failure.stack, [
    {
      file: "scripts/verify-customer-directory-joined.mjs",
      line: 900,
      column: 12,
    },
  ]);
  assert.equal(failure.actual, 25);
  assert.equal(failure.expected, 0);
  assert.ok(!JSON.stringify(failure).includes("secret"));
  assert.ok(!JSON.stringify(failure).includes("/private/tmp"));
  const kind = directoryNavigationKind(
    "http://127.0.0.1:3210/os/customer-directory?cursor=private&organisation_state=ACTIVE",
  );
  assert.deepEqual(kind, {
    directory: true,
    cursor: true,
    filtered: true,
    fragment: false,
  });
  assert.ok(!JSON.stringify(kind).includes("private"));
});

test("shutdown-only denial or browser failure fails final acceptance while safe cleanup can release", () => {
  const beforeShutdown = {
    candidatePassed: true,
    cleanupClean: true,
    asynchronousFailure: null,
    networkDenialObserved: false,
    browserDenied: 0,
    pageErrors: [],
  };
  assert.equal(joinedProofAcceptance(beforeShutdown), true);
  for (const late of [
    { networkDenialObserved: true },
    { browserDenied: 1 },
    { pageErrors: ["Error"] },
    { asynchronousFailure: "ASYNC_DATABASE_CLIENT_FAILURE" },
  ]) {
    const final = { ...beforeShutdown, ...late };
    const receipt = {
      passed: joinedProofAcceptance(final),
      networkDenialObserved: final.networkDenialObserved,
      browserDenied: final.browserDenied,
      pageErrors: final.pageErrors,
      cleanup: { clean: final.cleanupClean, leaseReleased: final.cleanupClean },
    };
    const saved = JSON.parse(JSON.stringify(receipt));
    assert.equal(saved.passed, false);
    assert.equal(saved.cleanup.clean, true);
    assert.equal(saved.cleanup.leaseReleased, true);
  }
  assert.equal(
    joinedProofAcceptance({ ...beforeShutdown, cleanupClean: false }),
    false,
  );
  const source = fs.readFileSync(
    path.join(root, "scripts/verify-customer-directory-joined.mjs"),
    "utf8",
  );
  assert.ok(
    source.indexOf("report.passed = joinedProofAcceptance(") >
      source.indexOf("report.networkDenialObserved = fs.existsSync("),
  );
  assert.ok(source.includes("if (cleanup.clean && release)"));
  assert.ok(!source.includes("if (report.passed && release)"));
});

test("joined execution uses guarded production build/start and visible JavaScript explanation", () => {
  const source = fs.readFileSync(
    path.join(root, "scripts/verify-customer-directory-joined.mjs"),
    "utf8",
  );
  assert.ok(source.includes('NODE_ENV: "production"'));
  assert.ok(source.includes('["build", ...application.webpackArguments]'));
  assert.ok(source.includes('["start", "--hostname", "127.0.0.1"'));
  assert.ok(!source.includes('NODE_ENV: "development"'));
  assert.ok(source.includes("await startApp(false, true)"));
  assert.ok(source.includes("OFFLINE_PRODUCTION_BUILD_FAILED_OR_TIMED_OUT"));
  assert.ok(source.includes("PRODUCTION_TRACKED_SOURCE_MUTATION"));
  assert.ok(source.includes("JavaScript may be disabled or failed to load"));
});

test("production database proof preserves verified TLS and confines ephemeral credentials", () => {
  const source = fs.readFileSync(
    path.join(root, "scripts/verify-customer-directory-joined.mjs"),
    "utf8",
  );
  assert.ok(
    source.includes("KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(databaseCa)"),
  );
  assert.ok(source.includes("postgresql://kxra_app@127.0.0.1:"));
  assert.ok(source.includes("subjectAltName=DNS:localhost,IP:127.0.0.1"));
  assert.ok(source.includes("rejectUnauthorized: true"));
  assert.ok(!source.includes("rejectUnauthorized: false"));
  assert.ok(source.includes("ERR_TLS_CERT_ALTNAME_INVALID"));
  assert.ok(source.includes("NEXT_DATABASE_TLS_CONNECTION_MISSING"));
  assert.ok(
    source.includes("cleanup.postgresStopped && fs.existsSync(tlsDirectory)"),
  );
  assert.ok(source.includes("hostssl postgres kxra_app 127.0.0.1/32 trust"));
});
