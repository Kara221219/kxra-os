import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emailWorkerRoleFindings,
  validateEmailWorkerRoleOperator,
} from "../scripts/staging-email-worker-role-core.mjs";

const environment = {
  KXRA_ENVIRONMENT: "staging",
  KXRA_STAGING_PROJECT_REF: "abcdefghijklmnopqrst",
  KXRA_STAGING_MIGRATOR_DATABASE_URL:
    "postgresql://postgres:password@db.abcdefghijklmnopqrst.supabase.co:5432/postgres?sslmode=verify-full",
};

test("email-worker role operator requires exact apply-only authority", () => {
  assert.equal(validateEmailWorkerRoleOperator(environment, "plan").ok, true);
  const rejected = validateEmailWorkerRoleOperator(environment, "apply");
  assert.equal(rejected.ok, false);
  const accepted = validateEmailWorkerRoleOperator(
    {
      ...environment,
      KXRA_STAGING_EMAIL_WORKER_PASSWORD: "p".repeat(72),
      KXRA_STAGING_EMAIL_WORKER_ROLE_CONFIRMATION:
        "EMAIL-ROLE:abcdefghijklmnopqrst:codex/phase-2-completion",
    },
    "apply",
  );
  assert.deepEqual(accepted, { ok: true, findings: [] });
});

test("email-worker login must have only the no-login capability role", () => {
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
    emailWorkerRoleFindings({
      roles: [
        {
          ...safeRole,
          rolname: "kxra_email_worker",
          rolcanlogin: false,
          rolconnlimit: -1,
          password_set: false,
        },
        {
          ...safeRole,
          rolname: "kxra_email_runner",
          rolcanlogin: true,
          rolconnlimit: 3,
          password_set: true,
        },
      ],
      memberships: [
        {
          member: "kxra_email_runner",
          granted: "kxra_email_worker",
          admin_option: false,
        },
      ],
      ownership: { owned: 0 },
      directGrants: { grants: 0 },
    }),
    [],
  );
});
