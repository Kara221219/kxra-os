import { validateStagingTarget } from "./staging-migrations-core.mjs";

export const foundingPlanProfile = "KXRA-FOUNDING-PLAN-V1";

export const foundingPlan = Object.freeze({
  id: "f0010000-0000-4000-8000-000000000001",
  key: "founding",
  name: "KXRA Founding",
  currency: "GBP",
  taxBehavior: "EXCLUSIVE",
  policyVersion: 1,
  commercialCopy: {
    audience: "One customer organisation",
    custom_projects: "Scoped and priced separately",
    generated_media: "Excluded and separately priced",
    high_cost_research: "Excluded and separately approved",
    policy_reference: "ADR-0046",
    support: "Standard online support",
  },
  versions: [
    {
      id: "f0010000-0000-4000-8000-000000000002",
      version: 1,
      interval: "MONTH",
      amountMinor: 2900,
      priceEnvironmentKey: "KXRA_STRIPE_MONTHLY_PRICE_ID",
    },
    {
      id: "f0010000-0000-4000-8000-000000000003",
      version: 2,
      interval: "YEAR",
      amountMinor: 29000,
      priceEnvironmentKey: "KXRA_STRIPE_ANNUAL_PRICE_ID",
    },
  ],
  features: [
    {
      key: "brand-studio.access",
      quantityLimit: null,
      usageWindow: "NONE",
    },
    { key: "brand.generate", quantityLimit: 120, usageWindow: "MONTH" },
    { key: "brand.export", quantityLimit: 120, usageWindow: "MONTH" },
  ],
});

function validPrice(value) {
  return /^price_[A-Za-z0-9]{8,}$/.test(value || "");
}

export function foundingPlanPrices(environment) {
  return {
    monthly: environment.KXRA_STRIPE_MONTHLY_PRICE_ID || "",
    annual: environment.KXRA_STRIPE_ANNUAL_PRICE_ID || "",
  };
}

export function validateFoundingPlanOperator(environment, command) {
  const findings = validateStagingTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  const prices = foundingPlanPrices(environment);
  if (!validPrice(prices.monthly))
    findings.push("KXRA_STRIPE_MONTHLY_PRICE_ID must be a Stripe price ID");
  if (!validPrice(prices.annual))
    findings.push("KXRA_STRIPE_ANNUAL_PRICE_ID must be a Stripe price ID");
  if (prices.monthly && prices.monthly === prices.annual)
    findings.push("monthly and annual Stripe price IDs must differ");
  if (command === "apply") {
    const expected = `FOUNDING-PLAN:${environment.KXRA_STAGING_PROJECT_REF || ""}:codex/phase-2-completion`;
    if (environment.KXRA_STAGING_FOUNDING_PLAN_CONFIRMATION !== expected)
      findings.push(
        `KXRA_STAGING_FOUNDING_PLAN_CONFIRMATION must equal ${expected}`,
      );
  }
  return { ok: findings.length === 0, findings };
}

export async function inspectFoundingPlan(database) {
  const plan = (
    await database.query(
      "select id,plan_key,name,state from kxra.plans where plan_key=$1",
      [foundingPlan.key],
    )
  ).rows[0];
  const versions = plan
    ? (
        await database.query(
          `select id,plan_id,version,state,currency,amount_minor::int,billing_interval,
            tax_behavior,provider_price_reference,policy_version,commercial_copy
           from kxra.plan_versions where plan_id=$1 order by version`,
          [plan.id],
        )
      ).rows
    : [];
  const features = versions.length
    ? (
        await database.query(
          `select plan_version_id,tool_version_id,feature_key,quantity_limit::int,
            usage_window,configuration
           from kxra.plan_features where plan_version_id=any($1::uuid[])
           order by plan_version_id,feature_key`,
          [versions.map((version) => version.id)],
        )
      ).rows
    : [];
  const references = versions.length
    ? (
        await database.query(
          `select plan_version_id,provider,provider_price_id,environment,state
           from kxra.price_references where plan_version_id=any($1::uuid[])
           order by plan_version_id,provider_price_id`,
          [versions.map((version) => version.id)],
        )
      ).rows
    : [];
  const tool = (
    await database.query(
      `select version.id from kxra.tool_catalogue tool
       join kxra.tool_versions version on version.tool_id=tool.id
       where tool.tool_key='brand-studio' and tool.state='ACTIVE'
        and version.version=1 and version.state='ACTIVE'`,
    )
  ).rows[0];
  return { plan, versions, features, references, tool };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stable(item)]),
    );
  return value;
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function foundingPlanFindings(state, prices) {
  const findings = [];
  if (!state.tool?.id) findings.push("active Brand Studio v1 is missing");
  if (
    !state.plan ||
    state.plan.id !== foundingPlan.id ||
    state.plan.plan_key !== foundingPlan.key ||
    state.plan.name !== foundingPlan.name ||
    state.plan.state !== "ACTIVE"
  )
    findings.push("founding plan is missing or mismatched");
  for (const expected of foundingPlan.versions) {
    const price =
      expected.interval === "MONTH" ? prices.monthly : prices.annual;
    const version = state.versions.find((row) => row.id === expected.id);
    if (
      !version ||
      version.plan_id !== foundingPlan.id ||
      version.version !== expected.version ||
      version.state !== "ACTIVE" ||
      version.currency !== foundingPlan.currency ||
      version.amount_minor !== expected.amountMinor ||
      version.billing_interval !== expected.interval ||
      version.tax_behavior !== foundingPlan.taxBehavior ||
      version.provider_price_reference !== price ||
      version.policy_version !== foundingPlan.policyVersion ||
      !same(version.commercial_copy, foundingPlan.commercialCopy)
    )
      findings.push(`${expected.interval.toLowerCase()} plan version mismatch`);
    const reference = state.references.find(
      (row) => row.plan_version_id === expected.id,
    );
    if (
      !reference ||
      reference.provider !== "STRIPE" ||
      reference.provider_price_id !== price ||
      reference.environment !== "TEST" ||
      reference.state !== "ACTIVE"
    )
      findings.push(`${expected.interval.toLowerCase()} TEST price mismatch`);
    for (const feature of foundingPlan.features) {
      const row = state.features.find(
        (item) =>
          item.plan_version_id === expected.id &&
          item.feature_key === feature.key,
      );
      if (
        !row ||
        row.tool_version_id !== state.tool?.id ||
        row.quantity_limit !== feature.quantityLimit ||
        row.usage_window !== feature.usageWindow ||
        !same(row.configuration, {})
      )
        findings.push(
          `${expected.interval.toLowerCase()} ${feature.key} mismatch`,
        );
    }
  }
  if (state.versions.length !== foundingPlan.versions.length)
    findings.push("unexpected founding plan version");
  if (
    state.features.length !==
    foundingPlan.versions.length * foundingPlan.features.length
  )
    findings.push("unexpected founding plan feature");
  if (state.references.length !== foundingPlan.versions.length)
    findings.push("unexpected founding price reference");
  return findings;
}

export function unsafeFoundingPlanState(state, prices) {
  if (!state.plan) return [];
  return foundingPlanFindings(state, prices);
}

export async function applyFoundingPlan(database, prices) {
  const initial = await inspectFoundingPlan(database);
  const blockers = unsafeFoundingPlanState(initial, prices);
  if (blockers.length)
    throw Error(`FOUNDING_PLAN_TAKEOVER_REJECTED:${blockers.join(";")}`);
  if (!initial.tool?.id) throw Error("FOUNDING_PLAN_BRAND_TOOL_MISSING");
  await database.query(
    `insert into kxra.plans(id,plan_key,name,state)
     values($1,$2,$3,'ACTIVE') on conflict(plan_key) do nothing`,
    [foundingPlan.id, foundingPlan.key, foundingPlan.name],
  );
  for (const version of foundingPlan.versions) {
    const price = version.interval === "MONTH" ? prices.monthly : prices.annual;
    await database.query(
      `insert into kxra.plan_versions(
        id,plan_id,version,state,currency,amount_minor,billing_interval,tax_behavior,
        provider_price_reference,policy_version,commercial_copy,effective_at
       ) values($1,$2,$3,'ACTIVE',$4,$5,$6,$7,$8,$9,$10,now())
       on conflict(plan_id,version) do nothing`,
      [
        version.id,
        foundingPlan.id,
        version.version,
        foundingPlan.currency,
        version.amountMinor,
        version.interval,
        foundingPlan.taxBehavior,
        price,
        foundingPlan.policyVersion,
        foundingPlan.commercialCopy,
      ],
    );
    for (const feature of foundingPlan.features)
      await database.query(
        `insert into kxra.plan_features(
          plan_version_id,tool_version_id,feature_key,quantity_limit,usage_window
         ) values($1,$2,$3,$4,$5)
         on conflict(plan_version_id,feature_key) do nothing`,
        [
          version.id,
          initial.tool.id,
          feature.key,
          feature.quantityLimit,
          feature.usageWindow,
        ],
      );
    await database.query(
      `insert into kxra.price_references(
        plan_version_id,provider,provider_price_id,environment,state
       ) values($1,'STRIPE',$2,'TEST','ACTIVE')
       on conflict(provider_price_id) do nothing`,
      [version.id, price],
    );
  }
  const final = await inspectFoundingPlan(database);
  const findings = foundingPlanFindings(final, prices);
  if (findings.length)
    throw Error(`FOUNDING_PLAN_APPLY_MISMATCH:${findings.join(";")}`);
}
