// Source shape checks only. They are not PostgreSQL authorization evidence.
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const proposal = fs.readFileSync(
  "database/proposals/customer-directory-metadata-v1.sql",
  "utf8",
);
const sql = proposal.replace(/--[^\n]*/g, "");
const authority = sql.slice(
  sql.indexOf(
    "create function kxra_owner_metadata.customer_directory_authorized_v1",
  ),
  sql.indexOf("create function kxra_owner_metadata.customer_directory_page_v1"),
);
const page = sql.slice(
  sql.indexOf("create function kxra_owner_metadata.customer_directory_page_v1"),
  sql.indexOf("revoke all on all functions"),
);
test("proposal is dormant, additive, owner-only and absent from release cohort", () => {
  assert.match(proposal, /UNPROMOTED REVIEW PROPOSAL/);
  assert.equal((sql.match(/create function /g) ?? []).length, 2);
  assert.equal((sql.match(/create schema /g) ?? []).length, 1);
  assert.doesNotMatch(
    sql,
    /\b(?:grant|create role|alter|drop|insert into|update kxra|delete from)\b/i,
  );
  assert.match(sql, /pg_get_userbyid\(relowner\)/);
  assert.match(sql, /pg_get_userbyid\(proowner\)/);
  assert.match(sql, /select rolname from pg_roles where rolname<>current_user/);
  assert.match(sql, /revoke all on schema kxra_owner_metadata from %I/);
  assert.match(
    sql,
    /revoke all on all functions in schema kxra_owner_metadata from %I/,
  );
  assert.match(
    sql,
    /aclexplode\(coalesce\(p.proacl,acldefault\('f',p.proowner\)\)\)/,
  );
  const manifest = fs.readFileSync(
    "database/releases/application-v1/manifest.json",
    "utf8",
  );
  assert.doesNotMatch(
    manifest,
    /customer-directory|customer_directory|owner_metadata/,
  );
});
test("exact owner authority follows a shared writer fence and fresh snapshot", () => {
  assert.match(
    authority,
    /language plpgsql volatile security definer set search_path=''/,
  );
  assert.match(authority, /session_user<>'kxra_app'/);
  assert.match(
    authority,
    /current_setting\('role',true\) is distinct from 'authenticated'/,
  );
  assert.match(
    authority,
    /current_setting\('transaction_isolation'\)<>'read committed'/,
  );
  const lock = authority.indexOf("perform pg_advisory_xact_lock_shared");
  assert.ok(lock < authority.indexOf("claims=auth.jwt()"));
  assert.ok(lock < authority.indexOf("from kxra.account_identities"));
  for (const requirement of [
    "a.auth_provider='SUPABASE'",
    "a.state='ACTIVE'",
    "a.email_verified_at is not null",
    "a.session_version=expected_account_epoch",
    "m.id=expected_membership_id",
    "m.version=expected_membership_version",
    "m.org_id=selected_org",
    "m.security_role='KXRA_OWNER'",
    "m.relationship_type='INTERNAL'",
    "m.starts_at<=clock_timestamp()",
    "m.expires_at>clock_timestamp()",
    "m.revoked_at is null",
    "o.organisation_kind='KXRA'",
    "o.state='ACTIVE'",
    "legal_requirements_satisfied(selected_org)",
    "custom_app_original_session_current()",
    "interval '15 minutes'",
    "interval '1 minute'",
  ])
    assert.ok(authority.includes(requirement), requirement);
  assert.doesNotMatch(authority, /\b(?:is_owner|mfa_owner)\(/);
  assert.doesNotMatch(
    authority + page,
    /for (?:update|share)|pg_advisory_xact_lock\(|kxra-paired-policy/,
  );
});
test("direct reader checks authority twice and emits only explicit metadata", () => {
  assert.equal(
    (
      page.match(
        /if not kxra_owner_metadata.customer_directory_authorized_v1\(/g,
      ) ?? []
    ).length,
    2,
  );
  assert.match(page, /then raise insufficient_privilege/);
  assert.match(
    page,
    /request-array\['version','after_organisation_id','organisation_state','limit'\]/,
  );
  assert.match(page, /row_limit not between 2 and 51/);
  assert.match(page, /o.organisation_kind='CUSTOMER'/);
  assert.match(page, /o.id>after_id/);
  assert.match(page, /o.state=filter_state/);
  assert.match(page, /order by o.id asc limit row_limit/);
  assert.match(page, /jsonb_agg\(jsonb_build_object\(/);
  assert.match(page, /'sampled_at',to_char\(sampled_at at time zone 'UTC'/);
  assert.match(
    page,
    /'items',rows,'has_more',jsonb_array_length\(rows\)=row_limit/,
  );
  assert.match(page, /octet_length\(o.name\)<=960/);
  assert.match(
    page,
    /extract\(year from page.updated_at at time zone 'UTC'\) between 1 and 9999/,
  );
  assert.match(page, /ascii\(character_value\)>65535/);
  assert.doesNotMatch(
    page,
    /select \*|to_jsonb\(|created_at|count\(|kxra\.(?:team_|account_|profiles|members|billing_|files|records)/,
  );
});
test("all direct authorities retain production statement fences", () => {
  const custom = fs.readFileSync(
    "database/releases/application-v1/migrations/0124_custom_apps.sql",
    "utf8",
  );
  for (const table of [
    "account_identities",
    "profiles",
    "organisations",
    "organisation_memberships",
    "legal_documents",
    "legal_document_requirements",
    "legal_acceptances",
  ])
    assert.ok(
      custom.includes(
        `create trigger a00_custom_app_authority before insert or update or delete on kxra.${table} for each statement execute function kxra_private.custom_app_authority_fence()`,
      ),
    );
  const original = fs.readFileSync(
    "database/releases/application-v1/migrations/0125_custom_app_session_attestation.sql",
    "utf8",
  );
  assert.match(
    original,
    /create trigger a00_custom_app_session_authority before insert or update or delete on auth.sessions for each statement/,
  );
  assert.match(
    original,
    /create trigger immutable_session_binding before update or delete/,
  );
  const paired = fs.readFileSync(
    "database/releases/application-v1/migrations/0126_paired_setup_session.sql",
    "utf8",
  );
  assert.match(paired, /create trigger b00_paired_setup_session_authority/);
});
