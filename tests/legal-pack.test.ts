import assert from "node:assert/strict";
import test from "node:test";
import pack from "../apps/marketing/content/legal-draft-v1.json";

test("customer document draft is complete, business-only and fail-closed", () => {
  assert.equal(pack.status, "OWNER_REVIEW_REQUIRED");
  assert.equal(pack.version, 1);
  assert.equal(pack.entity.legalName, "KXRA GROUP LTD");
  assert.equal(pack.entity.companyNumber, "17435511");
  assert.match(pack.entity.registeredOffice, /66 Paul Street/);
  assert.deepEqual(
    pack.documents.map((document) => document.documentType).sort(),
    ["COOKIE", "CUSTOM_PROJECT", "DATA_PROCESSING", "PRIVACY", "TERMS"],
  );
  for (const document of pack.documents) {
    assert.ok(document.sections.length >= 5, document.documentType);
    assert.ok(document.sections.every((section) => section.paragraphs.length));
  }
  const terms = pack.documents.find(
    (document) => document.documentType === "TERMS",
  );
  const termsText = JSON.stringify(terms);
  assert.match(termsText, /business purposes/i);
  assert.match(termsText, /£29 per organisation per month/);
  assert.match(termsText, /seven-calendar-day grace period/);
  assert.match(termsText, /non-refundable/);
  assert.equal(pack.commercialPolicy.failedPaymentGraceDays, 7);
  assert.equal(pack.commercialPolicy.readOnlyRecoveryDays, 30);
  assert.equal(pack.commercialPolicy.customerDataDeletionDays, 90);
  assert.equal(pack.commercialPolicy.backupExpiryDays, 35);
});
