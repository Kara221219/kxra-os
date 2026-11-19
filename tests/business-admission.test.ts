import assert from "node:assert/strict";
import test from "node:test";
import {
  businessDeclaration,
  BUSINESS_DECLARATION_VERSION,
  businessCountries,
} from "../packages/admission/business";
const valid = {
  legal_name: "Synthetic NZ Business",
  country: " nz ",
  region: "Auckland",
  provider: "Customer provider",
  business_use: true,
  authorised: true,
  provider_costs: true,
  declaration_version: BUSINESS_DECLARATION_VERSION,
};
test("normalizes worldwide business location without a UK restriction", () => {
  assert.equal(businessDeclaration.parse(valid).country, "NZ");
  assert.equal(businessCountries.size, 249);
  for (const country of businessCountries)
    assert.ok(businessDeclaration.safeParse({ ...valid, country }).success);
});
test("rejects missing authority, nonbusiness use and unaccepted provider costs", () => {
  for (const field of ["business_use", "authorised", "provider_costs"]) {
    for (const value of [false, undefined, "true", 1])
      assert.ok(
        !businessDeclaration.safeParse({ ...valid, [field]: value }).success,
      );
  }
});
test("rejects forged eligibility, mismatched version, invalid location and sensitive payload fields", () => {
  for (const change of [
    { country: "ZZ" },
    { country: "UK" },
    { country: "" },
    { region: "" },
    { legal_name: "bad\nname" },
    { declaration_version: "old" },
    { state: "ELIGIBLE" },
    { api_key: "secret" },
    { org_id: "forged" },
    { provider: "https://unreviewed.invalid" },
  ])
    assert.ok(!businessDeclaration.safeParse({ ...valid, ...change }).success);
});
