import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import pg from "pg";
import { importSeeds, loadSeeds, seedFixtures } from "./seed.mjs";
const root = path.resolve(import.meta.dirname, "..");
const runtime = path.resolve(
  process.env.KXRA_RUNTIME || path.join(root, ".runtime"),
);
const data = path.join(runtime, "postgres");
const socket = path.join(runtime, "socket");
function postgresBin() {
  if (process.env.KXRA_PG_BIN) return process.env.KXRA_PG_BIN;
  for (const candidate of [
    "/opt/homebrew/opt/postgresql@14/bin",
    "/opt/homebrew/opt/postgresql@16/bin",
    "/usr/local/opt/postgresql@14/bin",
    "/usr/local/opt/postgresql@16/bin",
  ])
    if (fs.existsSync(path.join(candidate, "pg_ctl"))) return candidate;
  try {
    return execFileSync("pg_config", ["--bindir"], {
      encoding: "utf8",
    }).trim();
  } catch {
    throw Error("PostgreSQL binaries unavailable; set KXRA_PG_BIN");
  }
}
const bin = postgresBin();
const port = Number(process.env.KXRA_PG_PORT || 55439);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("KXRA_PG_PORT must be a valid unprivileged port");
fs.mkdirSync(socket, { recursive: true, mode: 0o700 });
fs.chmodSync(runtime, 0o700);
const adminUser = os.userInfo().username;
const config = {
  host: socket,
  port,
  user: adminUser,
  database: "postgres",
};
function running() {
  try {
    execFileSync(path.join(bin, "pg_ctl"), ["-D", data, "status"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    try {
      execFileSync(
        path.join(bin, "pg_isready"),
        ["-h", socket, "-p", String(port), "-d", "postgres"],
        { stdio: "ignore" },
      );
      return true;
    } catch {
      return false;
    }
  }
}
async function start() {
  if (!fs.existsSync(path.join(data, "PG_VERSION")))
    execFileSync(
      path.join(bin, "initdb"),
      [
        "-D",
        data,
        "--auth-local=trust",
        "--auth-host=reject",
        "--encoding=UTF8",
        "--no-locale",
      ],
      { stdio: "ignore" },
    );
  if (!running())
    execFileSync(
      path.join(bin, "pg_ctl"),
      [
        "-D",
        data,
        "-l",
        path.join(runtime, "postgres.log"),
        "-o",
        `-k '${socket}' -p ${port} -h ''`,
        "-w",
        "start",
      ],
      { stdio: "inherit" },
    );
  const db = new pg.Client(config);
  await db.connect();
  for (const role of ["anon", "authenticated", "kxra_app"]) {
    const x = await db.query("select 1 from pg_roles where rolname=$1", [role]);
    if (!x.rowCount)
      await db.query(
        `create role ${role} ${role === "kxra_app" ? "login noinherit" : "nologin"} nobypassrls`,
      );
  }
  await db.query("grant authenticated,anon to kxra_app");
  await db.query(
    `create schema if not exists auth; create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;grant usage on schema auth to anon,authenticated;grant execute on all functions in schema auth to anon,authenticated;`,
  );
  await db.query("begin");
  try {
    await db.query(
      "select pg_advisory_xact_lock(hashtext('kxra-local-migrations'))",
    );
    await db.query(
      "create table if not exists public.kxra_local_migrations(name text primary key)",
    );
    if (
      (await db.query("select to_regclass('kxra.projects') as exists")).rows[0]
        .exists
    )
      await db.query(
        "insert into public.kxra_local_migrations values('0001_core.sql') on conflict do nothing",
      );
    for (const name of fs
      .readdirSync(path.join(root, "supabase/migrations"))
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      if (
        (
          await db.query(
            "select 1 from public.kxra_local_migrations where name=$1",
            [name],
          )
        ).rowCount
      )
        continue;
      const sql = fs
        .readFileSync(path.join(root, "supabase/migrations", name), "utf8")
        .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
        .replace(/commit;\s*$/i, "");
      await db.query(sql);
      await db.query("insert into public.kxra_local_migrations values($1)", [
        name,
      ]);
    }
    await importSeeds(db, loadSeeds(root));
    await seedFixtures(db);
    await db.query("commit");
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
  await db.end();
  fs.writeFileSync(
    path.join(runtime, "database.json"),
    JSON.stringify({ ...config, user: "kxra_app" }),
  );
  console.log("Isolated local PostgreSQL ready (Unix socket only).");
}
const action = process.argv[2] || "start";
if (action === "stop") {
  if (running())
    execFileSync(
      path.join(bin, "pg_ctl"),
      ["-D", data, "-m", "fast", "-w", "stop"],
      { stdio: "inherit" },
    );
} else if (action === "reset") {
  throw Error(
    "Reset disabled to preserve local work. Use a fresh runtime directory for destructive tests.",
  );
} else await start();
