begin;

drop policy org_read on kxra.organisations;
create policy org_read on kxra.organisations for select using(
 kxra_private.has_active_membership(id)
 and (kxra_private.requested_org() is null or id=kxra_private.requested_org())
);

drop policy organisation_memberships_read on kxra.organisation_memberships;
create policy organisation_memberships_read on kxra.organisation_memberships for select using(
 (
  account_id=auth.uid()
  and (kxra_private.requested_org() is null or org_id=kxra_private.requested_org())
 ) or kxra_private.is_owner(org_id)
);

create or replace function kxra.present_required_legal_documents(agent_digest text,network_digest text)
returns table(
 presentation_id uuid,requirement_id uuid,document_id uuid,document_version integer,
 document_sha256 text,title text,rendered_content text,acceptance_wording text,
 acceptance_wording_version integer,acceptance_wording_sha256 text,presented_at timestamptz
)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare membership kxra.organisation_memberships;requirement record;
begin
 if (agent_digest is not null and agent_digest!~'^[a-f0-9]{64}$')
  or (network_digest is not null and network_digest!~'^[a-f0-9]{64}$')
 then raise exception 'Legal presentation unavailable';end if;
 select * into membership from kxra.organisation_memberships m
 where m.account_id=auth.uid() and m.org_id=kxra_private.requested_org()
  and m.state='ACTIVE' and (m.expires_at is null or m.expires_at>now())
  and m.revoked_at is null;
 if not found or not kxra_private.has_active_membership(membership.org_id)
 then raise exception 'Legal presentation unavailable';end if;
 for requirement in
  select r.*,d.title,d.rendered_content
  from kxra.legal_document_requirements r
  join kxra.legal_documents d on d.org_id=r.org_id and d.id=r.document_id
   and d.version=r.document_version and d.content_sha256=r.document_sha256
  where r.org_id=membership.org_id and r.state='ACTIVE' and r.mandatory
   and d.status='APPROVED'
   and (r.membership_id is null or r.membership_id=membership.id)
   and (r.relationship_type is null or r.relationship_type=membership.relationship_type)
   and not exists(
    select 1 from kxra.legal_acceptances a
    where a.account_id=membership.account_id and a.membership_id=membership.id
     and a.requirement_id=r.id and a.document_id=r.document_id
     and a.document_version=r.document_version
     and a.document_sha256=r.document_sha256 and a.response='ACCEPTED'
   )
  order by r.effective_at,r.id
 loop
  insert into kxra.legal_presentations(
   org_id,account_id,membership_id,requirement_id,document_id,document_version,
   document_sha256,acceptance_wording,acceptance_wording_version,
   acceptance_wording_sha256,immutable_snapshot,user_agent_digest,ip_digest
  ) values(
   membership.org_id,membership.account_id,membership.id,requirement.id,
   requirement.document_id,requirement.document_version,requirement.document_sha256,
   requirement.acceptance_wording,requirement.acceptance_wording_version,
   requirement.acceptance_wording_sha256,
   jsonb_build_object(
    'title',requirement.title,'rendered_content',requirement.rendered_content,
    'document_sha256',requirement.document_sha256,
    'acceptance_wording',requirement.acceptance_wording,
    'acceptance_wording_sha256',requirement.acceptance_wording_sha256
   ),agent_digest,network_digest
  ) on conflict do nothing;
 end loop;
 return query
 select p.id,p.requirement_id,p.document_id,p.document_version,p.document_sha256,
  p.immutable_snapshot->>'title',p.immutable_snapshot->>'rendered_content',
  p.acceptance_wording,p.acceptance_wording_version,p.acceptance_wording_sha256,p.presented_at
 from kxra.legal_presentations p
 join kxra.legal_document_requirements r on r.id=p.requirement_id and r.state='ACTIVE'
 where p.account_id=membership.account_id and p.membership_id=membership.id
  and not exists(select 1 from kxra.legal_acceptances a where a.presentation_id=p.id)
 order by p.presented_at,p.id;
end $$;

commit;
