// Local-only117 cohort. Clone exact committed source; remove only pinned fixture migrations in owned clone.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { execFileSync, spawnSync } from "node:child_process";
import pg from "pg";
import { acquireNativeFixtureLease } from "./native-fixture-lease.mjs";
import { postgresBin } from "./postgres-bin.mjs";
import {
  hostedMigrationManifest,
  assertNoHostedFixtureObjects,
  expectedHostedDatabase,
  hostedFixtureObjects,
} from "./hosted-release-guard.mjs";
import assert from "node:assert/strict";
if (
  process.argv.length > 3 ||
  (process.argv[2] && process.argv[2] !== "--upgrade-rehearsal")
)
  throw Error(
    "Usage: node scripts/verify-hosted-release-native.mjs [--upgrade-rehearsal]",
  );
const root = path.resolve(import.meta.dirname, "..");
assert.equal(
  execFileSync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  "",
  "Committed clean source required",
);
const source = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const directory = fs.realpathSync(fs.mkdtempSync("/tmp/kxra-rg-"));
execFileSync(
  "git",
  ["clone", "--no-hardlinks", "--no-checkout", root, directory],
  { stdio: "inherit" },
);
execFileSync("git", ["checkout", "--detach", source], {
  cwd: directory,
  stdio: "inherit",
});
fs.symlinkSync(
  fs.realpathSync(path.join(root, "node_modules")),
  path.join(directory, "node_modules"),
  "dir",
);
const policy = JSON.parse(
  fs.readFileSync(
    path.join(root, "packages/release/hosted-schema-policy-v1.json"),
    "utf8",
  ),
);
const removed = [];
for (const file of policy.fixtureFiles.filter((f) =>
  f.path.startsWith("supabase/migrations/"),
)) {
  const target = path.join(directory, file.path);
  assert.equal(
    crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex"),
    file.sha256,
  );
  fs.unlinkSync(target);
  removed.push(file);
}
const manifest = hostedMigrationManifest(directory);
assert.equal(manifest.length, 117);
const runtime = path.join(directory, ".runtime/release-guard");
fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
async function port() {
  const server = net.createServer();
  await new Promise((r, j) => {
    server.once("error", j);
    server.listen(0, "127.0.0.1", r);
  });
  const value = server.address().port;
  await new Promise((r) => server.close(r));
  return value;
}
const env = {
  PATH: process.env.PATH,
  HOME: runtime,
  USER: os.userInfo().username,
  TMPDIR: process.env.TMPDIR,
  NODE_ENV: "development",
  KXRA_AUTH_MODE: "fixture",
  KXRA_ORIGIN: `http://127.0.0.1:${await port()}`,
  KXRA_RUNTIME: runtime,
  KXRA_PG_PORT: String(await port()),
  KXRA_LOCAL_SECRET: crypto.randomBytes(48).toString("hex"),
  KXRA_CI_RUN_ID: crypto.randomUUID(),
};
const release = acquireNativeFixtureLease("hosted-release-guard-native");
let db;
try {
  const started = spawnSync(
    process.execPath,
    ["scripts/database.mjs", "start"],
    { cwd: directory, env, stdio: "inherit" },
  );
  assert.equal(started.status, 0);
  const cfg = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  assert.equal(cfg.host, path.join(runtime, "socket"));
  db = new pg.Client({ ...cfg, user: os.userInfo().username });
  await db.connect();
  await db.query("set statement_timeout='5s'");
  assert.equal(
    fs.realpathSync(
      (await db.query("show data_directory")).rows[0].data_directory,
    ),
    path.join(runtime, "postgres"),
  );
  const inventory = async () => ({
    migrations: (
      await db.query("select count(*)::int n from public.kxra_local_migrations")
    ).rows[0].n,
    protectedTables: (
      await db.query(
        "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kxra' and c.relkind='r' and c.relrowsecurity",
      )
    ).rows[0].n,
    exposedFunctions: (
      await db.query(
        "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra'",
      )
    ).rows[0].n,
  });
  const before = await inventory();
  assert.deepEqual(before, expectedHostedDatabase);
  await assertNoHostedFixtureObjects(db);
  const tested = [];
  for (const [kind, names] of Object.entries(hostedFixtureObjects))
    for (const name of names) {
      await db.query("begin");
      try {
        if (kind === "schemas") await db.query(`create schema "${name}"`);
        else {
          const [schema, object] = name.split(".");
          if (hostedFixtureObjects.schemas.includes(schema))
            await db.query(`create schema "${schema}"`);
          await db.query(
            kind === "relations"
              ? `create view "${schema}"."${object}" as select 1 id`
              : `create function "${schema}"."${object}"() returns integer language sql as 'select 1'`,
          );
        }
        await assert.rejects(
          assertNoHostedFixtureObjects(db),
          new RegExp(
            `HOSTED_RELEASE_FIXTURE_OBJECT:${kind === "schemas" ? "schema" : kind === "relations" ? "relation" : "function"}:`,
          ),
        );
        tested.push({ kind, name });
      } finally {
        await db.query("rollback");
      }
    }
  await assertNoHostedFixtureObjects(db);
  assert.deepEqual(await inventory(), before);
  if (process.argv[2] === "--upgrade-rehearsal") {
    const { verifyReleaseUpgradeFixtures } =
      await import("./release-upgrade-fixture.mjs");
    const upgrade = await verifyReleaseUpgradeFixtures(
      db,
      cfg,
      manifest,
      source,
      directory,
      runtime,
    );
    fs.writeFileSync(
      path.join(runtime, "production-upgrade-proof.json"),
      JSON.stringify(upgrade, null, 2) + "\n",
      { mode: 0o600 },
    );
  }
  fs.writeFileSync(
    path.join(runtime, "hosted-release-native-proof.json"),
    JSON.stringify(
      {
        status: "PASS",
        sourceCommit: source,
        cohort: "OWNED_FIXTURE_EXCLUDED117_NOT_A_HOSTED_RELEASE",
        removed,
        manifest: manifest.map(({ name, sha256 }) => ({ name, sha256 })),
        inventory: before,
        testedMarkers: tested,
        markers: tested.length,
        rollbackRestoredBaseline: true,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600 },
  );
  console.log("HOSTED_RELEASE_NATIVE117_MARKERS_PASS " + runtime);
} finally {
  try {
    if (db) await db.end();
  } finally {
    const stop = spawnSync(process.execPath, ["scripts/database.mjs", "stop"], {
      cwd: directory,
      env,
      stdio: "inherit",
    });
    const absent = spawnSync(
      path.join(postgresBin(env), "pg_ctl"),
      ["-D", path.join(runtime, "postgres"), "status"],
      { stdio: "ignore" },
    );
    const clean =
      stop.status === 0 &&
      absent.status === 3 &&
      !fs.existsSync(path.join(runtime, "postgres/postmaster.pid"));
    fs.writeFileSync(
      path.join(runtime, "hosted-release-native-cleanup.json"),
      JSON.stringify({
        postgresStop: stop.status,
        postgresStatus: absent.status,
        postmasterPidAbsent: !fs.existsSync(
          path.join(runtime, "postgres/postmaster.pid"),
        ),
        leaseReleaseAllowed: clean,
      }) + "\n",
      { mode: 0o600 },
    );
    if (clean) release();
    else throw Error("OWNED_NATIVE_CLEANUP_UNCONFIRMED_LEASE_RETAINED");
  }
}
