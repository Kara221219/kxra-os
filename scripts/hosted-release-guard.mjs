// Host-only release boundary. Local fixture migration discovery is intentionally unchanged.
import fs from "node:fs";
import path from "node:path";
import { migrationManifest } from "./staging-migrations-core.mjs";
const policy = JSON.parse(
  fs.readFileSync(
    new URL(
      "../packages/release/hosted-schema-policy-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
if (
  policy.version !== 1 ||
  policy.migrations.length !== 117 ||
  policy.expectedDatabase.migrations !== 117 ||
  policy.migrations.some(
    (m, i) =>
      !m.name.startsWith(String(i + 1).padStart(4, "0") + "_") ||
      !/^[a-f0-9]{64}$/.test(m.sha256),
  )
)
  throw Error("HOSTED_RELEASE_POLICY_INVALID");
export const expectedHostedDatabase = Object.freeze({
  ...policy.expectedDatabase,
});
export const hostedFixtureObjects = Object.freeze(
  Object.fromEntries(
    Object.entries(policy.fixtureObjects).map(([kind, names]) => [
      kind,
      Object.freeze([...names]),
    ]),
  ),
);
export function hostedMigrationManifest(root, extensions = []) {
  if (!Array.isArray(extensions) || extensions.length)
    throw Error("HOSTED_RELEASE_EXTENSIONS_FORBIDDEN");
  const real = fs.realpathSync(root),
    directory = path.join(real, "supabase/migrations");
  if (fs.realpathSync(directory) !== directory)
    throw Error("HOSTED_RELEASE_MIGRATION_DIRECTORY_SYMLINK");
  for (const name of fs
    .readdirSync(directory)
    .filter((n) => n.endsWith(".sql"))) {
    if (!fs.lstatSync(path.join(directory, name)).isFile())
      throw Error("HOSTED_RELEASE_MIGRATION_NOT_REGULAR:" + name);
  }
  // Read/hash once; callers execute these same validated in-memory SQL bytes.
  const manifest = migrationManifest(real),
    allowed = new Map(policy.migrations.map((m) => [m.name, m.sha256]));
  const fixtureNames = new Set(
    policy.fixtureFiles
      .filter((f) => f.path.startsWith("supabase/migrations/"))
      .map((f) => path.basename(f.path)),
  );
  for (const m of manifest) {
    if (fixtureNames.has(m.name))
      throw Error("HOSTED_RELEASE_FIXTURE_MIGRATION:" + m.name);
    if (!allowed.has(m.name))
      throw Error("HOSTED_RELEASE_UNKNOWN_MIGRATION:" + m.name);
    if (allowed.get(m.name) !== m.sha256)
      throw Error("HOSTED_RELEASE_MIGRATION_HASH_MISMATCH:" + m.name);
  }
  if (manifest.length !== policy.migrations.length)
    throw Error("HOSTED_RELEASE_BASELINE_INCOMPLETE");
  return manifest;
}
export async function assertNoHostedFixtureObjects(database) {
  const result = await database.query(
    `
    select 'schema' kind,n.nspname qualified_name from pg_namespace n where n.nspname=any($1::text[])
    union all
    select 'relation',n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname||'.'||c.relname=any($2::text[])
    union all
    select 'function',n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=any($3::text[])
    order by 1,2`,
    [
      hostedFixtureObjects.schemas,
      hostedFixtureObjects.relations,
      hostedFixtureObjects.functions,
    ],
  );
  if (!Array.isArray(result.rows))
    throw Error("HOSTED_RELEASE_CATALOGUE_UNAVAILABLE");
  if (result.rows.length)
    throw Error(
      "HOSTED_RELEASE_FIXTURE_OBJECT:" +
        result.rows[0].kind +
        ":" +
        result.rows[0].qualified_name,
    );
}
