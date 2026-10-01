import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import {
  billingWorkerRoleFindings,
  validateBillingWorkerRoleOperator,
} from "../scripts/staging-billing-worker-role-core.mjs";

const environment = {
  KXRA_ENVIRONMENT: "staging",
  KXRA_STAGING_PROJECT_REF: "abcdefghijklmnopqrst",
  KXRA_STAGING_MIGRATOR_DATABASE_URL:
    "postgresql://postgres:password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full",
};

test("billing-worker role operator requires exact apply-only authority", () => {
  assert.equal(validateBillingWorkerRoleOperator(environment, "plan").ok, true);
  const rejected = validateBillingWorkerRoleOperator(environment, "apply");
  assert.equal(rejected.ok, false);
  const accepted = validateBillingWorkerRoleOperator(
    {
      ...environment,
      KXRA_STAGING_BILLING_WORKER_PASSWORD: "p".repeat(72),
      KXRA_STAGING_BILLING_WORKER_ROLE_CONFIRMATION:
        "BILLING-ROLE:abcdefghijklmnopqrst:codex/phase-2-completion",
    },
    "apply",
  );
  assert.deepEqual(accepted, { ok: true, findings: [] });
});

test("billing-worker login must have only the no-login capability role", () => {
  const safeRole = {
    rolsuper: false,
    rolinherit: false,
    rolcreaterole: false,
    rolcreatedb: false,
    rolreplication: false,
    rolbypassrls: false,
    rolconfig: [],
  };
  assert.deepEqual(
    billingWorkerRoleFindings({
      roles: [
        {
          ...safeRole,
          rolname: "kxra_billing_worker",
          rolcanlogin: false,
          rolconnlimit: -1,
          password_set: false,
        },
        {
          ...safeRole,
          rolname: "kxra_billing_runner",
          rolcanlogin: true,
          rolconnlimit: 3,
          password_set: true,
        },
      ],
      memberships: [
        {
          member: "kxra_billing_runner",
          granted: "kxra_billing_worker",
          admin_option: false,
        },
      ],
      ownership: { owned: 0 },
      directGrants: { grants: 0 },
    }),
    [],
  );
});

test("billing-worker role audit table remains protected by RLS", () => {
  const operator = fs.readFileSync(
    new URL("../scripts/staging-billing-worker-role.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    operator,
    /alter table public\.kxra_worker_role_events enable row level security/,
  );
  assert.match(operator, /revoke all on table public\.kxra_worker_role_events/);
});
