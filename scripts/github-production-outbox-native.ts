import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import {
  hostedMigrationManifest,
  assertNoHostedFixtureObjects,
} from "./hosted-release-guard.mjs";
import {
  productionOperationsPayload,
  productionOperationsSource,
} from "./production-operations-review.mjs";
import { integrationCatalog, integrationData } from "./integration-catalog.mjs";
import { postgresBin } from "./postgres-bin.mjs";
async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-gho-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/github-outbox");
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  async function port() {
    const s = net.createServer();
    await new Promise<void>((r, j) => {
      s.once("error", j);
      s.listen(0, "127.0.0.1", r);
    });
    const p = (s.address() as net.AddressInfo).port;
    await new Promise<void>((r) => s.close(() => r()));
    return p;
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
  const write = (n: string, v: unknown) =>
    fs.writeFileSync(path.join(runtime, n), JSON.stringify(v, null, 2) + "\n", {
      mode: 0o600,
    });
  const run = (args: string[]) => {
    const r = spawnSync(process.execPath, args, {
      cwd: root,
      env,
      stdio: "inherit",
      timeout: 240000,
    });
    assert.equal(r.status, 0, args.join(" "));
  };
  let db: pg.Client | undefined;
  try {
    assert.ok(!fs.existsSync(path.join(runtime, "postgres")));
    const base = hostedMigrationManifest(root);
    assert.equal(base.length, 117);
    run(["scripts/database.mjs", "start"]);
    const cfg = JSON.parse(
      fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
    );
    assert.equal(cfg.host, path.join(runtime, "socket"));
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
    const source = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      p = productionOperationsPayload(root);
    for (const [name, bytes] of [
      [p.ai.spec.candidateMigration.name, p.ai.bytes],
      [p.spec.candidateMigration.name, p.bytes],
    ])
      fs.writeFileSync(path.join(root, "supabase/migrations", name), bytes, {
        flag: "wx",
      });
    const manifest = productionOperationsSource(root);
    await db.query(
      "create table public.kxra_schema_migrations(name text primary key,sha256 text not null,source_commit text not null)",
    );
    for (const m of base)
      await db.query(
        "insert into public.kxra_schema_migrations values($1,$2,$3)",
        [m.name, m.sha256, source],
      );
    for (const m of manifest.slice(117)) {
      await db.query("begin");
      try {
        await db.query(m.sql);
        await db.query("insert into public.kxra_local_migrations values($1)", [
          m.name,
        ]);
        await db.query(
          "insert into public.kxra_schema_migrations values($1,$2,$3)",
          [m.name, m.sha256, source],
        );
        await db.query("commit");
      } catch (e) {
        await db.query("rollback");
        throw e;
      }
    }
    const payload = fs.readFileSync(
        "database/production/github-outbox-v1.sql",
        "utf8",
      ),
      body = payload
        .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
        .replace(/commit;\s*$/i, "");
    const before = await integrationCatalog(db),
      beforeData = await integrationData(db, before);
    await db.query("begin");
    await db.query(body);
    await assert.rejects(db.query("select 1/0"), { code: "22012" });
    await db.query("rollback");
    assert.deepEqual(await integrationCatalog(db), before);
    assert.deepEqual(await integrationData(db, before), beforeData);
    await db.query(payload);
    const catalog = await integrationCatalog(db);
    const newTables = catalog.tables.filter(
      (t: any) =>
        t.kind === "r" &&
        !before.tables.some(
          (b: any) => b.schema === t.schema && b.name === t.name,
        ),
    );
    assert.deepEqual(newTables.map((t: any) => t.name).sort(), [
      "ghp_activations",
      "ghp_attempts",
      "ghp_capabilities",
      "ghp_connections",
      "ghp_consumptions",
      "ghp_effects",
      "ghp_reads",
      "ghp_receipts",
      "ghp_writes",
    ]);
    for (const t of newTables) {
      assert.equal(t.rls, true);
      assert.ok(t.effective_table_privileges.every((v: any) => !v.reachable));
      assert.equal(
        (await db.query(`select count(*)::int n from kxra_private."${t.name}"`))
          .rows[0].n,
        0,
      );
    }
    for (const role of ["app", "authenticated", "anon"]) {
      const reach = (c: any) =>
        c.functions
          .filter(
            (f: any) => f.schema === "kxra_private" && f[role + "_reachable"],
          )
          .map((f: any) => f.name + "(" + f.arguments + ")");
      assert.deepEqual(reach(catalog), reach(before));
    }
    const newFunctions = catalog.functions.filter(
      (f: any) =>
        !before.functions.some(
          (b: any) =>
            b.schema === f.schema &&
            b.name === f.name &&
            b.arguments === f.arguments,
        ),
    );
    assert.deepEqual(
      newFunctions.map((f: any) => f.schema + "." + f.name).sort(),
      [
        "kxra.github_prod_human",
        "kxra.github_prod_receipt",
        "kxra.github_prod_worker",
        ...[
          "ghp_object",
          "ghp_sha",
          "ghp_iso",
          "ghp_binding_valid",
          "ghp_binding_hash",
          "ghp_operation_text",
          "ghp_operation_hash",
          "ghp_utf16",
          "ghp_immutable",
          "ghp_authority_writer",
          "ghp_human",
          "ghp_fence",
          "ghp_cap",
          "ghp_cap_current",
          "ghp_approval_hash",
          "ghp_projection",
        ].map((n) => "kxra_private." + n),
      ].sort(),
    );
    assert.deepEqual(catalog.sequences, before.sequences);
    const aclRoles = [
      "kxra_app",
      "authenticated",
      "anon",
      "kxra_billing_worker",
      "kxra_ai_worker",
    ];
    const effective = [];
    for (const role of aclRoles) {
      for (const table of newTables) {
        for (const privilege of [
          "SELECT",
          "INSERT",
          "UPDATE",
          "DELETE",
          "TRUNCATE",
          "REFERENCES",
          "TRIGGER",
        ]) {
          assert.equal(
            (
              await db.query("select has_table_privilege($1,$2,$3) allowed", [
                role,
                "kxra_private." + table.name,
                privilege,
              ])
            ).rows[0].allowed,
            false,
          );
        }
      }
      for (const f of newFunctions) {
        const signature = f.schema + "." + f.name + "(" + f.arguments + ")";
        const allowed = (
          await db.query(
            "select has_function_privilege($1,$2,'EXECUTE') allowed",
            [role, signature],
          )
        ).rows[0].allowed;
        assert.equal(
          allowed,
          f.schema === "kxra" && ["kxra_app", "authenticated"].includes(role),
        );
        effective.push({ role, signature, execute: allowed });
      }
    }
    write("outbox-exact-inventory.json", {
      tables: newTables,
      functions: newFunctions,
      triggers: catalog.triggers.filter(
        (t: any) =>
          !before.triggers.some(
            (b: any) =>
              b.schema === t.schema &&
              b.name === t.name &&
              b.tgname === t.tgname,
          ),
      ),
      effective,
      sequenceDelta: 0,
    });
    await assertNoHostedFixtureObjects(db);
    write("installed-catalogue.json", catalog);
    write("schema-proof.json", {
      sourceCommit: source,
      payloadSha256: crypto.createHash("sha256").update(payload).digest("hex"),
      newPrivateRlsTables: newTables.map((t: any) => t.name),
      noSeededActivationConnectionsCapabilities: true,
      rollbackCatalogueDataAcl: true,
      canonicalMigrations: 119,
      hostedActivation: false,
    });
    run([
      "--import",
      "tsx",
      "--test",
      "tests/review-operations/review-operations.db.test.ts",
    ]);
    run([
      "--import",
      "tsx",
      "--test",
      "--test-concurrency=1",
      "tests/github-production-outbox.test.ts",
      "tests/connectors/github-production-outbox.db.test.ts",
    ]);
    const restartCatalog = await integrationCatalog(db),
      restartData = await integrationData(db, restartCatalog);
    await db.end();
    db = undefined;
    execFileSync(
      path.join(postgresBin(env), "pg_ctl"),
      ["-D", path.join(runtime, "postgres"), "restart", "-w"],
      { stdio: "inherit", timeout: 30000 },
    );
    db = new pg.Client({ ...cfg, user: os.userInfo().username });
    await db.connect();
    assert.deepEqual(await integrationCatalog(db), restartCatalog);
    assert.deepEqual(await integrationData(db, restartCatalog), restartData);
    env.KXRA_OUTBOX_RESTART_ONLY = "true";
    run([
      "--import",
      "tsx",
      "--test",
      "tests/connectors/github-production-outbox.restore.test.ts",
    ]);
    delete env.KXRA_OUTBOX_RESTART_ONLY;
    const finalCatalog = await integrationCatalog(db),
      data = await integrationData(db, finalCatalog);
    write("catalogue-source.json", finalCatalog);
    write("data-source.json", data);
    const ledgers = {
      local: (
        await db.query(
          "select * from public.kxra_local_migrations order by name",
        )
      ).rows,
      hashed: (
        await db.query(
          "select * from public.kxra_schema_migrations order by name",
        )
      ).rows,
    };
    write("ledger-source.json", ledgers);
    const pass = path.join(runtime, "empty-libpq");
    fs.writeFileSync(pass, "", { mode: 0o600, flag: "wx" });
    const subEnv: NodeJS.ProcessEnv = {
        NODE_ENV: "test",
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
      dump = path.join(runtime, "github-outbox.dump");
    execFileSync(
      path.join(postgresBin(env), "pg_dump"),
      [...opts, "-d", "postgres", "--format=custom", "--file", dump],
      { env: subEnv, stdio: "inherit", timeout: 120000 },
    );
    const target =
      "kxra_outbox_restore_" + crypto.randomBytes(6).toString("hex");
    await db.query(`create database "${target}" template template0`);
    const restored = new pg.Client({
      ...cfg,
      user: os.userInfo().username,
      database: target,
    });
    await restored.connect();
    try {
      for (const [t, col] of [
        ["pg_class", "relnamespace"],
        ["pg_proc", "pronamespace"],
      ])
        assert.equal(
          (
            await restored.query(
              `select count(*)::int n from ${t} x join pg_namespace n on n.oid=x.${col} where n.nspname not like 'pg_%' and n.nspname<>'information_schema'`,
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
        { env: subEnv, stdio: "inherit", timeout: 120000 },
      );
      const rc = await integrationCatalog(restored),
        rd = await integrationData(restored, rc);
      assert.deepEqual(rc, finalCatalog);
      assert.deepEqual(rd, data);
      write("catalogue-restored.json", rc);
      write("data-restored.json", rd);
      const rl = {
        local: (
          await restored.query(
            "select * from public.kxra_local_migrations order by name",
          )
        ).rows,
        hashed: (
          await restored.query(
            "select * from public.kxra_schema_migrations order by name",
          )
        ).rows,
      };
      assert.deepEqual(rl, ledgers);
      write("ledger-restored.json", rl);
    } finally {
      await restored.end();
    }
    fs.writeFileSync(
      path.join(runtime, "restored-database.json"),
      JSON.stringify({ ...cfg, database: target }),
      { mode: 0o600 },
    );
    run([
      "--import",
      "tsx",
      "--test",
      "tests/connectors/github-production-outbox.restore.test.ts",
    ]);
    write("acceptance.json", {
      status: "PASS_LOCAL_GITHUB_OUTBOX_BOUNDARY",
      sourceCommit: source,
      production119WithUnnumberedOutboxOnly: true,
      fullPrivateInventoryAclDataAndLedgersRestored: true,
      restoredUncertainNoReplay: true,
      providerCalls: 0,
      realCredentials: false,
      hostedChanges: false,
      productionActivation: false,
    });
    console.log("GITHUB_PRODUCTION_OUTBOX_NATIVE_PASS " + runtime);
  } finally {
    let resourcesClean = true;
    try {
      if (db) await db.end();
    } catch {
      resourcesClean = false;
    }
    const recoveryFile = path.join(runtime, "ephemeral-recovery-state.json");
    try {
      if (fs.existsSync(recoveryFile)) fs.unlinkSync(recoveryFile);
    } catch {
      resourcesClean = false;
    }

    const stop = spawnSync(process.execPath, ["scripts/database.mjs", "stop"], {
        cwd: root,
        env,
        stdio: "inherit",
        timeout: 30000,
      }),
      status = spawnSync(
        path.join(postgresBin(env), "pg_ctl"),
        ["-D", path.join(runtime, "postgres"), "status"],
        { stdio: "ignore", timeout: 5000 },
      );
    const clean =
      resourcesClean &&
      !fs.existsSync(recoveryFile) &&
      stop.status === 0 &&
      status.status === 3 &&
      !fs.existsSync(path.join(runtime, "postgres/postmaster.pid"));
    write("cleanup.json", {
      clean,
      postgresStop: stop.status,
      postgresStatus: status.status,
      ephemeralRecoveryCapabilitiesAbsent: !fs.existsSync(recoveryFile),
      postmasterPidAbsent: !fs.existsSync(
        path.join(runtime, "postgres/postmaster.pid"),
      ),
    });
    assert.ok(clean, "OWNED_OUTBOX_CLEANUP_UNCERTAIN");
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
