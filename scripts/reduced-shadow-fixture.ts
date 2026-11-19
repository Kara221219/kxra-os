import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { readPrivateFixtureJson } from "../tests/support/private-fixture-json";

// Local default-off shadow proposal; fixture composition only. Release assigns the
// actual migration number. No arbitrary SQL path or hosted target is accepted.
async function main() {
  assert.equal(process.argv.slice(2).join(" "), "--synthetic");
  assert.ok(localModeConfiguration(process.env));
  assert.ok(!process.env.VERCEL_ENV);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  const cfg = readPrivateFixtureJson(path.join(runtime, "database.json"));
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.equal(fs.realpathSync(cfg.host), cfg.host);
  for (const dir of [runtime, cfg.host]) {
    assert.equal(fs.statSync(dir).uid, process.getuid!());
    assert.equal(fs.statSync(dir).mode & 0o077, 0);
  }
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  const sql = fs.readFileSync(
    path.resolve(
      process.cwd(),
      "supabase/proposals/reduced-billing-shadow.sql",
    ),
    "utf8",
  );
  const db = new pg.Client({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: os.userInfo().username,
    password: "",
    ssl: false,
  });
  await db.connect();
  try {
    const identity = (
      await db.query(
        "select session_user,current_user,current_database() db,current_setting('listen_addresses') listen,current_setting('unix_socket_directories') socket",
      )
    ).rows[0];
    assert.equal(identity.session_user, os.userInfo().username);
    assert.equal(identity.current_user, identity.session_user);
    assert.equal(identity.db, cfg.database);
    assert.equal(identity.listen, "");
    assert.equal(fs.realpathSync(identity.socket), cfg.host);
    const promoted = fs.existsSync(
      path.resolve("supabase/migrations/0116_reduced_billing_shadow.sql"),
    );
    if (promoted) {
      assert.equal(
        fs.readFileSync(
          path.resolve("supabase/migrations/0116_reduced_billing_shadow.sql"),
          "utf8",
        ),
        sql,
      );
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.kxra_local_migrations where name='0116_reduced_billing_shadow.sql'",
          )
        ).rows[0].n,
        1,
        "Promoted shadow schema must already be migrated",
      );
      assert.ok(
        (
          await db.query(
            "select to_regclass('kxra_private.reduced_billing_shadow_jobs') present",
          )
        ).rows[0].present,
        "No proposal repair of missing promoted schema",
      );
    }
    // Standalone generated fixtures only; promoted schema is verified, never reapplied.
    if (
      !promoted &&
      !(
        await db.query(
          "select to_regclass('kxra_private.reduced_billing_shadow_jobs') present",
        )
      ).rows[0].present
    )
      await db.query(sql);
    assert.ok(
      (
        await db.query(
          "select to_regprocedure('kxra_private.claim_reduced_billing_shadow(integer,text)') present",
        )
      ).rows[0].present,
    );
    console.log(
      JSON.stringify({
        source_sha256: crypto.createHash("sha256").update(sql).digest("hex"),
        fixture_only: true,
      }),
    );
    console.log(
      "Synthetic shadow SQL ready; no entitlement authority or financial-age change.",
    );
  } finally {
    await db.query("rollback").catch(() => {});
    await db.end();
  }
}
void main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Synthetic admission setup failed",
  );
  process.exitCode = 1;
});
