begin;

alter table kxra.custom_project_invoices
 add column invoice_hash text;
update kxra.custom_project_invoices i set invoice_hash=encode(sha256(convert_to(
 jsonb_build_object(
  'project_id',i.project_id,'proposal_id',i.proposal_id,
  'invoice_reference',i.invoice_reference,'subtotal_minor',i.subtotal_minor,
  'tax_minor',i.tax_minor,'total_minor',i.total_minor,'currency',i.currency,
  'due_at',i.due_at,'evidence_reference',i.evidence_reference
 )::text,'UTF8')),'hex');
alter table kxra.custom_project_invoices
 alter column invoice_hash set not null,
 add constraint custom_project_invoices_hash_check
  check(invoice_hash~'^[a-f0-9]{64}$'),
 drop constraint custom_project_invoices_state_check,
 add constraint custom_project_invoices_state_check
  check(state in ('ISSUED','PARTIALLY_CREDITED','CREDITED','VOID'));

create table kxra.custom_project_invoice_voids(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 invoice_id uuid not null references kxra.custom_project_invoices(id),
 client_request_id uuid not null,
 invoice_hash text not null check(invoice_hash~'^[a-f0-9]{64}$'),
 reason text not null check(length(trim(reason)) between 3 and 5000),
 evidence_reference text not null check(length(trim(evidence_reference)) between 3 and 500),
 voided_by uuid not null references kxra.account_identities(account_id),
 voided_at timestamptz not null default now(),
 unique(invoice_id),
 unique(org_id,client_request_id)
);

create table kxra.custom_project_credit_notes(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 project_id uuid not null references kxra.projects(id),
 proposal_id uuid not null references kxra.project_proposals(id),
 invoice_id uuid not null references kxra.custom_project_invoices(id),
 client_request_id uuid not null,
 credit_reference text not null check(length(trim(credit_reference)) between 1 and 120),
 subtotal_minor bigint not null check(subtotal_minor>=0),
 tax_minor bigint not null check(tax_minor>=0),
 total_minor bigint not null check(total_minor=subtotal_minor+tax_minor and total_minor>0),
 currency text not null check(currency~'^[A-Z]{3}$'),
 reason text not null check(length(trim(reason)) between 3 and 5000),
 evidence_reference text not null check(length(trim(evidence_reference)) between 3 and 500),
 credit_hash text not null check(credit_hash~'^[a-f0-9]{64}$'),
 issued_by uuid not null references kxra.account_identities(account_id),
 issued_at timestamptz not null default now(),
 unique(org_id,client_request_id),
 unique(org_id,credit_reference)
);

alter table kxra.custom_project_invoice_voids enable row level security;
alter table kxra.custom_project_credit_notes enable row level security;
grant select on kxra.custom_project_invoice_voids,kxra.custom_project_credit_notes
to authenticated,anon;

create policy custom_invoice_voids_read on kxra.custom_project_invoice_voids
 for select using(exists(
  select 1 from kxra.custom_project_invoices invoice
  where invoice.id=invoice_id and kxra_private.can_project(invoice.project_id)
 ));
create policy custom_credit_notes_read on kxra.custom_project_credit_notes
 for select using(kxra_private.can_project(project_id));

create or replace function kxra.issue_custom_project_invoice(
 project uuid,request uuid,reference text,subtotal bigint,tax bigint,
 currency_code text,due timestamptz,evidence text
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();proposal kxra.project_proposals;created uuid;
 hash_value text;inserted boolean=false;
begin
 select * into proposal from kxra.project_proposals p
 where p.delivery_project_id=project and p.org_id=o and p.state='PROJECT_CREATED';
 if proposal.id is null or not kxra_private.has_capability(o,'custom_project.manage')
  or request is null or length(trim(reference)) not between 1 and 120
  or subtotal is null or subtotal<0 or tax is null or tax<0
  or currency_code<>proposal.currency or due<=now()
  or length(trim(evidence)) not between 3 and 500
 then raise exception 'Custom project invoice unavailable';end if;
 hash_value=encode(sha256(convert_to(jsonb_build_object(
  'project_id',project,'proposal_id',proposal.id,'invoice_reference',trim(reference),
  'subtotal_minor',subtotal,'tax_minor',tax,'total_minor',subtotal+tax,
  'currency',currency_code,'due_at',due,'evidence_reference',trim(evidence)
 )::text,'UTF8')),'hex');
 insert into kxra.custom_project_invoices(
  org_id,project_id,proposal_id,client_request_id,invoice_reference,
  subtotal_minor,tax_minor,total_minor,currency,due_at,evidence_reference,
  issued_by,invoice_hash
 ) values(o,project,proposal.id,request,trim(reference),subtotal,tax,subtotal+tax,
  currency_code,due,trim(evidence),auth.uid(),hash_value)
 on conflict(org_id,client_request_id) do nothing returning id into created;
 inserted=created is not null;
 if created is null then
  select i.id into created from kxra.custom_project_invoices i
  where i.org_id=o and i.client_request_id=request and i.project_id=project
   and i.invoice_reference=trim(reference) and i.subtotal_minor=subtotal
   and i.tax_minor=tax and i.currency=currency_code and i.due_at=due
   and i.evidence_reference=trim(evidence) and i.invoice_hash=hash_value;
 end if;
 if created is null then raise exception 'Custom project invoice conflict';end if;
 if inserted then
  insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
  values(o,auth.uid(),'custom_project.invoice_issued',created,
   jsonb_build_object('project_id',project,'proposal_id',proposal.id,
    'invoice_reference',trim(reference),'total_minor',subtotal+tax,
    'currency',currency_code,'invoice_hash',hash_value));
 end if;
 return created;
end $$;

create function kxra.void_custom_project_invoice(
 invoice uuid,expected_hash text,request uuid,void_reason text,evidence text
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.custom_project_invoices;
 existing kxra.custom_project_invoice_voids;created uuid;
begin
 select * into value from kxra.custom_project_invoices i where i.id=invoice for update;
 if value.id is null or value.org_id<>o
  or not kxra_private.has_capability(o,'custom_project.manage')
  or expected_hash<>value.invoice_hash or request is null
  or length(trim(void_reason)) not between 3 and 5000
  or length(trim(evidence)) not between 3 and 500
 then raise exception 'Custom project invoice void unavailable';end if;
 select * into existing from kxra.custom_project_invoice_voids v
 where v.org_id=o and v.client_request_id=request;
 if existing.id is not null then
  if existing.invoice_id<>invoice or existing.invoice_hash<>expected_hash
   or existing.reason<>trim(void_reason) or existing.evidence_reference<>trim(evidence)
  then raise exception 'Custom project invoice void conflict';end if;
  return existing.id;
 end if;
 if value.state<>'ISSUED' or exists(
  select 1 from kxra.custom_project_credit_notes c where c.invoice_id=invoice
 ) then raise exception 'Custom project invoice void unavailable';end if;
 insert into kxra.custom_project_invoice_voids(
  org_id,invoice_id,client_request_id,invoice_hash,reason,evidence_reference,voided_by
 ) values(o,invoice,request,expected_hash,trim(void_reason),trim(evidence),auth.uid())
 returning id into created;
 update kxra.custom_project_invoices set state='VOID' where id=invoice;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'custom_project.invoice_voided',created,
  jsonb_build_object('invoice_id',invoice,'invoice_hash',expected_hash,
   'void_record_id',created));
 return created;
end $$;

create function kxra.issue_custom_project_credit_note(
 invoice uuid,expected_hash text,request uuid,reference text,subtotal bigint,
 tax bigint,credit_reason text,evidence text
) returns table(credit_note_id uuid,credit_note_hash text,resulting_invoice_state text)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.custom_project_invoices;
 existing kxra.custom_project_credit_notes;created kxra.custom_project_credit_notes;
 credited_subtotal bigint;credited_tax bigint;credited_total bigint;
 hash_value text;next_state text;
begin
 select * into value from kxra.custom_project_invoices i where i.id=invoice for update;
 if value.id is null or value.org_id<>o
  or not kxra_private.has_capability(o,'custom_project.manage')
  or expected_hash<>value.invoice_hash or request is null
  or length(trim(reference)) not between 1 and 120
  or subtotal is null or subtotal<0 or tax is null or tax<0 or subtotal+tax<=0
  or length(trim(credit_reason)) not between 3 and 5000
  or length(trim(evidence)) not between 3 and 500
 then raise exception 'Custom project credit note unavailable';end if;
 select * into existing from kxra.custom_project_credit_notes c
 where c.org_id=o and c.client_request_id=request;
 if existing.id is not null then
  if existing.invoice_id<>invoice or existing.credit_reference<>trim(reference)
   or existing.subtotal_minor<>subtotal or existing.tax_minor<>tax
   or existing.reason<>trim(credit_reason)
   or existing.evidence_reference<>trim(evidence)
  then raise exception 'Custom project credit note conflict';end if;
  return query select existing.id,existing.credit_hash,value.state;return;
 end if;
 if value.state='VOID' then raise exception 'Custom project credit note unavailable';end if;
 select coalesce(sum(c.subtotal_minor),0),coalesce(sum(c.tax_minor),0),
  coalesce(sum(c.total_minor),0)
 into credited_subtotal,credited_tax,credited_total
 from kxra.custom_project_credit_notes c where c.invoice_id=invoice;
 if subtotal>value.subtotal_minor-credited_subtotal
  or tax>value.tax_minor-credited_tax
  or subtotal+tax>value.total_minor-credited_total
 then raise exception 'Custom project credit note unavailable';end if;
 hash_value=encode(sha256(convert_to(jsonb_build_object(
  'invoice_id',invoice,'invoice_hash',expected_hash,'client_request_id',request,
  'credit_reference',trim(reference),'subtotal_minor',subtotal,
  'tax_minor',tax,'total_minor',subtotal+tax,'currency',value.currency,
  'reason',trim(credit_reason),'evidence_reference',trim(evidence)
 )::text,'UTF8')),'hex');
 insert into kxra.custom_project_credit_notes(
  org_id,project_id,proposal_id,invoice_id,client_request_id,credit_reference,
  subtotal_minor,tax_minor,total_minor,currency,reason,evidence_reference,
  credit_hash,issued_by
 ) values(o,value.project_id,value.proposal_id,invoice,request,trim(reference),
  subtotal,tax,subtotal+tax,value.currency,trim(credit_reason),trim(evidence),
  hash_value,auth.uid()) returning * into created;
 if credited_total+created.total_minor=value.total_minor
 then next_state='CREDITED';else next_state='PARTIALLY_CREDITED';end if;
 update kxra.custom_project_invoices set state=next_state where id=invoice;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'custom_project.credit_note_issued',created.id,
  jsonb_build_object('invoice_id',invoice,'invoice_hash',expected_hash,
   'credit_reference',created.credit_reference,'total_minor',created.total_minor,
   'currency',created.currency,'credit_hash',hash_value));
 return query select created.id,created.credit_hash,next_state;
end $$;

revoke all on function kxra.void_custom_project_invoice(uuid,text,uuid,text,text),
 kxra.issue_custom_project_credit_note(uuid,text,uuid,text,bigint,bigint,text,text)
from public,anon;
grant execute on function kxra.void_custom_project_invoice(uuid,text,uuid,text,text),
 kxra.issue_custom_project_credit_note(uuid,text,uuid,text,bigint,bigint,text,text)
to authenticated;

commit;
