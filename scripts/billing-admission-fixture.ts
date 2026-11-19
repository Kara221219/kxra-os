import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { readPrivateFixtureJson } from "../tests/support/private-fixture-json";

// Pinned admission tip2efac7c8; fixture composition only. Release assigns the
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
    path.resolve(process.cwd(), "integration/business-admission.fixture.sql"),
    "utf8",
  );
  assert.equal(
    crypto.createHash("sha256").update(sql).digest("hex"),
    "e6b1e3bbbcb4ef1ff8170dbdf2d0d35453d078985339dec96907d119ae049dad",
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
    const promotedFile = path.resolve(
      "supabase/migrations/0115_business_admission.sql",
    );
    const promoted = fs.existsSync(promotedFile);
    if (promoted) {
      const canonical = fs.readFileSync(
        path.resolve("database/proposals/business-admission.sql"),
        "utf8",
      );
      assert.equal(fs.readFileSync(promotedFile, "utf8"), canonical);
      assert.equal(
        (
          await db.query(
            "select count(*)::int n from public.kxra_local_migrations where name='0115_business_admission.sql'",
          )
        ).rows[0].n,
        1,
        "Promoted admission must already be migrated",
      );
      const definitions = [
        ...canonical.matchAll(
          /create(?: or replace)? function ([\w.]+)\(([\s\S]*?)\) returns ([\s\S]*?)as \$\$([\s\S]*?)\$\$;/g,
        ),
      ];
      assert.equal(
        definitions.length,
        10,
        "Complete admission function contract required",
      );
      for (const [, name, args, header, body] of definitions) {
        const types = args.trim()
          ? args
              .split(",")
              .map((p) => p.trim().split(/\s+/).slice(1).join(" "))
              .join(",")
          : "";
        const signature = `${name}(${types})`;
        const result = await db.query(
          "select prosrc,prosecdef,proconfig from pg_proc where oid=to_regprocedure($1)",
          [signature],
        );
        assert.equal(
          result.rowCount,
          1,
          `Missing admission function ${signature}`,
        );
        assert.equal(
          result.rows[0].prosrc,
          body,
          `Admission body drift ${signature}`,
        );
        assert.equal(
          result.rows[0].prosecdef,
          /security definer/i.test(header),
        );
        assert.ok(
          result.rows[0].proconfig?.some((v: string) =>
            /^search_path=(?:\"\"|)$/.test(v),
          ),
        );
      }
      const tables = await db.query(
        "select relname,relrowsecurity from pg_class where oid in ('kxra_private.business_declarations'::regclass,'kxra_private.business_eligibility_policies'::regclass,'kxra_private.business_eligibility_reviews'::regclass)",
      );
      assert.equal(tables.rowCount, 3);
      assert.ok(tables.rows.every((r) => r.relrowsecurity));
    }
    // Promoted schema is verified, never repaired using an older standalone fixture.
    if (
      !promoted &&
      !(
        await db.query(
          "select to_regclass('kxra_private.business_eligibility_reviews') present",
        )
      ).rows[0].present
    )
      await db.query(sql);
    assert.ok(
      (
        await db.query(
          "select to_regprocedure('kxra_private.business_current_review(uuid,text,uuid,text,integer,text)') present",
        )
      ).rows[0].present,
    );
    console.log(
      "Pinned synthetic admission composition ready; no real eligibility approval.",
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
