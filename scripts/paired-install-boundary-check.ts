import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
const runtime = process.env.KXRA_RUNTIME!;
if (
  !localModeConfiguration(process.env) ||
  process.env.VERCEL ||
  !runtime?.startsWith("/tmp/kxra-paired-")
)
  throw Error("ISOLATED_BOUNDARY_FIXTURE_REQUIRED");
const cfg = JSON.parse(
  fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
);
if (!String(cfg.host).startsWith(runtime + "/"))
  throw Error("OWNED_UNIX_FIXTURE_REQUIRED");
const admin = new pg.Client({ ...cfg, user: os.userInfo().username });
const name = "paired_boundary_" + crypto.randomBytes(8).toString("hex");
async function main() {
  await admin.connect();
  await admin.query(`create database ${name}`);
  const db = new pg.Client({
    ...cfg,
    user: os.userInfo().username,
    database: name,
  });
  await db.connect();
  const boundaries: unknown[] = [];
  try {
    await db.query(
      `create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;grant usage on schema auth to authenticated,anon;grant execute on all functions in schema auth to authenticated,anon;`,
    );
    const dir = path.resolve("supabase/migrations");
    for (const file of fs
      .readdirSync(dir)
      .filter((f) => /^\d{4}_.+\.sql$/.test(f))
      .sort()) {
      const sql = fs
        .readFileSync(path.join(dir, file), "utf8")
        .replace(/^([\s\S]*?)\bbegin;\s*/i, "$1")
        .replace(/commit;\s*$/i, "");
      await db.query("begin");
      try {
        await db.query(sql);
        await db.query("commit");
      } catch (e) {
        await db.query("rollback");
        throw e;
      }
      if (!/^(0117|0118|0119)_/.test(file)) continue;
      const functions = (
        await db.query(
          `select n.nspname schema,p.oid::regprocedure::text signature,p.prosecdef security_definer,p.prorettype::regtype::text return_type,p.proacl::text acl,has_function_privilege('kxra_app',p.oid,'EXECUTE') executable,has_schema_privilege('kxra_app',n.oid,'USAGE') usable from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('kxra_private','kxra_pairing') order by 2`,
        )
      ).rows;
      assert.equal(
        (
          await db.query(
            "select has_schema_privilege('kxra_app','kxra_private','USAGE') usable",
          )
        ).rows[0].usable,
        false,
      );
      assert.deepEqual(
        functions
          .filter((r) => r.executable && r.usable)
          .map((r) => r.signature),
        file.startsWith("0117")
          ? []
          : ["kxra_pairing.paired_resolve(text,text)"],
      );
      const schemas = (
        await db.query(
          `select nspname, nspacl::text acl, has_schema_privilege('kxra_app',oid,'USAGE') app_usage,has_schema_privilege('authenticated',oid,'USAGE') authenticated_usage,has_schema_privilege('anon',oid,'USAGE') anon_usage from pg_namespace where nspname in ('kxra_private','kxra_pairing') order by 1`,
        )
      ).rows;
      boundaries.push({
        after: file,
        sha256: crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(dir, file)))
          .digest("hex"),
        schemas,
        functions,
      });
    }
    // Reproduce only the old ACL grant in a rolled-back transaction. Ordinary
    // invocation of the unrelated INVOKER trigger helper is rejected before its
    // body can run; no arbitrary trigger attachment or exploit is attempted.
    await db.query("begin");
    let triggerResult: unknown;
    try {
      await db.query("grant usage on schema kxra_private to kxra_app");
      await db.query("set local role kxra_app");
      await db.query(
        "select kxra_private.guard_invitation_email_reconciliation()",
      );
      assert.fail("Trigger called as ordinary function");
    } catch (e) {
      assert.equal((e as { code?: string }).code, "0A000");
      triggerResult = {
        code: (e as { code: string }).code,
        message: (e as Error).message,
      };
    } finally {
      await db.query("rollback");
    }
    fs.writeFileSync(
      path.join(runtime, "paired-install-boundaries.json"),
      JSON.stringify(
        {
          database: name,
          boundaries,
          simulated_original_grant_trigger_call: triggerResult,
          hosted: false,
        },
        null,
        2,
      ),
    );
    console.log(
      "Paired install boundary ACL PASS (117/118/119 independently committed; unrelated ordinary trigger call rejected 0A000).",
    );
  } finally {
    await db.end();
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
