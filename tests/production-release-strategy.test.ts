import assert from "node:assert/strict";
import { test, after } from "node:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import vm from "node:vm";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";
import { z } from "zod";
import {
  integrationReleaseSource,
  reviewHostedUpgrade,
} from "../scripts/production-release-strategy.mjs";
import { hostedMigrationManifest } from "../scripts/hosted-release-guard.mjs";
const root = path.resolve(import.meta.dirname, ".."),
  policy = JSON.parse(
    fs.readFileSync(
      path.join(root, "packages/release/hosted-schema-policy-v1.json"),
      "utf8",
    ),
  ),
  owned = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-release-plan-"));
const target = path.join(owned, "candidate");
fs.mkdirSync(path.join(target, "supabase/migrations"), { recursive: true });
for (const m of policy.migrations)
  fs.copyFileSync(
    path.join(root, "supabase/migrations", m.name),
    path.join(target, "supabase/migrations", m.name),
  );
after(() => fs.rmSync(owned, { recursive: true, force: true }));
const rows = (n: number) =>
  policy.migrations.slice(0, n).map((m: { name: string; sha256: string }) => ({
    ...m,
    source_commit: "a".repeat(40),
  }));
test("explicit strategy excludes only exact pinned118119; guard still refuses integrated119", () => {
  const source = integrationReleaseSource(root);
  assert.equal(source.manifest.length, 119);
  assert.equal(source.exclusions.length, 2);
  assert.throws(
    () => hostedMigrationManifest(root),
    /HOSTED_RELEASE_FIXTURE_MIGRATION/,
  );
  assert.equal(hostedMigrationManifest(target).length, 117);
});
test("candidate source refuses changed fixture bytes or extra migration SQL before preparation", () => {
  const dir = path.join(owned, "source119"),
    migrations = path.join(dir, "supabase/migrations");
  fs.mkdirSync(migrations, { recursive: true });
  for (const name of fs.readdirSync(path.join(root, "supabase/migrations")))
    if (name.endsWith(".sql"))
      fs.copyFileSync(
        path.join(root, "supabase/migrations", name),
        path.join(migrations, name),
      );
  const fixture = path.join(
      migrations,
      "0119_paired_transport_confinement.sql",
    ),
    bytes = fs.readFileSync(fixture);
  fs.appendFileSync(fixture, "\n-- changed\n");
  assert.throws(
    () => integrationReleaseSource(dir),
    /SOURCE_HASH_OR_SET_CHANGED/,
  );
  fs.writeFileSync(fixture, bytes);
  fs.writeFileSync(path.join(migrations, "0120_unreviewed.sql"), "select 1;");
  assert.throws(
    () => integrationReleaseSource(dir),
    /SOURCE_HASH_OR_SET_CHANGED/,
  );
});
test("review plans distinguish fresh,113,116 and117 states without apply authority", () => {
  for (const n of [0, 113, 116, 117]) {
    const p = reviewHostedUpgrade(target, {
      managed: n !== 0,
      applied: rows(n),
    });
    assert.equal(p.applied, n);
    assert.equal(p.pending.length, 117 - n);
    assert.equal(p.authorization, false);
    assert.equal(p.apply_implemented, false);
    assert.equal(p.rollback.automatic_schema_downgrade, false);
  }
});
test("unknown/drifted/fixture history and managed but untracked schema refuse planning", () => {
  const unknown = {
    name: "0118_fixture_paired_agents.sql",
    sha256: "a".repeat(64),
    source_commit: "a".repeat(40),
  };
  assert.throws(
    () =>
      reviewHostedUpgrade(target, {
        managed: true,
        applied: [...rows(117), unknown],
      }),
    /STAGING_UNKNOWN_MIGRATION/,
  );
  const drift = rows(113);
  drift[0].sha256 = "b".repeat(64);
  assert.throws(
    () => reviewHostedUpgrade(target, { managed: true, applied: drift }),
    /HASH_MISMATCH/,
  );
  assert.throws(
    () => reviewHostedUpgrade(target, { managed: true, applied: [] }),
    /UNMANAGED/,
  );
});
test("duplicate, gapped, reordered and malformed source history refuse planning", () => {
  const duplicate = rows(113);
  duplicate.push(duplicate[0]);
  assert.throws(
    () => reviewHostedUpgrade(target, { managed: true, applied: duplicate }),
    /LEDGER_INVALID/,
  );
  const gap = rows(113);
  gap.splice(5, 1);
  assert.throws(
    () => reviewHostedUpgrade(target, { managed: true, applied: gap }),
    /NOT_PREFIX/,
  );
  const reordered = rows(113);
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.throws(
    () => reviewHostedUpgrade(target, { managed: true, applied: reordered }),
    /NOT_PREFIX/,
  );
  const bad = rows(1);
  bad[0].source_commit = "main";
  assert.throws(
    () => reviewHostedUpgrade(target, { managed: true, applied: bad }),
    /LEDGER_INVALID/,
  );
  assert.throws(
    () => reviewHostedUpgrade(target, { managed: false, applied: rows(1) }),
    /INCONSISTENT/,
  );
});
test("production-review117 SQL has no reference to paired fixture objects", () => {
  for (const m of policy.migrations) {
    const sql = fs.readFileSync(
      path.join(root, "supabase/migrations", m.name),
      "utf8",
    );
    assert.ok(
      !/kxra_pairing|\bpaired_(agents|tasks|invitations|sessions|control|device|resolve|task_status)\b/i.test(
        sql,
      ),
      m.name,
    );
  }
});
test("production paired entry functions decline before any fixture RPC or pool access", async () => {
  let downstream = 0;
  const forbidden = () => {
    downstream++;
    throw Error("DOWNSTREAM_FORBIDDEN");
  };
  class HttpError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  const dependencies: Record<string, unknown> = {
    "node:crypto": crypto,
    zod: { z },
    "../../../packages/db": {
      localMode: () => false,
      getPool: forbidden,
      query: forbidden,
    },
    "./auth": { HttpError },
  };
  const module = {
    exports: {} as Record<string, (...args: unknown[]) => Promise<unknown>>,
  };
  const require = createRequire(import.meta.url);
  vm.runInNewContext(
    transformSync(
      fs.readFileSync(path.join(root, "apps/os/lib/paired-agent.ts"), "utf8"),
      { loader: "ts", format: "cjs", target: "es2022" },
    ).code,
    {
      module,
      exports: module.exports,
      require: (name: string) => dependencies[name] ?? require(name),
      process: { env: { NODE_ENV: "production" } },
      Buffer,
      console,
    },
  );
  for (const [fn, args] of [
    ["pairedControl", [{}, "LIST", {}]],
    ["pairedDevice", ["POLL", "a".repeat(64), {}]],
  ] as const)
    await assert.rejects(
      module.exports[fn](...args),
      (e: unknown) => e instanceof HttpError && e.status === 503,
    );
  assert.equal(downstream, 0);
});
