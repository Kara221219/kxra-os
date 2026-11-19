begin;

create table kxra.release_review_attestations(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 release_manifest_id uuid not null references kxra.release_manifests(id),
 review_type text not null check(review_type in ('ACCESSIBILITY','SECURITY')),
 reviewer_id uuid not null references kxra.members(id),
 reviewer_name text not null check(length(trim(reviewer_name)) between 1 and 240),
 candidate_sha256 text not null check(candidate_sha256~'^[a-f0-9]{64}$'),
 evidence_sha256 text not null check(evidence_sha256~'^[a-f0-9]{64}$'),
 checklist jsonb not null check(jsonb_typeof(checklist)='object'),
 notes text not null check(length(trim(notes)) between 20 and 4000),
 status text not null default 'PASS' check(status='PASS'),
 attested_at timestamptz not null default now(),
 unique(release_manifest_id,review_type)
);

alter table kxra.release_review_attestations enable row level security;

create policy release_review_attestations_read on kxra.release_review_attestations
 for select using(kxra_private.is_owner(org_id));

create function kxra.release_candidate_digest(manifest uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare value kxra.release_manifests;
begin
 select * into value from kxra.release_manifests where id=manifest;
 if not found or not kxra_private.is_owner(value.org_id)
 then raise exception 'Release manifest unavailable';end if;
 return encode(sha256(convert_to(jsonb_build_object(
  'release_name',value.release_name,
  'release_version',value.release_version,
  'legal_document_refs',value.legal_document_refs,
  'commercial_configuration',value.commercial_configuration-array['accessibility_review','security_review'],
  'support_channels',value.support_channels,
  'legal_owner',value.legal_owner,
  'commercial_owner',value.commercial_owner,
  'reviewed_at',value.reviewed_at
 )::text,'UTF8')),'hex');
end $$;

create function kxra.attest_release_review(
 manifest uuid,kind text,expected_candidate_sha256 text,
 expected_evidence_sha256 text,review_checklist jsonb,review_notes text
) returns kxra.release_review_attestations
language plpgsql security definer set search_path='' as $$
declare
 value kxra.release_manifests;
 member kxra.members;
 result kxra.release_review_attestations;
 actual_candidate_sha256 text;
 expected_keys text[];
 supplied_keys text[];
begin
 select * into value from kxra.release_manifests where id=manifest for update;
 if not found or value.state<>'BLOCKED' or not kxra_private.mfa_owner(value.org_id)
 then raise exception 'Release review unavailable';end if;
 if kind not in ('ACCESSIBILITY','SECURITY')
  or expected_candidate_sha256!~'^[a-f0-9]{64}$'
  or expected_evidence_sha256!~'^[a-f0-9]{64}$'
  or jsonb_typeof(review_checklist) is distinct from 'object'
  or length(trim(coalesce(review_notes,''))) not between 20 and 4000
 then raise exception 'Release review unavailable';end if;

 select * into member from kxra.members
 where id=auth.uid() and org_id=value.org_id and active;
 if not found then raise exception 'Release review unavailable';end if;

 actual_candidate_sha256=kxra.release_candidate_digest(manifest);
 if actual_candidate_sha256 is distinct from expected_candidate_sha256
 then raise exception 'Release candidate changed';end if;

 expected_keys=case kind
  when 'ACCESSIBILITY' then array[
   'customer_journeys','keyboard_navigation','focus_visibility','screen_reader_labels',
   'zoom_and_reflow','reduced_motion','form_errors','contrast_and_readability'
  ]
  else array[
   'owner_access','partner_isolation','database_rls','ask_retrieval','whatsapp_permissions',
   'ai_run_logging','approvals','cross_project_files_search','public_private_separation','threat_models'
  ] end;
 select coalesce(array_agg(key order by key),'{}'::text[]) into supplied_keys
 from jsonb_object_keys(review_checklist) key;
 if supplied_keys is distinct from (
   select array_agg(key order by key) from unnest(expected_keys) key
  ) or exists(select 1 from jsonb_each(review_checklist) item
   where jsonb_typeof(item.value)<>'boolean' or item.value<>'true'::jsonb)
 then raise exception 'Every review check must pass';end if;

 insert into kxra.release_review_attestations(
  org_id,release_manifest_id,review_type,reviewer_id,reviewer_name,
  candidate_sha256,evidence_sha256,checklist,notes
 ) values(
  value.org_id,value.id,kind,member.id,member.display_name,
  actual_candidate_sha256,expected_evidence_sha256,review_checklist,trim(review_notes)
 ) returning * into result;

 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(value.org_id,auth.uid(),'release.review.attested',result.id,
  jsonb_build_object('manifest_id',value.id,'review_type',kind,
   'candidate_sha256',actual_candidate_sha256,'evidence_sha256',expected_evidence_sha256));
 return result;
exception when unique_violation then
 raise exception 'Release review already recorded';
end $$;

revoke all on table kxra.release_review_attestations from public,anon;
grant select on table kxra.release_review_attestations to authenticated,anon;
revoke all on function kxra.release_candidate_digest(uuid) from public,anon;
grant execute on function kxra.release_candidate_digest(uuid) to authenticated;
revoke all on function kxra.attest_release_review(uuid,text,text,text,jsonb,text) from public,anon;
grant execute on function kxra.attest_release_review(uuid,text,text,text,jsonb,text) to authenticated;

commit;
