// Owned Unix-socket PostgreSQL only. Never invokes the production TLS entry point.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import { applicationReleaseCohort } from "./application-release-cohort.mjs";
import {
  applicationCatalog,
  applicationDigest,
  applicationLock,
  operateApplication,
  validateApplicationProfiles,
} from "./production-application-core.mjs";
import {
  pairedCompositionCatalog,
  pairedCompositionData,
} from "./paired-composition-catalog.mjs";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import { postgresBin } from "./postgres-bin.mjs";
const derive = process.argv[2] === "--derive-source-profile";
assert.ok(
  process.argv.length === 2 || (process.argv.length === 3 && derive),
  "NO_TARGET_ARGUMENTS_ACCEPTED",
);
for (const key of Object.keys(process.env))
  if (
    /^(DATABASE_URL$|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE|PGSERVICE|KXRA_PRODUCTION_|NEXT_PUBLIC_SUPABASE_URL$|VERCEL)/.test(
      key,
    )
  )
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
const sourceCommit = git(["rev-parse", "HEAD"]);
const cohort = applicationReleaseCohort(root);
const runtime = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-app-operator-"));
const bin = postgresBin(),
  dir = path.join(runtime, "postgres"),
  socket = path.join(runtime, "socket");
fs.mkdirSync(socket, { mode: 0o700 });
const env = {
  PATH: process.env.PATH,
  HOME: runtime,
  USER: os.userInfo().username,
  LANG: "C",
  LC_ALL: "C",
};
const run = (command, args) =>
  execFileSync(path.join(bin, command), args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60000,
    maxBuffer: 32 * 1024 * 1024,
  });
const cfg = {
  host: socket,
  port: 55439,
  user: "postgres",
  database: "postgres",
  connectionTimeoutMillis: 5000,
  query_timeout: 30000,
};
const clients = [];
let started = false,
  passed = false;
const result = {
  classification:
    "LOCAL_OPERATOR_NEGATIVE_ATOMIC_RETRY_PROOF_NOT_HOSTED_ACCEPTANCE",
  sourceCommit,
  runtime,
  stages: [],
  hostedCalls: false,
  credentialsUsed: false,
};
const write = (name, value) =>
  fs.writeFileSync(
    path.join(runtime, name),
    JSON.stringify(value, null, 2) + "\n",
    { mode: 0o600 },
  );
async function connect(database = "postgres") {
  const db = new pg.Client({ ...cfg, database });
  await db.connect();
  clients.push(db);
  assert.equal(
    (await db.query("show data_directory")).rows[0].data_directory,
    dir,
  );
  assert.equal(
    (await db.query("show listen_addresses")).rows[0].listen_addresses,
    "",
  );
  await db.query("set search_path=pg_catalog;set statement_timeout='30s'");
  return db;
}
async function bootstrap(db) {
  await db.query(`create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to anon,authenticated,supabase_auth_admin;grant execute on all functions in schema auth to anon,authenticated;
    create table auth.sessions(id uuid primary key,user_id uuid not null,created_at timestamptz,updated_at timestamptz,not_after timestamptz);alter table auth.sessions owner to supabase_auth_admin;revoke all on auth.sessions from public,anon,authenticated,kxra_app;
    create table public.kxra_schema_migrations(name text primary key,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),source_commit text not null check(source_commit~'^[a-f0-9]{40}$'),applied_at timestamptz not null default now());revoke all on public.kxra_schema_migrations from public,anon,authenticated,kxra_app;
    create table public.operator_sentinel(id integer primary key,value text not null);insert into public.operator_sentinel values(1,'retained-synthetic-data');`);
}
const ledger = async (db) =>
  (
    await db.query(
      "select name,sha256,source_commit from public.kxra_schema_migrations order by name",
    )
  ).rows;
async function rawApply(db, item) {
  await db.query("begin");
  try {
    await db.query(item.sql);
    await db.query(
      "insert into public.kxra_schema_migrations(name,sha256,source_commit) values($1,$2,$3)",
      [item.name, item.sha256, sourceCommit],
    );
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}
async function snapshot(db) {
  const cat = await pairedCompositionCatalog(db);
  return {
    catalog: cat,
    data: await pairedCompositionData(db, cat),
    ledger: await ledger(db),
  };
}
const release = acquireNativeFixtureLease("production-application126-operator");
try {
  run("initdb", [
    "-D",
    dir,
    "-U",
    "postgres",
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
      `create role ${role} ${role === "kxra_app" || role === "supabase_auth_admin" ? "login" : "nologin"} noinherit nobypassrls`,
    );
  await admin.query("grant authenticated,anon to kxra_app");
  await admin.query("create database operator_reference template template0");
  const reference = await connect("operator_reference");
  await bootstrap(reference);
  const generated = {
    id: "application-v1-postgres-source",
    sourceCohortSha256: applicationDigest(
      cohort.migrations.map(({ name, sha256 }) => ({ name, sha256 })),
    ),
    catalogs: {},
  };
  for (const [index, item] of cohort.migrations.entries()) {
    await rawApply(reference, item);
    if (index >= 116)
      generated.catalogs[String(index + 1)] = (
        await applicationCatalog(reference, index + 1)
      ).sha256;
  }
  write("derived-source-profile.json", generated);
  result.stages.push("INDEPENDENT_FRESH_SOURCE_CATALOGS117_THROUGH126");
  if (!derive) {
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
    assert.deepEqual(
      profiles,
      [generated],
      "Committed profiles must reproduce from exact source without hosted metadata",
    );
    await bootstrap(admin);
    for (const item of cohort.migrations.slice(0, 117))
      await rawApply(admin, item);
    const options = { cohort, sourceCommit, profiles, planSha256: undefined };
    const plan = () =>
      operateApplication(admin, { ...options, command: "plan" });
    const apply = (planSha256, db = admin) =>
      operateApplication(db, { ...options, command: "apply", planSha256 });
    const original = await snapshot(admin);
    const firstPlan = await plan();
    assert.equal(firstPlan.pending.length, 9);
    assert.equal(firstPlan.profile, generated.id);
    assert.deepEqual(
      await snapshot(admin),
      original,
      "Read-only plan must not change schema/data/ACL/ledger",
    );
    await assert.rejects(
      operateApplication(admin, { ...options, command: "verify" }),
      /APPLICATION_VERIFICATION_INCOMPLETE/,
    );
    result.stages.push("READ_ONLY_PLAN_AND_INCOMPLETE_VERIFY");
    await assert.rejects(
      apply("0".repeat(64)),
      /APPLICATION_REVIEWED_PLAN_CHANGED/,
    );
    assert.deepEqual(await snapshot(admin), original);
    // Each adverse edit is contained in a fixture transaction then rolled back.
    for (const [name, sql] of [
      ["wrong-project", "set local app.settings.project_ref='foreign'"],
      [
        "changed-hash",
        "update public.kxra_schema_migrations set sha256=repeat('0',64) where name like '0117_%'",
      ],
      [
        "missing-prefix",
        "delete from public.kxra_schema_migrations where name like '0116_%'",
      ],
      [
        "fixture-history",
        "insert into public.kxra_schema_migrations(name,sha256,source_commit) values('0118_fixture_paired_agents.sql',repeat('a',64),repeat('b',40))",
      ],
      [
        "missing-provenance",
        "alter table public.kxra_schema_migrations drop constraint kxra_schema_migrations_source_commit_check;update public.kxra_schema_migrations set source_commit='' where name like '0117_%'",
      ],
      ["fixture-object", "create schema kxra_pairing"],
      ["external-fence", "create schema kxra_github_fence"],
      [
        "auth-column",
        "alter table auth.sessions rename not_after to unsupported_expiry",
      ],
      ["auth-owner", "alter table auth.sessions owner to postgres"],
      ["auth-grant", "grant select(id) on auth.sessions to kxra_app"],
      ["privileged-membership", "grant supabase_auth_admin to kxra_app"],
      [
        "ledger-column-grant",
        "grant update(source_commit) on public.kxra_schema_migrations to authenticated",
      ],
      [
        "ledger-grant",
        "grant select on public.kxra_schema_migrations to authenticated",
      ],
    ]) {
      await admin.query("begin");
      try {
        await admin.query(sql);
        // inspect uses no transaction boundary, preserving this negative fixture rollback.
        const { inspectApplication } =
          await import("./production-application-core.mjs");
        await assert.rejects(
          inspectApplication(admin, cohort, sourceCommit, profiles),
          undefined,
          name,
        );
      } finally {
        await admin.query("rollback");
      }
      result.stages.push(`NEGATIVE:${name}`);
    }
    const { inspectApplication } =
      await import("./production-application-core.mjs");
    for (const [name, sql] of [
      ["RLS", "alter table kxra.organisations disable row level security"],
      ["POLICY", "alter policy org_read on kxra.organisations using (true)"],
      [
        "INDEX",
        "create index unexpected_operator_index on kxra.organisations(name)",
      ],
    ]) {
      await admin.query("begin");
      try {
        await admin.query(sql);
        assert.equal(
          (await inspectApplication(admin, cohort, sourceCommit, profiles))
            .profile,
          null,
        );
      } finally {
        await admin.query("rollback");
      }
      result.stages.push(`NEGATIVE:${name}_DRIFT_REJECTED_BY_SOURCE_PROFILE`);
    }
    const blocker = await connect();
    await blocker.query("select pg_advisory_lock(hashtext($1))", [
      applicationLock,
    ]);
    await assert.rejects(
      apply(firstPlan.planSha256),
      /APPLICATION_OPERATOR_BUSY/,
    );
    await blocker.query("select pg_advisory_unlock(hashtext($1))", [
      applicationLock,
    ]);
    await blocker.end();
    clients.splice(clients.indexOf(blocker), 1);
    result.stages.push("NEGATIVE:SHARED_HISTORICAL_LOCK");
    // Real DDL/ledger failure inside each of the nine operator transactions.
    for (let prefix = 117; prefix < 126; prefix++) {
      const before = await snapshot(admin),
        p = await plan();
      let injected = false;
      const fault = {
        query: async (text, values) => {
          const response = await admin.query(text, values);
          if (
            !injected &&
            text.startsWith("insert into public.kxra_schema_migrations")
          ) {
            injected = true;
            await admin.query("select 1/0");
          }
          return response;
        },
      };
      await assert.rejects(
        apply(p.planSha256, fault),
        (e) => e.code === "22012",
      );
      assert.ok(injected);
      assert.deepEqual(
        await snapshot(admin),
        before,
        `DDL/data/ACL/ledger atomic rollback prefix${prefix}`,
      );
      // Commit succeeds in PostgreSQL, but the caller loses its acknowledgement.
      let lost = false;
      const lostAck = {
        query: async (text, values) => {
          if (lost && prefix === 125)
            throw Error("synthetic connection closed after COMMIT");
          const response = await admin.query(text, values);
          if (!lost && text === "commit") {
            lost = true;
            throw Error("synthetic lost commit acknowledgement");
          }
          return response;
        },
      };
      await assert.rejects(
        apply(p.planSha256, lostAck),
        /APPLICATION_COMMIT_OUTCOME_UNCERTAIN_REPLAN_REQUIRED/,
      );
      assert.equal((await ledger(admin)).length, prefix + 1);
      const resumed = await plan();
      assert.equal(resumed.applied, prefix + 1);
      assert.ok(
        !resumed.pending.some((m) => m.name === cohort.migrations[prefix].name),
      );
      await assert.rejects(
        apply(p.planSha256),
        /APPLICATION_REVIEWED_PLAN_CHANGED/,
      );
      result.stages.push(`ATOMIC_ROLLBACK_AND_LOST_ACK_REPLAN:${prefix + 1}`);
    }
    const final = await operateApplication(admin, {
      ...options,
      command: "verify",
    });
    assert.equal(final.applied, 126);
    assert.equal(final.pending.length, 0);
    const end = await snapshot(admin);
    await apply(final.planSha256);
    assert.deepEqual(await snapshot(admin), end, "Already126 apply is a no-op");
    assert.equal(
      (
        await admin.query(
          "select value from public.operator_sentinel where id=1",
        )
      ).rows[0].value,
      "retained-synthetic-data",
    );
    assert.equal(
      (await applicationCatalog(admin, 126)).sha256,
      (await applicationCatalog(reference, 126)).sha256,
    );
    result.stages.push(
      "VERIFY126_NOOP_RETRY_SENTINEL_FRESH_SCHEMA_EQUIVALENCE",
    );
    // Normal one-shot apply, not only fault wrappers: recreate owned postgres from clean template.
    await admin.end();
    clients.splice(clients.indexOf(admin), 1);
    await reference.query("drop database postgres");
    await reference.query("create database postgres template template0");
    const clean = await connect();
    await bootstrap(clean);
    for (const item of cohort.migrations.slice(0, 117))
      await rawApply(clean, item);
    const p = await operateApplication(clean, { ...options, command: "plan" });
    const completed = await operateApplication(clean, {
      ...options,
      command: "apply",
      planSha256: p.planSha256,
    });
    assert.equal(completed.applied, 126);
    assert.equal((await ledger(clean)).length, 126);
    result.stages.push("NORMAL_UNINTERRUPTED117_TO126_APPLY");
    write("final-plan.json", completed);
  }
  passed = true;
} finally {
  const closed = await Promise.allSettled(clients.map((c) => c.end()));
  const pidFile = path.join(dir, "postmaster.pid");
  const pid = fs.existsSync(pidFile)
    ? Number(fs.readFileSync(pidFile, "utf8").split("\n")[0])
    : null;
  const stop = started
    ? spawnSync(
        path.join(bin, "pg_ctl"),
        ["-D", dir, "-m", "fast", "-w", "stop"],
        { env, timeout: 30000 },
      )
    : { status: 0 };
  const status = started
    ? spawnSync(path.join(bin, "pg_ctl"), ["-D", dir, "status"], {
        env,
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
      closed.every((c) => c.status === "fulfilled") &&
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
