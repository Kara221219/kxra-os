begin;

-- Keep presented documents and evidence immutable without referencing document
-- columns while the trigger is running for a presentation or acceptance row.
create or replace function kxra_private.guard_legal_evidence() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_table_name='legal_documents' then
  if exists(
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
 elsif tg_table_name in ('legal_presentations','legal_acceptances') then
  raise exception 'Legal evidence is immutable';
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;

commit;
