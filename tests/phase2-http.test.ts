import { after, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import pg from "pg";
import { runtimeFile, testOrigin } from "./support/runtime";

const config = JSON.parse(
  fs.readFileSync(runtimeFile("database.json"), "utf8"),
);
const admin = new pg.Pool({ ...config, user: os.userInfo().username });
const base = testOrigin;
const kxraOrg = "10000000-0000-4000-8000-000000000001";
const ownerId = "20000000-0000-4000-8000-000000000001";
const partnerId = "20000000-0000-4000-8000-000000000002";
const p2 = "30000000-0000-4000-8000-000000000002";

after(() => admin.end());

type CookieJar = Map<string, string>;

function rememberCookies(jar: CookieJar, response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const values =
    headers.getSetCookie?.() ||
    (response.headers.get("set-cookie")
      ? [response.headers.get("set-cookie") as string]
      : []);
  for (const header of values) {
    const pair = header.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator < 1) continue;
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (!value || /max-age=0/i.test(header)) jar.delete(name);
    else jar.set(name, value);
  }
}

async function request(jar: CookieJar, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (jar.size)
    headers.set(
      "cookie",
      [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
    );
  if ((init.method || "GET") !== "GET" && !headers.has("origin"))
    headers.set("origin", base);
  const response = await fetch(base + path, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  rememberCookies(jar, response);
  return response;
}

async function jsonRequest(
  jar: CookieJar,
  path: string,
  value: unknown,
  method = "POST",
) {
  return request(jar, path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

async function login(fixture: string) {
  const jar: CookieJar = new Map();
  const response = await request(jar, "/api/auth", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ fixture }),
  });
  assert.equal(response.status, 303);
  assert.ok(jar.has("kxra_local_session"));
  return jar;
}

function digest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("AT-31 HTTP tenant selection ignores forged headers/bodies and rechecks revocation", async (t) => {
  const organisationId = crypto.randomUUID();
  const projectId = crypto.randomUUID();
  const slug = `http-tenant-${crypto.randomUUID().slice(0, 8)}`;
  let managerMembership: string | undefined;
  t.after(async () => {
    if (managerMembership) {
      await admin.query(
        `update kxra.organisation_memberships
         set state='REVOKED',revoked_at=coalesce(revoked_at,now()),version=version+1
         where id=$1 and state='ACTIVE'`,
        [managerMembership],
      );
    }
  });
  await admin.query(
    "insert into kxra.organisations(id,name,slug) values($1,'HTTP Customer',$2)",
    [organisationId, slug],
  );
  await admin.query(
    `insert into kxra.organisation_memberships(
      org_id,account_id,security_role,relationship_type,state,display_name,grant_source
     ) values($1,$2,'ORG_ADMIN','CUSTOMER','ACTIVE','HTTP dual member','AT_HTTP')`,
    [organisationId, partnerId],
  );
  await admin.query(
    `insert into kxra.projects(id,org_id,code,name,stage,status,next_action)
     values($1,$2,'HTTP-CUSTOM','HTTP customer project','customer','active','test tenant HTTP boundary')`,
    [projectId, organisationId],
  );

  const jar = await login("partner");
  const selectionRequired = await request(jar, "/api/projects");
  assert.equal(selectionRequired.status, 428);
  assert.equal(
    (await selectionRequired.json()).code,
    "TENANT_SELECTION_REQUIRED",
  );

  const available = await request(jar, "/api/context");
  assert.equal(available.status, 200);
  const organisations = (await available.json()).organisations;
  assert.deepEqual(
    organisations.map((item: { org_id: string }) => item.org_id).sort(),
    [kxraOrg, organisationId].sort(),
  );
  const forged = await jsonRequest(jar, "/api/context", {
    organisation_id: crypto.randomUUID(),
  });
  assert.equal(forged.status, 403);
  assert.equal((await forged.json()).code, "TENANT_ACCESS_DENIED");

  const selected = await jsonRequest(jar, "/api/context", {
    organisation_id: organisationId,
  });
  assert.equal(selected.status, 200, await selected.clone().text());
  assert.equal((await selected.json()).organisation.security_role, "ORG_ADMIN");
  const customerProjects = await request(jar, "/api/projects", {
    headers: { "x-kxra-organisation": kxraOrg },
  });
  assert.equal(customerProjects.status, 200);
  assert.deepEqual(
    (await customerProjects.json()).map(
      (project: { id: string }) => project.id,
    ),
    [projectId],
  );
  const forgedRequest = await jsonRequest(jar, "/api/custom-projects", {
    problem: "Tenant-bound customer problem",
    desired_outcome: "A separately priced result",
    constraints: "Synthetic HTTP fixture",
    reuse_consent: false,
    request_id: crypto.randomUUID(),
    org_id: kxraOrg,
  });
  assert.equal(forgedRequest.status, 400);
  const submitted = await jsonRequest(jar, "/api/custom-projects", {
    problem: "Tenant-bound customer problem",
    desired_outcome: "A separately priced result",
    constraints: "Synthetic HTTP fixture",
    reuse_consent: false,
    request_id: crypto.randomUUID(),
  });
  assert.equal(submitted.status, 201, await submitted.clone().text());
  const requestId = (await submitted.json()).id;
  assert.equal((await request(jar, "/api/custom-projects")).status, 200);
  assert.deepEqual(
    await (await request(jar, "/api/custom-projects/authority")).json(),
    { can_manage: false },
  );
  assert.equal(
    (
      await jsonRequest(jar, `/api/custom-projects/${requestId}/triage`, {
        assessment: "Customer cannot author internal triage",
        evidence: [],
        next_state: "PROPOSAL_PENDING",
      })
    ).status,
    409,
  );

  managerMembership = (
    await admin.query<{ id: string }>(
      `insert into kxra.organisation_memberships(
        org_id,account_id,security_role,relationship_type,state,display_name,grant_source
       ) values($1,$2,'ORG_ADMIN','INTERNAL','ACTIVE','HTTP KXRA manager','AT_HTTP')
       returning id`,
      [organisationId, ownerId],
    )
  ).rows[0].id;
  await admin.query(
    `insert into kxra.capability_grants(
      org_id,membership_id,capability,resource_type,state,issued_by,reason
     ) values($1,$2,'custom_project.manage','ORGANISATION','ACTIVE',$3,
      'Synthetic HTTP custom-project authority')`,
    [organisationId, managerMembership, ownerId],
  );
  const legalDocumentId = crypto.randomUUID();
  const legalContent = "Synthetic HTTP custom-project terms; not legal advice.";
  const legalHash = digest(legalContent);
  await admin.query(
    `insert into kxra.legal_documents(
      id,org_id,document_type,audience,jurisdiction,version,title,rendered_content,
      content_sha256,immutable_object_key,status,effective_at,
      owner_approval_reference,owner_approved_at
     ) values($1,$2,'CUSTOM_PROJECT','ALL','GB',1,'Synthetic custom terms',$3,$4,$5,
      'APPROVED',now(),'SYNTHETIC_TEST_OWNER_APPROVAL',now())`,
    [
      legalDocumentId,
      organisationId,
      legalContent,
      legalHash,
      `synthetic://legal/${legalDocumentId}/1`,
    ],
  );
  const ownerJar = await login("owner");
  assert.equal(
    (
      await jsonRequest(ownerJar, "/api/context", {
        organisation_id: organisationId,
      })
    ).status,
    200,
  );
  assert.deepEqual(
    await (await request(ownerJar, "/api/custom-projects/authority")).json(),
    { can_manage: true },
  );
  const triaged = await jsonRequest(
    ownerJar,
    `/api/custom-projects/${requestId}/triage`,
    {
      assessment: "Synthetic HTTP request is ready for a bounded proposal.",
      evidence: [{ reference: "AT-34-HTTP" }],
      next_state: "PROPOSAL_PENDING",
    },
  );
  assert.equal(triaged.status, 201, await triaged.clone().text());
  const proposed = await jsonRequest(
    ownerJar,
    `/api/custom-projects/${requestId}/proposals`,
    {
      scope: "Deliver one bounded synthetic customer outcome",
      exclusions: "No deployment or external send",
      assumptions: "Customer supplies approved inputs",
      milestones: [{ key: "m1", title: "Synthetic delivery" }],
      price_minor: 12000,
      currency: "GBP",
      tax_treatment: "Synthetic VAT-exclusive fixture",
      payment_gate: "DEPOSIT",
      deposit_minor: 3000,
      legal_document_id: legalDocumentId,
      legal_document_version: 1,
      legal_document_sha256: legalHash,
      valid_until: new Date(Date.now() + 86_400_000).toISOString(),
    },
  );
  assert.equal(proposed.status, 201, await proposed.clone().text());
  const proposal = await proposed.json();
  const accepted = await jsonRequest(
    jar,
    `/api/custom-projects/proposals/${proposal.id}/accept`,
    {
      proposal_hash: proposal.proposal_hash,
      request_id: crypto.randomUUID(),
    },
  );
  assert.equal(accepted.status, 200, await accepted.clone().text());
  assert.equal(
    (
      await jsonRequest(
        jar,
        `/api/custom-projects/proposals/${proposal.id}/payments`,
        {
          amount_minor: 3000,
          currency: "GBP",
          state: "RECEIVED",
          evidence_reference: "forged-customer-payment",
        },
      )
    ).status,
    409,
  );
  const paid = await jsonRequest(
    ownerJar,
    `/api/custom-projects/proposals/${proposal.id}/payments`,
    {
      amount_minor: 3000,
      currency: "GBP",
      state: "RECEIVED",
      evidence_reference: "synthetic-http-deposit",
    },
  );
  assert.equal(paid.status, 201, await paid.clone().text());
  const activated = await jsonRequest(
    ownerJar,
    `/api/custom-projects/proposals/${proposal.id}/activate`,
    {
      project_code: `HTTP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      project_name: "HTTP synthetic delivery project",
    },
  );
  assert.equal(activated.status, 201, await activated.clone().text());
  const deliveryProjectId = (await activated.json()).id;
  const changed = await jsonRequest(
    jar,
    `/api/custom-projects/projects/${deliveryProjectId}/changes`,
    {
      scope_delta: "Add an HTTP-tested customer handover",
      price_delta_minor: 2000,
      currency: "GBP",
      request_id: crypto.randomUUID(),
    },
  );
  assert.equal(changed.status, 201, await changed.clone().text());
  const change = await changed.json();
  const kxraChangeApproval = await jsonRequest(
    ownerJar,
    `/api/custom-projects/changes/${change.id}/decide`,
    {
      change_hash: change.change_hash,
      decision: "ACCEPTED",
      note: "KXRA accepts the exact HTTP change",
    },
  );
  assert.equal(kxraChangeApproval.status, 200);
  assert.equal((await kxraChangeApproval.json()).state, "SUBMITTED");
  const customerChangeApproval = await jsonRequest(
    jar,
    `/api/custom-projects/changes/${change.id}/decide`,
    {
      change_hash: change.change_hash,
      decision: "ACCEPTED",
      note: "Customer accepts the exact HTTP change",
    },
  );
  assert.equal(customerChangeApproval.status, 200);
  assert.equal((await customerChangeApproval.json()).state, "ACCEPTED");
  const delivered = await jsonRequest(
    ownerJar,
    `/api/custom-projects/projects/${deliveryProjectId}/deliveries`,
    {
      milestone_key: "m1",
      summary: "Synthetic HTTP milestone evidence is ready for review.",
      evidence: [{ reference: "synthetic://http/m1" }],
    },
  );
  assert.equal(delivered.status, 201, await delivered.clone().text());
  const delivery = await delivered.json();
  const milestoneAccepted = await jsonRequest(
    jar,
    `/api/custom-projects/deliveries/${delivery.id}/accept`,
    { delivery_hash: delivery.delivery_hash },
  );
  assert.equal(
    milestoneAccepted.status,
    200,
    await milestoneAccepted.clone().text(),
  );
  assert.equal(
    (
      await jsonRequest(
        jar,
        `/api/custom-projects/projects/${deliveryProjectId}/invoices`,
        {
          request_id: crypto.randomUUID(),
          invoice_reference: "INV-FORGED-CUSTOMER",
          subtotal_minor: 2000,
          tax_minor: 400,
          currency: "GBP",
          due_at: new Date(Date.now() + 86_400_000).toISOString(),
          evidence_reference: "forged-customer-invoice",
        },
      )
    ).status,
    409,
  );
  const invoiced = await jsonRequest(
    ownerJar,
    `/api/custom-projects/projects/${deliveryProjectId}/invoices`,
    {
      request_id: crypto.randomUUID(),
      invoice_reference: `HTTP-${crypto.randomUUID().slice(0, 8)}`,
      subtotal_minor: 2000,
      tax_minor: 400,
      currency: "GBP",
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
      evidence_reference: "synthetic-http-accounting-reference",
    },
  );
  assert.equal(invoiced.status, 201, await invoiced.clone().text());
  const invoiceId = (await invoiced.json()).id;
  const invoiceHash = (
    await admin.query<{ invoice_hash: string }>(
      "select invoice_hash from kxra.custom_project_invoices where id=$1",
      [invoiceId],
    )
  ).rows[0].invoice_hash;
  assert.equal(
    (
      await jsonRequest(
        jar,
        `/api/custom-projects/invoices/${invoiceId}/credit-notes`,
        {
          invoice_hash: invoiceHash,
          request_id: crypto.randomUUID(),
          credit_reference: "HTTP-CN-FORGED",
          subtotal_minor: 1000,
          tax_minor: 200,
          reason: "Forged customer credit",
          evidence_reference: "forged-http-credit",
        },
      )
    ).status,
    409,
  );
  const credited = await jsonRequest(
    ownerJar,
    `/api/custom-projects/invoices/${invoiceId}/credit-notes`,
    {
      invoice_hash: invoiceHash,
      request_id: crypto.randomUUID(),
      credit_reference: `HTTP-CN-${crypto.randomUUID().slice(0, 8)}`,
      subtotal_minor: 1000,
      tax_minor: 200,
      reason: "Agreed HTTP invoice adjustment",
      evidence_reference: "synthetic-http-credit-reference",
    },
  );
  assert.equal(credited.status, 201, await credited.clone().text());
  assert.equal((await credited.json()).invoice_state, "PARTIALLY_CREDITED");

  const voidable = await jsonRequest(
    ownerJar,
    `/api/custom-projects/projects/${deliveryProjectId}/invoices`,
    {
      request_id: crypto.randomUUID(),
      invoice_reference: `HTTP-VOID-${crypto.randomUUID().slice(0, 8)}`,
      subtotal_minor: 1000,
      tax_minor: 200,
      currency: "GBP",
      due_at: new Date(Date.now() + 86_400_000).toISOString(),
      evidence_reference: "synthetic-http-voidable-invoice",
    },
  );
  assert.equal(voidable.status, 201, await voidable.clone().text());
  const voidableId = (await voidable.json()).id;
  const voidableHash = (
    await admin.query<{ invoice_hash: string }>(
      "select invoice_hash from kxra.custom_project_invoices where id=$1",
      [voidableId],
    )
  ).rows[0].invoice_hash;
  const voided = await jsonRequest(
    ownerJar,
    `/api/custom-projects/invoices/${voidableId}/void`,
    {
      invoice_hash: voidableHash,
      request_id: crypto.randomUUID(),
      reason: "HTTP invoice issued in error",
      evidence_reference: "synthetic-http-void-reference",
    },
  );
  assert.equal(voided.status, 200, await voided.clone().text());

  await admin.query(
    `update kxra.organisation_memberships
     set state='REVOKED',revoked_at=now(),version=version+1
     where org_id=$1 and account_id=$2`,
    [organisationId, partnerId],
  );
  const revoked = await request(jar, "/api/projects");
  assert.equal(revoked.status, 403);
  assert.equal((await revoked.json()).code, "TENANT_ACCESS_DENIED");

  const reselected = await jsonRequest(jar, "/api/context", {
    organisation_id: kxraOrg,
  });
  assert.equal(reselected.status, 200);
  const kxraProjects = await request(jar, "/api/projects");
  assert.deepEqual(
    (await kxraProjects.json()).map((project: { id: string }) => project.id),
    [p2],
  );
  assert.deepEqual(
    await (await request(jar, "/api/custom-projects")).json(),
    [],
  );
  await admin.query(
    `update kxra.organisation_memberships
     set state='REVOKED',revoked_at=now(),version=version+1
     where id=$1`,
    [managerMembership],
  );
});

test("AT-32 HTTP first-private-access gate is typed and acceptance is exact", async () => {
  const membership = (
    await admin.query<{ id: string }>(
      "select id from kxra.organisation_memberships where org_id=$1 and account_id=$2",
      [kxraOrg, partnerId],
    )
  ).rows[0];
  const documentId = crypto.randomUUID();
  const documentVersion = crypto.randomInt(10_000, 2_000_000_000);
  const content = "Synthetic HTTP NDA. It is not production legal text.";
  const hash = digest(content);
  const wording = "I accept this exact synthetic HTTP NDA version.";
  const requirementId = crypto.randomUUID();
  await admin.query(
    `insert into kxra.legal_documents(
      id,org_id,document_type,audience,version,title,rendered_content,
      content_sha256,immutable_object_key,status,effective_at,
      owner_approval_reference,owner_approved_at
     ) values($1,$2,'NDA','PARTNER',$3,'Synthetic HTTP NDA',$4,$5,$6,
      'APPROVED',now(),'SYNTHETIC_TEST_OWNER_APPROVAL',now())`,
    [
      documentId,
      kxraOrg,
      documentVersion,
      content,
      hash,
      `synthetic://legal/${documentId}/${documentVersion}`,
    ],
  );
  await admin.query(
    `insert into kxra.legal_document_requirements(
      id,org_id,membership_id,relationship_type,document_id,document_version,
      document_sha256,mandatory,state,acceptance_wording,
      acceptance_wording_version,acceptance_wording_sha256,effective_at
     ) values($1,$2,$3,'PARTNER',$4,$5,$6,true,'ACTIVE',$7,1,$8,now())`,
    [
      requirementId,
      kxraOrg,
      membership.id,
      documentId,
      documentVersion,
      hash,
      wording,
      digest(wording),
    ],
  );
  const jar = await login("partner");
  for (const [path, init] of [
    ["/api/projects", undefined],
    ["/api/search?q=project", undefined],
    ["/api/files", undefined],
    [
      "/api/ask",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "private", project_id: p2 }),
      },
    ],
  ] as const) {
    const response = await request(jar, path, init);
    assert.equal(response.status, 428, path);
    assert.equal((await response.json()).code, "AGREEMENT_REQUIRED", path);
  }
  assert.equal((await request(jar, "/api/context")).status, 200);
  const presentationResponse = await request(jar, "/api/agreements");
  assert.equal(presentationResponse.status, 200);
  const presentationPayload = await presentationResponse.json();
  assert.equal(presentationPayload.documents.length, 1);
  const document = presentationPayload.documents[0];
  assert.equal(document.document_sha256, hash);
  assert.equal(document.rendered_content, content);
  assert.equal(document.acceptance_wording, wording);

  const accepted = await jsonRequest(jar, "/api/agreements", {
    presentation_id: document.presentation_id,
    response: "ACCEPTED",
    request_id: crypto.randomUUID(),
  });
  assert.equal(accepted.status, 200, await accepted.clone().text());
  assert.equal((await accepted.json()).gate.allowed, true);
  assert.equal((await request(jar, "/api/projects")).status, 200);
  const evidence = (
    await admin.query(
      `select document_version,document_sha256,response,immutable_audit
       from kxra.legal_acceptances where account_id=$1 and requirement_id=$2`,
      [partnerId, requirementId],
    )
  ).rows[0];
  assert.equal(evidence.document_version, documentVersion);
  assert.equal(evidence.document_sha256, hash);
  assert.equal(evidence.response, "ACCEPTED");
  assert.equal(evidence.immutable_audit.rendered_content, content);

  await admin.query(
    "update kxra.legal_document_requirements set state='RETIRED',retired_at=now() where id=$1",
    [requirementId],
  );
  await admin.query(
    "update kxra.legal_documents set status='RETIRED',retired_at=now() where id=$1 and version=$2",
    [documentId, documentVersion],
  );
});
