import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeProductionOwnerInput,
  productionOwnerGrantSource,
  productionOwnerProfile,
  validateProductionOwnerOperator,
} from "../scripts/production-owner-core.mjs";
import { productionProjectRef } from "../scripts/production-migrations-core.mjs";

const sourceCommit = "b".repeat(40);
const userId = "30000000-0000-4000-8000-000000000041";
const base = {
  KXRA_ENVIRONMENT: "production",
  KXRA_PRODUCTION_PROJECT_REF: productionProjectRef,
  KXRA_PRODUCTION_SOURCE_COMMIT: sourceCommit,
  KXRA_PRODUCTION_MIGRATOR_DATABASE_URL: `postgresql://postgres:private-password@db.${productionProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
  KXRA_PRODUCTION_OWNER_USER_ID: userId,
  KXRA_PRODUCTION_OWNER_EMAIL: "owner.production@example.com",
  KXRA_PRODUCTION_OWNER_DISPLAY_NAME: "Production Owner",
};

test("production owner operator is fixed to production and exact source", () => {
  assert.equal(validateProductionOwnerOperator(base, "plan").ok, true);
  assert.equal(validateProductionOwnerOperator(base, "apply").ok, false);
  assert.deepEqual(
    validateProductionOwnerOperator(
      {
        ...base,
        KXRA_PRODUCTION_OWNER_CONFIRMATION: `OWNER:${productionProjectRef}:${userId}:${sourceCommit}`,
      },
      "apply",
    ),
    {
      ok: true,
      findings: [],
      input: {
        userId,
        email: "owner.production@example.com",
        displayName: "Production Owner",
      },
    },
  );
  assert.equal(
    validateProductionOwnerOperator(
      { ...base, KXRA_ENVIRONMENT: "staging" },
      "plan",
    ).ok,
    false,
  );
});

test("production owner input is normalized and uses separate audit labels", () => {
  assert.deepEqual(
    normalizeProductionOwnerInput({
      KXRA_PRODUCTION_OWNER_USER_ID: userId.toUpperCase(),
      KXRA_PRODUCTION_OWNER_EMAIL: " Owner@Example.com ",
      KXRA_PRODUCTION_OWNER_DISPLAY_NAME: "  Kara  ",
    }),
    { userId, email: "owner@example.com", displayName: "Kara" },
  );
  assert.equal(productionOwnerProfile, "KXRA-PRODUCTION-OWNER-V1");
  assert.equal(productionOwnerGrantSource, "PRODUCTION_OWNER_BOOTSTRAP");
});
