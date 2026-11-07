begin;

create or replace function kxra.create_project_proposal(
 request uuid,scope_text text,exclusions_text text,assumptions_text text,
 milestone_list jsonb,amount_minor bigint,currency_code text,tax_text text,
 payment_requirement text,deposit_amount bigint,legal_id uuid,legal_version integer,
 legal_hash text,expires timestamptz
) returns table(id uuid,version integer,proposal_hash text)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare o uuid=kxra_private.member_org();request_row kxra.custom_project_requests;
 document kxra.legal_documents;next_version integer;hash_value text;created kxra.project_proposals;
begin
 select * into request_row from kxra.custom_project_requests r where r.id=request for update;
 select * into document from kxra.legal_documents d where d.org_id=o and d.id=legal_id
  and d.version=legal_version and d.content_sha256=legal_hash and d.status='APPROVED';
 if not kxra_private.is_owner(o) or request_row.id is null or request_row.org_id<>o
  or request_row.state in ('WITHDRAWN','REJECTED','PROJECT_CREATED') or document.id is null
  or length(trim(scope_text)) not between 1 and 50000
  or length(coalesce(exclusions_text,''))>30000 or length(coalesce(assumptions_text,''))>30000
  or jsonb_typeof(milestone_list)<>'array' or jsonb_array_length(milestone_list)<1
  or amount_minor<0 or currency_code!~'^[A-Z]{3}$'
  or length(trim(tax_text)) not between 1 and 500
  or payment_requirement not in ('NONE','DEPOSIT','PAID_IN_FULL')
  or deposit_amount<0 or deposit_amount>amount_minor
  or payment_requirement='DEPOSIT' and deposit_amount=0
  or payment_requirement='PAID_IN_FULL' and deposit_amount<>amount_minor
  or expires<=now()
 then raise exception 'Project proposal unavailable';end if;
 select coalesce(max(p.version),0)+1 into next_version
 from kxra.project_proposals p where p.request_id=request;
 update kxra.project_proposals p set state='SUPERSEDED'
 where p.request_id=request and p.state in ('DRAFT','ISSUED');
 hash_value=encode(sha256(convert_to(jsonb_build_object(
  'request_id',request,'version',next_version,'scope',trim(scope_text),
  'exclusions',coalesce(exclusions_text,''),'assumptions',coalesce(assumptions_text,''),
  'milestones',milestone_list,'price_minor',amount_minor,'currency',currency_code,
  'tax_treatment',trim(tax_text),'payment_gate',payment_requirement,
  'deposit_minor',deposit_amount,'legal_document_id',legal_id,
  'legal_document_version',legal_version,'legal_document_sha256',legal_hash,
  'valid_until',expires
 )::text,'UTF8')),'hex');
 insert into kxra.project_proposals(
  org_id,request_id,version,state,scope,exclusions,assumptions,milestones,
  price_minor,currency,tax_treatment,payment_gate,deposit_minor,
  legal_document_id,legal_document_version,legal_document_sha256,
  proposal_hash,valid_until,issued_at,created_by
 ) values(
  o,request,next_version,'ISSUED',trim(scope_text),coalesce(exclusions_text,''),
  coalesce(assumptions_text,''),milestone_list,amount_minor,currency_code,
  trim(tax_text),payment_requirement,deposit_amount,legal_id,legal_version,
  legal_hash,hash_value,expires,now(),auth.uid()
 ) returning * into created;
 update kxra.custom_project_requests r set state='PROPOSAL_ISSUED',updated_at=now()
 where r.id=request;
 return query select created.id,created.version,created.proposal_hash;
end $$;

commit;
