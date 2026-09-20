begin;

create function kxra_private.has_capability(o uuid,required_capability text)
returns boolean language sql stable security definer set search_path='' as $$
 select kxra_private.private_access_allowed(o) and exists(
  select 1 from kxra.organisation_memberships m
  join kxra.capability_grants g on g.membership_id=m.id and g.org_id=m.org_id
  where m.account_id=auth.uid() and m.org_id=o and m.state='ACTIVE'
   and g.capability=required_capability and g.state='ACTIVE'
   and g.starts_at<=now() and (g.expires_at is null or g.expires_at>now())
   and g.revoked_at is null
 )
$$;

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
   new.effective_at,new.legal_reviewer_reference,new.created_by,new.created_at
  ) is distinct from (
   old.id,old.org_id,old.document_type,old.audience,old.jurisdiction,old.version,
   old.title,old.rendered_content,old.content_sha256,old.immutable_object_key,
   old.effective_at,old.legal_reviewer_reference,old.created_by,old.created_at
  ) or old.status='RETIRED' or new.status not in (old.status,'RETIRED')
  then raise exception 'Presented legal document is immutable';end if;
 end if;
 if tg_table_name in ('legal_presentations','legal_acceptances')
 then raise exception 'Legal evidence is immutable';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;

create function kxra_private.guard_custom_project_authoring() returns trigger
language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then return new;end if;
 if tg_table_name='project_proposals' then
  if tg_op='INSERT' or (
   new.org_id,new.request_id,new.version,new.scope,new.exclusions,new.assumptions,
   new.milestones,new.price_minor,new.currency,new.tax_treatment,new.payment_gate,
   new.deposit_minor,new.legal_document_id,new.legal_document_version,
   new.legal_document_sha256,new.proposal_hash,new.valid_until,new.created_by,new.created_at
  ) is distinct from (
   old.org_id,old.request_id,old.version,old.scope,old.exclusions,old.assumptions,
   old.milestones,old.price_minor,old.currency,old.tax_treatment,old.payment_gate,
   old.deposit_minor,old.legal_document_id,old.legal_document_version,
   old.legal_document_sha256,old.proposal_hash,old.valid_until,old.created_by,old.created_at
  ) then
   if not kxra_private.has_capability(new.org_id,'custom_project.manage')
   then raise exception 'Custom project management capability required';end if;
  end if;
 elsif tg_table_name='projects' and new.stage='CUSTOM INTAKE' then
  if not kxra_private.has_capability(new.org_id,'custom_project.manage')
  then raise exception 'Custom project management capability required';end if;
 end if;
 return new;
end $$;

create trigger project_proposal_authoring before insert or update on kxra.project_proposals
for each row execute function kxra_private.guard_custom_project_authoring();
create trigger custom_project_creation before insert on kxra.projects
for each row execute function kxra_private.guard_custom_project_authoring();

drop policy legal_documents_read on kxra.legal_documents;
create policy legal_documents_read on kxra.legal_documents for select using(
 kxra_private.is_owner(org_id) or exists(
  select 1 from kxra.organisation_memberships m
  where m.account_id=auth.uid() and m.org_id=legal_documents.org_id
   and m.state='ACTIVE' and (
    exists(
     select 1 from kxra.legal_document_requirements r
     where r.org_id=legal_documents.org_id and r.document_id=legal_documents.id
      and r.document_version=legal_documents.version
      and r.document_sha256=legal_documents.content_sha256
      and r.state='ACTIVE' and r.mandatory
      and (r.membership_id is null or r.membership_id=m.id)
      and (r.relationship_type is null or r.relationship_type=m.relationship_type)
    ) or exists(
     select 1 from kxra.legal_acceptances a
     where a.account_id=m.account_id and a.membership_id=m.id
      and a.document_id=legal_documents.id and a.document_version=legal_documents.version
      and a.document_sha256=legal_documents.content_sha256
    )
   )
 )
);

drop policy legal_requirements_read on kxra.legal_document_requirements;
create policy legal_requirements_read on kxra.legal_document_requirements for select using(
 kxra_private.is_owner(org_id) or exists(
  select 1 from kxra.organisation_memberships m
  where m.account_id=auth.uid() and m.org_id=legal_document_requirements.org_id
   and m.state='ACTIVE'
   and (membership_id is null or membership_id=m.id)
   and (relationship_type is null or relationship_type=m.relationship_type)
 )
);

revoke all on function kxra_private.has_capability(uuid,text),
 kxra_private.guard_custom_project_authoring()
from public,authenticated,anon;

commit;
