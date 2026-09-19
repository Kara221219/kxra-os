import assert from "node:assert/strict";
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
  throw Error(
    "Database configuration unavailable; start the test database first",
  );

const migrationNames = fs
  .readdirSync(path.join(root, "supabase", "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort();
assert.ok(migrationNames.length > 0, "No migrations found");
for (let index = 0; index < migrationNames.length; index += 1) {
  const expected = String(index + 1).padStart(4, "0") + "_";
  assert.ok(
    migrationNames[index].startsWith(expected),
    `Migration sequence must be contiguous: expected ${expected}, received ${migrationNames[index]}`,
  );
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
const database = new pg.Client({ ...config, user: os.userInfo().username });
await database.connect();
try {
  const applied = (
    await database.query(
      "select name from public.kxra_local_migrations order by name",
    )
  ).rows.map((row) => row.name);
  assert.deepEqual(
    applied,
    migrationNames,
    "Applied migration set differs from source",
  );

  const tables = (
    await database.query(`
      select c.relname as table_name,c.relrowsecurity,
        count(p.policyname)::int as policies
      from pg_class c
      join pg_namespace n on n.oid=c.relnamespace
      left join pg_policies p on p.schemaname=n.nspname and p.tablename=c.relname
      where n.nspname='kxra' and c.relkind='r'
      group by c.relname,c.relrowsecurity
      order by c.relname
    `)
  ).rows;
  assert.ok(tables.length > 0, "No KXRA tables found");
  assert.deepEqual(
    tables.filter((table) => !table.relrowsecurity),
    [],
    "Every KXRA table must have row-level security enabled",
  );
  assert.deepEqual(
    tables.filter((table) => table.policies < 1),
    [],
    "Every KXRA table must have an explicit policy",
  );

  const roles = (
    await database.query(`
      select rolname,rolsuper,rolbypassrls,rolinherit,rolcanlogin
      from pg_roles where rolname in ('anon','authenticated','kxra_app')
      order by rolname
    `)
  ).rows;
  assert.equal(roles.length, 3, "Required application roles are missing");
  for (const role of roles) {
    assert.equal(role.rolsuper, false, `${role.rolname} must not be superuser`);
    assert.equal(
      role.rolbypassrls,
      false,
      `${role.rolname} must not bypass RLS`,
    );
  }
  const appRole = roles.find((role) => role.rolname === "kxra_app");
  assert.equal(appRole.rolinherit, false, "kxra_app must be NOINHERIT");
  assert.equal(appRole.rolcanlogin, true, "kxra_app must be a login role");

  console.log(
    `Migration/RLS verification PASS (${migrationNames.length} migrations, ${tables.length} protected tables).`,
  );
} finally {
  await database.end();
}
