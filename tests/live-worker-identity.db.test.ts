import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { requireLiveBillingWorkerIdentity } from "../packages/integrations/live-worker-identity";

// SOURCE ONLY until owner runs on existing isolated fixture. No role/grant/login changes.
test("actual local NOLOGIN capability cannot make an admin SET ROLE connection a genuine runner", async () => {
  assert.ok(localModeConfiguration(process.env));
  assert.ok(!process.env.VERCEL_ENV);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  for (const directory of [runtime, path.join(runtime, "socket")]) {
    const metadata = fs.statSync(directory);
    assert.equal(metadata.uid, process.getuid!());
    assert.equal(metadata.mode & 0o077, 0);
  }
  const config = JSON.parse(
    fs.readFileSync(path.join(runtime, "database.json"), "utf8"),
  );
  assert.equal(fs.realpathSync(config.host), path.join(runtime, "socket"));
  assert.equal(config.user, "kxra_app");
  assert.ok(!config.password);
  assert.ok(
    Number.isInteger(config.port) && config.port > 0 && config.port <= 65535,
  );
  assert.equal(typeof config.database, "string");
  const db = new pg.Client({
    host: path.join(runtime, "socket"),
    port: config.port,
    database: config.database,
    user: os.userInfo().username,
    password: "",
    ssl: false,
  });
  await db.connect();
  try {
    await db.query("begin");
    await db.query("set local statement_timeout='5s'");
    const capability = (
      await db.query(
        "select rolcanlogin,rolsuper,rolbypassrls from pg_roles where rolname='kxra_billing_worker'",
      )
    ).rows[0];
    assert.deepEqual(capability, {
      rolcanlogin: false,
      rolsuper: false,
      rolbypassrls: false,
    });
    await db.query("set local role kxra_billing_worker");
    const actual = (await db.query("select session_user,current_user")).rows[0];
    assert.equal(actual.current_user, "kxra_billing_worker");
    assert.notEqual(actual.session_user, "kxra_billing_runner");
    assert.throws(() => requireLiveBillingWorkerIdentity(actual), {
      message: "LIVE_BILLING_WORKER_IDENTITY_INVALID",
    });
  } finally {
    try {
      await db.query("rollback");
    } finally {
      await db.end();
    }
  }
});
