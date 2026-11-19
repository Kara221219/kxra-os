// Transactional upgrade simulations on newly owned empty local databases only. Not a hosted executor.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import pg from "pg";
import { postgresBin } from "./postgres-bin.mjs";
import { reviewHostedUpgrade } from "./production-release-strategy.mjs";
import { assertNoHostedFixtureObjects } from "./hosted-release-guard.mjs";
export async function verifyReleaseUpgradeFixtures(
  admin,
  cfg,
  manifest,
  source,
  directory,
  runtime,
) {
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.equal(cfg.database, "postgres");
  assert.ok(!cfg.password && !cfg.ssl && !cfg.connectionString);
  assert.ok(
    fs.realpathSync(runtime).startsWith("/private/tmp/kxra-rg-") ||
      fs.realpathSync(runtime).startsWith("/tmp/kxra-rg-"),
  );
  assert.equal(
    fs.realpathSync(
      (await admin.query("show data_directory")).rows[0].data_directory,
    ),
    path.join(runtime, "postgres"),
  );
  const passfile = path.join(runtime, "upgrade-empty-libpq");
  fs.writeFileSync(passfile, "", { mode: 0o600, flag: "wx" });
  const env = {
    PATH: process.env.PATH,
    HOME: runtime,
    PGPASSFILE: passfile,
    PGSERVICEFILE: passfile,
    PGSYSCONFDIR: runtime,
  };
  function fingerprint(database) {
    return crypto
      .createHash("sha256")
      .update(
        execFileSync(
          path.join(postgresBin(env), "pg_dump"),
          [
            "--no-password",
            "-h",
            cfg.host,
            "-p",
            String(cfg.port),
            "-U",
            os.userInfo().username,
            "-d",
            database,
            "--schema-only",
            "--restrict-key=KXRARELEASEFIXTUREV1",
            "--schema=kxra",
            "--schema=kxra_private",
            "--schema=kxra_room_worker",
          ],
          { env, maxBuffer: 16 * 1024 * 1024 },
        ),
      )
      .digest("hex");
  }
  const database = "kxra_upgrade_" + crypto.randomBytes(6).toString("hex");
  await admin.query(`create database "${database}" template template0`);
  const db = new pg.Client({ ...cfg, user: os.userInfo().username, database });
  await db.connect();
  const stages = [];
  try {
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema'",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not like 'pg_%' and n.nspname<>'information_schema'",
        )
      ).rows[0].n,
      0,
    );
    await db.query("set statement_timeout='5s'");
    await db.query(
      `create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated,anon;grant execute on all functions in schema auth to authenticated,anon;create table public.kxra_schema_migrations(name text primary key,sha256 text not null,source_commit text not null);`,
    );
    const ledger = async () =>
      (
        await db.query(
          "select name,sha256,source_commit from public.kxra_schema_migrations order by name",
        )
      ).rows;
    async function apply(item, fail = false) {
      await db.query("begin");
      try {
        await db.query(item.sql);
        await db.query(
          "insert into public.kxra_schema_migrations values($1,$2,$3)",
          [item.name, item.sha256, source],
        );
        if (fail) await db.query("select 1/0");
        await db.query("commit");
      } catch (e) {
        await db.query("rollback");
        throw e;
      }
    }
    for (const item of manifest.slice(0, 113)) await apply(item);
    const sentinel = crypto.randomUUID();
    await db.query(
      "insert into kxra.organisations(id,name,slug,organisation_kind) values($1,'Upgrade sentinel',$2,'CUSTOMER')",
      [sentinel, "upgrade-" + sentinel],
    );
    const data = async () =>
      (
        await db.query(
          "select to_jsonb(o) value from kxra.organisations o where id=$1",
          [sentinel],
        )
      ).rows[0].value;
    const beforeData = await data();
    for (const item of manifest.slice(113)) {
      const before = await ledger(),
        beforeSchema = fingerprint(database),
        plan = reviewHostedUpgrade(directory, {
          managed: true,
          applied: before,
        });
      assert.equal(plan.pending[0].name, item.name);
      await assert.rejects(apply(item, true), (e) => e.code === "22012");
      assert.deepEqual(await ledger(), before);
      assert.equal(fingerprint(database), beforeSchema);
      assert.deepEqual(await data(), beforeData);
      await assertNoHostedFixtureObjects(db);
      await apply(item);
      const after = await ledger(),
        resumed = reviewHostedUpgrade(directory, {
          managed: true,
          applied: after,
        });
      assert.equal(after.length, before.length + 1);
      assert.ok(!resumed.pending.some((m) => m.name === item.name));
      assert.deepEqual(await data(), beforeData);
      stages.push({
        migration: item.name,
        before: before.length,
        after: after.length,
        failureRolledBackDdlAndLedger: true,
        sentinelPreserved: true,
        committedMigrationOmittedFromResume: true,
      });
    }
    const finalPlan = reviewHostedUpgrade(directory, {
      managed: true,
      applied: await ledger(),
    });
    assert.equal(finalPlan.pending.length, 0);
    assert.equal(finalPlan.authorization, false);
    await assertNoHostedFixtureObjects(db);
    const finalSchema = fingerprint(database),
      freshSchema = fingerprint("postgres");
    assert.equal(
      finalSchema,
      freshSchema,
      "Upgraded application schema must equal independently fresh117 schema",
    );
    // A full fixture installation is not a removable tail in a hosted ledger.
    const fixtureSource = JSON.parse(
      fs.readFileSync(
        path.join(directory, "packages/release/hosted-schema-policy-v1.json"),
        "utf8",
      ),
    ).fixtureFiles.filter((f) => f.path.startsWith("supabase/migrations/"));
    const rows = await ledger();
    assert.throws(
      () =>
        reviewHostedUpgrade(directory, {
          managed: true,
          applied: [
            ...rows,
            ...fixtureSource.map((f) => ({
              name: path.basename(f.path),
              sha256: f.sha256,
              source_commit: source,
            })),
          ],
        }),
      /STAGING_UNKNOWN_MIGRATION/,
    );
    return {
      status: "PASS",
      database,
      verifiedEmptyTarget: true,
      startingPrefix: 113,
      endingPrefix: 117,
      stages,
      finalSchemaSha256: finalSchema,
      freshSchemaSha256: freshSchema,
      sentinelPreserved: true,
      already117Plan: finalPlan,
      fixture119HistoryRefused: true,
      automaticDownMigration: false,
      hostedUpgradeExecutorImplemented: false,
    };
  } finally {
    await db.end();
  }
}
