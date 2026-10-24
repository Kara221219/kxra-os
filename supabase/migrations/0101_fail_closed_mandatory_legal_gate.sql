begin;

-- Retiring a document does not retire its ACTIVE mandatory requirement.
-- Enumerate every applicable requirement first, then require an exact approved
-- document and current acceptance. CREATE OR REPLACE preserves existing ACLs.
create or replace function kxra_private.legal_requirements_satisfied(o uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(
  select 1 from kxra.organisation_memberships m
  join kxra.legal_document_requirements r on r.org_id=m.org_id
   and r.state='ACTIVE' and r.mandatory
   and (r.membership_id is null or r.membership_id=m.id)
   and (r.relationship_type is null or r.relationship_type=m.relationship_type)
  where m.account_id=auth.uid() and m.org_id=o and m.state='ACTIVE'
   and not exists(
    select 1 from kxra.legal_documents d
    join kxra.legal_acceptances a on a.org_id=r.org_id
     and a.account_id=m.account_id and a.membership_id=m.id
     and a.requirement_id=r.id and a.document_id=r.document_id
     and a.document_version=r.document_version
     and a.document_sha256=r.document_sha256 and a.response='ACCEPTED'
     and a.acceptance_wording=r.acceptance_wording
     and a.acceptance_wording_version=r.acceptance_wording_version
     and a.acceptance_wording_sha256=r.acceptance_wording_sha256
    where d.org_id=r.org_id and d.id=r.document_id
     and d.version=r.document_version and d.content_sha256=r.document_sha256
     and d.status='APPROVED'
   )
 )
$$;

commit;
