import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import {
  applyLegalDocuments,
  inspectLegalDocuments,
  legalApproval,
  legalDocuments,
  legalDocumentFindings,
  legalRequirements,
  legalStagingProjectRef,
  validateLegalDocumentOperator,
} from "../scripts/staging-legal-documents-core.mjs";
import { runtimeFile } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const database = new pg.Pool({ ...config, user: os.userInfo().username });

after(() => database.end());

test("approved legal source is hash bound and scopes only customer Terms and Privacy", () => {
  assert.equal(
    legalApproval.packSha256,
    "8277d2cbad017feaf4fea238d9eecedd1e7cfff0aaab6fa80fca5a239a8783a9",
  );
  assert.equal(legalApproval.vatStatus, "NOT_VAT_REGISTERED");
  assert.deepEqual(
    legalDocuments.map((document: any) => document.documentType),
    ["TERMS", "PRIVACY", "COOKIE", "DATA_PROCESSING", "CUSTOM_PROJECT"],
  );
  assert.deepEqual(
    legalRequirements.map((requirement: any) => requirement.relationshipType),
    ["CUSTOMER", "CUSTOMER"],
  );
});

test("legal operator requires the authorized project, exact hash and apply confirmation", () => {
  const environment = {
    KXRA_ENVIRONMENT: "staging",
    KXRA_STAGING_PROJECT_REF: legalStagingProjectRef,
    KXRA_STAGING_MIGRATOR_DATABASE_URL: `postgresql://postgres:secret@db.${legalStagingProjectRef}.supabase.co:5432/postgres?sslmode=verify-full`,
  };
  assert.equal(validateLegalDocumentOperator(environment, "plan").ok, true);
  assert.equal(validateLegalDocumentOperator(environment, "apply").ok, false);
  assert.equal(
    validateLegalDocumentOperator(
      {
        ...environment,
        KXRA_STAGING_LEGAL_CONFIRMATION: `LEGAL-DOCUMENTS:${legalStagingProjectRef}:${legalApproval.packSha256}:codex/phase-2-completion`,
      },
      "apply",
    ).ok,
    true,
  );
  assert.equal(
    validateLegalDocumentOperator(
      { ...environment, KXRA_STAGING_PROJECT_REF: "a".repeat(20) },
      "plan",
    ).ok,
    false,
  );
});

test("approved legal documents apply idempotently and reject content drift", async () => {
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from kxra.legal_document_requirements where id=any($1::uuid[])",
      [legalRequirements.map((requirement: any) => requirement.id)],
    );
    await client.query(
      "delete from kxra.legal_documents where id=any($1::uuid[])",
      [legalDocuments.map((document: any) => document.id)],
    );
    await applyLegalDocuments(client);
    await applyLegalDocuments(client);
    assert.deepEqual(
      legalDocumentFindings(await inspectLegalDocuments(client)),
      [],
    );
    await client.query(
      "update kxra.legal_documents set title='Changed title' where id=$1",
      [legalDocuments[0].id],
    );
    await assert.rejects(
      () => applyLegalDocuments(client),
      /LEGAL_DOCUMENT_TAKEOVER_REJECTED/,
    );
  } finally {
    await client.query("rollback");
    client.release();
  }
});
