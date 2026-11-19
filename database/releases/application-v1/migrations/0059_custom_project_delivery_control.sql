begin;

alter table kxra.project_proposals
 add column delivery_project_id uuid references kxra.projects(id);
create unique index project_proposals_delivery_project_unique
 on kxra.project_proposals(delivery_project_id) where delivery_project_id is not null;

alter table kxra.custom_project_change_requests
 add column proposal_id uuid references kxra.project_proposals(id),
 add column client_request_id uuid,
 add column change_hash text check(change_hash is null or change_hash~'^[a-f0-9]{64}$');
create unique index custom_project_change_request_idempotency
 on kxra.custom_project_change_requests(org_id,client_request_id)
 where client_request_id is not null;

create table kxra.custom_project_change_approvals(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 change_request_id uuid not null references kxra.custom_project_change_requests(id),
 change_hash text not null check(change_hash~'^[a-f0-9]{64}$'),
 party text not null check(party in ('KXRA','CUSTOMER')),
 decision text not null check(decision in ('ACCEPTED','REJECTED')),
 decided_by uuid not null references kxra.account_identities(account_id),
 membership_id uuid not null references kxra.organisation_memberships(id),
 note text not null default '' check(length(note)<=5000),
 decided_at timestamptz not null default now(),
 unique(change_request_id,party)
);

create table kxra.custom_project_milestone_deliveries(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 project_id uuid not null references kxra.projects(id),
 proposal_id uuid not null references kxra.project_proposals(id),
 milestone_key text not null check(length(trim(milestone_key)) between 1 and 120),
 version integer not null check(version>0),
 state text not null default 'SUBMITTED' check(state in ('SUBMITTED','ACCEPTED','SUPERSEDED')),
 summary text not null check(length(trim(summary)) between 1 and 30000),
 evidence jsonb not null check(jsonb_typeof(evidence)='array' and jsonb_array_length(evidence)>0),
 delivery_hash text not null check(delivery_hash~'^[a-f0-9]{64}$'),
 submitted_by uuid not null references kxra.account_identities(account_id),
 submitted_at timestamptz not null default now(),
 unique(project_id,proposal_id,milestone_key,version),
 unique(id,delivery_hash)
);

alter table kxra.custom_project_milestone_acceptances
 add column delivery_id uuid references kxra.custom_project_milestone_deliveries(id),
 add column delivery_hash text check(delivery_hash is null or delivery_hash~'^[a-f0-9]{64}$');
create unique index custom_project_milestone_delivery_acceptance
 on kxra.custom_project_milestone_acceptances(delivery_id)
 where delivery_id is not null;

create table kxra.custom_project_invoices(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 project_id uuid not null references kxra.projects(id),
 proposal_id uuid not null references kxra.project_proposals(id),
 client_request_id uuid not null,
 invoice_reference text not null check(length(trim(invoice_reference)) between 1 and 120),
 subtotal_minor bigint not null check(subtotal_minor>=0),
 tax_minor bigint not null check(tax_minor>=0),
 total_minor bigint not null check(total_minor=subtotal_minor+tax_minor),
 currency text not null check(currency~'^[A-Z]{3}$'),
 state text not null default 'ISSUED' check(state in ('ISSUED','VOID')),
 due_at timestamptz not null,
 evidence_reference text not null check(length(trim(evidence_reference)) between 3 and 500),
 issued_by uuid not null references kxra.account_identities(account_id),
 issued_at timestamptz not null default now(),
 unique(org_id,client_request_id),
 unique(org_id,invoice_reference)
);

alter table kxra.custom_project_change_approvals enable row level security;
alter table kxra.custom_project_milestone_deliveries enable row level security;
alter table kxra.custom_project_invoices enable row level security;
grant select on kxra.custom_project_change_approvals,
 kxra.custom_project_milestone_deliveries,kxra.custom_project_invoices
to authenticated,anon;

create policy custom_change_approvals_read on kxra.custom_project_change_approvals
 for select using(exists(
  select 1 from kxra.custom_project_change_requests change
  where change.id=change_request_id and kxra_private.can_project(change.project_id)
 ));
create policy custom_milestone_deliveries_read on kxra.custom_project_milestone_deliveries
 for select using(kxra_private.can_project(project_id));
create policy custom_invoices_read on kxra.custom_project_invoices
 for select using(kxra_private.can_project(project_id));

create function kxra.submit_custom_project_change(
 project uuid,scope_change text,price_change bigint,currency_code text,request uuid
) returns table(id uuid,version integer,change_hash text)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();proposal kxra.project_proposals;
 next_version integer;hash_value text;created kxra.custom_project_change_requests;
begin
 select * into proposal from kxra.project_proposals p
 where p.delivery_project_id=project and p.org_id=o and p.state='PROJECT_CREATED';
 if proposal.id is null or request is null
  or not (kxra_private.has_capability(o,'custom_project.manage')
   or kxra_private.can_project(project,true))
  or length(trim(scope_change)) not between 1 and 30000
  or price_change is null or currency_code<>proposal.currency
 then raise exception 'Custom project change unavailable';end if;
 select * into created from kxra.custom_project_change_requests c
  where c.org_id=o and c.client_request_id=request;
 if created.id is not null then
  if created.project_id<>project or created.scope_delta<>trim(scope_change)
   or created.price_delta_minor<>price_change or created.currency<>currency_code
  then raise exception 'Custom project change conflict';end if;
  return query select created.id,created.version,created.change_hash;return;
 end if;
 if exists(select 1 from kxra.custom_project_change_requests c
  where c.project_id=project and c.state='SUBMITTED')
 then raise exception 'Custom project change unavailable';end if;
 select coalesce(max(c.version),0)+1 into next_version
 from kxra.custom_project_change_requests c where c.project_id=project;
 hash_value=encode(sha256(convert_to(jsonb_build_object(
  'project_id',project,'proposal_id',proposal.id,'version',next_version,
  'scope_delta',trim(scope_change),'price_delta_minor',price_change,
  'currency',currency_code,'client_request_id',request
 )::text,'UTF8')),'hex');
 insert into kxra.custom_project_change_requests(
  org_id,project_id,proposal_id,client_request_id,version,requested_by,
  scope_delta,price_delta_minor,currency,state,change_hash
 ) values(o,project,proposal.id,request,next_version,auth.uid(),trim(scope_change),
  price_change,currency_code,'SUBMITTED',hash_value) returning * into created;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'custom_project.change_submitted',created.id,
  jsonb_build_object('project_id',project,'version',next_version,'change_hash',hash_value));
 return query select created.id,created.version,created.change_hash;
end $$;

create function kxra.decide_custom_project_change(
 change_request uuid,expected_hash text,decision_value text,decision_note text
) returns text language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();change kxra.custom_project_change_requests;
 membership kxra.organisation_memberships;acceptance kxra.project_proposal_acceptances;
 party_value text;result_state text;created uuid;
begin
 select * into change from kxra.custom_project_change_requests c
 where c.id=change_request for update;
 select * into membership from kxra.organisation_memberships m
 where m.org_id=o and m.account_id=auth.uid() and m.state='ACTIVE'
  and m.starts_at<=now() and (m.expires_at is null or m.expires_at>now())
  and m.revoked_at is null;
 select * into acceptance from kxra.project_proposal_acceptances a
 where a.proposal_id=change.proposal_id;
 if change.id is null or change.org_id<>o or change.state<>'SUBMITTED'
  or change.change_hash<>expected_hash or decision_value not in ('ACCEPTED','REJECTED')
  or length(coalesce(decision_note,''))>5000 or membership.id is null
 then raise exception 'Custom project change decision unavailable';end if;
 if membership.relationship_type='INTERNAL'
  and kxra_private.has_capability(o,'custom_project.manage') then party_value='KXRA';
 elsif membership.relationship_type='CUSTOMER'
  and kxra_private.can_project(change.project_id)
  and (membership.security_role='ORG_ADMIN' or acceptance.accepted_by=auth.uid())
 then party_value='CUSTOMER';
 else raise exception 'Custom project change decision unavailable';end if;
 insert into kxra.custom_project_change_approvals(
  org_id,change_request_id,change_hash,party,decision,decided_by,membership_id,note
 ) values(o,change.id,change.change_hash,party_value,decision_value,auth.uid(),
  membership.id,coalesce(decision_note,'')) returning id into created;
 if decision_value='REJECTED' then result_state='REJECTED';
 elsif exists(select 1 from kxra.custom_project_change_approvals a
   where a.change_request_id=change.id and a.party<>'KXRA' and a.decision='ACCEPTED')
  and exists(select 1 from kxra.custom_project_change_approvals a
   where a.change_request_id=change.id and a.party='KXRA' and a.decision='ACCEPTED')
 then result_state='ACCEPTED';else result_state='SUBMITTED';end if;
 update kxra.custom_project_change_requests set state=result_state where id=change.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'custom_project.change_decided',created,
  jsonb_build_object('change_request_id',change.id,'party',party_value,
   'decision',decision_value,'state',result_state,'change_hash',change.change_hash));
 return result_state;
end $$;

create function kxra.submit_custom_project_milestone_delivery(
 project uuid,milestone text,delivery_summary text,evidence_items jsonb
) returns table(id uuid,version integer,delivery_hash text)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();proposal kxra.project_proposals;
 next_version integer;hash_value text;created kxra.custom_project_milestone_deliveries;
begin
 select * into proposal from kxra.project_proposals p
 where p.delivery_project_id=project and p.org_id=o and p.state='PROJECT_CREATED';
 if proposal.id is null or not kxra_private.has_capability(o,'custom_project.manage')
  or length(trim(milestone)) not between 1 and 120
  or not exists(select 1 from jsonb_array_elements(proposal.milestones) item
   where item->>'key'=milestone)
  or length(trim(delivery_summary)) not between 1 and 30000
  or jsonb_typeof(evidence_items)<>'array' or jsonb_array_length(evidence_items)<1
  or jsonb_array_length(evidence_items)>50 or length(evidence_items::text)>50000
  or exists(select 1 from kxra.custom_project_milestone_acceptances a
   where a.project_id=project and a.proposal_id=proposal.id and a.milestone_key=milestone)
 then raise exception 'Milestone delivery unavailable';end if;
 select coalesce(max(d.version),0)+1 into next_version
 from kxra.custom_project_milestone_deliveries d
 where d.project_id=project and d.proposal_id=proposal.id and d.milestone_key=milestone;
 update kxra.custom_project_milestone_deliveries set state='SUPERSEDED'
 where project_id=project and proposal_id=proposal.id and milestone_key=milestone
  and state='SUBMITTED';
 hash_value=encode(sha256(convert_to(jsonb_build_object(
  'project_id',project,'proposal_id',proposal.id,'milestone_key',milestone,
  'version',next_version,'summary',trim(delivery_summary),'evidence',evidence_items
 )::text,'UTF8')),'hex');
 insert into kxra.custom_project_milestone_deliveries(
  org_id,project_id,proposal_id,milestone_key,version,summary,evidence,
  delivery_hash,submitted_by
 ) values(o,project,proposal.id,milestone,next_version,trim(delivery_summary),
  evidence_items,hash_value,auth.uid()) returning * into created;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'custom_project.milestone_delivered',created.id,
  jsonb_build_object('project_id',project,'milestone_key',milestone,
   'version',next_version,'delivery_hash',hash_value));
 return query select created.id,created.version,created.delivery_hash;
end $$;

create function kxra.accept_custom_project_milestone(
 delivery uuid,expected_hash text
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.custom_project_milestone_deliveries;
 membership kxra.organisation_memberships;acceptance kxra.project_proposal_acceptances;
 created uuid;latest integer;
begin
 select * into value from kxra.custom_project_milestone_deliveries d
 where d.id=delivery for update;
 select max(d.version) into latest from kxra.custom_project_milestone_deliveries d
 where d.project_id=value.project_id and d.proposal_id=value.proposal_id
  and d.milestone_key=value.milestone_key;
 select * into membership from kxra.organisation_memberships m
 where m.org_id=o and m.account_id=auth.uid() and m.state='ACTIVE'
  and m.starts_at<=now() and (m.expires_at is null or m.expires_at>now())
  and m.revoked_at is null;
 select * into acceptance from kxra.project_proposal_acceptances a
 where a.proposal_id=value.proposal_id;
 if value.id is null or value.org_id<>o or value.state<>'SUBMITTED'
  or value.delivery_hash<>expected_hash or value.version<>latest
  or not kxra_private.can_project(value.project_id)
  or membership.relationship_type<>'CUSTOMER'
  or (membership.security_role<>'ORG_ADMIN' and acceptance.accepted_by<>auth.uid())
 then raise exception 'Milestone acceptance unavailable';end if;
 insert into kxra.custom_project_milestone_acceptances(
  org_id,project_id,proposal_id,milestone_key,accepted_by,evidence,
  delivery_id,delivery_hash
 ) values(o,value.project_id,value.proposal_id,value.milestone_key,auth.uid(),
  jsonb_build_object('delivery_id',value.id,'delivery_hash',value.delivery_hash,
   'delivery_version',value.version),value.id,value.delivery_hash)
 returning id into created;
 update kxra.custom_project_milestone_deliveries set state='ACCEPTED' where id=value.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'custom_project.milestone_accepted',created,
  jsonb_build_object('delivery_id',value.id,'delivery_hash',value.delivery_hash));
 return created;
end $$;

create function kxra.issue_custom_project_invoice(
 project uuid,request uuid,reference text,subtotal bigint,tax bigint,
 currency_code text,due timestamptz,evidence text
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();proposal kxra.project_proposals;created uuid;
 inserted boolean=false;
begin
 select * into proposal from kxra.project_proposals p
 where p.delivery_project_id=project and p.org_id=o and p.state='PROJECT_CREATED';
 if proposal.id is null or not kxra_private.has_capability(o,'custom_project.manage')
  or request is null or length(trim(reference)) not between 1 and 120
  or subtotal is null or subtotal<0 or tax is null or tax<0
  or currency_code<>proposal.currency or due<=now()
  or length(trim(evidence)) not between 3 and 500
 then raise exception 'Custom project invoice unavailable';end if;
 insert into kxra.custom_project_invoices(
  org_id,project_id,proposal_id,client_request_id,invoice_reference,
  subtotal_minor,tax_minor,total_minor,currency,due_at,evidence_reference,issued_by
 ) values(o,project,proposal.id,request,trim(reference),subtotal,tax,subtotal+tax,
  currency_code,due,trim(evidence),auth.uid())
 on conflict(org_id,client_request_id) do nothing returning id into created;
 inserted=created is not null;
 if created is null then
  select i.id into created from kxra.custom_project_invoices i
  where i.org_id=o and i.client_request_id=request and i.project_id=project
   and i.invoice_reference=trim(reference) and i.subtotal_minor=subtotal
   and i.tax_minor=tax and i.currency=currency_code and i.due_at=due
   and i.evidence_reference=trim(evidence);
 end if;
 if created is null then raise exception 'Custom project invoice conflict';end if;
 if inserted then
  insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
  values(o,auth.uid(),'custom_project.invoice_issued',created,
   jsonb_build_object('project_id',project,'proposal_id',proposal.id,
    'invoice_reference',trim(reference),'total_minor',subtotal+tax,
    'currency',currency_code));
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
  or value.id is null or value.org_id<>o or value.delivery_project_id is not null
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
 update kxra.project_proposals set state='PROJECT_CREATED',delivery_project_id=created
 where id=value.id;
 update kxra.custom_project_requests set state='PROJECT_CREATED',updated_at=now()
 where id=value.request_id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'custom_project.project_created',created,
  jsonb_build_object('proposal_id',value.id,'proposal_hash',value.proposal_hash));
 return created;
end $$;

revoke all on function kxra.submit_custom_project_change(uuid,text,bigint,text,uuid),
 kxra.decide_custom_project_change(uuid,text,text,text),
 kxra.submit_custom_project_milestone_delivery(uuid,text,text,jsonb),
 kxra.accept_custom_project_milestone(uuid,text),
 kxra.issue_custom_project_invoice(uuid,uuid,text,bigint,bigint,text,timestamptz,text)
from public,anon;
grant execute on function kxra.submit_custom_project_change(uuid,text,bigint,text,uuid),
 kxra.decide_custom_project_change(uuid,text,text,text),
 kxra.submit_custom_project_milestone_delivery(uuid,text,text,jsonb),
 kxra.accept_custom_project_milestone(uuid,text),
 kxra.issue_custom_project_invoice(uuid,uuid,text,bigint,bigint,text,timestamptz,text)
to authenticated;

commit;
