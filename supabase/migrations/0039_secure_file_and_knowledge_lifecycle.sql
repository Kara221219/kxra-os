begin;

-- Milestone 4/5 foundation. Object bytes remain outside PostgreSQL, but every
-- immutable object version, state transition, derived chunk and delivery is
-- bound to the same organisation/project/record authorization chain.
do $$
begin
 if not exists(select 1 from pg_roles where rolname='kxra_worker') then
  create role kxra_worker nologin noinherit nobypassrls;
 end if;
end $$;
grant usage on schema kxra,kxra_private to kxra_worker;

alter table kxra.files
 add column current_version integer not null default 1 check(current_version>0),
 add column lifecycle_state text not null default 'QUARANTINE'
  check(lifecycle_state in ('QUARANTINE','CLEAN','EXTRACTED','INDEXED','FAILED','REJECTED')),
 add column state_reason_code text,
 add column detected_mime text,
 add column state_changed_at timestamptz not null default now(),
 add column indexed_at timestamptz,
 add constraint files_scope_id_unique unique(org_id,project_id,id),
 add constraint files_indexed_consistency check(
  (lifecycle_state='INDEXED')=(indexed_at is not null)
 );

create table kxra.file_versions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 file_id uuid not null,
 record_id uuid not null,
 version integer not null check(version>0),
 object_key text not null unique check(
  length(object_key) between 20 and 500
  and object_key!~'(^|/)\.\.(/|$)'
  and object_key!~'[[:cntrl:]\\]'
 ),
 filename text not null check(length(filename) between 1 and 240),
 declared_mime text not null check(length(declared_mime) between 1 and 200),
 detected_mime text check(detected_mime is null or length(detected_mime) between 1 and 200),
 size_bytes integer not null check(size_bytes between 1 and 20971520),
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 lifecycle_state text not null default 'QUARANTINE'
  check(lifecycle_state in ('QUARANTINE','CLEAN','EXTRACTED','INDEXED','FAILED','REJECTED')),
 state_reason_code text,
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 state_changed_at timestamptz not null default now(),
 indexed_at timestamptz,
 unique(file_id,version),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,file_id) references kxra.files(org_id,project_id,id),
 foreign key(org_id,project_id,record_id) references kxra.records(org_id,project_id,id),
 check((lifecycle_state='INDEXED')=(indexed_at is not null))
);
create index file_versions_scope on kxra.file_versions(org_id,project_id,file_id,version desc);

create table kxra.file_state_events(
 id bigint generated always as identity primary key,
 org_id uuid not null,
 project_id uuid not null,
 file_id uuid not null,
 file_version_id uuid not null,
 from_state text,
 to_state text not null check(to_state in ('QUARANTINE','CLEAN','EXTRACTED','INDEXED','FAILED','REJECTED')),
 reason_code text,
 worker_reference text,
 created_at timestamptz not null default now(),
 foreign key(org_id,project_id,file_id) references kxra.files(org_id,project_id,id),
 foreign key(org_id,project_id,file_version_id) references kxra.file_versions(org_id,project_id,id)
);

create table kxra.file_scan_runs(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 file_id uuid not null,
 file_version_id uuid not null,
 scanner_adapter text not null check(length(scanner_adapter) between 1 and 120),
 scanner_version text not null check(length(scanner_version) between 1 and 120),
 outcome text not null check(outcome in ('CLEAN','REJECTED','FAILED')),
 reason_code text,
 detected_mime text,
 actual_sha256 text check(actual_sha256 is null or actual_sha256~'^[a-f0-9]{64}$'),
 report jsonb not null default '{}'::jsonb check(jsonb_typeof(report)='object'),
 started_at timestamptz not null,
 completed_at timestamptz not null default now(),
 worker_reference text not null check(length(worker_reference) between 1 and 160),
 check(completed_at>=started_at),
 foreign key(org_id,project_id,file_id) references kxra.files(org_id,project_id,id),
 foreign key(org_id,project_id,file_version_id) references kxra.file_versions(org_id,project_id,id)
);
create index file_scan_runs_version on kxra.file_scan_runs(file_version_id,completed_at desc);

create table kxra.file_extractions(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 file_id uuid not null,
 file_version_id uuid not null,
 extractor_adapter text not null check(length(extractor_adapter) between 1 and 120),
 extractor_version text not null check(length(extractor_version) between 1 and 120),
 outcome text not null check(outcome in ('EXTRACTED','FAILED')),
 reason_code text,
 extracted_sha256 text check(extracted_sha256 is null or extracted_sha256~'^[a-f0-9]{64}$'),
 character_count integer not null default 0 check(character_count>=0),
 chunk_count integer not null default 0 check(chunk_count>=0),
 configuration jsonb not null default '{}'::jsonb check(jsonb_typeof(configuration)='object'),
 started_at timestamptz not null,
 completed_at timestamptz not null default now(),
 worker_reference text not null check(length(worker_reference) between 1 and 160),
 check(completed_at>=started_at),
 foreign key(org_id,project_id,file_id) references kxra.files(org_id,project_id,id),
 foreign key(org_id,project_id,file_version_id) references kxra.file_versions(org_id,project_id,id)
);

create table kxra.knowledge_chunks(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 record_id uuid not null,
 file_id uuid not null,
 file_version_id uuid not null,
 source_version integer not null check(source_version>0),
 ordinal integer not null check(ordinal>=0),
 content text not null check(length(content) between 1 and 8000),
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 token_estimate integer not null check(token_estimate between 1 and 4000),
 created_at timestamptz not null default now(),
 search_document tsvector generated always as (to_tsvector('english',content)) stored,
 unique(file_version_id,ordinal),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id,record_id) references kxra.records(org_id,project_id,id),
 foreign key(org_id,project_id,file_id) references kxra.files(org_id,project_id,id),
 foreign key(org_id,project_id,file_version_id) references kxra.file_versions(org_id,project_id,id)
);
create index knowledge_chunks_search on kxra.knowledge_chunks using gin(search_document);
create index knowledge_chunks_scope on kxra.knowledge_chunks(org_id,project_id,file_id,source_version);

create table kxra.file_processing_jobs(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 file_id uuid not null,
 file_version_id uuid not null unique,
 state text not null default 'PENDING'
  check(state in ('PENDING','RUNNING','RETRY','COMPLETED','FAILED','CANCELLED')),
 attempts integer not null default 0 check(attempts between 0 and 10),
 max_attempts integer not null default 3 check(max_attempts between 1 and 10),
 available_at timestamptz not null default now(),
 lease_expires_at timestamptz,
 worker_reference text,
 last_reason_code text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(org_id,project_id,file_id) references kxra.files(org_id,project_id,id),
 foreign key(org_id,project_id,file_version_id) references kxra.file_versions(org_id,project_id,id),
 check((state='RUNNING')=(lease_expires_at is not null))
);
create index file_processing_jobs_claim on kxra.file_processing_jobs(state,available_at,created_at);

create table kxra.file_delivery_events(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null,
 org_id uuid not null,
 project_id uuid not null,
 file_id uuid not null,
 file_version_id uuid not null,
 account_id uuid not null references kxra.account_identities(account_id),
 membership_id uuid not null references kxra.organisation_memberships(id),
 membership_version integer not null check(membership_version>0),
 state text not null check(state in ('AUTHORIZED','DELIVERED','WITHHELD','FAILED')),
 reason_code text,
 delivered_bytes integer check(delivered_bytes is null or delivered_bytes>=0),
 authorized_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(account_id,request_id),
 foreign key(org_id,project_id,file_id) references kxra.files(org_id,project_id,id),
 foreign key(org_id,project_id,file_version_id) references kxra.file_versions(org_id,project_id,id)
);

create table kxra.knowledge_query_runs(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null,
 org_id uuid not null,
 project_id uuid not null,
 account_id uuid not null references kxra.account_identities(account_id),
 membership_id uuid not null references kxra.organisation_memberships(id),
 membership_version integer not null check(membership_version>0),
 query_sha256 text not null check(query_sha256~'^[a-f0-9]{64}$'),
 query_classification text not null check(query_classification in ('PROJECT_EVIDENCE','PROJECT_STATUS','RESEARCH')),
 mode text not null default 'EVIDENCE_ONLY' check(mode in ('EVIDENCE_ONLY','MODEL')),
 model_policy_version integer not null default 1 check(model_policy_version>0),
 state text not null default 'RETRIEVING'
  check(state in ('RETRIEVING','DELIVERED','EMPTY','WITHHELD','FAILED')),
 evidence_refs jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence_refs)='array'),
 failure_code text,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(account_id,request_id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id)
);

create table kxra.object_reconciliation_runs(
 id uuid primary key default gen_random_uuid(),
 started_at timestamptz not null default now(),
 completed_at timestamptz,
 adapter text not null check(length(adapter) between 1 and 120),
 state text not null default 'RUNNING' check(state in ('RUNNING','COMPLETED','FAILED')),
 expected_count integer not null default 0 check(expected_count>=0),
 observed_count integer not null default 0 check(observed_count>=0),
 recovered_count integer not null default 0 check(recovered_count>=0),
 quarantined_count integer not null default 0 check(quarantined_count>=0),
 mismatch_count integer not null default 0 check(mismatch_count>=0),
 failure_code text,
 worker_reference text not null check(length(worker_reference) between 1 and 160)
);

create table kxra.object_reconciliation_items(
 id bigint generated always as identity primary key,
 run_id uuid not null references kxra.object_reconciliation_runs(id),
 org_id uuid,
 project_id uuid,
 file_id uuid,
 file_version_id uuid,
 object_key text not null check(length(object_key) between 1 and 500),
 observed_sha256 text check(observed_sha256 is null or observed_sha256~'^[a-f0-9]{64}$'),
 outcome text not null check(outcome in (
  'VERIFIED','RECOVERED_FROM_ORPHAN','QUARANTINED_ORPHAN','MISSING','HASH_MISMATCH'
 )),
 created_at timestamptz not null default now(),
 foreign key(org_id,project_id,file_id) references kxra.files(org_id,project_id,id),
 foreign key(org_id,project_id,file_version_id) references kxra.file_versions(org_id,project_id,id)
);

create function kxra_private.file_parent_allowed(parent_record uuid,parent_file uuid,parent_version uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select kxra_private.can_record(parent_record) and exists(
  select 1 from kxra.files f join kxra.file_versions v
   on v.file_id=f.id and v.id=parent_version and v.org_id=f.org_id and v.project_id=f.project_id
  where f.id=parent_file and f.record_id=parent_record
 )
$$;

alter table kxra.file_versions enable row level security;
alter table kxra.file_state_events enable row level security;
alter table kxra.file_scan_runs enable row level security;
alter table kxra.file_extractions enable row level security;
alter table kxra.knowledge_chunks enable row level security;
alter table kxra.file_processing_jobs enable row level security;
alter table kxra.file_delivery_events enable row level security;
alter table kxra.knowledge_query_runs enable row level security;
alter table kxra.object_reconciliation_runs enable row level security;
alter table kxra.object_reconciliation_items enable row level security;

grant select on kxra.file_versions,kxra.file_state_events,kxra.file_scan_runs,
 kxra.file_extractions,kxra.knowledge_chunks,kxra.file_processing_jobs,
 kxra.file_delivery_events,kxra.knowledge_query_runs,
 kxra.object_reconciliation_runs,kxra.object_reconciliation_items
to authenticated,anon;

create policy file_versions_read on kxra.file_versions for select using(
 kxra_private.can_record(record_id)
);
create policy file_state_events_read on kxra.file_state_events for select using(
 exists(select 1 from kxra.files f where f.id=file_state_events.file_id and kxra_private.can_record(f.record_id))
);
create policy file_scan_runs_read on kxra.file_scan_runs for select using(
 exists(select 1 from kxra.files f where f.id=file_scan_runs.file_id and kxra_private.can_record(f.record_id))
);
create policy file_extractions_read on kxra.file_extractions for select using(
 exists(select 1 from kxra.files f where f.id=file_extractions.file_id and kxra_private.can_record(f.record_id))
);
create policy knowledge_chunks_read on kxra.knowledge_chunks for select using(
 kxra_private.file_parent_allowed(record_id,file_id,file_version_id)
 and exists(
  select 1 from kxra.files f join kxra.file_versions v
   on v.id=knowledge_chunks.file_version_id and v.file_id=f.id
  where f.id=knowledge_chunks.file_id and f.current_version=knowledge_chunks.source_version
   and f.lifecycle_state='INDEXED' and v.lifecycle_state='INDEXED'
 )
);
create policy file_processing_jobs_read on kxra.file_processing_jobs for select using(
 kxra_private.is_owner(org_id)
);
create policy file_delivery_events_read on kxra.file_delivery_events for select using(
 account_id=auth.uid() or kxra_private.is_owner(org_id)
);
create policy knowledge_query_runs_read on kxra.knowledge_query_runs for select using(
 account_id=auth.uid() or kxra_private.is_owner(org_id)
);
create policy object_reconciliation_runs_read on kxra.object_reconciliation_runs for select using(
 kxra_private.is_platform_owner()
);
create policy object_reconciliation_items_read on kxra.object_reconciliation_items for select using(
 kxra_private.is_platform_owner()
);

-- Metadata creation is the only browser-reachable write. Object identity is
-- derived here; callers cannot choose a storage key or processing authority.
create function kxra.create_file_upload(
 project uuid,original_filename text,content_type text,content_length integer,
 content_sha256 text,file_visibility text,request uuid
) returns table(
 file_id uuid,record_id uuid,file_version_id uuid,object_key text,lifecycle_state text
) language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();f uuid=gen_random_uuid();r uuid;v uuid;
 membership kxra.organisation_memberships;safe_name text;key text;
begin
 if o is null or request is null or not kxra_private.can_project(project,true)
  or content_length not between 1 and 20971520
  or content_sha256!~'^[a-f0-9]{64}$'
  or length(content_type) not between 1 and 200
  or file_visibility not in ('owner_only','project_shared')
 then raise exception 'File upload unavailable';end if;
 safe_name=trim(original_filename);
 if length(safe_name) not between 1 and 240 or safe_name~'[[:cntrl:]/\\]'
 then raise exception 'File upload unavailable';end if;
 select * into membership from kxra.organisation_memberships m
 where m.account_id=auth.uid() and m.org_id=o and m.state='ACTIVE'
  and (m.expires_at is null or m.expires_at>now()) and m.revoked_at is null;
 if not found or (
  membership.security_role not in ('KXRA_OWNER','ORG_ADMIN')
  and file_visibility<>'project_shared'
 ) then raise exception 'File upload unavailable';end if;
 if not kxra.consume_rate_limit(
  'file_upload',encode(sha256(convert_to(auth.uid()::text,'UTF8')),'hex'),50,3600
 ) then raise exception 'File upload unavailable';end if;
 key=o::text||'/'||project::text||'/'||f::text||'/v1';
 insert into kxra.records(
  org_id,project_id,kind,title,body,classification,visibility,created_by
 ) values(
  o,project,'note',safe_name,'File is awaiting trusted processing.',
  'USER-SUPPLIED INFORMATION',file_visibility,auth.uid()
 ) returning id into r;
 insert into kxra.files(
  id,org_id,project_id,record_id,filename,object_key,mime_type,size_bytes,
  sha256,scan_status,created_by,current_version,lifecycle_state
 ) values(
  f,o,project,r,safe_name,key,content_type,content_length,content_sha256,
  'quarantine',auth.uid(),1,'QUARANTINE'
 );
 insert into kxra.file_versions(
  org_id,project_id,file_id,record_id,version,object_key,filename,
  declared_mime,size_bytes,sha256,created_by
 ) values(
  o,project,f,r,1,key,safe_name,content_type,content_length,content_sha256,auth.uid()
 ) returning id into v;
 insert into kxra.file_state_events(
  org_id,project_id,file_id,file_version_id,to_state,reason_code
 ) values(o,project,f,v,'QUARANTINE','UPLOAD_ACCEPTED');
 insert into kxra.file_processing_jobs(org_id,project_id,file_id,file_version_id)
 values(o,project,f,v);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'file.upload.created',f,jsonb_build_object(
  'project_id',project,'record_id',r,'file_version_id',v,'request_id',request,
  'visibility',file_visibility,'size_bytes',content_length
 ));
 return query select f,r,v,key,'QUARANTINE'::text;
end $$;

create function kxra.authorize_file_delivery(file uuid,request uuid)
returns table(
 delivery_id uuid,file_version_id uuid,object_key text,filename text,
 mime_type text,size_bytes integer,sha256 text
) language plpgsql security definer set search_path='' as $$
declare f kxra.files;v kxra.file_versions;m kxra.organisation_memberships;event uuid;
begin
 if request is null then return;end if;
 select * into f from kxra.files candidate where candidate.id=file;
 if not found or f.lifecycle_state<>'INDEXED' or not kxra_private.can_record(f.record_id)
 then return;end if;
 select * into v from kxra.file_versions candidate
 where candidate.file_id=f.id and candidate.version=f.current_version
  and candidate.lifecycle_state='INDEXED';
 select * into m from kxra.organisation_memberships membership
 where membership.account_id=auth.uid() and membership.org_id=f.org_id
  and membership.state='ACTIVE' and membership.revoked_at is null
  and (membership.expires_at is null or membership.expires_at>now());
 if v.id is null or m.id is null then return;end if;
 insert into kxra.file_delivery_events(
  request_id,org_id,project_id,file_id,file_version_id,account_id,
  membership_id,membership_version,state
 ) values(request,f.org_id,f.project_id,f.id,v.id,auth.uid(),m.id,m.version,'AUTHORIZED')
 returning id into event;
 return query select event,v.id,v.object_key,v.filename,v.detected_mime,
  v.size_bytes,v.sha256;
end $$;

create function kxra.complete_file_delivery(
 delivery uuid,actual_sha256 text,actual_bytes integer
) returns boolean language plpgsql security definer set search_path='' as $$
declare event kxra.file_delivery_events;f kxra.files;v kxra.file_versions;
 current_membership kxra.organisation_memberships;allowed boolean=false;reason text;
begin
 select * into event from kxra.file_delivery_events e where e.id=delivery for update;
 if not found or event.account_id<>auth.uid() or event.state<>'AUTHORIZED'
 then return false;end if;
 select * into f from kxra.files where id=event.file_id;
 select * into v from kxra.file_versions where id=event.file_version_id;
 select * into current_membership from kxra.organisation_memberships m
 where m.id=event.membership_id and m.account_id=auth.uid() and m.org_id=event.org_id
  and m.state='ACTIVE' and m.revoked_at is null
  and (m.expires_at is null or m.expires_at>now());
 allowed=current_membership.id is not null
  and current_membership.version=event.membership_version
  and f.id is not null and f.current_version=v.version
  and f.lifecycle_state='INDEXED' and v.lifecycle_state='INDEXED'
  and actual_sha256=v.sha256 and actual_bytes=v.size_bytes
  and kxra_private.can_record(f.record_id);
 reason=case
  when current_membership.id is null or current_membership.version<>event.membership_version
   then 'AUTHORITY_CHANGED'
  when actual_sha256 is distinct from v.sha256 or actual_bytes is distinct from v.size_bytes
   then 'OBJECT_MISMATCH'
  when f.lifecycle_state is distinct from 'INDEXED' or v.lifecycle_state is distinct from 'INDEXED'
   then 'STATE_CHANGED'
  else 'ACCESS_WITHHELD' end;
 update kxra.file_delivery_events set
  state=case when allowed then 'DELIVERED' else 'WITHHELD' end,
  reason_code=case when allowed then null else reason end,
  delivered_bytes=case when allowed then actual_bytes else null end,
  completed_at=now()
 where id=event.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(event.org_id,auth.uid(),case when allowed then 'file.delivered' else 'file.withheld' end,
  event.file_id,jsonb_build_object('delivery_id',event.id,'reason_code',case when allowed then null else reason end));
 return allowed;
end $$;

create function kxra.begin_knowledge_query(
 project uuid,request uuid,query_hash text,classification text
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();m kxra.organisation_memberships;run uuid;
begin
 if request is null or query_hash!~'^[a-f0-9]{64}$'
  or classification not in ('PROJECT_EVIDENCE','PROJECT_STATUS','RESEARCH')
  or not kxra_private.can_project(project,false)
 then raise exception 'Knowledge query unavailable';end if;
 select * into m from kxra.organisation_memberships membership
 where membership.account_id=auth.uid() and membership.org_id=o
  and membership.state='ACTIVE' and membership.revoked_at is null
  and (membership.expires_at is null or membership.expires_at>now());
 if not found then raise exception 'Knowledge query unavailable';end if;
 insert into kxra.knowledge_query_runs(
  request_id,org_id,project_id,account_id,membership_id,membership_version,
  query_sha256,query_classification
 ) values(request,o,project,auth.uid(),m.id,m.version,query_hash,classification)
 returning id into run;
 return run;
end $$;

create function kxra.complete_knowledge_query(
 run uuid,evidence_references jsonb,result_state text,failure text default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare q kxra.knowledge_query_runs;m kxra.organisation_memberships;item jsonb;
 valid boolean=true;delivered_state text;
begin
 select * into q from kxra.knowledge_query_runs candidate where candidate.id=run for update;
 if not found or q.account_id<>auth.uid() or q.state<>'RETRIEVING'
  or jsonb_typeof(evidence_references)<>'array' or jsonb_array_length(evidence_references)>50
  or result_state not in ('DELIVERED','EMPTY','FAILED')
 then return false;end if;
 select * into m from kxra.organisation_memberships membership
 where membership.id=q.membership_id and membership.account_id=auth.uid()
  and membership.org_id=q.org_id and membership.state='ACTIVE'
  and membership.revoked_at is null
  and (membership.expires_at is null or membership.expires_at>now());
 valid=m.id is not null and m.version=q.membership_version
  and kxra_private.can_project(q.project_id,false);
 if result_state='EMPTY' and jsonb_array_length(evidence_references)<>0 then valid=false;end if;
 if result_state='DELIVERED' and jsonb_array_length(evidence_references)=0 then valid=false;end if;
 if valid then
  for item in select value from jsonb_array_elements(evidence_references) loop
   if jsonb_typeof(item)<>'object' or item->>'type' not in ('RECORD','CHUNK')
    or coalesce(item->>'id','')!~'^[0-9a-fA-F-]{36}$'
    or coalesce(item->>'version','')!~'^[1-9][0-9]*$'
   then valid=false;exit;end if;
   if item->>'type'='RECORD' then
    valid=exists(
     select 1 from kxra.records r where r.id=(item->>'id')::uuid
      and r.project_id=q.project_id and r.version=(item->>'version')::integer
      and kxra_private.can_record(r.id)
    );
   else
    valid=exists(
     select 1 from kxra.knowledge_chunks c
     join kxra.file_versions v on v.id=c.file_version_id
     join kxra.files f on f.id=c.file_id
     where c.id=(item->>'id')::uuid and c.project_id=q.project_id
      and c.source_version=(item->>'version')::integer
      and v.lifecycle_state='INDEXED' and f.lifecycle_state='INDEXED'
      and f.current_version=c.source_version and kxra_private.can_record(c.record_id)
    );
   end if;
   if not valid then exit;end if;
  end loop;
 end if;
 delivered_state=case
  when not valid then 'WITHHELD'
  when result_state='FAILED' then 'FAILED'
  else result_state end;
 update kxra.knowledge_query_runs set
  state=delivered_state,evidence_refs=case when valid then evidence_references else '[]'::jsonb end,
  failure_code=case when valid then failure else 'AUTHORITY_OR_EVIDENCE_CHANGED' end,
  completed_at=now()
 where id=q.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(q.org_id,auth.uid(),'knowledge.query.'||lower(delivered_state),q.id,
  jsonb_build_object('project_id',q.project_id,'evidence_count',case when valid then jsonb_array_length(evidence_references) else 0 end));
 return valid;
end $$;

revoke insert on kxra.files from authenticated;
drop policy if exists files_insert on kxra.files;
create policy files_insert_disabled on kxra.files for insert with check(false);

revoke all on function kxra_private.file_parent_allowed(uuid,uuid,uuid)
from public,authenticated,anon;
grant execute on function kxra_private.file_parent_allowed(uuid,uuid,uuid)
to authenticated,anon;

revoke all on function kxra.create_file_upload(uuid,text,text,integer,text,text,uuid),
 kxra.authorize_file_delivery(uuid,uuid),
 kxra.complete_file_delivery(uuid,text,integer),
 kxra.begin_knowledge_query(uuid,uuid,text,text),
 kxra.complete_knowledge_query(uuid,jsonb,text,text)
from public;
grant execute on function kxra.create_file_upload(uuid,text,text,integer,text,text,uuid),
 kxra.authorize_file_delivery(uuid,uuid),
 kxra.complete_file_delivery(uuid,text,integer),
 kxra.begin_knowledge_query(uuid,uuid,text,text),
 kxra.complete_knowledge_query(uuid,jsonb,text,text)
to authenticated;

commit;
