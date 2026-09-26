begin;

alter table kxra.brand_product_events
 drop constraint brand_product_events_event_type_check;
alter table kxra.brand_product_events
 add constraint brand_product_events_event_type_check check(event_type in (
  'SOURCE_ADDED','SOURCE_CORRECTED','PROFILE_CREATED','PROFILE_APPROVED',
  'CAMPAIGN_APPROVED','GENERATION_STARTED','GENERATION_COMPLETED',
  'GENERATION_FAILED','VARIANT_EDITED','VARIANT_REVIEWED','EXPORT_CREATED',
  'EXPORT_DELIVERED'
 ));

create table kxra.brand_source_revision_metadata(
 source_version_id uuid primary key,
 org_id uuid not null,
 project_id uuid not null,
 source_id uuid not null,
 supersedes_source_version_id uuid not null,
 revision_kind text not null
  check(revision_kind in ('WEBSITE_REFRESH','USER_CORRECTION')),
 revision_reason text check(
  revision_reason is null or length(trim(revision_reason)) between 3 and 2000
 ),
 client_request_id uuid not null,
 created_at timestamptz not null default now(),
 unique(org_id,client_request_id),
 unique(org_id,project_id,source_version_id),
 foreign key(org_id,project_id,source_id)
  references kxra.brand_sources(org_id,project_id,id),
 foreign key(org_id,project_id,source_version_id)
  references kxra.brand_source_versions(org_id,project_id,id),
 foreign key(org_id,project_id,supersedes_source_version_id)
  references kxra.brand_source_versions(org_id,project_id,id),
 check(
  (revision_kind='USER_CORRECTION' and revision_reason is not null)
  or (revision_kind='WEBSITE_REFRESH' and revision_reason is null)
 )
);

create index brand_source_revision_metadata_source
 on kxra.brand_source_revision_metadata(source_id,created_at desc,source_version_id);

alter table kxra.brand_source_revision_metadata enable row level security;
grant select on kxra.brand_source_revision_metadata to authenticated,anon;
create policy brand_source_revision_metadata_read
 on kxra.brand_source_revision_metadata for select
 using(kxra_private.can_project(project_id,false));
create trigger brand_source_revision_metadata_append_only
 before update or delete on kxra.brand_source_revision_metadata
 for each row execute function kxra_private.guard_brand_append_only();

create function kxra_private.brand_profile_evidence_current(p_profile_version uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.brand_profile_evidence evidence
  where evidence.profile_version_id=p_profile_version
 ) and not exists(
  select 1 from kxra.brand_profile_evidence evidence
  join kxra.brand_source_versions source_version
   on source_version.id=evidence.source_version_id
  join kxra.brand_sources source on source.id=source_version.source_id
  where evidence.profile_version_id=p_profile_version
   and source_version.version<>source.current_version
 )
$$;

create function kxra_private.guard_current_brand_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare profile_version_id uuid;
begin
 if tg_table_name='brand_profile_versions' then
  if tg_op='UPDATE' and old.status='DRAFT' and new.status='APPROVED'
   and not kxra_private.brand_profile_evidence_current(new.id)
  then raise exception 'Brand profile evidence requires correction review';end if;
  return new;
 end if;
 if tg_table_name='campaign_brief_versions' then
  if tg_op='UPDATE' and not (old.status='DRAFT' and new.status='APPROVED')
  then return new;end if;
 end if;
 profile_version_id=new.profile_version_id;
 if not kxra_private.brand_profile_evidence_current(profile_version_id)
 then raise exception 'Brand profile evidence requires correction review';end if;
 return new;
end $$;

create trigger brand_profile_versions_current_evidence
 before update on kxra.brand_profile_versions
 for each row execute function kxra_private.guard_current_brand_evidence();
create trigger campaign_brief_versions_current_evidence
 before insert or update on kxra.campaign_brief_versions
 for each row execute function kxra_private.guard_current_brand_evidence();
create trigger creative_requests_current_evidence
 before insert on kxra.creative_requests
 for each row execute function kxra_private.guard_current_brand_evidence();

create function kxra_private.guard_current_creative_evidence() returns trigger
language plpgsql security definer set search_path='' as $$
declare profile_version_id uuid;
begin
 if tg_table_name='creative_variants' then
  select request.profile_version_id into profile_version_id
  from kxra.creative_requests request where request.id=new.request_id;
 else
  select request.profile_version_id into profile_version_id
  from kxra.creative_variants variant
  join kxra.creative_requests request on request.id=variant.request_id
  where variant.id=new.variant_id;
 end if;
 if profile_version_id is null
  or not kxra_private.brand_profile_evidence_current(profile_version_id)
 then raise exception 'Brand profile evidence requires correction review';end if;
 return new;
end $$;

create trigger creative_variants_current_evidence
 before insert on kxra.creative_variants
 for each row execute function kxra_private.guard_current_creative_evidence();
create trigger brand_exports_current_evidence
 before insert on kxra.brand_exports
 for each row execute function kxra_private.guard_current_creative_evidence();

create function kxra.revise_brand_source(
 p_source uuid,p_expected_version integer,p_content text,p_reason text,p_request uuid
) returns table(source_version_id uuid,version integer,content_sha256 text)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();source_row kxra.brand_sources;
 existing_meta kxra.brand_source_revision_metadata;
 existing_version kxra.brand_source_versions;
 superseded kxra.brand_source_versions;created kxra.brand_source_versions;
 next_version integer;content_hash text;
begin
 select * into source_row from kxra.brand_sources value
 where value.id=p_source for update;
 if o is null or source_row.id is null or source_row.org_id<>o
  or source_row.state<>'ACTIVE'
  or not kxra_private.can_project(source_row.project_id,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or p_expected_version is null or p_expected_version<1 or p_request is null
  or length(trim(coalesce(p_content,''))) not between 1 and 50000
  or length(trim(coalesce(p_reason,''))) not between 3 and 2000
 then raise exception 'Brand source revision unavailable';end if;
 content_hash=encode(sha256(convert_to(trim(p_content),'UTF8')),'hex');
 select * into existing_meta from kxra.brand_source_revision_metadata metadata
 where metadata.org_id=o and metadata.client_request_id=p_request;
 if existing_meta.source_version_id is not null then
  select * into existing_version from kxra.brand_source_versions value
  where value.id=existing_meta.source_version_id;
  if existing_meta.source_id<>source_row.id
   or existing_meta.revision_kind<>'USER_CORRECTION'
   or existing_meta.revision_reason<>trim(p_reason)
   or existing_version.version<>p_expected_version+1
   or existing_version.content_sha256<>content_hash
  then raise exception 'Brand source revision conflict';end if;
  return query select existing_version.id,existing_version.version,
   existing_version.content_sha256;return;
 end if;
 if source_row.current_version<>p_expected_version
 then raise exception 'Brand source revision unavailable';end if;
 select * into superseded from kxra.brand_source_versions value
 where value.source_id=source_row.id and value.version=source_row.current_version;
 if superseded.id is null then raise exception 'Brand source revision unavailable';end if;
 next_version=source_row.current_version+1;
 insert into kxra.brand_source_versions(
  org_id,project_id,source_id,version,supplied_content,content_sha256,
  fetch_state,security_result,source_classification,created_by
 ) values(
  o,source_row.project_id,source_row.id,next_version,trim(p_content),content_hash,
  'PROVIDER_DISABLED','NOT_FETCHED','USER-SUPPLIED INFORMATION',auth.uid()
 ) returning * into created;
 insert into kxra.brand_source_revision_metadata(
  source_version_id,org_id,project_id,source_id,supersedes_source_version_id,
  revision_kind,revision_reason,client_request_id
 ) values(
  created.id,o,source_row.project_id,source_row.id,superseded.id,
  'USER_CORRECTION',trim(p_reason),p_request
 );
 update kxra.brand_sources set current_version=next_version,updated_at=now()
 where id=source_row.id;
 insert into kxra.brand_product_events(
  org_id,project_id,account_id,event_type,resource_id,metadata
 ) values(
  o,source_row.project_id,auth.uid(),'SOURCE_CORRECTED',source_row.id,
  jsonb_build_object('source_version',next_version,
   'supersedes_source_version_id',superseded.id,'content_sha256',content_hash)
 );
 return query select created.id,created.version,created.content_sha256;
end $$;

create or replace function kxra_private.complete_brand_source_acquisition(
 p_acquisition uuid,p_worker text,p_outcome text,p_final_url text,
 p_content_type text,p_raw_sha256 text,p_content text,p_byte_count integer,
 p_redirect_count integer,p_failure_code text,p_retryable boolean
) returns table(state text,source_version_id uuid,version integer)
language plpgsql security definer set search_path='' as $$
declare job kxra.brand_source_acquisitions;source_row kxra.brand_sources;
 created_version kxra.brand_source_versions;content_hash text;next_version integer;
 superseded_version_id uuid;
begin
 select * into job from kxra.brand_source_acquisitions value
 where value.id=p_acquisition for update;
 if job.id is null then raise exception 'Brand source acquisition unavailable';end if;
 if job.state='SUCCEEDED' and p_outcome='SUCCEEDED'
  and job.raw_sha256=p_raw_sha256
  and job.content_sha256=encode(sha256(convert_to(trim(p_content),'UTF8')),'hex')
 then return query select job.state,job.source_version_id,
  (select value.version from kxra.brand_source_versions value
   where value.id=job.source_version_id);return;
 end if;
 if job.state<>'RUNNING' or job.worker_reference<>trim(p_worker)
  or job.lease_expires_at<=now() or p_outcome not in ('SUCCEEDED','FAILED')
 then raise exception 'Brand source acquisition unavailable';end if;
 select * into source_row from kxra.brand_sources value
 where value.id=job.source_id for update;
 if source_row.id is null or source_row.state<>'ACTIVE'
  or source_row.current_version<>job.requested_source_version then
  update kxra.brand_source_acquisitions set state='CANCELLED',
   lease_expires_at=null,worker_reference=null,failure_code='SOURCE_CHANGED',
   completed_at=now(),updated_at=now() where id=job.id;
  return query select 'CANCELLED'::text,null::uuid,null::integer;return;
 end if;
 if p_outcome='FAILED' then
  if p_failure_code is null or p_failure_code!~'^[A-Z][A-Z0-9_]{2,79}$'
  then raise exception 'Brand source acquisition result unavailable';end if;
  update kxra.brand_source_acquisitions set
   state=case when p_retryable and attempts<max_attempts then 'RETRY' else 'FAILED' end,
   available_at=case when p_retryable and attempts<max_attempts
    then now()+interval '30 seconds' else available_at end,
   lease_expires_at=null,worker_reference=null,failure_code=p_failure_code,
   completed_at=case when p_retryable and attempts<max_attempts then null else now() end,
   updated_at=now() where id=job.id;
  return query select
   case when p_retryable and job.attempts<job.max_attempts then 'RETRY' else 'FAILED' end,
   null::uuid,null::integer;return;
 end if;
 if not kxra_private.safe_brand_locator(p_final_url)
  or p_content_type not in ('text/html','text/plain','application/xhtml+xml')
  or p_raw_sha256!~'^[a-f0-9]{64}$'
  or length(trim(coalesce(p_content,''))) not between 1 and 50000
  or p_byte_count not between 1 and 1000000
  or p_redirect_count not between 0 and 3
  or p_failure_code is not null
 then raise exception 'Brand source acquisition result unavailable';end if;
 content_hash=encode(sha256(convert_to(trim(p_content),'UTF8')),'hex');
 next_version=source_row.current_version+1;
 select value.id into superseded_version_id from kxra.brand_source_versions value
 where value.source_id=source_row.id and value.version=source_row.current_version;
 if superseded_version_id is null
 then raise exception 'Brand source acquisition result unavailable';end if;
 insert into kxra.brand_source_versions(
  org_id,project_id,source_id,version,supplied_content,content_sha256,
  fetch_state,security_result,source_classification,created_by
 ) values(
  job.org_id,job.project_id,job.source_id,next_version,trim(p_content),content_hash,
  'FETCHED','PASSED','EXTERNAL RESEARCH',job.requested_by
 ) returning * into created_version;
 insert into kxra.brand_source_revision_metadata(
  source_version_id,org_id,project_id,source_id,supersedes_source_version_id,
  revision_kind,revision_reason,client_request_id
 ) values(
  created_version.id,job.org_id,job.project_id,job.source_id,
  superseded_version_id,'WEBSITE_REFRESH',null,job.client_request_id
 );
 update kxra.brand_sources set current_version=next_version,updated_at=now()
 where id=source_row.id;
 update kxra.brand_source_acquisitions set state='SUCCEEDED',
  final_url=p_final_url,content_type=p_content_type,raw_sha256=p_raw_sha256,
  content_sha256=content_hash,byte_count=p_byte_count,redirect_count=p_redirect_count,
  source_version_id=created_version.id,lease_expires_at=null,worker_reference=null,
  failure_code=null,completed_at=now(),updated_at=now() where id=job.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(job.org_id,job.requested_by,'brand_source.refresh_completed',job.id,
  jsonb_build_object('project_id',job.project_id,'source_id',job.source_id,
   'source_version',next_version,'input_sha256',job.input_sha256,
   'content_sha256',content_hash,'raw_sha256',p_raw_sha256));
 return query select 'SUCCEEDED'::text,created_version.id,next_version;
end $$;

create or replace function kxra.authorize_brand_export(p_export uuid)
returns table(
 allowed boolean,reason_code text,export_format text,filename text,
 content jsonb,content_sha256 text
) language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();export_row kxra.brand_exports;
 variant kxra.creative_variants;review kxra.creative_reviews;
 request_row kxra.creative_requests;
 membership kxra.organisation_memberships;reason text='EXPORT_UNAVAILABLE';
begin
 select * into export_row from kxra.brand_exports value where value.id=p_export;
 if export_row.id is null or export_row.org_id<>o
  or not kxra_private.can_project(export_row.project_id,false)
 then return query select false,reason,null::text,null::text,null::jsonb,null::text;return;end if;
 select * into variant from kxra.creative_variants value where value.id=export_row.variant_id;
 select * into review from kxra.creative_reviews value where value.id=export_row.review_id;
 select * into request_row from kxra.creative_requests value
 where value.id=variant.request_id;
 select * into membership from kxra.organisation_memberships value
 where value.account_id=auth.uid() and value.org_id=o and value.state='ACTIVE'
  and (value.expires_at is null or value.expires_at>now());
 if export_row.state<>'READY' then reason='EXPORT_NOT_READY';
 elsif membership.id is null then reason='AUTHORITY_CHANGED';
 elsif variant.id is null or variant.content_sha256<>export_row.content_sha256
  or review.id is null or review.variant_id<>variant.id
  or review.variant_sha256<>variant.content_sha256 or review.decision<>'APPROVE_EXPORT'
 then reason='EXPORT_EVIDENCE_CHANGED';
 elsif request_row.id is null
  or not kxra_private.brand_profile_evidence_current(request_row.profile_version_id)
 then reason='SOURCE_EVIDENCE_CHANGED';
 elsif not kxra_private.brand_feature_current('brand.export')
 then reason='ENTITLEMENT_CHANGED';
 else reason='AUTHORIZED';end if;
 if reason<>'AUTHORIZED' then
  insert into kxra.brand_export_deliveries(
   org_id,project_id,export_id,account_id,membership_id,membership_version,
   outcome,reason_code
  ) values(
   o,export_row.project_id,export_row.id,auth.uid(),membership.id,membership.version,
   'WITHHELD',reason
  );
  return query select false,reason,null::text,null::text,null::jsonb,null::text;return;
 end if;
 insert into kxra.brand_export_deliveries(
  org_id,project_id,export_id,account_id,membership_id,membership_version,
  outcome,reason_code
 ) values(
  o,export_row.project_id,export_row.id,auth.uid(),membership.id,membership.version,
  'DELIVERED','AUTHORIZED'
 );
 update kxra.brand_exports set delivered_at=coalesce(delivered_at,now())
 where id=export_row.id;
 insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
 values(o,export_row.project_id,auth.uid(),'EXPORT_DELIVERED',export_row.id,
  jsonb_build_object('format',export_row.export_format));
 return query select true,'AUTHORIZED',export_row.export_format,
  'kxra-brand-'||left(export_row.id::text,8)||case export_row.export_format
   when 'JSON' then '.json' when 'MARKDOWN' then '.md' else '.txt' end,
  variant.content,variant.content_sha256;
end $$;

revoke all on function kxra.revise_brand_source(uuid,integer,text,text,uuid)
from public,anon;
grant execute on function kxra.revise_brand_source(uuid,integer,text,text,uuid)
to authenticated;
revoke all on function kxra_private.brand_profile_evidence_current(uuid),
 kxra_private.guard_current_brand_evidence(),
 kxra_private.guard_current_creative_evidence()
from public,authenticated,anon;

commit;
