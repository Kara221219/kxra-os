import assert from "node:assert/strict";
import { test, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  migrationManifest,
  expectedStagingDatabase,
} from "../scripts/staging-migrations-core.mjs";
import {
  hostedMigrationManifest,
  expectedHostedDatabase,
  hostedFixtureObjects,
  assertNoHostedFixtureObjects,
} from "../scripts/hosted-release-guard.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  policy = JSON.parse(
    fs.readFileSync(
      path.join(root, "packages/release/hosted-schema-policy-v1.json"),
      "utf8",
    ),
  );
const owned = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-release-source-"));
after(() => fs.rmSync(owned, { recursive: true, force: true }));
let sequence = 0;
function baseline() {
  const dir = path.join(owned, String(sequence++)),
    migrations = path.join(dir, "supabase/migrations");
  fs.mkdirSync(migrations, { recursive: true });
  for (const m of policy.migrations)
    fs.copyFileSync(
      path.join(root, "supabase/migrations", m.name),
      path.join(migrations, m.name),
    );
  return dir;
}
test("hosted source refuses fixture119 while unchanged local discovery retains all119", () => {
  assert.equal(migrationManifest(root).length, 119);
  assert.equal(expectedStagingDatabase.migrations, 119);
  assert.throws(
    () => hostedMigrationManifest(root),
    /HOSTED_RELEASE_FIXTURE_MIGRATION:0118_fixture_paired_agents.sql/,
  );
});
test("hosted117 source is exact hash-bound review baseline, without filtering or authorization", () => {
  const dir = baseline(),
    manifest = hostedMigrationManifest(dir);
  assert.equal(manifest.length, 117);
  assert.equal(expectedHostedDatabase.protectedTables, 214);
  assert.equal(expectedHostedDatabase.exposedFunctions, 207);
  assert.deepEqual(
    manifest.map(({ name, sha256 }) => ({ name, sha256 })),
    policy.migrations,
  );
  assert.equal(
    policy.classification,
    "SOURCE_REVIEW_BASELINE_NOT_RELEASE_AUTHORIZATION",
  );
});
test("fixture renamed as a new migration and fixture copied over approved SQL both fail closed", () => {
  const dir = baseline(),
    migrations = path.join(dir, "supabase/migrations"),
    fixture = path.join(root, "database/proposals/github-vault-receipts.sql");
  fs.copyFileSync(fixture, path.join(migrations, "0118_ordinary_update.sql"));
  assert.throws(
    () => hostedMigrationManifest(dir),
    /HOSTED_RELEASE_UNKNOWN_MIGRATION/,
  );
  fs.unlinkSync(path.join(migrations, "0118_ordinary_update.sql"));
  fs.copyFileSync(fixture, path.join(migrations, policy.migrations[0].name));
  assert.throws(
    () => hostedMigrationManifest(dir),
    /HOSTED_RELEASE_MIGRATION_HASH_MISMATCH/,
  );
});
test("missing, altered and nonregular migration sources cannot pass", () => {
  const dir = baseline(),
    file = path.join(dir, "supabase/migrations", policy.migrations.at(-1).name);
  fs.appendFileSync(file, "\n-- changed\n");
  assert.throws(
    () => hostedMigrationManifest(dir),
    /HOSTED_RELEASE_MIGRATION_HASH_MISMATCH/,
  );
  fs.unlinkSync(file);
  assert.throws(
    () => hostedMigrationManifest(dir),
    /HOSTED_RELEASE_BASELINE_INCOMPLETE/,
  );
  fs.symlinkSync(
    path.join(root, "supabase/migrations", policy.migrations.at(-1).name),
    file,
  );
  assert.throws(
    () => hostedMigrationManifest(dir),
    /HOSTED_RELEASE_MIGRATION_NOT_REGULAR/,
  );
});
test("hosted source refuses a symlinked migration directory", () => {
  const dir = baseline(),
    original = path.join(dir, "supabase/migrations"),
    moved = path.join(dir, "supabase/moved");
  fs.renameSync(original, moved);
  fs.symlinkSync(moved, original, "dir");
  assert.throws(
    () => hostedMigrationManifest(dir),
    /HOSTED_RELEASE_MIGRATION_DIRECTORY_SYMLINK/,
  );
});
test("no declared extension or environment override grants hosted release authority", () => {
  for (const extension of policy.fixtureFiles)
    assert.throws(
      () => hostedMigrationManifest(root, [extension.path]),
      /HOSTED_RELEASE_EXTENSIONS_FORBIDDEN/,
    );
  assert.throws(
    () => hostedMigrationManifest(root, ["unknown.sql"]),
    /HOSTED_RELEASE_EXTENSIONS_FORBIDDEN/,
  );
  assert.throws(
    () => hostedMigrationManifest(root, null as unknown as []),
    /HOSTED_RELEASE_EXTENSIONS_FORBIDDEN/,
  );
});
test("fixture registry exactly inventories pinned fixture DDL; no namespace/table/function marker omitted", () => {
  const found = {
    schemas: new Set<string>(),
    relations: new Set<string>(),
    functions: new Set<string>(),
  };
  for (const f of policy.fixtureFiles) {
    const sql = fs.readFileSync(path.join(root, f.path), "utf8");
    assert.equal(
      crypto.createHash("sha256").update(sql).digest("hex"),
      f.sha256,
    );
    for (const [kind, key] of [
      ["schema", "schemas"],
      ["table", "relations"],
      ["function", "functions"],
    ] as const)
      for (const match of sql.matchAll(
        new RegExp(
          `create\\s+(?:or\\s+replace\\s+)?${kind}\\s+([a-z_]+(?:\\.[a-z_]+)?)`,
          "gi",
        ),
      ))
        found[key].add(match[1]);
  }
  for (const key of ["schemas", "relations", "functions"] as const)
    assert.deepEqual([...found[key]].sort(), hostedFixtureObjects[key]);
});
test("catalogue gate rejects schema-only, relation-only and function-only fixture state and query failure", async () => {
  for (const kind of ["schema", "relation", "function"])
    await assert.rejects(
      assertNoHostedFixtureObjects({
        query: async () => ({
          rows: [{ kind, qualified_name: "synthetic.marker" }],
        }),
      }),
      /HOSTED_RELEASE_FIXTURE_OBJECT/,
    );
  await assert.rejects(
    assertNoHostedFixtureObjects({
      query: async () => {
        throw Error("UNAVAILABLE");
      },
    }),
    /UNAVAILABLE/,
  );
  let query = "";
  await assertNoHostedFixtureObjects({
    query: async (sql: string) => {
      query = sql;
      return { rows: [] };
    },
  });
  assert.ok(
    query.includes("pg_namespace") &&
      query.includes("pg_class") &&
      query.includes("pg_proc"),
  );
  assert.ok(
    !query.includes("relkind="),
    "All relation kinds must be inspected",
  );
});
test("all hosted entrypoints refuse every command before target configuration or any network call", () => {
  const marker = path.join(owned, "network-attempt"),
    preload = path.join(owned, "deny-network.mjs");
  fs.writeFileSync(
    preload,
    `import fs from 'node:fs';import net from 'node:net';import tls from 'node:tls';import dns from 'node:dns';import{syncBuiltinESMExports}from'node:module';const deny=()=>{fs.appendFileSync(process.env.KXRA_RELEASE_TRIPWIRE,'called');throw Error('NETWORK_FORBIDDEN');};net.connect=deny;net.createConnection=deny;net.Socket.prototype.connect=deny;tls.connect=deny;dns.lookup=deny;syncBuiltinESMExports();`,
  );
  for (const script of [
    "staging-migrations",
    "production-migrations",
    "staging-seeds",
    "production-bootstrap",
  ])
    for (const command of ["plan", "apply", "verify"]) {
      const r = spawnSync(
        process.execPath,
        ["--import", preload, `scripts/${script}.mjs`, command],
        {
          cwd: root,
          env: {
            PATH: process.env.PATH,
            HOME: owned,
            NODE_ENV: "production",
            KXRA_RELEASE_TRIPWIRE: marker,
            KXRA_AUTH_MODE: "fixture",
            KXRA_ENVIRONMENT: "production",
            KXRA_RELEASE_ALLOW_FIXTURES: "true",
          },
          encoding: "utf8",
          timeout: 10000,
        },
      );
      assert.equal(r.status, 1, script + ":" + command);
      assert.match(r.stderr, /HOSTED_RELEASE_FIXTURE_MIGRATION/);
      assert.ok(!fs.existsSync(marker));
    }
});
