import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { productionDatabaseConfig } from "./production-database.mjs";
import {
  expectedProductionDatabase,
  migrationManifest,
  productionProjectRef,
  reconcileMigrationState,
  validateProductionMigrator,
} from "./production-migrations-core.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "plan";
const validation = validateProductionMigrator(process.env, command);
if (!validation.ok)
  throw Error(
    `Production migration guard rejected:\n- ${validation.findings.join("\n- ")}`,
  );

const manifest = migrationManifest(root);
if (manifest.length !== expectedProductionDatabase.migrations)
  throw Error("PRODUCTION_EXPECTED_MIGRATION_COUNT_CHANGED");

function repositoryState() {
  const branch = execFileSync("git", ["branch", "--show-current"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const dirty = execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const remote = execFileSync(
    "git",
    ["rev-parse", "origin/codex/phase-2-completion"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  if (branch !== "codex/phase-2-completion")
    throw Error("PRODUCTION_MIGRATIONS_REQUIRE_PHASE_BRANCH");
  if (dirty) throw Error("PRODUCTION_MIGRATIONS_REQUIRE_CLEAN_TREE");
  if (head !== remote) throw Error("PRODUCTION_MIGRATIONS_REQUIRE_PUSHED_HEAD");
  if (head !== process.env.KXRA_PRODUCTION_SOURCE_COMMIT)
    throw Error("PRODUCTION_MIGRATIONS_REQUIRE_EXACT_SOURCE_COMMIT");
  return head;
}

async function tracking(database) {
  const result = await database.query(
    "select to_regclass('public.kxra_schema_migrations') is not null as tracked,to_regnamespace('kxra') is not null as managed",
  );
  if (!result.rows[0].tracked)
    return { managed: result.rows[0].managed, rows: [] };
  const rows = (
    await database.query(
      "select name,sha256,source_commit from public.kxra_schema_migrations order by name",
    )
  ).rows;
  return { managed: result.rows[0].managed, rows };
}

async function verify(database) {
  const tracked = await tracking(database);
  const state = reconcileMigrationState(
    manifest,
    tracked.rows,
    tracked.managed,
  );
  if (state.pending.length) throw Error("PRODUCTION_MIGRATIONS_INCOMPLETE");
  const tables = (
    await database.query(`select count(*)::int n from (
      select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
      left join pg_policies p on p.schemaname=n.nspname and p.tablename=c.relname
      where n.nspname='kxra' and c.relkind='r' and c.relrowsecurity
      group by c.oid having count(p.policyname)>0
    ) protected`)
  ).rows[0].n;
  const functions = (
    await database.query(`select count(*)::int n from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra'`)
  ).rows[0].n;
  if (tables !== expectedProductionDatabase.protectedTables)
    throw Error(`PRODUCTION_RLS_TABLE_COUNT_MISMATCH:${tables}`);
  if (functions !== expectedProductionDatabase.exposedFunctions)
    throw Error(`PRODUCTION_FUNCTION_COUNT_MISMATCH:${functions}`);
  console.log(
    `Production database verification PASS (${manifest.length} migrations, ${tables} protected tables, ${functions} exposed functions).`,
  );
}

const sourceCommit = repositoryState();
const database = new pg.Client(
  productionDatabaseConfig(
    process.env.KXRA_PRODUCTION_MIGRATOR_DATABASE_URL,
    `kxra-production-migrations-${command}`,
  ),
);
await database.connect();
try {
  await database.query("set statement_timeout='30s'");
  const target = (
    await database.query(
      "select current_database() database,current_user username",
    )
  ).rows[0];
  if (
    target.database !== "postgres" ||
    !String(target.username).startsWith("postgres")
  )
    throw Error("PRODUCTION_MIGRATOR_IDENTITY_INVALID");

  const project = (
    await database.query(
      "select current_setting('app.settings.project_ref',true) project_ref",
    )
  ).rows[0]?.project_ref;
  if (project && project !== productionProjectRef)
    throw Error("PRODUCTION_DATABASE_PROJECT_REF_MISMATCH");

  const tracked = await tracking(database);
  const state = reconcileMigrationState(
    manifest,
    tracked.rows,
    tracked.managed,
  );
  if (command === "plan") {
    if (state.applied !== 0 || tracked.managed)
      throw Error("PRODUCTION_INITIALIZATION_REQUIRES_EMPTY_TARGET");
    const extensions = (
      await database.query(
        "select extname,extversion from pg_extension order by extname",
      )
    ).rows;
    console.log(
      `Production migration plan: empty target verified; ${manifest.length} migrations pending; ${extensions.length} installed extensions inspected.`,
    );
  } else if (command === "apply") {
    if (state.applied !== 0 || tracked.managed)
      throw Error("PRODUCTION_INITIALIZATION_REQUIRES_EMPTY_TARGET");
    await database.query(
      "select pg_advisory_lock(hashtext('kxra-production-migrations'))",
    );
    try {
      const locked = await tracking(database);
      if (locked.rows.length !== 0 || locked.managed)
        throw Error("PRODUCTION_INITIALIZATION_REQUIRES_EMPTY_TARGET");
      await database.query(`create table public.kxra_schema_migrations(
        name text primary key,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
        source_commit text not null check(source_commit~'^[a-f0-9]{40}$'),
        applied_at timestamptz not null default now()
      )`);
      await database.query(
        "revoke all on table public.kxra_schema_migrations from public,anon,authenticated",
      );
      for (const item of manifest) {
        await database.query("begin");
        try {
          await database.query(item.sql);
          await database.query(
            "insert into public.kxra_schema_migrations(name,sha256,source_commit) values($1,$2,$3)",
            [item.name, item.sha256, sourceCommit],
          );
          await database.query("commit");
        } catch (error) {
          await database.query("rollback");
          throw error;
        }
      }
    } finally {
      await database.query(
        "select pg_advisory_unlock(hashtext('kxra-production-migrations'))",
      );
    }
    await verify(database);
  } else await verify(database);
} finally {
  await database.end();
}
