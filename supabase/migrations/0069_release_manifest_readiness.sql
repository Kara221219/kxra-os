begin;

create or replace function kxra.release_manifest_check(manifest uuid)
returns table(ready boolean,blockers text[])
language plpgsql stable security definer set search_path='' as $$
declare
 value kxra.release_manifests;
 problems text[]='{}'::text[];
 required_types text[]=array['NDA','TERMS','PRIVACY','COOKIE','DATA_PROCESSING','CUSTOM_PROJECT'];
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

revoke all on function kxra.release_manifest_check(uuid) from public,anon;
grant execute on function kxra.release_manifest_check(uuid) to authenticated;

commit;
