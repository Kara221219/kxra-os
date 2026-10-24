import assert from "node:assert/strict";
import { rootCertificates } from "node:tls";
import test from "node:test";
import { createPaidRefreshWorkerQuery } from "../packages/integrations/paid-refresh-database";
import type { LiveCustomerDatabaseClient } from "../packages/integrations/live-customer-worker";
function environment(mode: "staging" | "production" = "staging") {
  const project =
    mode === "staging" ? "jlebgsxcvhvpueuibekd" : "lhbgeucifxxcdoyrnesf";
  return {
    KXRA_PAID_PROOF_REFRESH_ENABLED: "true",
    NODE_ENV: "production",
    KXRA_ENVIRONMENT: mode,
    NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`,
    STRIPE_SECRET_KEY: `sk_${mode === "staging" ? "test" : "live"}_SYNTHETIC_NOT_A_REAL_CREDENTIAL_0000`,
    KXRA_BILLING_WORKER_DATABASE_URL: `postgresql://kxra_billing_runner.${project}:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres`,
    KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(rootCertificates[0]).toString(
      "base64",
    ),
  };
}
test("refresh off refuses before reading any private settings or constructing a client", async () => {
  let constructed = 0;
  const env = new Proxy(
    {},
    {
      get: (_target, key) => {
        assert.equal(key, "KXRA_PAID_PROOF_REFRESH_ENABLED");
        return undefined;
      },
    },
  );
  await assert.rejects(
    createPaidRefreshWorkerQuery({
      environment: env,
      clientFactory: async () => {
        constructed++;
        throw Error("must not construct");
      },
    })("select 1"),
    { message: "PAID_REFRESH_DISABLED" },
  );
  assert.equal(constructed, 0);
});
const invalid = {
  foreignHost:
    "postgresql://kxra_billing_runner:synthetic@foreign.example:5432/postgres",
  wrongUser:
    "postgresql://postgres.jlebgsxcvhvpueuibekd:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
  wrongDatabase:
    "postgresql://kxra_billing_runner.jlebgsxcvhvpueuibekd:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/other",
  wrongPort:
    "postgresql://kxra_billing_runner.jlebgsxcvhvpueuibekd:synthetic@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
  productionTarget:
    "postgresql://kxra_billing_runner.lhbgeucifxxcdoyrnesf:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
  wrongDirectProject:
    "postgresql://kxra_billing_runner:synthetic@db.lhbgeucifxxcdoyrnesf.supabase.co:5432/postgres",
  override:
    "postgresql://kxra_billing_runner.jlebgsxcvhvpueuibekd:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?host=foreign.example",
  weakSsl:
    "postgresql://kxra_billing_runner.jlebgsxcvhvpueuibekd:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?sslmode=disable",
  passwordless:
    "postgresql://kxra_billing_runner.jlebgsxcvhvpueuibekd@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
  fragment:
    "postgresql://kxra_billing_runner.jlebgsxcvhvpueuibekd:synthetic@aws-0-eu-west-2.pooler.supabase.com:5432/postgres#anything",
};
for (const [name, dsn] of Object.entries(invalid))
  test(`refresh rejects ${name} before client/network`, async () => {
    let factory = 0;
    await assert.rejects(
      createPaidRefreshWorkerQuery({
        environment: {
          ...environment(),
          KXRA_BILLING_WORKER_DATABASE_URL: dsn,
        },
        clientFactory: async () => {
          factory++;
          throw Error("no network");
        },
      })("select 1"),
      { message: "PAID_REFRESH_DATABASE_CONFIGURATION_INVALID" },
    );
    assert.equal(factory, 0);
  });
for (const [name, override] of Object.entries({
  wrongMode: { KXRA_ENVIRONMENT: "other" },
  development: { NODE_ENV: "development" },
  missingCa: { KXRA_DATABASE_CA_CERT_BASE64: "" },
  wrongUrl: {
    NEXT_PUBLIC_SUPABASE_URL: "https://lhbgeucifxxcdoyrnesf.supabase.co",
  },
  liveKeyOnStage: {
    STRIPE_SECRET_KEY: "sk_live_SYNTHETIC_NOT_A_REAL_CREDENTIAL_0000",
  },
  testKeyOnProduction: {
    KXRA_ENVIRONMENT: "production",
    NEXT_PUBLIC_SUPABASE_URL: "https://lhbgeucifxxcdoyrnesf.supabase.co",
  },
}))
  test(`refresh rejects ${name} before client/network`, async () => {
    let factory = 0;
    await assert.rejects(
      createPaidRefreshWorkerQuery({
        environment: { ...environment(), ...override },
        clientFactory: async () => {
          factory++;
          throw Error("no network");
        },
      })("select 1"),
      { message: "PAID_REFRESH_DATABASE_CONFIGURATION_INVALID" },
    );
    assert.equal(factory, 0);
  });
for (const mode of ["staging", "production"] as const)
  for (const direct of [false, true])
    test(`valid refresh ${mode} ${direct ? "direct" : "pooler"} is bounded and genuinely identified`, async () => {
      const env = environment(mode),
        project =
          mode === "staging" ? "jlebgsxcvhvpueuibekd" : "lhbgeucifxxcdoyrnesf";
      if (direct)
        env.KXRA_BILLING_WORKER_DATABASE_URL = `postgresql://kxra_billing_runner:synthetic@db.${project}.supabase.co:5432/postgres?sslmode=verify-full`;
      const statements: string[] = [];
      let closed = 0,
        connected = 0;
      const query = createPaidRefreshWorkerQuery({
        environment: env,
        clientFactory: async (cfg) => {
          assert.equal(cfg.database, "postgres");
          assert.equal(cfg.port, 5432);
          assert.equal(
            cfg.user,
            direct ? "kxra_billing_runner" : `kxra_billing_runner.${project}`,
          );
          assert.equal(cfg.ssl.rejectUnauthorized, true);
          assert.equal(cfg.connectionTimeoutMillis, 3000);
          assert.equal(cfg.query_timeout, 5000);
          assert.equal("connectionString" in cfg, false);
          return {
            connect: async () => {
              connected++;
            },
            end: async () => {
              closed++;
            },
            query: async (text, values) => {
              statements.push(text);
              if (text === "select session_user,current_user")
                return {
                  rows: [
                    {
                      session_user: "kxra_billing_runner",
                      current_user: "kxra_billing_worker",
                    },
                  ],
                };
              if (text === "select synthetic_refresh($1)") {
                assert.deepEqual(values, ["SYNTHETIC"]);
                return { rows: [{ value: "first" }, { value: "second" }] };
              }
              return { rows: [] };
            },
          };
        },
      });
      assert.deepEqual(
        await query("select synthetic_refresh($1)", ["SYNTHETIC"]),
        { rows: [{ value: "first" }, { value: "second" }] },
      );
      assert.equal(connected, 1);
      assert.equal(closed, 1);
      assert.deepEqual(statements.slice(0, 5), [
        "begin",
        "set local statement_timeout='5s'",
        "set local lock_timeout='2s'",
        "set local role kxra_billing_worker",
        "select session_user,current_user",
      ]);
      assert.equal(statements.at(-1), "commit");
    });
for (const session_user of ["postgres", "kxra_billing_worker", "kxra_app"])
  test(`refresh rejects ${session_user} role-only impersonation and rolls back`, async () => {
    const statements: string[] = [];
    let closed = 0;
    const client: LiveCustomerDatabaseClient = {
      connect: async () => {},
      end: async () => {
        closed++;
      },
      query: async (sql) => {
        statements.push(sql);
        return {
          rows:
            sql === "select session_user,current_user"
              ? [{ session_user, current_user: "kxra_billing_worker" }]
              : [],
        };
      },
    };
    await assert.rejects(
      createPaidRefreshWorkerQuery({
        environment: environment(),
        clientFactory: async () => client,
      })("select must_not_execute"),
      { message: "PAID_REFRESH_DATABASE_UNAVAILABLE" },
    );
    assert.ok(!statements.includes("select must_not_execute"));
    assert.equal(statements.at(-1), "rollback");
    assert.equal(closed, 1);
  });
test("refresh query errors are redacted, rolled back and closed", async () => {
  let closed = 0;
  const statements: string[] = [];
  const client: LiveCustomerDatabaseClient = {
    connect: async () => {},
    end: async () => {
      closed++;
    },
    query: async (sql) => {
      statements.push(sql);
      if (sql === "select session_user,current_user")
        return {
          rows: [
            {
              session_user: "kxra_billing_runner",
              current_user: "kxra_billing_worker",
            },
          ],
        };
      if (sql === "select fail")
        throw Error("postgresql://private-password@private-target");
      return { rows: [] };
    },
  };
  await assert.rejects(
    createPaidRefreshWorkerQuery({
      environment: environment(),
      clientFactory: async () => client,
    })("select fail"),
    { message: "PAID_REFRESH_DATABASE_UNAVAILABLE" },
  );
  assert.equal(statements.at(-1), "rollback");
  assert.equal(closed, 1);
});
