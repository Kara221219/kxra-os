// Local PostgreSQL rehearsal only. No hosted target arguments, environment files or credentials.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import {
  applicationReleaseCohort,
  applicationReleasePlan,
} from "./application-release-cohort.mjs";
import { postgresBin } from "./postgres-bin.mjs";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import {
  pairedCompositionCatalog as catalog,
  pairedCompositionData as data,
} from "./paired-composition-catalog.mjs";
assert.equal(process.argv.length, 2, "NO_TARGET_ARGUMENTS_ACCEPTED");
for (const key of [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VERCEL",
  "VERCEL_ENV",
])
  assert.ok(!process.env[key], "LOCAL_ONLY_ENVIRONMENT_REQUIRED");
const root = fs.realpathSync(path.resolve(import.meta.dirname, ".."));
const git = (a) =>
  execFileSync("git", a, {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  }).trim();
assert.equal(
  git(["status", "--porcelain"]),
  "",
  "CLEAN_COMMITTED_SOURCE_REQUIRED",
);
const source = git(["rev-parse", "HEAD"]);
const cohort = applicationReleaseCohort(root);
const release = acquireNativeFixtureLease(
  "application-release-cohort-20261107",
);
const runtime = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-cohort-"));
const bin = postgresBin(),
  dir = path.join(runtime, "postgres"),
  socket = path.join(runtime, "socket");
fs.mkdirSync(socket, { mode: 0o700 });
const environment = {
  PATH: process.env.PATH,
  HOME: runtime,
  USER: os.userInfo().username,
  LANG: "C",
  LC_ALL: "C",
};
const run = (binary, args) =>
  execFileSync(path.join(bin, binary), args, {
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 45000,
    maxBuffer: 32 * 1024 * 1024,
  });
const cfg = {
  host: socket,
  port: 55439,
  user: os.userInfo().username,
  database: "postgres",
  connectionTimeoutMillis: 5000,
  query_timeout: 20000,
};
const clients = [];
let started = false,
  passed = false;
const result = {
  classification:
    "LOCAL_APPLICATION_COHORT_INSTALL_ROLLBACK_RESTORE_NOT_HOSTED_ACCEPTANCE",
  sourceCommit: source,
  migrations: 125,
  externalFencesInstalled: false,
  phases: [],
  runtime,
};
const write = (name, obj) =>
  fs.writeFileSync(
    path.join(runtime, name),
    JSON.stringify(obj, null, 2) + "\n",
    { mode: 0o600 },
  );
async function connect(database = "postgres") {
  const c = new pg.Client({ ...cfg, database });
  await c.connect();
  clients.push(c);
  assert.equal(
    (await c.query("show data_directory")).rows[0].data_directory,
    dir,
  );
  assert.equal(
    (await c.query("show listen_addresses")).rows[0].listen_addresses,
    "",
  );
  return c;
}
async function bootstrap(c) {
  await c.query(`create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;
  create table auth.sessions(id uuid primary key,user_id uuid not null,created_at timestamptz,updated_at timestamptz,not_after timestamptz);alter table auth.sessions owner to supabase_auth_admin;revoke all on auth.sessions from public,anon,authenticated,kxra_app;grant usage on schema auth to supabase_auth_admin;
  create table public.kxra_schema_migrations(name text primary key,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),source_commit text not null check(source_commit~'^[a-f0-9]{40}$'));revoke all on public.kxra_schema_migrations from public,anon,authenticated,kxra_app;
  create table public.cohort_sentinel(id integer primary key,value text not null);insert into public.cohort_sentinel values(1,'synthetic-existing-data-retained');`);
}
async function ledger(c) {
  return (
    await c.query(
      "select name,sha256,source_commit from public.kxra_schema_migrations order by name",
    )
  ).rows;
}
async function snapshot(c) {
  const schema = await catalog(c);
  return {
    catalog: schema,
    data: await data(c, schema),
    ledger: await ledger(c),
  };
}
async function apply(c, m, fail = false) {
  await c.query("begin");
  try {
    await c.query(m.sql);
    await c.query(
      "insert into public.kxra_schema_migrations(name,sha256,source_commit) values($1,$2,$3)",
      [m.name, m.sha256, source],
    );
    if (fail) await c.query("select 1/0");
    await c.query("commit");
  } catch (e) {
    await c.query("rollback");
    throw e;
  }
}
try {
  run("initdb", [
    "-D",
    dir,
    "--auth-local=trust",
    "--auth-host=reject",
    "--encoding=UTF8",
    "--no-locale",
  ]);
  started = true;
  run("pg_ctl", [
    "-D",
    dir,
    "-l",
    path.join(runtime, "postgres.log"),
    "-o",
    `-k '${socket}' -p 55439 -h ''`,
    "-w",
    "start",
  ]);
  const admin = await connect();
  for (const role of [
    "anon",
    "authenticated",
    "kxra_app",
    "supabase_auth_admin",
  ])
    await admin.query(
      `create role ${role} ${role === "kxra_app" ? "login noinherit" : "nologin"} nobypassrls`,
    );
  await admin.query("grant authenticated,anon to kxra_app");
  await bootstrap(admin);
  for (const m of cohort.migrations.slice(0, 117)) await apply(admin, m);
  const account = "11111111-2222-4333-8444-555555555555",
    oldSession = "22222222-2222-4333-8444-555555555555";
  await admin.query(
    "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values($1,'SUPABASE',$1::text,'ACTIVE',now())",
    [account],
  );
  await admin.query(
    "insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp())",
    [oldSession, account],
  );
  assert.equal(
    applicationReleasePlan(cohort, await ledger(admin)).pending.length,
    8,
  );
  result.phases.push("CANONICAL_117_EXACT_HASH_LEDGER_INSTALLED");
  for (const m of cohort.migrations.slice(117)) {
    const before = await snapshot(admin);
    await assert.rejects(apply(admin, m, true), (e) => e.code === "22012");
    assert.deepEqual(
      await snapshot(admin),
      before,
      `Atomic DDL/data/ACL/ledger rollback: ${m.name}`,
    );
    await apply(admin, m);
    const plan = applicationReleasePlan(cohort, await ledger(admin));
    assert.ok(
      !plan.pending.some((p) => p.name === m.name),
      "Lost acknowledgement must not replay committed migration",
    );
    result.phases.push(`ROLLBACK_AND_COMMIT:${m.name}`);
    console.log("PASS", m.name);
  }
  assert.equal(
    applicationReleasePlan(cohort, await ledger(admin)).pending.length,
    0,
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from kxra_private.custom_app_session_bindings where session_id=$1",
        [oldSession],
      )
    ).rows[0].n,
    0,
    "Old session must not be backfilled",
  );
  assert.equal(
    (
      await admin.query(
        "select count(*)::int n from pg_namespace where nspname in ('kxra_pairing','kxra_github_fence','kxra_paired_fence')",
      )
    ).rows[0].n,
    0,
  );
  const final = await snapshot(admin);
  write("upgraded-catalogue.json", final.catalog);
  write("upgraded-data.json", final.data);
  write("upgraded-ledger.json", final.ledger);
  await admin.query("create database cohort_fresh template template0");
  const fresh = await connect("cohort_fresh");
  await bootstrap(fresh);
  for (const m of cohort.migrations) await apply(fresh, m);
  assert.deepEqual(
    await catalog(fresh),
    final.catalog,
    "Fresh125 catalogue equals upgrade117→125",
  );
  assert.deepEqual(
    await ledger(fresh),
    final.ledger,
    "Fresh and upgraded exact ledgers",
  );
  result.phases.push("FRESH_125_EQUALS_UPGRADE_CATALOGUE_AND_LEDGER");
  const dump = path.join(runtime, "complete.dump");
  run("pg_dump", [
    "-h",
    socket,
    "-p",
    "55439",
    "-U",
    cfg.user,
    "-d",
    "postgres",
    "-Fc",
    "-f",
    dump,
  ]);
  await admin.query("create database cohort_restored template template0");
  run("pg_restore", [
    "-h",
    socket,
    "-p",
    "55439",
    "-U",
    cfg.user,
    "-d",
    "cohort_restored",
    "--exit-on-error",
    dump,
  ]);
  const restored = await connect("cohort_restored");
  assert.deepEqual(
    await snapshot(restored),
    final,
    "Restored catalogue/data/ACLs/sequences/ledger must equal source",
  );
  result.phases.push("FRESH_EMPTY_RESTORE_EXACT_CATALOGUE_DATA_LEDGER");
  result.inventory = {
    tables: final.catalog.tables.filter((t) => t.kind === "r").length,
    functions: final.catalog.functions.length,
  };
  passed = true;
} finally {
  const closes = await Promise.allSettled(clients.map((c) => c.end()));
  const pidFile = path.join(dir, "postmaster.pid");
  const pid = fs.existsSync(pidFile)
    ? Number(fs.readFileSync(pidFile, "utf8").split("\n")[0])
    : null;
  const stop = started
    ? spawnSync(
        path.join(bin, "pg_ctl"),
        ["-D", dir, "-m", "fast", "-w", "stop"],
        { env: environment, timeout: 30000 },
      )
    : { status: 0 };
  const status = started
    ? spawnSync(path.join(bin, "pg_ctl"), ["-D", dir, "status"], {
        env: environment,
        timeout: 5000,
      })
    : { status: 3 };
  let absent = !pid;
  if (pid) {
    try {
      process.kill(pid, 0);
    } catch (e) {
      absent = e.code === "ESRCH";
    }
  }
  const cleanup = {
    clean:
      closes.every((c) => c.status === "fulfilled") &&
      stop.status === 0 &&
      status.status === 3 &&
      absent &&
      !fs.existsSync(pidFile),
    stop: stop.status,
    status: status.status,
    ownPostgresProcessAbsent: absent,
  };
  result.passed = passed;
  result.cleanup = cleanup;
  write("result.json", result);
  write("cleanup.json", cleanup);
  assert.ok(cleanup.clean, "OWNED_CLEANUP_UNCERTAIN_LEASE_RETAINED");
  release();
}
console.log(JSON.stringify(result, null, 2));
