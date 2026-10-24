import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import pg from "pg";
import { rootCertificates } from "node:tls";
import { customerDispatchConfiguration } from "../packages/integrations/live-customer-dispatch-config";
import { liveCustomerDatabaseExecutor } from "../packages/integrations/live-customer-worker";
import { localModeConfiguration } from "../packages/authz/local-guard";
import { requireLiveBillingWorkerIdentity } from "../packages/integrations/live-worker-identity";

// SOURCE ONLY until owner runs sequentially on an existing disposable fixture.
function fixtureConfiguration() {
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
  return {
    host: path.join(runtime, "socket"),
    port: config.port,
    database: config.database,
    user: os.userInfo().username,
    password: "",
    ssl: false as const,
  };
}

test("actual local NOLOGIN capability cannot make an admin SET ROLE connection a genuine runner", async () => {
  const db = new pg.Client(fixtureConfiguration());
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

test("fresh private fixture accepts a genuine runner login followed by worker SET ROLE", async () => {
  const config = fixtureConfiguration();
  const admin = new pg.Client(config);
  const runner = new pg.Client({ ...config, user: "kxra_billing_runner" });
  let owned = false;
  await admin.connect();
  try {
    const isolation = (
      await admin.query(
        "select current_setting('listen_addresses') listen,current_setting('unix_socket_directories') socket,current_database() db",
      )
    ).rows[0];
    assert.equal(
      isolation.listen,
      "",
      "Transient no-password role requires a TCP-disabled fixture",
    );
    assert.equal(fs.realpathSync(isolation.socket), config.host);
    assert.equal(isolation.db, config.database);
    await admin.query(
      "select pg_advisory_lock(hashtext('local-fixture-billing-runner-identity'))",
    );
    assert.equal(
      (
        await admin.query(
          "select count(*)::int n from pg_roles where rolname='kxra_billing_runner'",
        )
      ).rows[0].n,
      0,
      "Refuse to alter or reuse any preexisting runner role",
    );
    const capability = (
      await admin.query(
        "select rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls from pg_roles where rolname='kxra_billing_worker'",
      )
    ).rows[0];
    assert.deepEqual(capability, {
      rolcanlogin: false,
      rolsuper: false,
      rolinherit: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
      rolbypassrls: false,
    });
    await admin.query("begin");
    // Explicit test-only LOGIN on private trust-auth socket, with NO password.
    // Do not call the hosted operator or modify an existing role/configuration.
    await admin.query(
      "create role kxra_billing_runner login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 3",
    );
    owned = true;
    await admin.query("grant kxra_billing_worker to kxra_billing_runner");
    await admin.query("commit");
    const attributes = (
      await admin.query(
        "select rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls,rolconnlimit,coalesce(rolconfig,'{}') rolconfig from pg_roles where rolname='kxra_billing_runner'",
      )
    ).rows[0];
    assert.deepEqual(attributes, {
      rolcanlogin: true,
      rolsuper: false,
      rolinherit: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
      rolbypassrls: false,
      rolconnlimit: 3,
      rolconfig: [],
    });
    const memberships = (
      await admin.query(
        "select role.rolname granted,m.admin_option from pg_auth_members m join pg_roles role on role.oid=m.roleid join pg_roles member on member.oid=m.member where member.rolname='kxra_billing_runner' order by role.rolname",
      )
    ).rows;
    assert.deepEqual(memberships, [
      { granted: "kxra_billing_worker", admin_option: false },
    ]);
    await runner.connect();
    const initial = (await runner.query("select session_user,current_user"))
      .rows[0];
    assert.deepEqual(initial, {
      session_user: "kxra_billing_runner",
      current_user: "kxra_billing_runner",
    });
    assert.throws(() => requireLiveBillingWorkerIdentity(initial), {
      message: "LIVE_BILLING_WORKER_IDENTITY_INVALID",
    });
    await runner.query("begin");
    await runner.query("set local role kxra_billing_worker");
    const actual = (await runner.query("select session_user,current_user"))
      .rows[0];
    assert.deepEqual(actual, {
      session_user: "kxra_billing_runner",
      current_user: "kxra_billing_worker",
    });
    assert.doesNotThrow(() => requireLiveBillingWorkerIdentity(actual));
    await runner.query("commit");
    assert.equal(
      (await runner.query("select current_user")).rows[0].current_user,
      "kxra_billing_runner",
    );
    // Exercise the real short-transaction adapter with a genuine second runner
    // connection. Only the transport is injected to the private fixture socket;
    // this proves transaction/identity handling, NOT hosted TLS/provider readiness.
    const project = "jlebgsxcvhvpueuibekd";
    const target = customerDispatchConfiguration({
      KXRA_MODERN_BILLING_DISPATCH_ENABLED: "true",
      NODE_ENV: "production",
      KXRA_ENVIRONMENT: "staging",
      NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`,
      STRIPE_SECRET_KEY: "sk_test_SYNTHETIC_NOT_A_REAL_CREDENTIAL_0000",
      KXRA_BILLING_WORKER_DATABASE_URL: `postgresql://kxra_billing_runner.${project}:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
      KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(rootCertificates[0]).toString(
        "base64",
      ),
    })!;
    const execute = liveCustomerDatabaseExecutor(target, async () => {
      const client = new pg.Client({ ...config, user: "kxra_billing_runner" });
      return {
        connect: async () => {
          await client.connect();
        },
        query: (text, values) => client.query(text, values),
        end: () => client.end(),
      };
    });
    assert.equal(
      await execute({ text: "select current_user::text value", values: [] }),
      "kxra_billing_worker",
    );
    assert.equal(
      (await runner.query("select current_user")).rows[0].current_user,
      "kxra_billing_runner",
    );
  } finally {
    // Close the fresh login before removing only the role owned by this test.
    try {
      await runner.end();
    } finally {
      try {
        await admin.query("rollback").catch(() => {});
        if (owned) {
          await admin.query("drop role kxra_billing_runner");
          assert.equal(
            (
              await admin.query(
                "select count(*)::int n from pg_roles where rolname='kxra_billing_runner'",
              )
            ).rows[0].n,
            0,
          );
        }
      } finally {
        await admin.end();
      }
    }
  }
});
