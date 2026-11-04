import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import {
  hostedMigrationManifest,
  assertNoHostedFixtureObjects,
  expectedHostedDatabase,
} from "./hosted-release-guard.mjs";
import {
  productionAiPayload,
  productionAiSource,
  productionAiUpgrade,
} from "./production-ai-review.mjs";
import { integrationCatalog, integrationData } from "./integration-catalog.mjs";
import { postgresBin } from "./postgres-bin.mjs";
import { importSeeds, loadSeeds, seedFixtures } from "./seed.mjs";
import { seedAiResumeFixture } from "../tests/support/ai-resume-fixture";
async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-pc-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/production-ai");
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  async function port() {
    const s = net.createServer();
    await new Promise<void>((r, j) => {
      s.once("error", j);
      s.listen(0, "127.0.0.1", r);
    });
    const n = (s.address() as net.AddressInfo).port;
    await new Promise<void>((r, j) => s.close((e) => (e ? j(e) : r())));
    return n;
  }
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: runtime,
    USER: os.userInfo().username,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "development",
    NODE_OPTIONS: "--conditions=development",
    KXRA_AUTH_MODE: "fixture",
    KXRA_RUNTIME: runtime,
    KXRA_ORIGIN: `http://127.0.0.1:${await port()}`,
    KXRA_PG_PORT: String(await port()),
    KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
    KXRA_MODERN_BILLING_TEST_MODE: "STAGING_SANDBOX",
  };
  Object.assign(process.env, env);
  const source = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    { spec, bytes } = productionAiPayload(root),
    baseline = hostedMigrationManifest(root);
  assert.equal(baseline.length, 117);
  const configurationFile = path.join(runtime, "database.json");
  let admin: pg.Client | undefined,
    cfg: any,
    originalConfig: Buffer | undefined;
  const clients = new Set<pg.Client>();
  const phases: any[] = [];
  function run(args: string[], extra: Partial<NodeJS.ProcessEnv> = {}) {
    const r = spawnSync(process.execPath, args, {
      cwd: root,
      env: { ...env, ...extra },
      stdio: "inherit",
      timeout: 120_000,
    });
    assert.equal(r.status, 0, args.join(" "));
  }
  async function client(database: string, user = os.userInfo().username) {
    const c = new pg.Client({ ...cfg, database, user });
    clients.add(c);
    await c.connect();
    await c.query("set statement_timeout='10s'");
    return c;
  }
  async function close(c: pg.Client) {
    try {
      await c.end();
    } finally {
      clients.delete(c);
    }
  }
  const write = (name: string, value: unknown) =>
    fs.writeFileSync(
      path.join(runtime, name),
      JSON.stringify(value, null, 2) + "\n",
      { mode: 0o600 },
    );
  const authShim = `create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;`;
  async function empty(c: pg.Client) {
    for (const table of ["pg_class", "pg_proc"])
      assert.equal(
        (
          await c.query(
            `select count(*)::int n from ${table} x join pg_namespace n on n.oid=x.${table === "pg_class" ? "relnamespace" : "pronamespace"} where n.nspname not like 'pg_%' and n.nspname<>'information_schema'`,
          )
        ).rows[0].n,
        0,
      );
  }
  async function app(
    c: pg.Client,
    fixture: any,
    sql: string,
    values: unknown[] = [],
  ) {
    await c.query("begin");
    try {
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
      const result = (await c.query(sql, values)).rows[0]?.value;
      await c.query("commit");
      return result;
    } catch (e) {
      await c.query("rollback");
      throw e;
    }
  }
  try {
    assert.ok(!fs.existsSync(path.join(runtime, "postgres")));
    run(["scripts/database.mjs", "start"]);
    originalConfig = fs.readFileSync(configurationFile);
    cfg = JSON.parse(originalConfig.toString());
    assert.equal(cfg.database, "postgres");
    assert.equal(cfg.user, "kxra_app");
    assert.equal(fs.realpathSync(cfg.host), path.join(runtime, "socket"));
    assert.ok(!cfg.password && !cfg.ssl && !cfg.connectionString);
    admin = await client("postgres");
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
    await assertNoHostedFixtureObjects(admin);
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kxra' and c.relkind='r' and c.relrowsecurity",
        )
      ).rows[0].n,
      expectedHostedDatabase.protectedTables,
    );
    run(
      [
        "--import",
        "tsx",
        "--test",
        "--test-concurrency=1",
        "tests/admission/ai-admission.db.test.ts",
        "tests/admission/ai-admission.test.ts",
        "tests/admission/ai-resume-api.test.ts",
        "tests/admission/ai-setup-status.test.ts",
        "tests/team-provider.test.ts",
        "tests/business-admission.test.ts",
      ],
      { KXRA_AI_PRODUCTION_REVIEW_PROFILE: "PRODUCTION_117_PAYLOAD" },
    );
    phases.push({
      phase: "production117-payload",
      tests: 38,
      passed: true,
      fixturePairingAbsent: true,
      transactionRolledBack: true,
    });
    // Historical state is synthetic and owned. Build it with the existing117 APIs, preserving every paid/legal/audit guard.
    await admin.query("begin");
    const legacy = await seedAiResumeFixture(admin, false);
    await admin.query("commit");
    const legacyId = crypto.randomUUID();
    await legacy.appCall(
      "select kxra.team_connection_save($1,'Synthetic legacy connection','OPENAI','synthetic-model','',$2) value",
      [legacyId, legacy.cipher],
    );
    const legacyRun = await legacy.start(legacyId);
    await admin.query(
      "create table public.kxra_schema_migrations(name text primary key,sha256 text not null,source_commit text not null)",
    );
    for (const m of baseline)
      await admin.query(
        "insert into public.kxra_schema_migrations values($1,$2,$3)",
        [m.name, m.sha256, source],
      );
    const ledger = async () =>
      (
        await admin!.query(
          "select * from public.kxra_schema_migrations order by name",
        )
      ).rows;
    const beforeCatalog = await integrationCatalog(admin),
      beforeData = await integrationData(admin, beforeCatalog),
      beforeLedger = await ledger();
    write("canonical117-catalogue.json", beforeCatalog);
    write("canonical117-data.json", beforeData);
    const migrationFile = path.join(
      root,
      "supabase/migrations",
      spec.candidateMigration.name,
    );
    fs.writeFileSync(migrationFile, bytes, { flag: "wx" });
    const manifest = productionAiSource(root),
      migration = manifest[117];
    assert.equal(
      productionAiUpgrade(root, { managed: true, applied: beforeLedger })
        .pending.length,
      1,
    );
    async function apply(fail = false) {
      await admin!.query("begin");
      try {
        await admin!.query(migration.sql);
        await admin!.query(
          "insert into public.kxra_schema_migrations values($1,$2,$3)",
          [migration.name, migration.sha256, source],
        );
        await admin!.query(
          "insert into public.kxra_local_migrations values($1)",
          [migration.name],
        );
        if (fail) await admin!.query("select 1/0");
        await admin!.query("commit");
      } catch (e) {
        await admin!.query("rollback");
        throw e;
      }
    }
    await assert.rejects(apply(true), (e: any) => e.code === "22012");
    assert.deepEqual(await integrationCatalog(admin), beforeCatalog);
    assert.deepEqual(await integrationData(admin, beforeCatalog), beforeData);
    assert.deepEqual(await ledger(), beforeLedger);
    await assertNoHostedFixtureObjects(admin);
    await apply();
    assert.equal(
      productionAiUpgrade(root, { managed: true, applied: await ledger() })
        .pending.length,
      0,
    );
    assert.throws(
      () => hostedMigrationManifest(root),
      /HOSTED_RELEASE_UNKNOWN_MIGRATION/,
    );
    const upgradedCatalog = await integrationCatalog(admin);
    const additions = upgradedCatalog.tables
      .filter(
        (t: any) =>
          t.kind === "r" &&
          !beforeCatalog.tables.some(
            (b: any) => b.schema === t.schema && b.name === t.name,
          ),
      )
      .map((t: any) => t.schema + "." + t.name)
      .sort();
    assert.deepEqual(additions, [
      "kxra_private.ai_connection_bindings",
      "kxra_private.ai_connection_intents",
      "kxra_private.ai_connection_reviews",
      "kxra_private.ai_run_admissions",
    ]);
    for (const role of ["app", "authenticated", "anon"]) {
      const privateReach = (c: any) =>
        c.functions
          .filter(
            (f: any) => f.schema === "kxra_private" && f[role + "_reachable"],
          )
          .map((f: any) => f.schema + "." + f.name + "(" + f.arguments + ")");
      assert.deepEqual(
        privateReach(upgradedCatalog),
        privateReach(beforeCatalog),
      );
    }
    for (const table of upgradedCatalog.tables.filter(
      (t: any) => t.schema === "kxra_private" && t.name.startsWith("ai_"),
    )) {
      assert.equal(table.rls, true);
      for (const privilege of table.effective_table_privileges || [])
        assert.equal(privilege.reachable, false);
    }
    await assertNoHostedFixtureObjects(admin);
    assert.equal(
      (
        await admin.query(
          "select encrypted_key from kxra.team_connections where id=$1",
          [legacyId],
        )
      ).rows[0].encrypted_key,
      legacy.cipher,
    );
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from kxra_private.ai_connection_bindings where connection_id=$1",
          [legacyId],
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      await legacy.appCall("select kxra.team_run_ready($1) value", [
        legacyRun.run,
      ]),
      false,
    );
    await legacy.appCall(
      "select kxra.team_run_finish($1,'Must not publish',null,0,0) value",
      [legacyRun.run],
    );
    assert.deepEqual(
      (
        await admin.query(
          "select status,output,error_code from kxra.team_runs where id=$1",
          [legacyRun.run],
        )
      ).rows[0],
      { status: "CANCELLED", output: "", error_code: "AI_ADMISSION_CHANGED" },
    );
    await assert.rejects(
      legacy.appCall(
        "select kxra.team_connection_save($1,'Bypass','OPENAI','synthetic-model','',$2) value",
        [crypto.randomUUID(), legacy.cipher],
      ),
    );
    phases.push({
      phase: "117-to-ai118-upgrade",
      injectedDdlLedgerDataAclRollback: true,
      onePendingThenNone: true,
      legacyCipherPreserved: true,
      noManufacturedAuthority: true,
      legacyRunPublicationDenied: true,
      oldRealSaveRpcDenied: true,
      originalHostedGuardRemainsClosed: true,
    });
    // Independent fresh118 installation, not a repaired119 fixture.
    const freshName = "kxra_ai_fresh_" + crypto.randomBytes(6).toString("hex");
    await admin.query(`create database "${freshName}" template template0`);
    const fresh = await client(freshName);
    await empty(fresh);
    await fresh.query(
      authShim +
        "create table public.kxra_local_migrations(name text primary key);create table public.kxra_schema_migrations(name text primary key,sha256 text not null,source_commit text not null);",
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
          [m.name, m.sha256, source],
        );
        await fresh.query("commit");
      } catch (e) {
        await fresh.query("rollback");
        throw e;
      }
    }
    assert.deepEqual(await integrationCatalog(fresh), upgradedCatalog);
    await assertNoHostedFixtureObjects(fresh);
    await fresh.query("begin");
    await importSeeds(fresh, loadSeeds(root));
    await seedFixtures(fresh);
    await fresh.query("commit");
    fs.writeFileSync(
      configurationFile,
      JSON.stringify({ ...cfg, database: freshName }),
      { mode: 0o600 },
    );
    run(
      [
        "--import",
        "tsx",
        "--test",
        "--test-concurrency=1",
        "tests/admission/ai-admission.db.test.ts",
        "tests/admission/ai-admission.test.ts",
        "tests/admission/ai-resume-api.test.ts",
        "tests/admission/ai-setup-status.test.ts",
        "tests/team-provider.test.ts",
        "tests/business-admission.test.ts",
      ],
      { KXRA_AI_PRODUCTION_REVIEW_PROFILE: "PRODUCTION_118_INSTALLED" },
    );
    fs.writeFileSync(configurationFile, originalConfig);
    await close(fresh);
    phases.push({
      phase: "fresh-ai118",
      verifiedEmpty: true,
      catalogueEqualsUpgraded: true,
      tests: 38,
      passed: true,
      noProposalRepair: true,
    });
    // Populate new authority and prove full recovery alongside preserved legacy history.
    await admin.query("begin");
    const current = await seedAiResumeFixture(admin, false);
    await admin.query("commit");
    const currentId = crypto.randomUUID();
    await current.register(currentId);
    const currentReview = await current.reviewAi(currentId);
    await current.save(currentId);
    const currentRun = await current.start(currentId);
    assert.equal(await current.gate(currentRun.run), true);
    const recoveryCatalog = await integrationCatalog(admin),
      recoveryData = await integrationData(admin, recoveryCatalog);
    write("ai118-catalogue-source.json", recoveryCatalog);
    write("ai118-data-source.json", recoveryData);
    const passfile = path.join(runtime, "empty-libpq");
    fs.writeFileSync(passfile, "", { mode: 0o600, flag: "wx" });
    const processEnv: NodeJS.ProcessEnv = {
        NODE_ENV: "production",
        PATH: env.PATH,
        HOME: runtime,
        PGPASSFILE: passfile,
        PGSERVICEFILE: passfile,
        PGSYSCONFDIR: runtime,
      },
      options = [
        "--no-password",
        "-h",
        cfg.host,
        "-p",
        String(cfg.port),
        "-U",
        os.userInfo().username,
      ],
      dump = path.join(runtime, "production-ai118.dump");
    execFileSync(
      path.join(postgresBin(env), "pg_dump"),
      [...options, "-d", "postgres", "--format=custom", "--file", dump],
      { env: processEnv, stdio: "inherit", timeout: 120_000 },
    );
    const target = "kxra_ai_restore_" + crypto.randomBytes(6).toString("hex");
    await admin.query(`create database "${target}" template template0`);
    const restored = await client(target);
    await empty(restored);
    execFileSync(
      path.join(postgresBin(env), "pg_restore"),
      [
        ...options,
        "-d",
        target,
        "--single-transaction",
        "--exit-on-error",
        dump,
      ],
      { env: processEnv, stdio: "inherit", timeout: 120_000 },
    );
    const restoredCatalog = await integrationCatalog(restored),
      restoredData = await integrationData(restored, restoredCatalog);
    assert.deepEqual(restoredCatalog, recoveryCatalog);
    assert.deepEqual(restoredData, recoveryData);
    write("ai118-catalogue-restored.json", restoredCatalog);
    write("ai118-data-restored.json", restoredData);
    await assertNoHostedFixtureObjects(restored);
    const restoredApp = await client(target, "kxra_app");
    assert.equal(
      (
        await app(
          restoredApp,
          current,
          "select kxra.ai_connection_status($1) value",
          [currentId],
        )
      ).state,
      "SAVED",
    );
    assert.equal(
      await app(
        restoredApp,
        current,
        "select kxra.ai_run_admission($1,$2,$3) value",
        [currentRun.run, current.ep, current.sha(current.cipher)],
      ),
      true,
    );
    await restored.query(
      "update kxra_private.ai_connection_reviews set withdrawn_at=clock_timestamp() where id=$1",
      [currentReview],
    );
    assert.equal(
      await app(
        restoredApp,
        current,
        "select kxra.ai_run_admission($1,$2,$3) value",
        [currentRun.run, current.ep, current.sha(current.cipher)],
      ),
      false,
    );
    assert.equal(await current.gate(currentRun.run), true);
    await close(restoredApp);
    await close(restored);
    phases.push({
      phase: "ai118-recovery",
      target,
      verifiedEmpty: true,
      fullCatalogueDataSequencesEqual: true,
      legacyAndNewAuthorityPreserved: true,
      withdrawalStillDenies: true,
      tables: recoveryCatalog.tables.filter((t: any) => t.kind === "r").length,
      functions: recoveryCatalog.functions.length,
    });
    write("acceptance.json", {
      status: "PASS_PRODUCTION_AI117_118_LOCAL_REVIEW_ONLY",
      authorization: false,
      fullReleaseEligible: false,
      objective: spec.objective,
      sourceCommit: source,
      manifest: manifest.map(({ name, sha256 }: any) => ({ name, sha256 })),
      phases,
      inventory: {
        tableAdditions: additions,
        privateReachabilityUnchanged: true,
        fixtureObjectsAbsent: true,
      },
      termsOrFinancialCommitmentsChanged: false,
      fullFeatureDependencies: spec.fullFeatureDependencies,
      snapshotHashes: Object.fromEntries(
        [
          "canonical117-catalogue.json",
          "canonical117-data.json",
          "ai118-catalogue-source.json",
          "ai118-catalogue-restored.json",
          "ai118-data-source.json",
          "ai118-data-restored.json",
        ].map((n) => [
          n,
          crypto
            .createHash("sha256")
            .update(fs.readFileSync(path.join(runtime, n)))
            .digest("hex"),
        ]),
      ),
    });
    console.log("PRODUCTION_AI_NATIVE_REVIEW_PASS " + runtime);
  } finally {
    let clean = true;
    for (const c of clients) {
      try {
        await c.query("rollback");
      } catch {}
      try {
        await c.end();
      } catch {
        clean = false;
      }
    }
    if (originalConfig)
      try {
        fs.writeFileSync(configurationFile, originalConfig);
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
    write("cleanup.json", {
      clean,
      postgresStop: stopped.status,
      postgresStatus: status.status,
      postmasterPidAbsent: !fs.existsSync(
        path.join(runtime, "postgres/postmaster.pid"),
      ),
    });
    assert.ok(clean, "OWNED_CLEANUP_UNCERTAIN");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
