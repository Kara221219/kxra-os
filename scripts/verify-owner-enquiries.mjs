// Explicit local serial window only. No hosted/provider acceptance.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import {
  classifyPostgresStartup,
  postgresStartupObservation,
  captureCoherentPostgresStartup,
} from "./postgres-startup-candidate.mjs";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import {
  processBirth,
  observeOwnedProcesses,
} from "./owner-enquiry-proof-ownership.mjs";
import { postgresBin } from "./postgres-bin.mjs";
import {
  assertPostgresOwnership,
  assertGeneratedNextEnv,
} from "./customer-directory-joined-ownership.mjs";
assert.deepEqual(
  process.argv.slice(2),
  ["--reviewed-local-window"],
  "EXPLICIT_SERIAL_WINDOW_REQUIRED",
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
const sourceCommit = git("rev-parse", "HEAD"),
  sourceTree = git("rev-parse", "HEAD^{tree}");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const manifest = git("ls-tree", "-r", "-z", "HEAD")
  .split("\0")
  .filter(Boolean)
  .map((entry) => {
    const [metadata, file] = entry.split("\t"),
      [mode, type, blob] = metadata.split(" ");
    assert.ok(
      type === "blob" && ["100644", "100755"].includes(mode),
      "UNSUPPORTED_TRACKED_FILE_MODE",
    );
    const actual = fs.lstatSync(path.join(root, file));
    assert.ok(
      actual.isFile() && !actual.isSymbolicLink(),
      "TRACKED_FILE_TYPE_CHANGED",
    );
    const bytes = fs.readFileSync(path.join(root, file));
    const committed = execFileSync("git", ["cat-file", "blob", blob], {
      cwd: root,
      timeout: 10000,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.ok(
      bytes.equals(committed),
      "WORKTREE_BYTES_DIFFER_FROM_HEAD:" + file,
    );
    assert.equal(
      actual.mode & 0o111,
      mode === "100755" ? 0o111 : 0,
      "WORKTREE_MODE_DIFFERS_FROM_HEAD:" + file,
    );
    return {
      path: file,
      mode,
      blob,
      sha256: hash(bytes),
    };
  });
for (const folder of ["", "apps/os", "apps/marketing", "apps/email-worker"])
  for (const name of [
    ".env",
    ".env.local",
    ".env.development",
    ".env.development.local",
    ".env.production",
    ".env.production.local",
  ])
    assert.ok(
      !fs.existsSync(path.join(root, folder, name)),
      "AMBIENT_ENV_FILE_REJECTED",
    );
const runtime = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-enquiry-proof-"));
fs.chmodSync(runtime, 0o700);
const home = path.join(runtime, "home");
fs.mkdirSync(home, { mode: 0o700 });
const report = {
  classification: "LOCAL_SYNTHETIC119_NOT_HOSTED_ACCEPTANCE",
  sourceCommit,
  sourceTree,
  manifest,
  runtime,
  phases: [],
  sourceSnapshots: [],
  passed: false,
};
const save = () =>
  fs.writeFileSync(
    path.join(runtime, "receipt.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
const generated = "apps/os/next-env.d.ts",
  original = fs.readFileSync(path.join(root, generated), "utf8");
function snapshot(label, allowGenerated = false) {
  assert.equal(git("rev-parse", "HEAD"), sourceCommit, "SOURCE_HEAD_CHANGED");
  assert.equal(
    git("rev-parse", "HEAD^{tree}"),
    sourceTree,
    "SOURCE_TREE_CHANGED",
  );
  const changes = [];
  for (const entry of manifest) {
    const file = path.join(root, entry.path),
      stat = fs.lstatSync(file);
    assert.ok(
      stat.isFile() && !stat.isSymbolicLink(),
      "TRACKED_FILE_TYPE_CHANGED",
    );
    assert.equal(
      stat.mode & 0o111,
      entry.mode === "100755" ? 0o111 : 0,
      "TRACKED_EXECUTABLE_MODE_CHANGED",
    );
    const bytes = fs.readFileSync(file),
      actual = hash(bytes);
    if (actual !== entry.sha256) {
      assert.ok(
        allowGenerated && entry.path === generated,
        "UNEXPECTED_TRACKED_DRIFT:" + entry.path,
      );
      assertGeneratedNextEnv(generated, original, bytes.toString(), "16.4.3");
      fs.writeFileSync(path.join(runtime, "next-env-generated.d.ts"), bytes, {
        mode: 0o600,
      });
      changes.push({ path: entry.path, before: entry.sha256, after: actual });
    }
  }
  const status = git("status", "--porcelain");
  assert.ok(
    status === "" || (allowGenerated && status === `M ${generated}`),
    "UNEXPECTED_WORKTREE_CHANGE",
  );
  report.sourceSnapshots.push({ label, changes });
  save();
}
function processes() {
  const result = spawnSync(
    "ps",
    ["-axo", "pid=,ppid=,pgid=,lstart=,command="],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(result.status, 0, "PROCESS_INSPECTION_UNCERTAIN");
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const m = line
        .trim()
        .match(
          /^(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\S+\s+\d+)\s+(.*)$/,
        );
      assert.ok(m, "PROCESS_RECORD_UNPARSEABLE");
      return {
        pid: Number(m[1]),
        ppid: Number(m[2]),
        pgid: Number(m[3]),
        birth: m[4].replace(/\s+/g, " "),
        command: m[5],
      };
    });
}
const identity = processBirth;
const pgIdentity = (pid) => {
  const p = processes().find((p) => p.pid === pid);
  assert.ok(p, "POSTGRES_PROCESS_MISSING");
  return { birth: p.birth, command: p.command };
};
let cancelled = null;
const onInt = () => {
    cancelled = "SIGINT";
  },
  onTerm = () => {
    cancelled = "SIGTERM";
  };
process.on("SIGINT", onInt);
process.on("SIGTERM", onTerm);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function check() {
  assert.equal(cancelled, null, "RUN_CANCELLED");
}
async function freePort() {
  const s = net.createServer();
  await new Promise((resolve, reject) => {
    s.once("error", reject);
    s.listen(0, "127.0.0.1", resolve);
  });
  const port = s.address().port;
  await new Promise((resolve) => s.close(resolve));
  return port;
}
const appPort = await freePort(),
  pgPort = await freePort();
assert.notEqual(pgPort, 5432);
assert.notEqual(appPort, pgPort);
const env = {
  PATH: process.env.PATH,
  HOME: home,
  USER: os.userInfo().username,
  TMPDIR: runtime,
  LANG: "C",
  LC_ALL: "C",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_ENV: "development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_RUNTIME: runtime,
  KXRA_ORIGIN: `http://127.0.0.1:${appPort}`,
  KXRA_PG_PORT: String(pgPort),
  KXRA_CI_RUN_ID: crypto.randomUUID(),
  PLAYWRIGHT_BROWSERS_PATH: fs.realpathSync(
    path.join(os.homedir(), "Library/Caches/ms-playwright"),
  ),
};
report.origin = env.KXRA_ORIGIN;
report.pgPort = pgPort;
report.runId = env.KXRA_CI_RUN_ID;
const owned = [];
let postgresOwnership, release, failure;
function launch(name, args) {
  const fd = fs.openSync(path.join(runtime, name + ".log"), "wx", 0o600);
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    detached: true,
    stdio: ["ignore", fd, fd],
  });
  const record = {
    name,
    args,
    child,
    fd,
    pid: child.pid,
    identity: null,
    seen: new Map(),
    error: null,
  };
  owned.push(record);
  child.on("error", (error) => {
    record.error = error;
  });
  if (child.pid) {
    const p = processes().find((p) => p.pid === child.pid);
    assert.ok(p, "CHILD_BIRTH_IDENTITY_MISSING");
    record.identity = identity(p);
    record.initialCommand = p.command;
    record.seen.set(p.pid, { ...p });
  }
  return record;
}
function observe(record) {
  return observeOwnedProcesses(record, processes());
}
function signalOwned(record, pid, signal) {
  const current = processes().find((p) => p.pid === pid);
  if (!current) return;
  const proven = record.seen.get(pid);
  assert.ok(proven, "UNPROVEN_PROCESS_SIGNAL_REFUSED");
  assert.deepEqual(
    identity(current),
    identity(proven),
    "PROCESS_BIRTH_CHANGED_BEFORE_SIGNAL",
  );
  process.kill(pid, signal);
}
async function stop(record) {
  if (!record.pid) return { name: record.name, clean: !record.error };
  observe(record);
  // Let the test/server root close children normally before cleaning up any
  // proven survivors. Chromium may be detached into a different process group.
  signalOwned(record, record.pid, "SIGTERM");
  for (let i = 0; i < 30 && observe(record).length; i++) await pause(100);
  for (const process of observe(record).reverse())
    signalOwned(record, process.pid, "SIGTERM");
  for (let i = 0; i < 30 && observe(record).length; i++) await pause(100);
  for (const process of observe(record).reverse())
    signalOwned(record, process.pid, "SIGKILL");
  for (let i = 0; i < 30 && observe(record).length; i++) await pause(100);
  assert.equal(observe(record).length, 0, "OWNED_DESCENDANT_REMAINS");
  return {
    name: record.name,
    pid: record.pid,
    identity: record.identity,
    initialCommand: record.initialCommand,
    observed: [...record.seen.values()],
    clean: true,
  };
}
function readPostgresPidFile(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
function capturePg() {
  if (postgresOwnership) return;
  const file = path.join(runtime, "postgres/postmaster.pid");
  const expected = {
    dir: path.join(runtime, "postgres"),
    socket: path.join(runtime, "socket"),
    port: pgPort,
  };
  const first = readPostgresPidFile(file);
  const observation = {
    at: new Date().toISOString(),
    ...postgresStartupObservation(first),
  };
  (report.postgresStartupObservations ||= []).push(observation);
  try {
    const candidate = classifyPostgresStartup(first, expected);
    observation.reason = candidate.reason;
    observation.kind = candidate.kind;
    save();
    if (candidate.kind === "NOT_READY") return;
    // Only a complete ready server record can trigger a process lookup.
    // Any missing/replaced process or changed second read fails this attempt.
    const firstProcess = pgIdentity(candidate.pid);
    const second = readPostgresPidFile(file);
    const secondProcess = pgIdentity(candidate.pid);
    postgresOwnership = captureCoherentPostgresStartup(
      first,
      second,
      firstProcess,
      secondProcess,
      expected,
    );
    report.postgresOwnership = postgresOwnership;
    save();
  } catch (error) {
    observation.reason = String(error.message).split("\n")[0];
    observation.kind = "REJECTED";
    save();
    throw error;
  }
}
async function run(name, args, timeout = 12 * 60_000) {
  snapshot(name + "-before", true);
  const record = launch(name, args),
    start = Date.now();
  try {
    while (record.child.exitCode === null && record.child.signalCode === null) {
      check();
      if (record.error) throw record.error;
      observe(record);
      assert.ok(Date.now() - start < timeout, "TEST_PHASE_TIMEOUT");
      await pause(200);
    }
    assert.equal(record.child.exitCode, 0, "TEST_PHASE_FAILED:" + name);
    assert.equal(observe(record).length, 0, "TEST_GROUP_REMAINS");
    report.phases.push({
      name,
      exit: record.child.exitCode,
      pid: record.pid,
      identity: record.identity,
    });
    snapshot(name + "-after", true);
    console.log("PASS " + name);
  } finally {
    report.lastPhase = name;
    save();
  }
}
save();
try {
  snapshot("initial");
  release = acquireNativeFixtureLease("owner-enquiry-management");
  report.leaseOwnerPid = process.pid;
  save();
  const server = launch("application", ["scripts/local.mjs"]);
  report.application = { pid: server.pid, identity: server.identity };
  let ready = false;
  for (let i = 0; i < 180; i++) {
    check();
    if (server.error) throw server.error;
    assert.ok(
      server.child.exitCode === null && server.child.signalCode === null,
      "SERVER_EXITED",
    );
    observe(server);
    capturePg();
    try {
      const r = await fetch(env.KXRA_ORIGIN + "/api/health", {
        signal: AbortSignal.timeout(1500),
      });
      const data = await r.json();
      if (r.ok && data.run_id === env.KXRA_CI_RUN_ID) {
        ready = true;
        report.health = data;
        break;
      }
    } catch {}
    await pause(1000);
  }
  assert.ok(ready, "FIXTURE_READINESS_TIMEOUT");
  capturePg();
  assert.ok(postgresOwnership, "POSTGRES_OWNERSHIP_REQUIRED");
  env.KXRA_LOCAL_SECRET = fs.readFileSync(
    path.join(runtime, "session-key"),
    "utf8",
  );
  await run("native", [
    "--conditions=development",
    "--import",
    "tsx",
    "--test",
    "tests/acceptance/owner-enquiries.native.ts",
  ]);
  await run("browser", [
    "node_modules/@playwright/test/cli.js",
    "test",
    "tests/e2e/owner-enquiries.spec.ts",
    "tests/e2e/owner-overview.spec.ts",
    "--max-failures=1",
    "--timeout=90000",
    "--output=" + path.join(runtime, "browser"),
  ]);
  report.passed = true;
} catch (error) {
  failure = error;
  report.failure = String(error.message);
} finally {
  const cleanup = {
    groups: [],
    errors: [],
    clean: false,
    leaseReleased: false,
  };
  for (const record of [...owned].reverse())
    try {
      cleanup.groups.push(await stop(record));
    } catch (error) {
      cleanup.errors.push(String(error.message));
    }
  try {
    const file = path.join(runtime, "postgres/postmaster.pid");
    if (fs.existsSync(file)) {
      assert.ok(postgresOwnership, "UNOWNED_POSTGRES_LEASE_RETAINED");
      assertPostgresOwnership(
        postgresOwnership,
        fs.readFileSync(file, "utf8").split("\n"),
        pgIdentity(postgresOwnership.pid),
      );
      const result = spawnSync(
        path.join(postgresBin(), "pg_ctl"),
        ["-D", postgresOwnership.dir, "-m", "fast", "-w", "stop"],
        { env, encoding: "utf8", timeout: 30000 },
      );
      assert.equal(result.status, 0, "POSTGRES_STOP_FAILED");
    }
    assert.ok(!fs.existsSync(file), "POSTGRES_PID_FILE_REMAINS");
    assert.ok(
      !fs.existsSync(path.join(runtime, "socket", `.s.PGSQL.${pgPort}`)),
      "POSTGRES_SOCKET_REMAINS",
    );
    if (postgresOwnership)
      assert.ok(
        !processes().some(
          (p) =>
            p.pid === postgresOwnership.pid &&
            p.birth === postgresOwnership.birth,
        ),
        "POSTGRES_PROCESS_REMAINS",
      );
    // Check both owned TCP ports without probing any unrelated listener.
    for (const port of [appPort, pgPort]) {
      const r = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
        encoding: "utf8",
        timeout: 5000,
      });
      assert.ok(r.status === 0 || r.status === 1, "PORT_INSPECTION_FAILED");
      assert.equal(r.stdout.trim(), "", "OWNED_PORT_STILL_LISTENING");
    }
    // A descendant that detached and reparented between observation intervals
    // is not safe to signal. Its unique runtime marker blocks lease release.
    assert.ok(
      !processes().some(
        (p) => p.pid !== process.pid && p.command.includes(runtime),
      ),
      "UNPROVEN_RUNTIME_DESCENDANT_LEASE_RETAINED",
    );
    cleanup.postgresStopped = true;
  } catch (error) {
    cleanup.errors.push(String(error.message));
  }
  try {
    snapshot("cleanup-before-generated-restore", true);
    const actual = fs.readFileSync(path.join(root, generated), "utf8");
    if (actual !== original) {
      assertGeneratedNextEnv(generated, original, actual, "16.4.3");
      fs.writeFileSync(path.join(runtime, "next-env-original.d.ts"), original, {
        mode: 0o600,
      });
      fs.writeFileSync(path.join(root, generated), original);
      cleanup.generatedRestored = true;
    }
    snapshot("final");
    cleanup.sourceVerified = true;
  } catch (error) {
    cleanup.errors.push(String(error.message));
  }
  cleanup.clean =
    cleanup.errors.length === 0 &&
    cleanup.groups.every((g) => g.clean) &&
    cleanup.postgresStopped &&
    cleanup.sourceVerified;
  if (cleanup.clean && release) {
    release();
    cleanup.leaseReleased = true;
  }
  for (const record of owned) fs.closeSync(record.fd);
  report.cleanup = cleanup;
  report.passed = report.passed && cleanup.clean;
  save();
  process.removeListener("SIGINT", onInt);
  process.removeListener("SIGTERM", onTerm);
  console.log(
    JSON.stringify({
      runtime,
      sourceCommit,
      sourceTree,
      passed: report.passed,
      cleanup,
    }),
  );
}
if (failure || !report.passed) process.exitCode = 1;
