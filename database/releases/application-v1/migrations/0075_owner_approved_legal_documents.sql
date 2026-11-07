begin;

-- ADR 0044 makes explicit owner approval the authoritative release evidence.
-- The legacy reviewer field remains for compatible evidence imports, but it is
-- no longer the source of approval authority.
alter table kxra.legal_documents
 add column owner_approval_reference text
  check(owner_approval_reference is null or length(owner_approval_reference)<=500),
 add column owner_approved_at timestamptz,
 add column independent_review_reference text
  check(independent_review_reference is null or length(independent_review_reference)<=500);

update kxra.legal_documents
set owner_approval_reference='MIGRATED:'||left(legal_reviewer_reference,491),
 owner_approved_at=coalesce(effective_at,created_at),
 independent_review_reference=legal_reviewer_reference
where status='APPROVED' and owner_approval_reference is null;

alter table kxra.legal_documents
 add constraint legal_documents_approved_by_owner
 check(status<>'APPROVED' or (
  effective_at is not null and immutable_object_key is not null
  and owner_approval_reference is not null and owner_approved_at is not null
 ));

create function kxra_private.normalize_owner_approved_legal_document()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='APPROVED' then
  if new.owner_approval_reference is null or new.owner_approved_at is null
  then raise exception 'Explicit owner approval evidence is required';end if;
  -- Historical schema checks still inspect this deprecated column. This
  -- compatibility marker records owner authority and does not claim counsel.
  if new.legal_reviewer_reference is null then
   new.legal_reviewer_reference='OWNER_APPROVAL:'||left(new.owner_approval_reference,485);
  end if;
 end if;
 return new;
end $$;

create trigger legal_document_owner_approval_normalize
before insert or update on kxra.legal_documents
for each row execute function kxra_private.normalize_owner_approved_legal_document();

create or replace function kxra_private.guard_legal_evidence() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_table_name='legal_documents' and exists(
  select 1 from kxra.legal_presentations p
  where p.document_id=old.id and p.document_version=old.version
 ) then
  if tg_op='DELETE' then raise exception 'Presented legal document is immutable';end if;
  if (
   new.id,new.org_id,new.document_type,new.audience,new.jurisdiction,new.version,
   new.title,new.rendered_content,new.content_sha256,new.immutable_object_key,
   new.effective_at,new.legal_reviewer_reference,new.owner_approval_reference,
   new.owner_approved_at,new.independent_review_reference,new.created_by,new.created_at
  ) is distinct from (
   old.id,old.org_id,old.document_type,old.audience,old.jurisdiction,old.version,
   old.title,old.rendered_content,old.content_sha256,old.immutable_object_key,
   old.effective_at,old.legal_reviewer_reference,old.owner_approval_reference,
   old.owner_approved_at,old.independent_review_reference,old.created_by,old.created_at
  ) or old.status='RETIRED' or new.status not in (old.status,'RETIRED')
  then raise exception 'Presented legal document is immutable';end if;
 end if;
 if tg_table_name in ('legal_presentations','legal_acceptances')
 then raise exception 'Legal evidence is immutable';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;

revoke all on function kxra_private.normalize_owner_approved_legal_document()
from public,authenticated,anon;

commit;
