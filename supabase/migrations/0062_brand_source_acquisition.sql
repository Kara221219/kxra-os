begin;

do $$ begin
 if not exists(select 1 from pg_roles where rolname='kxra_brand_source_worker') then
  create role kxra_brand_source_worker nologin noinherit nobypassrls;
 end if;
end $$;

grant usage on schema kxra,kxra_private to kxra_brand_source_worker;

create table kxra.brand_source_acquisitions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 source_id uuid not null,
 requested_source_version integer not null check(requested_source_version>0),
 requested_by uuid not null references kxra.account_identities(account_id),
 client_request_id uuid not null,
 input_sha256 text not null check(input_sha256~'^[a-f0-9]{64}$'),
 state text not null default 'PENDING'
  check(state in ('PENDING','RUNNING','RETRY','SUCCEEDED','FAILED','CANCELLED')),
 attempts integer not null default 0 check(attempts>=0),
 max_attempts integer not null default 3 check(max_attempts between 1 and 5),
 available_at timestamptz not null default now(),
 lease_expires_at timestamptz,
 worker_reference text,
 final_url text,
 content_type text,
 raw_sha256 text check(raw_sha256 is null or raw_sha256~'^[a-f0-9]{64}$'),
 content_sha256 text check(content_sha256 is null or content_sha256~'^[a-f0-9]{64}$'),
 byte_count integer check(byte_count is null or byte_count between 1 and 1000000),
 redirect_count integer check(redirect_count is null or redirect_count between 0 and 3),
 source_version_id uuid,
 failure_code text check(
  failure_code is null or failure_code~'^[A-Z][A-Z0-9_]{2,79}$'
 ),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(org_id,client_request_id),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,source_id)
  references kxra.brand_sources(org_id,project_id,id),
 foreign key(org_id,project_id,source_version_id)
  references kxra.brand_source_versions(org_id,project_id,id),
 check(
  (state='RUNNING')=(lease_expires_at is not null and worker_reference is not null)
 ),
 check(
  (state in ('SUCCEEDED','FAILED','CANCELLED'))=(completed_at is not null)
 ),
 check(
  state<>'SUCCEEDED' or (
   final_url is not null and content_type is not null and raw_sha256 is not null
   and content_sha256 is not null and byte_count is not null
   and redirect_count is not null and source_version_id is not null
   and failure_code is null
  )
 )
);

create index brand_source_acquisitions_queue
 on kxra.brand_source_acquisitions(state,available_at,created_at,id)
 where state in ('PENDING','RETRY','RUNNING');
create index brand_source_acquisitions_source
 on kxra.brand_source_acquisitions(source_id,created_at desc,id desc);

alter table kxra.brand_source_acquisitions enable row level security;
grant select on kxra.brand_source_acquisitions to authenticated,anon;
create policy brand_source_acquisitions_read
 on kxra.brand_source_acquisitions for select
 using(kxra_private.can_project(project_id,false));

create function kxra.request_brand_source_refresh(
 p_source uuid,p_expected_version integer,p_request uuid
) returns table(acquisition_id uuid,state text,input_sha256 text)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();source_row kxra.brand_sources;
 created kxra.brand_source_acquisitions;existing kxra.brand_source_acquisitions;
 request_hash text;
begin
 select * into source_row from kxra.brand_sources value
 where value.id=p_source for update;
 if o is null or source_row.id is null or source_row.org_id<>o
  or source_row.source_type<>'WEBSITE' or source_row.state<>'ACTIVE'
  or source_row.current_version<>p_expected_version or p_request is null
  or not kxra_private.can_project(source_row.project_id,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or not kxra_private.safe_brand_locator(source_row.locator)
 then raise exception 'Brand source refresh unavailable';end if;
 request_hash=encode(sha256(convert_to(jsonb_build_object(
  'org_id',o,'project_id',source_row.project_id,'source_id',source_row.id,
  'source_version',source_row.current_version,'locator',source_row.locator
 )::text,'UTF8')),'hex');
 insert into kxra.brand_source_acquisitions(
  org_id,project_id,source_id,requested_source_version,requested_by,
  client_request_id,input_sha256
 ) values(
  o,source_row.project_id,source_row.id,source_row.current_version,auth.uid(),
  p_request,request_hash
 ) on conflict(org_id,client_request_id) do nothing returning * into created;
 if created.id is null then
  select * into existing from kxra.brand_source_acquisitions value
  where value.org_id=o and value.client_request_id=p_request;
  if existing.id is null or existing.requested_by<>auth.uid()
   or existing.source_id<>source_row.id
   or existing.requested_source_version<>p_expected_version
   or existing.input_sha256<>request_hash
  then raise exception 'Brand source refresh conflict';end if;
  return query select existing.id,existing.state,existing.input_sha256;return;
 end if;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'brand_source.refresh_requested',created.id,
  jsonb_build_object('project_id',source_row.project_id,'source_id',source_row.id,
   'source_version',source_row.current_version,'input_sha256',request_hash));
 return query select created.id,created.state,created.input_sha256;
end $$;

create function kxra_private.claim_brand_source_acquisition(p_worker text)
returns table(
 acquisition_id uuid,org_id uuid,project_id uuid,source_id uuid,
 requested_source_version integer,requested_by uuid,input_sha256 text,
 locator text,attempt integer
) language plpgsql security definer set search_path='' as $$
declare claimed kxra.brand_source_acquisitions;source_row kxra.brand_sources;
begin
 if length(trim(p_worker)) not between 3 and 160 or p_worker~'[[:cntrl:]]'
 then raise exception 'Brand source worker unavailable';end if;
 update kxra.brand_source_acquisitions job set
  state='FAILED',lease_expires_at=null,worker_reference=null,
  failure_code='RETRY_EXHAUSTED',completed_at=now(),updated_at=now()
 where job.state in ('PENDING','RETRY') and job.attempts>=job.max_attempts;
 select * into claimed from kxra.brand_source_acquisitions job
 where (job.state in ('PENDING','RETRY') and job.available_at<=now())
  or (job.state='RUNNING' and job.lease_expires_at<=now()
   and job.attempts<job.max_attempts)
 order by job.available_at,job.created_at,job.id
 for update skip locked limit 1;
 if not found then return;end if;
 select * into source_row from kxra.brand_sources value
 where value.id=claimed.source_id;
 if source_row.id is null or source_row.state<>'ACTIVE'
  or source_row.source_type<>'WEBSITE'
  or source_row.current_version<>claimed.requested_source_version then
  update kxra.brand_source_acquisitions set state='CANCELLED',
   lease_expires_at=null,worker_reference=null,failure_code='SOURCE_CHANGED',
   completed_at=now(),updated_at=now() where id=claimed.id;
  return;
 end if;
 update kxra.brand_source_acquisitions job set state='RUNNING',
  attempts=job.attempts+1,lease_expires_at=now()+interval '2 minutes',
  worker_reference=trim(p_worker),failure_code=null,updated_at=now()
 where job.id=claimed.id returning * into claimed;
 return query select claimed.id,claimed.org_id,claimed.project_id,claimed.source_id,
  claimed.requested_source_version,claimed.requested_by,claimed.input_sha256,
  source_row.locator,claimed.attempts;
end $$;

create function kxra_private.complete_brand_source_acquisition(
 p_acquisition uuid,p_worker text,p_outcome text,p_final_url text,
 p_content_type text,p_raw_sha256 text,p_content text,p_byte_count integer,
 p_redirect_count integer,p_failure_code text,p_retryable boolean
) returns table(state text,source_version_id uuid,version integer)
language plpgsql security definer set search_path='' as $$
declare job kxra.brand_source_acquisitions;source_row kxra.brand_sources;
 created_version kxra.brand_source_versions;content_hash text;next_version integer;
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
 insert into kxra.brand_source_versions(
  org_id,project_id,source_id,version,supplied_content,content_sha256,
  fetch_state,security_result,source_classification,created_by
 ) values(
  job.org_id,job.project_id,job.source_id,next_version,trim(p_content),content_hash,
  'FETCHED','PASSED','EXTERNAL RESEARCH',job.requested_by
 ) returning * into created_version;
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

revoke all on function kxra.request_brand_source_refresh(uuid,integer,uuid)
from public,anon;
grant execute on function kxra.request_brand_source_refresh(uuid,integer,uuid)
to authenticated;

revoke all on function kxra_private.claim_brand_source_acquisition(text),
 kxra_private.complete_brand_source_acquisition(
  uuid,text,text,text,text,text,text,integer,integer,text,boolean
 ) from public,authenticated,anon;
grant execute on function kxra_private.claim_brand_source_acquisition(text),
 kxra_private.complete_brand_source_acquisition(
  uuid,text,text,text,text,text,text,integer,integer,text,boolean
 ) to kxra_brand_source_worker;

commit;
