import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
if (process.argv.slice(2).join(" ") !== "--synthetic")
  throw Error("Use --synthetic only");
const bin = "/opt/homebrew/opt/postgresql@17/bin";
if (!fs.existsSync(path.join(bin, "initdb")))
  throw Error("Pinned local PostgreSQL17 unavailable");
const release = acquireNativeFixtureLease("billing-refresh-session");
const root = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-rs-"));
fs.chmodSync(root, 0o700);
const socket = path.join(root, "socket");
fs.mkdirSync(socket, { mode: 0o700 });
const data = path.join(root, "postgres"),
  port = 55491;
const env = { PATH: "/usr/bin:/bin", HOME: root, LANG: "C", LC_ALL: "C" };
let attempted = false,
  stopped = false,
  result = "FAIL",
  testExit = null;
function run(file, args, extra = {}) {
  const r = spawnSync(file, args, {
    cwd: process.cwd(),
    env: { ...env, ...extra },
    encoding: "utf8",
    timeout: 120000,
  });
  fs.appendFileSync(
    path.join(root, "run.log"),
    `${r.stdout ?? ""}${r.stderr ?? ""}`,
  );
  if (r.error || r.status !== 0) throw Error("OWNED_FIXTURE_COMMAND_FAILED");
  return r;
}
try {
  run(path.join(bin, "initdb"), ["-D", data, "-A", "trust", "--no-locale"]);
  attempted = true;
  run(path.join(bin, "pg_ctl"), [
    "-D",
    data,
    "-l",
    path.join(root, "postgres.log"),
    "-o",
    `-F -k ${socket} -p ${port} -h ''`,
    "-w",
    "start",
  ]);
  const sql = `create role kxra_billing_worker nologin nosuperuser nobypassrls; create role kxra_billing_runner login noinherit nosuperuser nobypassrls; grant kxra_billing_worker to kxra_billing_runner;
create table public.fixture_scope_probe(scope text); insert into public.fixture_scope_probe values('A'),('B'); alter table public.fixture_scope_probe enable row level security; create policy isolated on public.fixture_scope_probe to kxra_billing_worker using(scope=current_setting('request.fixture_scope',true)); grant select on public.fixture_scope_probe to kxra_billing_worker;
create function public.fixture_scope_read() returns table(scope text) language plpgsql security invoker set search_path='' as $$begin perform set_config('request.fixture_scope','A',true);return query select p.scope from public.fixture_scope_probe p;end$$; revoke all on function public.fixture_scope_read() from public; grant execute on function public.fixture_scope_read() to kxra_billing_worker;`;
  const bootstrap = path.join(root, "bootstrap.sql");
  fs.writeFileSync(bootstrap, sql, { mode: 0o600 });
  run(path.join(bin, "psql"), [
    "-h",
    socket,
    "-p",
    String(port),
    "-U",
    os.userInfo().username,
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    bootstrap,
  ]);
  fs.writeFileSync(
    path.join(root, "fixture.json"),
    JSON.stringify({
      host: socket,
      port,
      user: "kxra_billing_runner",
      database: "postgres",
    }),
    { mode: 0o600 },
  );
  const r = run(
    process.execPath,
    [
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=1",
      "tests/billing-refresh-session/native.test.ts",
    ],
    {
      NODE_ENV: "development",
      KXRA_AUTH_MODE: "fixture",
      KXRA_ORIGIN: "http://127.0.0.1:55492",
      KXRA_RUNTIME: root,
      KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
    },
  );
  testExit = r.status;
  result = "PASS";
} finally {
  if (attempted) {
    const r = spawnSync(
      path.join(bin, "pg_ctl"),
      ["-D", data, "-m", "fast", "-w", "stop"],
      { env, encoding: "utf8", timeout: 30000 },
    );
    fs.appendFileSync(
      path.join(root, "run.log"),
      `${r.stdout ?? ""}${r.stderr ?? ""}`,
    );
    const status = spawnSync(path.join(bin, "pg_ctl"), ["-D", data, "status"], {
      env,
      encoding: "utf8",
      timeout: 5000,
    });
    stopped = status.status === 3;
  } else stopped = true;
  const receipt = {
    kind: "OWNED_SYNTHETIC_REFRESH_SESSION",
    runtime: root,
    result,
    test_exit: testExit,
    provider_calls: false,
    hosted: false,
    owned_postgres_stopped: stopped,
    lease_released: stopped,
    base_commit: "d60a463941bc10430dccf359f8b189a4d6e1107e",
    proof_sources: Object.fromEntries(
      [
        "packages/integrations/billing-refresh-session.ts",
        "packages/integrations/billing-http-runtime.ts",
        "tests/billing-refresh-session/native.test.ts",
        "scripts/verify-billing-refresh-session.mjs",
      ].map((file) => [
        file,
        crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      ]),
    ),
  };
  if (stopped) release();
  fs.writeFileSync(
    path.join(root, "receipt.json"),
    JSON.stringify(receipt, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(receipt));
  if (!stopped) throw Error("OWNED_FIXTURE_STOP_UNCONFIRMED_LEASE_RETAINED");
}
