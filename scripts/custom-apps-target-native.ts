import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import {
  pairedCompositionCatalog,
  pairedCompositionData,
} from "./paired-composition-catalog.mjs";
import { exampleCustomApp } from "../packages/custom-apps/contract";
/** Existing local installations must never be overwritten by the fresh payload. */
export async function proveCustomAppsTargetRefusal(p: {
  admin: pg.Client;
  cfg: any;
  runtime: string;
  bin: string;
  fixture: { org: string; actor: string; room: string };
  sql: string;
  write(name: string, value: unknown): void;
}) {
  assert.match(
    p.runtime,
    /^\/(?:private\/)?tmp\/kxra-capps-[A-Za-z0-9]+\/\.runtime\/production-apps$/,
  );
  assert.equal(p.cfg.host, path.join(p.runtime, "socket"));
  assert.equal(p.cfg.database, "postgres");
  assert.ok(!p.cfg.password && !p.cfg.ssl && !p.cfg.connectionString);
  const before = await pairedCompositionCatalog(p.admin),
    dataBefore = await pairedCompositionData(p.admin, before);
  const id = () => crypto.randomUUID(),
    target = "custom_apps_local_guard_" + id().replaceAll("-", "");
  const dump = path.join(p.runtime, "target-baseline.dump"),
    pass = path.join(p.runtime, "empty.pgpass");
  fs.writeFileSync(pass, "", { mode: 0o600 });
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "development",
    PATH: process.env.PATH,
    HOME: p.runtime,
    LANG: "C",
    LC_ALL: "C",
    PGPASSFILE: pass,
  };
  const run = (command: string, args: string[]) =>
    execFileSync(path.join(p.bin, command), args, {
      env,
      timeout: 120000,
      stdio: "pipe",
    });
  run("pg_dump", [
    "-h",
    p.cfg.host,
    "-p",
    String(p.cfg.port),
    "-U",
    os.userInfo().username,
    "-d",
    "postgres",
    "-Fc",
    "-f",
    dump,
  ]);
  assert.equal(
    (
      await p.admin.query(
        "select count(*)::int n from pg_database where datname=$1",
        [target],
      )
    ).rows[0].n,
    0,
  );
  await p.admin.query('create database "' + target + '" template template0');
  const admin = new pg.Client({
      ...p.cfg,
      user: os.userInfo().username,
      database: target,
    }),
    app = new pg.Client({ ...p.cfg, database: target });
  try {
    await admin.connect();
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname!~'^pg_' and n.nspname<>'information_schema'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname!~'^pg_' and n.nspname<>'information_schema'",
        )
      ).rows[0].n,
      0,
    );
    run("pg_restore", [
      "-h",
      p.cfg.host,
      "-p",
      String(p.cfg.port),
      "-U",
      os.userInfo().username,
      "-d",
      target,
      "--single-transaction",
      "--exit-on-error",
      dump,
    ]);
    for (const file of [
      "packages/custom-apps/local-schema.sql",
      "packages/custom-apps/local-records-schema.sql",
    ])
      await admin.query(fs.readFileSync(file, "utf8"));
    await app.connect();
    await app.query("begin;set local role authenticated");
    await app.query(
      "select set_config('request.jwt.claim.sub',$1,true),set_config('request.kxra.org_id',$2,true),set_config('request.jwt.claims',$3,true),set_config('request.kxra.execution_mode','fixture',true)",
      [
        p.fixture.actor,
        p.fixture.org,
        JSON.stringify({
          sub: p.fixture.actor,
          session_version: 1,
          aal: "aal2",
          auth_time: Math.floor(Date.now() / 1000),
        }),
      ],
    );
    const appId = id(),
      recordId = id(),
      operation = id(),
      values = Object.fromEntries(
        exampleCustomApp.fields.map((f) => [
          f.key,
          f.type === "checkbox"
            ? true
            : f.type === "select"
              ? f.options[0]
              : "Synthetic retained local data",
        ]),
      );
    await app.query("select kxra.custom_app_register($1,$2,0,$3)", [
      appId,
      p.fixture.room,
      exampleCustomApp,
    ]);
    await app.query(
      "select kxra.custom_app_release($1,$2,1,1,'PUBLISH_LOCAL')",
      [appId, p.fixture.room],
    );
    await app.query(
      "select kxra.custom_app_record_save($1,$2,$3,$4,2,1,0,$5)",
      [operation, recordId, appId, p.fixture.room, values],
    );
    await app.query("commit");
    const catalog = await pairedCompositionCatalog(admin),
      data = await pairedCompositionData(admin, catalog);
    let refused = false;
    try {
      await admin.query(p.sql);
    } catch (error) {
      assert.ok(["42723", "42P07"].includes((error as any).code));
      refused = true;
    } finally {
      await admin.query("rollback");
    }
    assert.ok(refused, "LOCAL_EXTENSION_TARGET_MUST_REFUSE_FRESH_INSTALL");
    assert.deepEqual(await pairedCompositionCatalog(admin), catalog);
    assert.deepEqual(await pairedCompositionData(admin, catalog), data);
    p.write("target-local-catalog.json", catalog);
    p.write("target-local-data.json", data);
    p.write("target-refusal.json", {
      verifiedEmptyOwnedTarget: target,
      localApp: appId,
      record: recordId,
      operation,
      productionPayloadRefused: true,
      allLocalCatalogueAndDataPreserved: true,
      numberedMigrationsAssigned: [],
      hostedApplied: false,
    });
    assert.deepEqual(await pairedCompositionCatalog(p.admin), before);
    assert.deepEqual(await pairedCompositionData(p.admin, before), dataBefore);
  } finally {
    const closed = await Promise.allSettled([app.end(), admin.end()]);
    assert.ok(
      closed.every((r) => r.status === "fulfilled"),
      "TARGET_REFUSAL_CLIENT_CLEANUP_UNCONFIRMED",
    );
  }
}
