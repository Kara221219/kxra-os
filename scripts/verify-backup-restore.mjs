import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";

const root = path.resolve(import.meta.dirname, "..");
const runtime = path.resolve(
  process.env.KXRA_RUNTIME || path.join(root, ".runtime"),
);
const configPath = path.join(runtime, "database.json");
if (!fs.existsSync(configPath))
  throw Error("Local database is not initialized");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const admin = { ...config, user: os.userInfo().username };
const targetName = `kxra_restore_${crypto.randomBytes(6).toString("hex")}`;
const drill = path.join(runtime, "restore-drill");
const dump = path.join(drill, "database.dump");
const backupObjects = path.join(drill, "backup-objects");
const restoredObjects = path.join(drill, "restored-objects");
const started = Date.now();

function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function copyObjects(source, destination) {
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(source)) return [];
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
  const files = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (
        entry.isFile() &&
        !path.relative(destination, absolute).startsWith("_reconciliation")
      ) {
        files.push({
          key: path.relative(destination, absolute).split(path.sep).join("/"),
          bytes: fs.statSync(absolute).size,
          sha256: sha256File(absolute),
        });
      }
    }
  };
  walk(destination);
  return files.sort((a, b) => a.key.localeCompare(b.key));
}

async function evidence(database) {
  const client = new pg.Client({ ...admin, database });
  await client.connect();
  try {
    const tables = (
      await client.query(`
      select c.relname as name,c.relrowsecurity,
        count(p.policyname)::int as policies,
        ((xpath('/row/count/text()',query_to_xml(format(
          'select count(*) as count from kxra.%I',c.relname
        ),false,true,'')))[1]::text)::bigint as rows
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
      left join pg_policies p on p.schemaname=n.nspname and p.tablename=c.relname
      where n.nspname='kxra' and c.relkind='r'
      group by c.relname,c.relrowsecurity order by c.relname
    `)
    ).rows;
    const migrations = (
      await client.query(
        "select name from public.kxra_local_migrations order by name",
      )
    ).rows.map((row) => row.name);
    const focus = {};
    for (const table of [
      "agreement_acceptances",
      "legal_acceptances",
      "approvals",
      "routine_run_checkpoints",
      "transactional_email_outbox",
      "inbound_events",
      "knowledge_chunks",
      "knowledge_query_runs",
      "file_versions",
      "records",
    ]) {
      const exists = await client.query("select to_regclass($1) as name", [
        `kxra.${table}`,
      ]);
      if (exists.rows[0].name)
        focus[table] = (
          await client.query(`select count(*)::int as rows from kxra.${table}`)
        ).rows[0].rows;
    }
    return { migrations, tables, focus };
  } finally {
    await client.end();
  }
}

fs.rmSync(drill, { recursive: true, force: true });
fs.mkdirSync(drill, { recursive: true, mode: 0o700 });
const sourceEvidence = await evidence(config.database);
const sourceObjects = copyObjects(path.join(runtime, "objects"), backupObjects);
execFileSync(
  "pg_dump",
  [
    "-h",
    config.host,
    "-p",
    String(config.port),
    "-U",
    admin.user,
    "-d",
    config.database,
    "--format=custom",
    "--file",
    dump,
  ],
  { stdio: "inherit" },
);

const control = new pg.Client(admin);
await control.connect();
try {
  await control.query(`create database "${targetName}"`);
} finally {
  await control.end();
}

let restoredEvidence;
try {
  execFileSync(
    "pg_restore",
    [
      "-h",
      config.host,
      "-p",
      String(config.port),
      "-U",
      admin.user,
      "-d",
      targetName,
      "--no-owner",
      "--exit-on-error",
      dump,
    ],
    { stdio: "inherit" },
  );
  restoredEvidence = await evidence(targetName);
  assert.deepEqual(restoredEvidence, sourceEvidence);
  fs.cpSync(backupObjects, restoredObjects, {
    recursive: true,
    errorOnExist: true,
  });
  const restoredObjectsManifest = copyObjects(
    restoredObjects,
    path.join(drill, "verified-objects"),
  );
  assert.deepEqual(restoredObjectsManifest, sourceObjects);
} finally {
  const cleanup = new pg.Client(admin);
  await cleanup.connect();
  try {
    await cleanup.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname=$1",
      [targetName],
    );
    await cleanup.query(`drop database if exists "${targetName}"`);
  } finally {
    await cleanup.end();
  }
}

const manifest = {
  schema: "KXRA_LOCAL_RESTORE_DRILL_V1",
  created_at: new Date(started).toISOString(),
  reviewer: "AUTOMATED_LOCAL_DRILL",
  source_database: config.database,
  target: "EMPTY_ISOLATED_DATABASE",
  database_dump_sha256: sha256File(dump),
  database_tables: sourceEvidence.tables.length,
  database_rows: sourceEvidence.tables.reduce(
    (sum, table) => sum + Number(table.rows),
    0,
  ),
  migration_count: sourceEvidence.migrations.length,
  object_count: sourceObjects.length,
  objects: sourceObjects,
  focus_state: sourceEvidence.focus,
  rpo_seconds: 0,
  rto_seconds: Math.ceil((Date.now() - started) / 1000),
  discrepancies: [],
  result: "PASS",
};
fs.writeFileSync(
  path.join(drill, "manifest.json"),
  JSON.stringify(manifest, null, 2),
  { mode: 0o600 },
);
console.log(
  `AT-29 empty-target restore PASS (${manifest.database_tables} tables, ${manifest.database_rows} rows, ${manifest.object_count} objects, RTO ${manifest.rto_seconds}s).`,
);
