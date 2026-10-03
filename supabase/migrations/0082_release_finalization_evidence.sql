begin;

create table kxra.release_finalizations(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 release_manifest_id uuid not null unique references kxra.release_manifests(id),
 base_candidate_sha256 text not null check(base_candidate_sha256~'^[a-f0-9]{64}$'),
 recovery_evidence_sha256 text not null check(recovery_evidence_sha256~'^[a-f0-9]{64}$'),
 recovery_evidence jsonb not null check(jsonb_typeof(recovery_evidence)='object'),
 accessibility_attestation_id uuid not null references kxra.release_review_attestations(id),
 security_attestation_id uuid not null references kxra.release_review_attestations(id),
 operator_reference text not null check(length(trim(operator_reference)) between 1 and 240),
 finalized_at timestamptz not null default now()
);

alter table kxra.release_finalizations enable row level security;

create policy release_finalizations_read on kxra.release_finalizations
 for select using(kxra_private.is_owner(org_id));

revoke all on table kxra.release_finalizations from public,anon;
grant select on table kxra.release_finalizations to authenticated,anon;

commit;
