import assert from "node:assert/strict";
import { test } from "node:test";
import {
  productionBootstrapFindings,
  productionBootstrapPasswords,
  productionBootstrapProfile,
  validateProductionBootstrap,
} from "../scripts/production-bootstrap-core.mjs";
import { productionProjectRef } from "../scripts/production-migrations-core.mjs";

const sourceCommit = "a".repeat(40);
const base = {
  KXRA_ENVIRONMENT: "production",
  KXRA_PRODUCTION_PROJECT_REF: productionProjectRef,
  KXRA_PRODUCTION_SOURCE_COMMIT: sourceCommit,
  KXRA_PRODUCTION_MIGRATOR_DATABASE_URL: `postgresql://postgres:private-password@db.${productionProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
};

const password = (character: string) => character.repeat(64);

test("production bootstrap is fixed to production and requires four distinct secrets", () => {
  assert.equal(validateProductionBootstrap(base, "plan").ok, true);
  const missing = validateProductionBootstrap(base, "apply");
  assert.equal(missing.ok, false);
  assert.ok(
    missing.findings.includes(
      "KXRA_PRODUCTION_APP_PASSWORD must be 48-128 base64url characters",
    ),
  );
  const environment = {
    ...base,
    KXRA_PRODUCTION_APP_PASSWORD: password("a"),
    KXRA_PRODUCTION_PUBLIC_INGRESS_PASSWORD: password("b"),
    KXRA_PRODUCTION_EMAIL_WORKER_PASSWORD: password("c"),
    KXRA_PRODUCTION_BILLING_WORKER_PASSWORD: password("d"),
    KXRA_PRODUCTION_BOOTSTRAP_CONFIRMATION: `BOOTSTRAP:${productionProjectRef}:${sourceCommit}`,
  };
  assert.deepEqual(productionBootstrapPasswords(environment), {
    app: password("a"),
    publicIngress: password("b"),
    emailWorker: password("c"),
    billingWorker: password("d"),
  });
  assert.deepEqual(validateProductionBootstrap(environment, "apply"), {
    ok: true,
    findings: [],
  });
  assert.equal(
    validateProductionBootstrap(
      {
        ...environment,
        KXRA_PRODUCTION_BILLING_WORKER_PASSWORD: password("a"),
      },
      "apply",
    ).ok,
    false,
  );
});

test("production bootstrap reports every missing foundation boundary", () => {
  assert.deepEqual(
    productionBootstrapFindings({
      migrationsComplete: true,
      seedApplied: true,
      runtimeRoleFindings: [],
      emailRoleFindings: [],
      billingRoleFindings: [],
      legalFindings: [],
      event: {
        profile: productionBootstrapProfile,
        source_commit: sourceCommit,
      },
      sourceCommit,
    }),
    [],
  );
  assert.deepEqual(
    productionBootstrapFindings({
      migrationsComplete: false,
      seedApplied: false,
      runtimeRoleFindings: ["runtime missing"],
      emailRoleFindings: ["email missing"],
      billingRoleFindings: ["billing missing"],
      legalFindings: ["legal missing"],
      event: null,
      sourceCommit,
    }),
    [
      "migrations are incomplete",
      "canonical seed is missing",
      "runtime missing",
      "email missing",
      "billing missing",
      "legal missing",
      "production bootstrap evidence is missing",
    ],
  );
});
