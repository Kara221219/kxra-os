begin;

drop policy custom_requests_read on kxra.custom_project_requests;
create policy custom_requests_read on kxra.custom_project_requests for select using(
 kxra_private.is_platform_owner()
 or kxra_private.is_owner(org_id)
 or (kxra_private.private_access_allowed(org_id) and submitted_by=auth.uid())
);

drop policy custom_triage_read on kxra.custom_project_triage;
create policy custom_triage_read on kxra.custom_project_triage for select using(
 kxra_private.is_platform_owner()
 or kxra_private.has_capability(org_id,'custom_project.manage')
);

drop policy proposals_read on kxra.project_proposals;
create policy proposals_read on kxra.project_proposals for select using(
 kxra_private.is_platform_owner()
 or kxra_private.is_owner(org_id)
 or exists(
  select 1 from kxra.custom_project_requests request
  where request.id=project_proposals.request_id
   and request.org_id=project_proposals.org_id
   and request.submitted_by=auth.uid()
 )
);

drop policy proposal_acceptances_read on kxra.project_proposal_acceptances;
create policy proposal_acceptances_read on kxra.project_proposal_acceptances for select using(
 kxra_private.is_platform_owner()
 or kxra_private.is_owner(org_id)
 or exists(
  select 1 from kxra.project_proposals proposal
  join kxra.custom_project_requests request on request.id=proposal.request_id
   and request.org_id=proposal.org_id
  where proposal.id=project_proposal_acceptances.proposal_id
   and proposal.org_id=project_proposal_acceptances.org_id
   and request.submitted_by=auth.uid()
 )
);

drop policy custom_payments_read on kxra.custom_project_payments;
create policy custom_payments_read on kxra.custom_project_payments for select using(
 kxra_private.is_platform_owner()
 or kxra_private.is_owner(org_id)
 or exists(
  select 1 from kxra.project_proposals proposal
  join kxra.custom_project_requests request on request.id=proposal.request_id
   and request.org_id=proposal.org_id
  where proposal.id=custom_project_payments.proposal_id
   and proposal.org_id=custom_project_payments.org_id
   and request.submitted_by=auth.uid()
 )
);

create function kxra.custom_project_management_status()
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(
  kxra_private.has_capability(kxra_private.member_org(),'custom_project.manage'),
  false
 )
$$;

create function kxra.triage_custom_project_request(
 request uuid,assessment_text text,evidence_items jsonb,next_state text
) returns table(id uuid,version integer)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.custom_project_requests;
 next_version integer;created kxra.custom_project_triage;
begin
 select * into value from kxra.custom_project_requests r where r.id=request for update;
 if value.id is null or value.org_id<>o
  or not kxra_private.has_capability(o,'custom_project.manage')
  or value.state in ('ACCEPTED','REJECTED','WITHDRAWN','PROJECT_CREATED')
  or length(trim(assessment_text)) not between 1 and 20000
  or jsonb_typeof(evidence_items)<>'array'
  or jsonb_array_length(evidence_items)>50
  or length(evidence_items::text)>50000
  or next_state not in ('TRIAGE','CLARIFICATION','PROPOSAL_PENDING','REJECTED')
 then raise exception 'Custom project triage unavailable';end if;
 select coalesce(max(t.version),0)+1 into next_version
 from kxra.custom_project_triage t where t.request_id=request;
 insert into kxra.custom_project_triage(
  org_id,request_id,version,assessment,evidence,created_by
 ) values(o,request,next_version,trim(assessment_text),evidence_items,auth.uid())
 returning * into created;
 update kxra.custom_project_requests
 set state=next_state,updated_at=now() where custom_project_requests.id=request;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'custom_project.triaged',created.id,
  jsonb_build_object('request_id',request,'version',created.version,'state',next_state));
 return query select created.id,created.version;
end $$;

create function kxra.record_custom_project_payment(
 proposal uuid,amount bigint,currency_code text,payment_state text,
 evidence text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.project_proposals;
 created uuid;received bigint;refunded bigint;inserted boolean=false;
begin
 select * into value from kxra.project_proposals p where p.id=proposal for update;
 select coalesce(sum(p.amount_minor) filter(where p.state='RECEIVED'),0),
  coalesce(sum(p.amount_minor) filter(where p.state='REFUNDED'),0)
 into received,refunded from kxra.custom_project_payments p
 where p.proposal_id=proposal;
 if value.id is null or value.org_id<>o
  or not kxra_private.has_capability(o,'custom_project.manage')
  or value.state not in ('ACCEPTED','PROJECT_CREATED')
  or amount is null or amount<=0 or amount>value.price_minor
  or currency_code<>value.currency
  or payment_state not in ('PENDING','RECEIVED','REFUNDED','FAILED')
  or length(trim(evidence)) not between 3 and 500
  or payment_state='REFUNDED' and amount>received-refunded
 then raise exception 'Custom project payment unavailable';end if;
 insert into kxra.custom_project_payments(
  org_id,proposal_id,amount_minor,currency,state,evidence_reference,recorded_by
 ) values(o,proposal,amount,currency_code,payment_state,trim(evidence),auth.uid())
 on conflict(proposal_id,evidence_reference) do nothing returning id into created;
 inserted=created is not null;
 if created is null then
  select p.id into created from kxra.custom_project_payments p
  where p.proposal_id=proposal and p.evidence_reference=trim(evidence)
   and p.amount_minor=amount and p.currency=currency_code and p.state=payment_state;
 end if;
 if created is null then raise exception 'Custom project payment conflict';end if;
 if inserted then
  insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
  values(o,auth.uid(),'custom_project.payment_recorded',created,
   jsonb_build_object('proposal_id',proposal,'amount_minor',amount,
    'currency',currency_code,'state',payment_state));
 end if;
 return created;
end $$;

create or replace function kxra.activate_custom_project(
 proposal uuid,project_code text,project_name text
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.project_proposals;
 accepted kxra.project_proposal_acceptances;created uuid;paid bigint;
begin
 select * into value from kxra.project_proposals p where p.id=proposal for update;
 select * into accepted from kxra.project_proposal_acceptances a where a.proposal_id=value.id;
 select coalesce(sum(amount_minor) filter(where state='RECEIVED'),0)
  - coalesce(sum(amount_minor) filter(where state='REFUNDED'),0) into paid
 from kxra.custom_project_payments where proposal_id=value.id;
 if not kxra_private.has_capability(o,'custom_project.manage')
  or value.id is null or value.org_id<>o
  or value.state<>'ACCEPTED' or accepted.id is null or value.valid_until<=accepted.accepted_at
  or value.payment_gate='DEPOSIT' and paid<value.deposit_minor
  or value.payment_gate='PAID_IN_FULL' and paid<value.price_minor
  or project_code!~'^[A-Z][A-Z0-9-]{2,39}$'
  or length(trim(project_name)) not between 1 and 240
 then raise exception 'Custom project activation unavailable';end if;
 insert into kxra.projects(
  org_id,code,name,stage,status,next_action,lifecycle_stage,disposition,
  live_execution_enabled,product_creation_enabled
 ) values(
  o,project_code,trim(project_name),'CUSTOM INTAKE','active',
  'Confirm project kickoff and first accepted milestone.','VALIDATION','ACTIVE',false,false
 ) returning id into created;
 insert into kxra.project_memberships(org_id,project_id,user_id,role,active)
 values(o,created,accepted.accepted_by,'contributor',true)
 on conflict(project_id,user_id) do update set role='contributor',active=true,expires_at=null;
 update kxra.project_proposals set state='PROJECT_CREATED' where id=value.id;
 update kxra.custom_project_requests set state='PROJECT_CREATED',updated_at=now()
 where id=value.request_id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'custom_project.project_created',created,
  jsonb_build_object('proposal_id',value.id,'proposal_hash',value.proposal_hash));
 return created;
end $$;

revoke all on function kxra.custom_project_management_status(),
 kxra.triage_custom_project_request(uuid,text,jsonb,text),
 kxra.record_custom_project_payment(uuid,bigint,text,text,text)
from public,anon;
-- This closed boolean helper is evaluated by the triage RLS policy. As with
-- the other policy helpers, callers receive no rows or capability metadata.
grant execute on function kxra_private.has_capability(uuid,text)
to authenticated,anon;
grant execute on function kxra.custom_project_management_status(),
 kxra.triage_custom_project_request(uuid,text,jsonb,text),
 kxra.record_custom_project_payment(uuid,bigint,text,text,text)
to authenticated;

commit;
