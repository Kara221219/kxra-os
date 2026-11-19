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
} from "./production-application-core.mjs";
import {
  operateApplicationUpgrade as operateApplication,
  validateUpgradeProfiles as validateApplicationProfiles,
  inspectApplicationUpgrade as inspectApplication,
  readUpgradeLedger,
  readUpgradeRuntimeMetadata,
  readUpgradeDdlHooks,
} from "./production-application-upgrade-core.mjs";
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
const runtime = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-app-upgrade-"));
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
    "LOCAL_UPGRADE82_126_ATOMIC_RETRY_PROOF_NOT_HOSTED_ACCEPTANCE",
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
    create table auth.sessions(id uuid primary key,user_id uuid not null,created_at timestamptz,updated_at timestamptz,not_after timestamptz);alter table auth.sessions owner to supabase_auth_admin;revoke all on auth.sessions from public,anon,authenticated,kxra_app;insert into auth.sessions(id,user_id,created_at) values('22222222-2222-4333-8444-555555555555','11111111-2222-4333-8444-555555555555',clock_timestamp());
    create table public.kxra_schema_migrations(name text primary key,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),source_commit text not null check(source_commit~'^[a-f0-9]{40}$'),applied_at timestamptz not null default now());revoke all on public.kxra_schema_migrations from public,anon,authenticated,kxra_app;
    alter table public.kxra_schema_migrations enable row level security;
    create table public.operator_sentinel(id integer primary key,value text not null);insert into public.operator_sentinel values(1,'retained-synthetic-data');`);
}
const ledger = async (db) =>
  (
    await db.query(
      `select name,sha256,source_commit,to_char(applied_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') applied_at from public.kxra_schema_migrations order by name`,
    )
  ).rows;
async function rawApply(db, item) {
  await db.query("begin");
  try {
    await db.query(item.sql);
    const prefix = Number(item.name.slice(0, 4));
    if (prefix <= 82)
      await db.query(
        "insert into public.kxra_schema_migrations(name,sha256,source_commit,applied_at) values($1,$2,$3,timestamptz '2026-10-05 23:03:50.756352+00' + $4::integer * interval '1 microsecond')",
        [
          item.name,
          item.sha256,
          "7ba761ab64ce93c7ebd8b7f05be36d1f6d0a8028",
          prefix,
        ],
      );
    else
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
    runtimeRoles: await readUpgradeRuntimeMetadata(db),
    ddlHooks: await readUpgradeDdlHooks(db),
  };
}
const release = acquireNativeFixtureLease("production-application82-upgrade");
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
  await admin.query("create role service_role nologin bypassrls");
  await admin.query("create database operator_reference template template0");
  const reference = await connect("operator_reference");
  await bootstrap(reference);
  const serverVersion = (await reference.query("show server_version_num"))
    .rows[0].server_version_num;
  const serverMajor = String(Math.trunc(Number(serverVersion) / 10000));
  result.serverVersion = serverVersion;
  const generated = {
    id: `application-upgrade-postgres${serverMajor}-source`,
    serverMajor,
    sourceCohortSha256: applicationDigest(
      cohort.migrations.map(({ name, sha256 }) => ({ name, sha256 })),
    ),
    catalogs: {},
  };
  for (const [index, item] of cohort.migrations.entries()) {
    await rawApply(reference, item);
    if (index >= 81)
      generated.catalogs[String(index + 1)] = (
        await applicationCatalog(reference, index + 1)
      ).sha256;
  }
  const historicalProfiles = JSON.parse(
    fs.readFileSync(
      path.join(
        root,
        "packages/release/production-application-targets-v1.json",
      ),
      "utf8",
    ),
  ).profiles;
  const historicalProfile = historicalProfiles.find(
    (p) => p.serverMajor === serverMajor,
  );
  assert.ok(historicalProfile);
  for (let prefix = 117; prefix <= 126; prefix++)
    assert.equal(
      generated.catalogs[String(prefix)],
      historicalProfile.catalogs[String(prefix)],
      "Existing117–126 catalog expectations must remain unchanged",
    );
  write("derived-source-profile.json", generated);
  result.stages.push("INDEPENDENT_FRESH_SOURCE_CATALOGS82_THROUGH126");
  if (!derive) {
    const profiles = validateApplicationProfiles(
      JSON.parse(
        fs.readFileSync(
          path.join(
            root,
            "packages/release/production-application-upgrade-targets-v1.json",
          ),
          "utf8",
        ),
      ),
    );
    assert.deepEqual(
      profiles.filter((p) => p.serverMajor === serverMajor),
      [generated],
      "Committed profiles must reproduce from exact source without hosted metadata",
    );
    await bootstrap(admin);
    for (const item of cohort.migrations.slice(0, 82))
      await rawApply(admin, item);
    const options = { cohort, sourceCommit, profiles, planSha256: undefined };
    const plan = () =>
      operateApplication(admin, { ...options, command: "plan" });
    const apply = (planSha256, db = admin) =>
      operateApplication(db, { ...options, command: "apply", planSha256 });
    await admin.query(
      "insert into kxra.account_identities(account_id,auth_provider,auth_subject,state,email_verified_at) values('11111111-2222-4333-8444-555555555555','SUPABASE','11111111-2222-4333-8444-555555555555','ACTIVE',now())",
    );
    const rolesBefore = (
      await admin.query(
        "select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles order by rolname",
      )
    ).rows;
    const historicalRows = await ledger(admin);
    assert.equal(historicalRows.length, 82);
    assert.ok(
      historicalRows.every(
        (row) =>
          row.source_commit === "7ba761ab64ce93c7ebd8b7f05be36d1f6d0a8028" &&
          /\.\d{6}Z$/.test(row.applied_at),
      ),
    );
    const historicalMetadata = (
      await readUpgradeLedger(admin, cohort, serverMajor)
    ).metadata;
    const original = await snapshot(admin);
    const firstPlan = await plan();
    assert.equal(firstPlan.pending.length, 44);
    assert.equal(firstPlan.profile, generated.id);
    assert.deepEqual(
      await snapshot(admin),
      original,
      "Read-only plan must not change schema/data/ACL/ledger",
    );
    await assert.rejects(
      operateApplication(admin, { ...options, command: "verify" }),
      /APPLICATION_UPGRADE_VERIFICATION_INCOMPLETE/,
    );
    result.stages.push("READ_ONLY_PLAN_AND_INCOMPLETE_VERIFY");
    await assert.rejects(
      apply("0".repeat(64)),
      /APPLICATION_UPGRADE_REVIEWED_PLAN_CHANGED/,
    );
    assert.deepEqual(await snapshot(admin), original);
    // Each adverse edit is contained in a fixture transaction then rolled back.
    for (const [name, sql] of [
      ["wrong-project", "set local app.settings.project_ref='foreign'"],
      [
        "changed-hash",
        "update public.kxra_schema_migrations set sha256=repeat('0',64) where name like '0082_%'",
      ],
      [
        "missing-prefix",
        "delete from public.kxra_schema_migrations where name like '0081_%'",
      ],
      [
        "fixture-history",
        "insert into public.kxra_schema_migrations(name,sha256,source_commit) values('0118_fixture_paired_agents.sql',repeat('a',64),repeat('b',40))",
      ],
      [
        "missing-provenance",
        "alter table public.kxra_schema_migrations drop constraint kxra_schema_migrations_source_commit_check;update public.kxra_schema_migrations set source_commit='' where name like '0082_%'",
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
        "timestamp-era",
        "update public.kxra_schema_migrations set applied_at=timestamptz '2026-10-05 23:03:50.756353+00 BC' where name='0001_core.sql'",
      ],
      [
        "timestamp-infinity",
        "update public.kxra_schema_migrations set applied_at='infinity'::timestamptz where name='0001_core.sql'",
      ],
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
        if (name.startsWith("ledger-"))
          assert.equal(
            (await inspectApplication(admin, cohort, sourceCommit, profiles))
              .applyEligible,
            false,
            name,
          );
        else
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
    // Observed residual privileges are a read-only plan blocker, even with RLS on.
    const residualPrivileges =
      serverMajor === "17"
        ? "TRUNCATE,TRIGGER,REFERENCES,MAINTAIN"
        : "TRUNCATE,TRIGGER,REFERENCES";
    await admin.query(
      `grant ${residualPrivileges} on public.kxra_schema_migrations to service_role`,
    );
    const blockedPlan = await plan();
    assert.equal(blockedPlan.applyEligible, false);
    assert.deepEqual(
      blockedPlan.ledger.residualGrants.map((g) => g.privilege).sort(),
      residualPrivileges.split(",").sort(),
    );
    const blockedSnapshot = await snapshot(admin),
      blockedMetadata = (await readUpgradeLedger(admin, cohort, serverMajor))
        .metadata;
    await assert.rejects(
      apply(blockedPlan.planSha256),
      /APPLICATION_UPGRADE_BLOCKED_REVIEW_PLAN/,
    );
    assert.deepEqual(await snapshot(admin), blockedSnapshot);
    assert.deepEqual(
      (await readUpgradeLedger(admin, cohort, serverMajor)).metadata,
      blockedMetadata,
      "Operator must not repair observed grants",
    );
    write("residual-grants-blocked-plan.json", blockedPlan);
    await admin.query("begin");
    try {
      await admin.query("set local role service_role");
      await admin.query("truncate public.kxra_schema_migrations");
    } finally {
      await admin.query("rollback");
    }
    assert.deepEqual(
      await ledger(admin),
      historicalRows,
      "RLS does not stop TRUNCATE; owned fixture rollback restores it",
    );
    // Local test setup only. The operator has no such remediation command.
    await admin.query(
      `revoke ${residualPrivileges} on public.kxra_schema_migrations from service_role`,
    );
    result.stages.push("OBSERVED_RESIDUAL_GRANTS_BLOCK_APPLY_WITHOUT_REPAIR");
    result.stages.push("RLS_DOES_NOT_PROTECT_RESIDUAL_TRUNCATE");
    const precisePlan = await plan(),
      originalFirst = historicalRows[0];
    await admin.query(
      "update public.kxra_schema_migrations set applied_at=applied_at+interval '1 microsecond' where name=$1",
      [originalFirst.name],
    );
    const changedTimePlan = await plan();
    assert.notEqual(changedTimePlan.planSha256, precisePlan.planSha256);
    const timeChangedSnapshot = await snapshot(admin);
    await assert.rejects(
      apply(precisePlan.planSha256),
      /APPLICATION_UPGRADE_REVIEWED_PLAN_CHANGED/,
    );
    assert.deepEqual(await snapshot(admin), timeChangedSnapshot);
    await admin.query(
      "update public.kxra_schema_migrations set applied_at=$2::timestamptz where name=$1",
      [originalFirst.name, originalFirst.applied_at],
    );
    assert.deepEqual(await ledger(admin), historicalRows);
    result.stages.push("SUB_MILLISECOND_TIMESTAMP_TAMPERING_REJECTED");
    const rolePlan = await plan();
    await admin.query("alter role kxra_app set statement_timeout='3s'");
    assert.notEqual((await plan()).planSha256, rolePlan.planSha256);
    await assert.rejects(
      apply(rolePlan.planSha256),
      /APPLICATION_UPGRADE_REVIEWED_PLAN_CHANGED/,
    );
    await admin.query("alter role kxra_app reset statement_timeout");
    result.stages.push("ROLE_CONFIGURATION_DRIFT_INVALIDATES_PLAN");
    const databaseRolePlan = await plan();
    await admin.query(
      "alter role kxra_app in database postgres set statement_timeout='4s'",
    );
    assert.notEqual((await plan()).planSha256, databaseRolePlan.planSha256);
    await assert.rejects(
      apply(databaseRolePlan.planSha256),
      /APPLICATION_UPGRADE_REVIEWED_PLAN_CHANGED/,
    );
    await admin.query(
      "alter role kxra_app in database postgres reset statement_timeout",
    );
    result.stages.push("DATABASE_ROLE_OVERRIDE_DRIFT_INVALIDATES_PLAN");
    const noHooksPlan = await plan();
    await admin.query(
      "create function public.upgrade_fixture_ddl_hook() returns event_trigger language plpgsql as $$begin null;end$$;create event trigger upgrade_fixture_hook on ddl_command_end execute function public.upgrade_fixture_ddl_hook()",
    );
    const hooksPlan = await plan();
    assert.notEqual(hooksPlan.planSha256, noHooksPlan.planSha256);
    assert.equal(hooksPlan.ddlHooks.hooks.length, 1);
    assert.ok(!JSON.stringify(hooksPlan).includes("begin null"));
    await assert.rejects(
      apply(noHooksPlan.planSha256),
      /APPLICATION_UPGRADE_REVIEWED_PLAN_CHANGED/,
    );
    await admin.query(
      "alter function public.upgrade_fixture_ddl_hook() set upgrade_fixture.secret_value='SYNTHETIC_NOT_A_SECRET'",
    );
    const configuredHookPlan = await plan();
    assert.notEqual(configuredHookPlan.planSha256, hooksPlan.planSha256);
    assert.ok(
      !JSON.stringify(configuredHookPlan).includes("SYNTHETIC_NOT_A_SECRET"),
    );
    await assert.rejects(
      apply(hooksPlan.planSha256),
      /APPLICATION_UPGRADE_REVIEWED_PLAN_CHANGED/,
    );
    await admin.query(
      "drop event trigger upgrade_fixture_hook;drop function public.upgrade_fixture_ddl_hook()",
    );
    result.stages.push(
      "DDL_HOOK_DEFINITION_SECURITY_DRIFT_INVALIDATES_PLAN_WITHOUT_VALUE_EXPOSURE",
    );
    if (serverMajor === "17") {
      const membershipPlan = await plan();
      await admin.query("grant authenticated to kxra_app with set false");
      assert.notEqual((await plan()).planSha256, membershipPlan.planSha256);
      await assert.rejects(
        apply(membershipPlan.planSha256),
        /APPLICATION_UPGRADE_REVIEWED_PLAN_CHANGED/,
      );
      await admin.query("grant authenticated to kxra_app with set true");
      result.stages.push("ROLE_SET_OPTION_DRIFT_INVALIDATES_PLAN");
    }
    for (const [name, mutation] of [
      ["role_configuration", "alter role kxra_app set statement_timeout='3s'"],
      ["role_login", "alter role kxra_app nologin"],
      ["provider_role_limit", "alter role service_role connection limit 7"],
      [
        "migrator_database_setting",
        "alter role postgres in database postgres set statement_timeout='4s'",
      ],
      ["role_inherit", "alter role kxra_app inherit"],
      [
        "database_role_configuration",
        "alter role kxra_app in database postgres set statement_timeout='4s'",
      ],
      [
        "ddl_hook",
        "create function public.upgrade_fixture_ddl_hook() returns event_trigger language plpgsql as $$begin null;end$$;create event trigger upgrade_fixture_hook on ddl_command_end execute function public.upgrade_fixture_ddl_hook()",
      ],
      [
        "timestamp",
        "update public.kxra_schema_migrations set applied_at=applied_at+interval '1 microsecond' where name='0001_core.sql'",
      ],
      [
        "provenance",
        "update public.kxra_schema_migrations set source_commit=repeat('c',40) where name='0001_core.sql'",
      ],
      [
        "rls",
        "alter table public.kxra_schema_migrations disable row level security",
      ],
    ]) {
      const p = await plan(),
        before = await snapshot(admin);
      let changed = false;
      const tampering = {
        query: async (text, values) => {
          const response = await admin.query(text, values);
          if (
            !changed &&
            text.startsWith("insert into public.kxra_schema_migrations")
          ) {
            changed = true;
            await admin.query(mutation);
          }
          return response;
        },
      };
      await assert.rejects(
        apply(p.planSha256, tampering),
        /APPLICATION_UPGRADE_(HISTORICAL_LEDGER_CHANGED|POST_MIGRATION_REJECTED|RUNTIME_ROLE_METADATA_CHANGED|DDL_HOOK_METADATA_CHANGED)/,
      );
      assert.ok(changed);
      assert.deepEqual(await snapshot(admin), before);
      result.stages.push(
        `MID_TRANSACTION_${name.toUpperCase()}_TAMPERING_ROLLED_BACK`,
      );
    }
    const uncertainPlan = await plan(),
      uncertainBefore = await snapshot(admin);
    let uncertain = false;
    const uncommittedAck = {
      query: async (text, values) => {
        if (text === "commit" && !uncertain) {
          uncertain = true;
          await admin.query("rollback");
          throw Error("synthetic unknown commit result with server rollback");
        }
        return admin.query(text, values);
      },
    };
    await assert.rejects(
      apply(uncertainPlan.planSha256, uncommittedAck),
      /APPLICATION_UPGRADE_COMMIT_OUTCOME_UNCERTAIN_REPLAN_REQUIRED/,
    );
    assert.deepEqual(await snapshot(admin), uncertainBefore);
    assert.equal((await plan()).applied, 82);
    result.stages.push(
      "UNCERTAIN_UNCOMMITTED_RESULT_REQUIRES_REPLAN_WITHOUT_REPLAY",
    );
    const blocker = await connect();
    await blocker.query("select pg_advisory_lock(hashtext($1))", [
      applicationLock,
    ]);
    await assert.rejects(
      apply(firstPlan.planSha256),
      /APPLICATION_UPGRADE_OPERATOR_BUSY/,
    );
    await blocker.query("select pg_advisory_unlock(hashtext($1))", [
      applicationLock,
    ]);
    await blocker.end();
    clients.splice(clients.indexOf(blocker), 1);
    result.stages.push("NEGATIVE:SHARED_HISTORICAL_LOCK");
    // Real DDL/ledger failure inside each of the 44 operator transactions.
    for (let prefix = 82; prefix < 126; prefix++) {
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
      const ackClient = prefix === 125 ? await connect() : admin;
      const lostAck = {
        query: async (text, values) => {
          const response = await ackClient.query(text, values);
          if (!lost && text === "commit") {
            lost = true;
            if (prefix === 125) {
              await ackClient.end();
              clients.splice(clients.indexOf(ackClient), 1);
            }
            throw Error("synthetic lost commit acknowledgement");
          }
          return response;
        },
      };
      await assert.rejects(
        apply(p.planSha256, lostAck),
        /APPLICATION_UPGRADE_COMMIT_OUTCOME_UNCERTAIN_REPLAN_REQUIRED/,
      );
      const committed = await ledger(admin);
      assert.equal(committed.length, prefix + 1);
      assert.deepEqual(
        committed.slice(0, 82),
        historicalRows,
        "Historical provenance and microsecond timestamps preserved",
      );
      assert.deepEqual(
        committed.slice(0, prefix),
        before.ledger,
        "Committed prefix never rewritten on retry",
      );
      assert.equal(committed[prefix].source_commit, sourceCommit);
      assert.deepEqual(
        (await readUpgradeLedger(admin, cohort, serverMajor)).metadata,
        historicalMetadata,
        "Ledger RLS, ACL, policies, columns, defaults and constraints unchanged",
      );
      const resumed = await plan();
      assert.equal(resumed.applied, prefix + 1);
      assert.ok(
        !resumed.pending.some((m) => m.name === cohort.migrations[prefix].name),
      );
      await assert.rejects(
        apply(p.planSha256),
        /APPLICATION_UPGRADE_REVIEWED_PLAN_CHANGED/,
      );
      result.stages.push(`ATOMIC_ROLLBACK_AND_LOST_ACK_REPLAN:${prefix + 1}`);
    }
    const final = await operateApplication(admin, {
      ...options,
      command: "verify",
    });
    assert.equal(final.applied, 126);
    assert.equal(final.pending.length, 0);
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra_private.custom_app_session_bindings where session_id='22222222-2222-4333-8444-555555555555'",
        )
      ).rows[0].n,
      0,
      "Existing Auth sessions must not be backfilled",
    );
    assert.deepEqual(
      (
        await admin.query(
          "select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles order by rolname",
        )
      ).rows,
      rolesBefore,
      "Operator must not create or change roles",
    );
    result.stages.push("NO_SESSION_BACKFILL_OR_ROLE_PROVISIONING");
    result.stages.push(
      "ALL44_PRESERVED_HISTORICAL_PROVENANCE_MICROSECOND_TIMESTAMPS_AND_LEDGER_METADATA",
    );
    write("historical-ledger.json", historicalRows);
    write("ledger-metadata-before.json", historicalMetadata);
    write(
      "ledger-metadata-after.json",
      (await readUpgradeLedger(admin, cohort, serverMajor)).metadata,
    );
    write("upgraded-ledger.json", await ledger(admin));
    for (const [name, sql] of [
      [
        "EXEMPTED_NAME_EXTRA_OVERLOAD",
        "create function kxra.custom_app_register() returns boolean language sql as 'select true'",
      ],
      [
        "EXEMPTED_NAME_FIXTURE_BODY",
        "create or replace function kxra_private.custom_apps_local() returns boolean language sql stable security definer set search_path='' as 'select true'",
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
      result.stages.push(`NEGATIVE:${name}`);
    }
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
    for (const item of cohort.migrations.slice(0, 82))
      await rawApply(clean, item);
    const p = await operateApplication(clean, { ...options, command: "plan" });
    const completed = await operateApplication(clean, {
      ...options,
      command: "apply",
      planSha256: p.planSha256,
    });
    assert.equal(completed.applied, 126);
    assert.equal((await ledger(clean)).length, 126);
    result.stages.push("NORMAL_UNINTERRUPTED82_TO126_APPLY");
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
