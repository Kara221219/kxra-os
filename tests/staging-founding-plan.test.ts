import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import {
  applyFoundingPlan,
  foundingPlan,
  foundingPlanFindings,
  inspectFoundingPlan,
  validateFoundingPlanOperator,
} from "../scripts/staging-founding-plan-core.mjs";
import { runtimeFile } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const database = new pg.Pool({ ...config, user: os.userInfo().username });
const prices = {
  monthly: "price_monthlySynthetic123",
  annual: "price_annualSynthetic123",
};

after(() => database.end());

test("founding plan operator requires exact staging target, TEST prices and apply confirmation", () => {
  const environment = {
    KXRA_ENVIRONMENT: "staging",
    KXRA_STAGING_PROJECT_REF: "a".repeat(20),
    KXRA_STAGING_MIGRATOR_DATABASE_URL: `postgresql://postgres:secret@db.${"a".repeat(20)}.supabase.co:5432/postgres?sslmode=verify-full`,
    KXRA_STRIPE_MONTHLY_PRICE_ID: prices.monthly,
    KXRA_STRIPE_ANNUAL_PRICE_ID: prices.annual,
  };
  assert.equal(validateFoundingPlanOperator(environment, "plan").ok, true);
  assert.equal(validateFoundingPlanOperator(environment, "apply").ok, false);
  assert.equal(
    validateFoundingPlanOperator(
      {
        ...environment,
        KXRA_STAGING_FOUNDING_PLAN_CONFIRMATION: `FOUNDING-PLAN:${"a".repeat(20)}:codex/phase-2-completion`,
      },
      "apply",
    ).ok,
    true,
  );
  assert.equal(
    validateFoundingPlanOperator(
      { ...environment, KXRA_STRIPE_ANNUAL_PRICE_ID: prices.monthly },
      "plan",
    ).ok,
    false,
  );
});

test("founding plan has exact commercial and usage limits", () => {
  assert.equal(foundingPlan.currency, "GBP");
  assert.deepEqual(
    foundingPlan.versions.map((version) => [
      version.interval,
      version.amountMinor,
    ]),
    [
      ["MONTH", 2900],
      ["YEAR", 29000],
    ],
  );
  assert.deepEqual(
    foundingPlan.features.map((feature) => [
      feature.key,
      feature.quantityLimit,
      feature.usageWindow,
    ]),
    [
      ["brand-studio.access", null, "NONE"],
      ["brand.generate", 120, "MONTH"],
      ["brand.export", 120, "MONTH"],
    ],
  );
});

test("founding plan applies idempotently and rejects changed provider authority", async () => {
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from kxra.price_references where plan_version_id in ($1,$2)",
      [foundingPlan.versions[0].id, foundingPlan.versions[1].id],
    );
    await client.query(
      "delete from kxra.plan_features where plan_version_id in ($1,$2)",
      [foundingPlan.versions[0].id, foundingPlan.versions[1].id],
    );
    await client.query("delete from kxra.plan_versions where plan_id=$1", [
      foundingPlan.id,
    ]);
    await client.query("delete from kxra.plans where id=$1", [foundingPlan.id]);
    await applyFoundingPlan(client, prices);
    await applyFoundingPlan(client, prices);
    assert.deepEqual(
      foundingPlanFindings(await inspectFoundingPlan(client), prices),
      [],
    );
    await client.query(
      "update kxra.plan_versions set amount_minor=1 where id=$1",
      [foundingPlan.versions[0].id],
    );
    await assert.rejects(
      () => applyFoundingPlan(client, prices),
      /FOUNDING_PLAN_TAKEOVER_REJECTED/,
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});
