import assert from "node:assert/strict";
import test from "node:test";
import {
  reviewedBusinessFixtureCommands,
  seedReviewedBusinessFixture,
} from "./support/reviewed-business-fixture";

const id = (n: string) =>
  `${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const context = {
  org_id: id("1"),
  actor_id: id("2"),
  scope_id: id("3"),
  customer_id: "cus_synthetic123",
  offer_key: "KXRA_STARTER_V1",
  mapping_revision: 1,
  terms_document_id: id("4"),
  terms_document_version: 1,
  terms_sha256: "a".repeat(64),
  mapping_tax_sha256: "b".repeat(64),
};
const ids = { declaration: id("5"), policy: id("6"), review: id("7") };
test("fixture executor rejects ordinary/hosted execution before any database query", async () => {
  const original = process.env.KXRA_AUTH_MODE;
  let queries = 0;
  try {
    process.env.KXRA_AUTH_MODE = "supabase";
    await assert.rejects(
      seedReviewedBusinessFixture(
        async () => {
          queries++;
          return { rows: [] };
        },
        { org_id: context.org_id, actor_id: context.actor_id },
      ),
      /Explicit generated fixture required/,
    );
    assert.equal(queries, 0);
  } finally {
    if (original === undefined) delete process.env.KXRA_AUTH_MODE;
    else process.env.KXRA_AUTH_MODE = original;
  }
});
test("synthetic receipt binds canonical tenant/customer/scope/mapping/terms and all four evidence classes", () => {
  const commands = reviewedBusinessFixtureCommands(
    context,
    ids,
    "c".repeat(64),
  );
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0].values, [
    ids.declaration,
    context.org_id,
    context.actor_id,
  ]);
  assert.deepEqual(commands[1].values, [
    ids.review,
    context.org_id,
    ids.declaration,
    ids.policy,
    context.scope_id,
    context.customer_id,
    context.offer_key,
    1,
    context.terms_document_id,
    1,
    context.terms_sha256,
    context.mapping_tax_sha256,
    "c".repeat(64),
  ]);
  assert.match(commands[0].text, /'NZ','Auckland'/);
  assert.match(commands[1].text, /'CLEARED','CLEARED','CLEARED','CLEARED'/);
  assert.doesNotMatch(
    commands.map((c) => c.text).join("\n"),
    /disable trigger|set_config|update |delete |alter |entitlement|business_eligibility_review_id/i,
  );
});
test("malformed or caller-asserted eligibility cannot create fixture commands", () => {
  for (const patch of [
    { state: "ELIGIBLE" },
    { mapping_revision: 0 },
    { scope_id: "forged" },
    { terms_sha256: "placeholder" },
    { customer_id: "" },
    { actor_id: undefined },
  ])
    assert.throws(() =>
      reviewedBusinessFixtureCommands(
        { ...context, ...patch },
        ids,
        "c".repeat(64),
      ),
    );
});
