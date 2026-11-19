import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { localModeConfiguration } from "../../packages/authz/local-guard";
import { checkoutTermsPresentationDigest } from "../../packages/integrations/live-checkout-consent";
import { readPrivateFixtureJson } from "./private-fixture-json";

type Query = (
  text: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, any>[] }>;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const contextSchema = z
  .object({
    org_id: z.uuid(),
    actor_id: z.uuid(),
    scope_id: z.uuid(),
    customer_id: z.string().regex(/^cus_[A-Za-z0-9]{6,}$/),
    offer_key: z.enum(["KXRA_STARTER_V1", "KXRA_TEAM_V1", "KXRA_BUSINESS_V1"]),
    mapping_revision: z.number().int().positive(),
    terms_document_id: z.uuid(),
    terms_document_version: z.number().int().positive(),
    terms_sha256: hash,
    mapping_tax_sha256: hash,
  })
  .strict();
export type SyntheticBusinessContext = z.infer<typeof contextSchema>;

/** Pure construction is exported for offline assertions. Only the guarded
 * executor below may apply these commands, on a generated private fixture.
 * Evidence is explicitly synthetic, never a customer/legal/tax approval.
 */
export function reviewedBusinessFixtureCommands(
  input: unknown,
  ids: { declaration: string; policy: string; review: string },
  evidenceHash: string,
) {
  const c = contextSchema.parse(input);
  for (const id of Object.values(ids)) z.uuid().parse(id);
  hash.parse(evidenceHash);
  return [
    {
      text: "insert into kxra_private.business_declarations(id,org_id,actor_id,legal_name,country,region,provider,business_use,authorised,provider_costs,declaration_version) values($1,$2,$3,'SYNTHETIC BILLING FIXTURE ONLY','NZ','Auckland','Synthetic customer provider',true,true,true,'business-byok-v1')",
      values: [ids.declaration, c.org_id, c.actor_id],
    },
    {
      text: "insert into kxra_private.business_eligibility_reviews(id,org_id,declaration_id,policy_id,scope_id,customer_id,offer_key,mapping_revision,terms_document_id,terms_document_version,terms_sha256,mapping_tax_sha256,legal_status,payment_status,provider_status,tax_status,legal_evidence_sha256,payment_evidence_sha256,provider_evidence_sha256,tax_evidence_sha256,expires_at,reviewer_reference) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'CLEARED','CLEARED','CLEARED','CLEARED',$13,$13,$13,$13,now()+interval '1 hour','SYNTHETIC_BILLING_FIXTURE_NOT_APPROVAL')",
      values: [
        ids.review,
        c.org_id,
        ids.declaration,
        ids.policy,
        c.scope_id,
        c.customer_id,
        c.offer_key,
        c.mapping_revision,
        c.terms_document_id,
        c.terms_document_version,
        c.terms_sha256,
        c.mapping_tax_sha256,
        evidenceHash,
      ],
    },
  ] as const;
}

/** Requires admission migration installed and the exact canonical mapping plus
 * approved synthetic legal document/paid policy already present. Missing facts
 * fail; this helper never disables a trigger, invents a default approval,
 * rewrites current evidence, or changes billing activation/claims/entitlements.
 * Call in the test's existing admin setup transaction BEFORE CHECKOUT INSERT.
 */
export async function seedReviewedBusinessFixture(
  query: Query,
  input: { org_id: string; actor_id: string },
) {
  await requirePrivateAdmissionFixture(query);
  z.object({ org_id: z.uuid(), actor_id: z.uuid() }).strict().parse(input);
  const canonical = (
    await query(
      `select b.org_id,$2::uuid actor_id,b.scope_id,b.customer_id,b.offer_key,b.mapping_revision,
    q.terms_document_id,q.terms_document_version,q.terms_review_sha256 terms_sha256,q.tax_review_sha256 mapping_tax_sha256
    from kxra_private.live_billing_bindings b
    join kxra_private.live_billing_mappings m on m.scope_id=b.scope_id and m.offer_key=b.offer_key and m.revision=b.mapping_revision and m.enabled
    join kxra_private.live_paid_policies q on q.scope_id=b.scope_id and q.offer_key=b.offer_key and q.mapping_revision=b.mapping_revision and q.enabled
      and q.terms_review_sha256=m.terms_review_sha256 and q.tax_review_sha256=m.tax_review_sha256
    join kxra.legal_documents d on d.id=q.terms_document_id and d.version=q.terms_document_version
      and d.content_sha256=q.terms_review_sha256 and d.document_type='TERMS' and d.audience in ('CUSTOMER','ALL')
      and d.status='APPROVED' and d.effective_at<=now() and d.owner_approval_reference is not null and d.owner_approved_at is not null
    where b.org_id=$1 and exists(select 1 from kxra.organisation_memberships u where u.org_id=b.org_id and u.account_id=$2 and u.state='ACTIVE')`,
      [input.org_id, input.actor_id],
    )
  ).rows;
  assert.equal(
    canonical.length,
    1,
    "Seed exact approved synthetic terms/paid policy first; never repair absent/mismatched authority",
  );
  const context = contextSchema.parse(canonical[0]);
  const policyVersion = `SYNTHETIC_BILLING_${context.scope_id}`;
  const evidenceHash = crypto
    .createHash("sha256")
    .update(policyVersion)
    .digest("hex");
  // Reuse ONE existing synthetic policy so seeding another tenant does not
  // supersede the first tenant's review. Never enable/repair an old policy.
  let policy = (
    await query(
      "select id,version,owner_review_reference from kxra_private.business_eligibility_policies where enabled order by sequence desc limit 1",
    )
  ).rows[0];
  if (policy) {
    assert.equal(policy.version, policyVersion);
    assert.equal(
      policy.owner_review_reference,
      "SYNTHETIC_BILLING_FIXTURE_NOT_APPROVAL",
    );
  } else {
    const id = crypto.randomUUID();
    await query(
      "insert into kxra_private.business_eligibility_policies(id,version,evidence_sha256,owner_review_reference,effective_at,expires_at,enabled) values($1,$2,$3,'SYNTHETIC_BILLING_FIXTURE_NOT_APPROVAL',now(),now()+interval '1 day',true)",
      [id, policyVersion, evidenceHash],
    );
    policy = { id };
  }
  const ids = {
    policy: policy.id,
    declaration: crypto.randomUUID(),
    review: crypto.randomUUID(),
  };
  for (const command of reviewedBusinessFixtureCommands(
    context,
    ids,
    evidenceHash,
  ))
    await query(command.text, [...command.values]);
  const current = (
    await query(
      "select kxra_private.business_current_review($1,$2,$3,$4,$5,$6) id",
      [
        context.org_id,
        context.customer_id,
        context.scope_id,
        context.offer_key,
        context.mapping_revision,
        context.terms_sha256,
      ],
    )
  ).rows[0]?.id;
  assert.equal(
    current,
    ids.review,
    "The real admission fence must accept the exact seeded receipt",
  );
  return Object.freeze({
    declaration_id: ids.declaration,
    review_id: ids.review,
  });
}

async function requirePrivateAdmissionFixture(query: Query) {
  assert.ok(
    localModeConfiguration(process.env),
    "Explicit generated fixture required",
  );
  assert.ok(!process.env.VERCEL_ENV && !process.env.DATABASE_URL);
  const runtime = fs.realpathSync(process.env.KXRA_RUNTIME!);
  const cfg = readPrivateFixtureJson(path.join(runtime, "database.json"));
  assert.equal(cfg.host, path.join(runtime, "socket"));
  assert.equal(fs.realpathSync(cfg.host), cfg.host);
  for (const directory of [runtime, cfg.host]) {
    const metadata = fs.statSync(directory);
    assert.equal(metadata.uid, process.getuid!());
    assert.equal(metadata.mode & 0o077, 0);
  }
  assert.equal(cfg.user, "kxra_app");
  assert.ok(!cfg.password && !cfg.connectionString && !cfg.ssl);
  const identity = (
    await query(
      "select session_user,current_user,current_database() db,current_setting('listen_addresses') listen,current_setting('unix_socket_directories') socket",
    )
  ).rows[0];
  assert.equal(identity.session_user, os.userInfo().username);
  assert.equal(
    identity.current_user,
    identity.session_user,
    "Use the existing fixture admin, never SET ROLE elevation",
  );
  assert.equal(identity.db, cfg.database);
  assert.equal(identity.listen, "");
  assert.equal(fs.realpathSync(identity.socket), cfg.host);
  assert.ok(
    (
      await query(
        "select to_regclass('kxra_private.business_eligibility_reviews') installed",
      )
    ).rows[0].installed,
    "Install the reviewed admission proposal; do not bypass a missing migration",
  );
}

/** Explicit synthetic legal/policy setup for legacy ledger/concurrency fixtures.
 * Called once per mapping BEFORE evidence seeding. This does not repair existing
 * policy rows or approve a real document. Its bytes must match the fixture mapping.
 */
export async function seedSyntheticAdmissionTerms(
  query: Query,
  input: { org_id: string; content: string },
) {
  await requirePrivateAdmissionFixture(query);
  z.object({ org_id: z.uuid(), content: z.string().min(1).max(1000) })
    .strict()
    .parse(input);
  const m = (
    await query(
      `select m.* from kxra_private.live_billing_bindings b
    join kxra_private.live_billing_mappings m on m.scope_id=b.scope_id and m.offer_key=b.offer_key and m.revision=b.mapping_revision and m.enabled
    where b.org_id=$1`,
      [input.org_id],
    )
  ).rows[0];
  assert.ok(m, "Explicit canonical mapping required");
  const termsHash = crypto
    .createHash("sha256")
    .update(input.content)
    .digest("hex");
  assert.equal(
    m.terms_review_sha256,
    termsHash,
    "Synthetic terms bytes must match the mapping",
  );
  assert.equal(
    (
      await query(
        "select count(*)::integer n from kxra_private.live_paid_policies where scope_id=$1 and offer_key=$2 and mapping_revision=$3 and enabled",
        [m.scope_id, m.offer_key, m.revision],
      )
    ).rows[0].n,
    0,
    "Never replace an existing policy",
  );
  const document = crypto.randomUUID(),
    policy = crypto.randomUUID();
  const terms = {
    terms_review_sha256: termsHash,
    terms_url: `https://kxra.example/legal/terms?sha256=${termsHash}`,
    message: `SYNTHETIC ONLY [terms](https://kxra.example/legal/terms?sha256=${termsHash})`,
  };
  await query(
    "insert into kxra.legal_documents(id,org_id,document_type,audience,version,title,rendered_content,content_sha256,status,effective_at,immutable_object_key,owner_approval_reference,owner_approved_at) values($1,$2,'TERMS','CUSTOMER',1,'Synthetic admission terms',$3,$4,'APPROVED',now(),'synthetic/admission-terms','SYNTHETIC_NOT_REAL_APPROVAL',now())",
    [document, input.org_id, input.content, termsHash],
  );
  await query(
    `insert into kxra_private.live_paid_policies(id,revision,enabled,offer_key,mapping_revision,terms_document_id,terms_document_version,terms_url,message,activation_review_sha256,terms_review_sha256,presentation_sha256,tax_review_sha256,cancellation_review_sha256,grace_review_sha256,refund_review_sha256,trial_review_sha256,ai_review_sha256,access_rule,cancellation_mode,grace_seconds,refund_mode,trial_access,past_due_access,proof_ttl_seconds)
    values($1,1,true,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$7,$7,$7,$7,$7,'CURRENT_COLLECTED_ACTIVE_ONLY','END_OF_PAID_PERIOD',0,'DENY_ANY_REFUND',false,false,120)`,
    [
      policy,
      m.offer_key,
      m.revision,
      document,
      terms.terms_url,
      terms.message,
      m.activation_review_sha256,
      termsHash,
      checkoutTermsPresentationDigest(terms),
      m.tax_review_sha256,
    ],
  );
  return { document, policy };
}
