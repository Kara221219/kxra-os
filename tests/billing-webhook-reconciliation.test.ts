import assert from "node:assert/strict";
import test from "node:test";
import {
  readWebhookReconciliationStatus,
  webhookReconciliationPresentation,
} from "../packages/integrations/billing-webhook-reconciliation";
import { modernBillingFixture } from "./support/modern-billing-scope";

function fixture(mode: "LIVE" | "STAGING_SANDBOX" = "LIVE") {
  const modern = modernBillingFixture(mode),
    tag = modern.execution.execution_scope;
  const env = Object.freeze({
    NODE_ENV: "production",
    KXRA_ENVIRONMENT: tag.livemode ? "production" : "staging",
    NEXT_PUBLIC_SUPABASE_URL: modern.runtimeIdentity.supabase_url,
    STRIPE_SECRET_KEY: `sk_${tag.livemode ? "live" : "test"}_SYNTHETIC_NOT_A_CREDENTIAL_000000`,
    KXRA_BILLING_WORKER_DATABASE_URL: `postgresql://kxra_billing_runner:SYNTHETIC_NOT_A_PASSWORD@db.${tag.project_ref}.supabase.co:5432/postgres`,
    KXRA_DATABASE_CA_CERT_BASE64: Buffer.from(
      "-----BEGIN CERTIFICATE-----\nU1lOVEhFVElDX09OTFk=\n-----END CERTIFICATE-----\n",
    ).toString("base64"),
    KXRA_BILLING_RECONCILIATION_STATUS_ENABLED: "true",
    KXRA_MODERN_BILLING_DISPATCH_ENABLED: "false",
    KXRA_PAID_PROOF_REFRESH_ENABLED: "false",
    KXRA_BILLING_HTTP_ENABLED: "false",
  });
  const summary = {
    execution_scope: tag,
    unmatched_quarantined: 2,
    quarantined: 2,
    conflict_quarantined: 1,
    unproven_associations: 0,
    operator_held: 3,
    exhausted: 2,
    pending: 4,
    claimed: 1,
    completed: 10,
    superseded: 20,
    oldest_quarantine_age_seconds: 120,
    automatic_resolution: false,
    entitlement_authority: false,
    version: "WEBHOOK_RECONCILIATION_V1",
  };
  const statements: string[] = [];
  let ended = 0;
  let identity = {
    session_user: "kxra_billing_runner",
    current_user: "kxra_billing_worker",
  };
  let data: unknown = summary,
    failAt = "";
  const client = {
    connect: async () => {},
    end: async () => {
      ended++;
    },
    query: async (text: string) => {
      statements.push(text);
      if (text.includes(failAt) && failAt)
        throw Error("SYNTHETIC_PRIVATE_PASSWORD_AND_RAW_PROVIDER_ERROR");
      if (text === "select session_user,current_user")
        return { rows: [identity] };
      if (text.includes("scope_attestation"))
        return { rows: [{ value: modern.execution }] };
      if (text.includes("reconciliation_summary"))
        return { rows: [{ value: data }] };
      return { rows: [] };
    },
  };
  return {
    modern,
    env,
    summary,
    statements,
    ended: () => ended,
    ports: {
      clientFactory: async (config: any) => {
        assert.equal(config.ssl.rejectUnauthorized, true);
        assert.equal(config.query_timeout, 5000);
        assert.equal(config.user, "kxra_billing_runner");
        return client;
      },
    },
    badIdentity: () => {
      identity = {
        session_user: "kxra_app",
        current_user: "kxra_billing_worker",
      };
    },
    badSummary: (value: unknown) => {
      data = value;
    },
    fail: (part: string) => {
      failAt = part;
    },
  };
}
test("operator status is separately default-off before loading keys, DSN, CA or a client", async () => {
  const source = new Proxy(
    {},
    {
      get(_target, key) {
        assert.equal(key, "KXRA_BILLING_RECONCILIATION_STATUS_ENABLED");
        return undefined;
      },
    },
  );
  await assert.rejects(
    readWebhookReconciliationStatus(source, {
      clientFactory: async () => assert.fail("client"),
    }),
    /STATUS_DISABLED/,
  );
});
for (const mode of ["LIVE", "STAGING_SANDBOX"] as const)
  test(`${mode}: genuine scoped operator summary uses READ ONLY without enabling billing or calling Stripe`, async () => {
    const f = fixture(mode),
      originalFetch = globalThis.fetch;
    globalThis.fetch = async () => assert.fail("No Stripe/HTTP call permitted");
    try {
      const result = await readWebhookReconciliationStatus(f.env, f.ports);
      assert.equal(result.state, "REVIEW_REQUIRED");
      assert.equal(result.operator_action, "REVIEW_VERIFIED_RESOURCE_LINEAGE");
      assert.equal(result.mode, mode);
      assert.equal(result.automatic_resolution, false);
      assert.equal(result.entitlement_authority, false);
      assert.equal(f.statements[0], "begin read only");
      assert.equal(f.statements.at(-1), "commit");
      assert.ok(
        f.statements.includes(
          `select kxra_private.${mode === "LIVE" ? "" : "staging_sandbox_"}webhook_reconciliation_summary() value`,
        ),
      );
      assert.ok(
        !f.statements.some((s) =>
          /insert |update |delete |resolve_unmatched|record_live|claim_live|set.*enabled/i.test(
            s,
          ),
        ),
      );
      assert.doesNotMatch(
        JSON.stringify(result),
        /acct_|evt_|cus_|sub_|org_id|scope_id|project_ref|secret|password|SYNTHETIC/i,
      );
      assert.equal(f.env.KXRA_PAID_PROOF_REFRESH_ENABLED, "false");
      assert.equal(f.env.KXRA_MODERN_BILLING_DISPATCH_ENABLED, "false");
      assert.equal(f.ended(), 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
test("zero quarantine is not product readiness, payment authority or automated repair", () => {
  const f = fixture();
  const result = webhookReconciliationPresentation(
    {
      ...f.summary,
      unmatched_quarantined: 0,
      quarantined: 0,
      conflict_quarantined: 0,
      operator_held: 0,
      exhausted: 0,
      oldest_quarantine_age_seconds: 0,
    },
    f.modern.execution.execution_scope,
  );
  assert.equal(result.state, "NO_QUARANTINED_EVENTS");
  assert.equal(result.pending, 4);
  assert.equal(result.entitlement_authority, false);
  assert.equal(result.automatic_resolution, false);
  assert.doesNotMatch(JSON.stringify(result), /READY|LAUNCH|ENTITLED/);
});

test("an unproven legacy association requires review even when ordinary hold counts are zero", () => {
  const f = fixture();
  const result = webhookReconciliationPresentation(
    {
      ...f.summary,
      unmatched_quarantined: 0,
      quarantined: 0,
      conflict_quarantined: 0,
      operator_held: 0,
      exhausted: 0,
      unproven_associations: 1,
    },
    f.modern.execution.execution_scope,
  );
  assert.equal(result.state, "REVIEW_REQUIRED");
  assert.equal(result.automatic_resolution, false);
});
test("missing, contradictory, nonfinite or identifier-bearing summaries fail closed", () => {
  const f = fixture();
  for (const bad of [
    null,
    {},
    { ...f.summary, exhausted: 4 },
    { ...f.summary, pending: -1 },
    { ...f.summary, claimed: 0.5 },
    { ...f.summary, pending: NaN },
    { ...f.summary, pending: 2147483648 },
    { ...f.summary, automatic_resolution: true },
    { ...f.summary, customer_id: "cus_forbidden" },
    { ...f.summary, event_ids: ["evt_forbidden"] },
    {
      ...f.summary,
      execution_scope:
        modernBillingFixture("STAGING_SANDBOX").execution.execution_scope,
    },
  ])
    assert.throws(() =>
      webhookReconciliationPresentation(
        bad,
        f.modern.execution.execution_scope,
      ),
    );
});
test("an application session cannot impersonate the genuine operator runner", async () => {
  const f = fixture();
  f.badIdentity();
  await assert.rejects(
    readWebhookReconciliationStatus(f.env, f.ports),
    /STATUS_UNAVAILABLE/,
  );
  assert.ok(!f.statements.some((s) => s.includes("scope_attestation")));
  assert.equal(f.statements.at(-1), "rollback");
  assert.equal(f.ended(), 1);
});
test("database errors and malformed output roll back, close and never disclose raw details", async () => {
  for (const errorAt of ["scope_attestation", "reconciliation_summary"]) {
    const f = fixture();
    f.fail(errorAt);
    await assert.rejects(
      readWebhookReconciliationStatus(f.env, f.ports),
      (error: unknown) => {
        assert.equal(
          (error as Error).message,
          "BILLING_RECONCILIATION_STATUS_UNAVAILABLE",
        );
        assert.equal((error as Error).cause, undefined);
        return true;
      },
    );
    assert.equal(f.statements.at(-1), "rollback");
    assert.equal(f.ended(), 1);
  }
  const f = fixture();
  f.badSummary({ ...f.summary, raw_error: "PRIVATE" });
  await assert.rejects(
    readWebhookReconciliationStatus(f.env, f.ports),
    /STATUS_UNAVAILABLE/,
  );
  assert.equal(f.ended(), 1);
});
test("invalid worker profile never creates a database connection", async () => {
  const f = fixture();
  let calls = 0;
  await assert.rejects(
    readWebhookReconciliationStatus(
      { ...f.env, KXRA_DATABASE_CA_CERT_BASE64: "" },
      {
        clientFactory: async () => {
          calls++;
          throw Error("unexpected");
        },
      },
    ),
    /STATUS_UNAVAILABLE/,
  );
  assert.equal(calls, 0);
});
