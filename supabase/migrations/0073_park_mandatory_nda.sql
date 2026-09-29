begin;

-- Owner decision: confidentiality/NDA acceptance is parked. Preserve the
-- versioned legal subsystem and immutable evidence, but retire current NDA
-- requirements and do not treat unapproved placeholders as onboarding gates.
update kxra.legal_document_requirements requirement
set state='RETIRED',retired_at=coalesce(requirement.retired_at,now())
from kxra.legal_documents document
where requirement.org_id=document.org_id
 and requirement.document_id=document.id
 and requirement.document_version=document.version
 and requirement.document_sha256=document.content_sha256
 and requirement.state='ACTIVE' and document.document_type='NDA';

update kxra.agreement_documents
set required=false
where document_key='nda' and required;

create or replace function kxra_private.current_agreements_acknowledged(account uuid,o uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(
  select 1 from kxra.agreement_documents d
  where d.org_id=o and d.required and d.status='APPROVED'
   and not exists(
    select 1 from kxra.agreement_acceptances a
    where a.user_id=account and a.org_id=o and a.agreement_id=d.id
     and a.agreement_version=d.version
   )
 )
$$;

create or replace function kxra.complete_onboarding_step(step integer,contents jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare
 p kxra.profiles;progress kxra.onboarding_progress;item jsonb;agreement kxra.agreement_documents;
 required_count integer;accepted_count integer;next_step integer;recipient text;queued uuid;
begin
 select * into p from kxra.profiles where user_id=auth.uid() for update;
 select * into progress from kxra.onboarding_progress where user_id=auth.uid() for update;
 if p.user_id is null or progress.user_id is null or p.account_state<>'ONBOARDING'
  or step is null or step<1 or step>9 or step>progress.current_step
  or jsonb_typeof(contents) is distinct from 'object'
 then raise exception 'Onboarding step unavailable';end if;

 if step=1 then
  if contents<>jsonb_build_object('acknowledged',true) then raise exception 'Welcome acknowledgement required';end if;
 elsif step=2 then
  perform kxra.update_own_profile(contents);
 elsif step=3 then
  if not(contents ? 'security_acknowledged') or contents->'security_acknowledged'<>'true'::jsonb
   or contents-array['security_acknowledged']<>'{}'::jsonb
  then raise exception 'Security acknowledgement required';end if;
 elsif step=4 then
  if contents<>jsonb_build_object('access_acknowledged',true)
   or not exists(select 1 from kxra.project_memberships pm where pm.user_id=p.user_id and pm.active and (pm.expires_at is null or pm.expires_at>now()))
  then raise exception 'Project access acknowledgement required';end if;
 elsif step=5 then
  if contents<>jsonb_build_object('working_acknowledged',true) then raise exception 'Working acknowledgement required';end if;
 elsif step=6 then
  if contents-array['whatsapp_choice']<>'{}'::jsonb
   or contents->>'whatsapp_choice' not in ('SKIP','CONNECT_LATER')
  then raise exception 'WhatsApp choice required';end if;
  update kxra.onboarding_progress set whatsapp_choice=contents->>'whatsapp_choice' where user_id=p.user_id;
 elsif step=7 then
  perform kxra.update_own_preferences(contents);
 elsif step=8 then
  if not(contents ? 'agreement_ids') or jsonb_typeof(contents->'agreement_ids')<>'array'
   or coalesce(contents->'agreements_reviewed','false'::jsonb)<>'true'::jsonb
   or contents-array['agreement_ids','agreements_reviewed']<>'{}'::jsonb
  then raise exception 'Agreement review required';end if;
  for item in select value from jsonb_array_elements(contents->'agreement_ids') loop
   if jsonb_typeof(item)<>'string' then raise exception 'Agreement review required';end if;
   select * into agreement from kxra.agreement_documents d
   where d.id=(item#>>'{}')::uuid and d.org_id=p.org_id and d.required and d.status='APPROVED';
   if not found then raise exception 'Agreement review required';end if;
   insert into kxra.agreement_acceptances(user_id,org_id,agreement_id,agreement_version)
   values(p.user_id,p.org_id,agreement.id,agreement.version) on conflict do nothing;
  end loop;
  select count(*) into required_count from kxra.agreement_documents d
  where d.org_id=p.org_id and d.required and d.status='APPROVED';
  select count(*) into accepted_count from kxra.agreement_acceptances a
  join kxra.agreement_documents d on d.id=a.agreement_id and d.version=a.agreement_version
  where a.user_id=p.user_id and d.org_id=p.org_id and d.required and d.status='APPROVED';
  if accepted_count<>required_count then raise exception 'Every required approved agreement version must be acknowledged';end if;
 elsif step=9 then
  if contents<>jsonb_build_object('complete',true)
   or not(progress.completed_steps@>array[1,2,3,4,5,6,7,8])
   or p.first_name is null or p.last_name is null
   or not exists(select 1 from kxra.user_preferences pref where pref.user_id=p.user_id)
  then raise exception 'Onboarding is incomplete';end if;
  select count(*) into required_count from kxra.agreement_documents d
  where d.org_id=p.org_id and d.required and d.status='APPROVED';
  select count(*) into accepted_count from kxra.agreement_acceptances a
  join kxra.agreement_documents d on d.id=a.agreement_id and d.version=a.agreement_version
  where a.user_id=p.user_id and d.org_id=p.org_id and d.required and d.status='APPROVED';
  if accepted_count<>required_count then raise exception 'Onboarding is incomplete';end if;
 end if;

 update kxra.onboarding_progress set
  completed_steps=(select array_agg(distinct value order by value) from unnest(completed_steps||step) value),
  current_step=case when step=9 then 9 else greatest(current_step,step+1) end,
  updated_at=now(),completed_at=case when step=9 then now() else completed_at end
 where user_id=p.user_id returning current_step into next_step;
 if step=9 then
  update kxra.profiles set account_state='ACTIVE',onboarding_completed_at=now(),updated_at=now()
  where user_id=p.user_id;
  select i.recipient_email into recipient from kxra.invitations i
  where i.redeemed_by=p.user_id and i.state='REDEEMED' and i.recipient_email is not null
  order by i.redeemed_at desc limit 1;
  if recipient is not null then
   queued=kxra_private.queue_email(p.org_id,null,p.user_id,'WELCOME',recipient,
    jsonb_build_object('user_id',p.user_id,'onboarding_completed',true),
    'welcome:'||p.user_id||':1');
  end if;
  insert into kxra.account_security_events(org_id,user_id,actor_id,event_type)
  values(p.org_id,p.user_id,p.user_id,'ONBOARDING_COMPLETED');
  insert into kxra.audit_events(org_id,actor_id,action,resource_id)
  values(p.org_id,p.user_id,'onboarding.completed',p.user_id);
 end if;
 return next_step;
end $$;

create or replace function kxra.resume_required_onboarding() returns integer
language plpgsql security definer set search_path='' as $$
declare p kxra.profiles;m kxra.members;
begin
 select * into p from kxra.profiles where user_id=auth.uid() for update;
 select * into m from kxra.members where id=auth.uid() and org_id=p.org_id for update;
 if p.user_id is null or m.id is null or not m.active or m.role<>'partner'
  or p.account_state in ('SUSPENDED','REVOKED')
 then raise exception 'Onboarding unavailable';end if;
 if p.account_state='ACTIVE' and not kxra_private.current_agreements_acknowledged(p.user_id,p.org_id) then
  update kxra.profiles set account_state='ONBOARDING',updated_at=now() where user_id=p.user_id;
  update kxra.onboarding_progress set current_step=8,
   completed_steps=array_remove(array_remove(completed_steps,8),9),completed_at=null,updated_at=now()
  where user_id=p.user_id;
  return 8;
 end if;
 return coalesce((select current_step from kxra.onboarding_progress where user_id=p.user_id),1);
end $$;

create or replace function kxra.release_manifest_check(manifest uuid)
returns table(ready boolean,blockers text[])
language plpgsql stable security definer set search_path='' as $$
declare
 value kxra.release_manifests;
 problems text[]='{}'::text[];
 required_types text[]=array['TERMS','PRIVACY','COOKIE','DATA_PROCESSING','CUSTOM_PROJECT'];
 found_types text[]='{}'::text[];
 item jsonb;
 document record;
 evidence jsonb;
 required_evidence text[]=array['CORE_STAGING','AUTH_RLS','BACKUP_RESTORE','STRIPE_TEST','EMAIL_STAGING'];
 evidence_keys text[]='{}'::text[];
 commercial jsonb;
 support jsonb;
begin
 select * into value from kxra.release_manifests where id=manifest;
 if not found or not kxra_private.is_owner(value.org_id)
 then raise exception 'Release manifest unavailable';end if;
 commercial=value.commercial_configuration;
 support=value.support_channels;

 if jsonb_array_length(value.legal_document_refs)=0 then
  problems=array_append(problems,'LEGAL_DOCUMENTS_MISSING');
 end if;
 for item in select entry from jsonb_array_elements(value.legal_document_refs) refs(entry) loop
  if jsonb_typeof(item)<>'object'
   or not(item ?& array['document_id','version','sha256'])
   or item-array['document_id','version','sha256']<>'{}'::jsonb
   or coalesce(item->>'document_id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
   or coalesce(item->>'version','')!~'^[1-9][0-9]*$'
   or coalesce(item->>'sha256','')!~'^[a-f0-9]{64}$'
  then
   if not('LEGAL_DOCUMENT_REFERENCE_MALFORMED'=any(problems)) then
    problems=array_append(problems,'LEGAL_DOCUMENT_REFERENCE_MALFORMED');
   end if;
   continue;
  end if;
  select d.document_type,d.status,d.immutable_object_key,d.legal_reviewer_reference,d.effective_at
   into document from kxra.legal_documents d
   where d.org_id=value.org_id and d.id=(item->>'document_id')::uuid
    and d.version=(item->>'version')::integer and d.content_sha256=item->>'sha256';
  if not found or document.status<>'APPROVED' or document.immutable_object_key is null
   or document.legal_reviewer_reference is null or document.effective_at is null
  then
   if not('LEGAL_DOCUMENT_UNAPPROVED_OR_HASH_MISMATCH'=any(problems)) then
    problems=array_append(problems,'LEGAL_DOCUMENT_UNAPPROVED_OR_HASH_MISMATCH');
   end if;
  elsif document.document_type=any(found_types) then
   if not('LEGAL_DOCUMENT_TYPE_DUPLICATED'=any(problems)) then
    problems=array_append(problems,'LEGAL_DOCUMENT_TYPE_DUPLICATED');
   end if;
  else found_types=array_append(found_types,document.document_type);end if;
 end loop;
 if not(required_types<@found_types) then
  problems=array_append(problems,'REQUIRED_LEGAL_DOCUMENT_TYPES_MISSING');
 end if;

 if not(commercial ?& array[
  'plan_code','plan_name','price_minor','currency','billing_interval','included_usage',
  'custom_projects_separate','cancellation_policy','refund_policy','grace_policy',
  'tax_treatment','retention_policy','subprocessors','public_copy_sha256',
  'provider_evidence','accessibility_review','security_review'
 ]) then problems=array_append(problems,'COMMERCIAL_CONFIGURATION_INCOMPLETE');
 elsif jsonb_typeof(commercial->'plan_code')<>'string'
  or length(trim(commercial->>'plan_code')) not between 1 and 80
  or jsonb_typeof(commercial->'plan_name')<>'string'
  or length(trim(commercial->>'plan_name')) not between 1 and 160
  or jsonb_typeof(commercial->'price_minor')<>'number'
  or not(case when coalesce(commercial->>'price_minor','')~'^[1-9][0-9]*$'
   then (commercial->>'price_minor')::numeric<=100000000 else false end)
  or coalesce(commercial->>'currency','')!~'^[A-Z]{3}$'
  or commercial->>'billing_interval' not in ('MONTH','YEAR')
  or jsonb_typeof(commercial->'included_usage')<>'object'
  or commercial->'included_usage'='{}'::jsonb
  or commercial->'custom_projects_separate'<>'true'::jsonb
  or jsonb_typeof(commercial->'cancellation_policy')<>'string'
  or length(trim(commercial->>'cancellation_policy')) not between 1 and 2000
  or jsonb_typeof(commercial->'refund_policy')<>'string'
  or length(trim(commercial->>'refund_policy')) not between 1 and 2000
  or jsonb_typeof(commercial->'grace_policy')<>'string'
  or length(trim(commercial->>'grace_policy')) not between 1 and 2000
  or jsonb_typeof(commercial->'tax_treatment')<>'string'
  or length(trim(commercial->>'tax_treatment')) not between 1 and 1000
 then problems=array_append(problems,'COMMERCIAL_CONFIGURATION_INVALID');end if;

 if jsonb_typeof(commercial->'retention_policy') is distinct from 'object'
  or not(coalesce(commercial->'retention_policy','{}'::jsonb) ?& array[
   'customer_data_days','backup_days','deletion_process','legal_basis'
  ])
  or coalesce(commercial->'retention_policy'->>'customer_data_days','')!~'^[1-9][0-9]*$'
  or coalesce(commercial->'retention_policy'->>'backup_days','')!~'^[1-9][0-9]*$'
  or length(trim(coalesce(commercial->'retention_policy'->>'deletion_process',''))) not between 1 and 2000
  or length(trim(coalesce(commercial->'retention_policy'->>'legal_basis',''))) not between 1 and 1000
 then problems=array_append(problems,'RETENTION_POLICY_MISSING_OR_INVALID');end if;

 if jsonb_typeof(commercial->'subprocessors') is distinct from 'array' then
  problems=array_append(problems,'SUBPROCESSOR_REGISTER_MISSING_OR_INVALID');
 elsif jsonb_array_length(commercial->'subprocessors')=0
  or exists(select 1 from jsonb_array_elements(commercial->'subprocessors') s
   where jsonb_typeof(s.value)<>'object' or not(s.value ?& array['name','purpose','location'])
    or length(trim(coalesce(s.value->>'name',''))) not between 1 and 200
    or length(trim(coalesce(s.value->>'purpose',''))) not between 1 and 1000
    or length(trim(coalesce(s.value->>'location',''))) not between 1 and 200)
 then problems=array_append(problems,'SUBPROCESSOR_REGISTER_MISSING_OR_INVALID');end if;

 if coalesce(commercial->>'public_copy_sha256','')!~'^[a-f0-9]{64}$'
 then problems=array_append(problems,'PUBLIC_COPY_HASH_MISSING_OR_INVALID');end if;

 if jsonb_typeof(commercial->'provider_evidence') is distinct from 'array' then
  problems=array_append(problems,'PROVIDER_EVIDENCE_INCOMPLETE');
 else
  for evidence in select entry from jsonb_array_elements(commercial->'provider_evidence') entries(entry) loop
   if jsonb_typeof(evidence)<>'object' or not(evidence ?& array['key','status','reference','sha256'])
    or evidence-array['key','status','reference','sha256']<>'{}'::jsonb
    or evidence->>'key'<>all(required_evidence) or evidence->>'status'<>'PASS'
    or length(trim(coalesce(evidence->>'reference',''))) not between 1 and 500
    or coalesce(evidence->>'sha256','')!~'^[a-f0-9]{64}$'
    or evidence->>'key'=any(evidence_keys)
   then
    if not('PROVIDER_EVIDENCE_INVALID'=any(problems)) then
     problems=array_append(problems,'PROVIDER_EVIDENCE_INVALID');
    end if;
   else evidence_keys=array_append(evidence_keys,evidence->>'key');end if;
  end loop;
  if not(required_evidence<@evidence_keys) then
   problems=array_append(problems,'PROVIDER_EVIDENCE_INCOMPLETE');
  end if;
 end if;

 if jsonb_typeof(commercial->'accessibility_review') is distinct from 'object'
  or commercial->'accessibility_review'->>'status'<>'PASS'
  or length(trim(coalesce(commercial->'accessibility_review'->>'reviewer',''))) not between 1 and 240
  or coalesce(commercial->'accessibility_review'->>'reviewed_at','')!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
 then problems=array_append(problems,'ACCESSIBILITY_REVIEW_MISSING_OR_INVALID');end if;
 if jsonb_typeof(commercial->'security_review') is distinct from 'object'
  or commercial->'security_review'->>'status'<>'PASS'
  or length(trim(coalesce(commercial->'security_review'->>'reviewer',''))) not between 1 and 240
  or coalesce(commercial->'security_review'->>'reviewed_at','')!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}T'
 then problems=array_append(problems,'SECURITY_REVIEW_MISSING_OR_INVALID');end if;

 if not(support ?& array['support_email','privacy_email','security_email','response_policy'])
  or jsonb_typeof(support->'support_email')<>'string'
  or jsonb_typeof(support->'privacy_email')<>'string'
  or jsonb_typeof(support->'security_email')<>'string'
  or lower(support->>'support_email')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  or lower(support->>'privacy_email')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  or lower(support->>'security_email')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  or length(trim(coalesce(support->>'response_policy',''))) not between 1 and 2000
 then problems=array_append(problems,'SUPPORT_CHANNELS_MISSING_OR_INVALID');end if;
 if value.legal_owner is null or length(trim(value.legal_owner))=0
  or value.commercial_owner is null or length(trim(value.commercial_owner))=0
  or value.reviewed_at is null
 then problems=array_append(problems,'OWNERS_OR_REVIEW_MISSING');end if;
 return query select cardinality(problems)=0,problems;
end $$;

commit;
