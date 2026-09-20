begin;

-- Use the full upload/processing state vocabulary and preserve all prior rows.
alter table kxra.files drop constraint files_lifecycle_state_check;
alter table kxra.file_versions drop constraint file_versions_lifecycle_state_check;
alter table kxra.file_state_events drop constraint file_state_events_to_state_check;

update kxra.files set lifecycle_state='QUARANTINED' where lifecycle_state='QUARANTINE';
update kxra.file_versions set lifecycle_state='QUARANTINED' where lifecycle_state='QUARANTINE';
update kxra.file_state_events set
 from_state=case when from_state='QUARANTINE' then 'QUARANTINED' else from_state end,
 to_state=case when to_state='QUARANTINE' then 'QUARANTINED' else to_state end;

alter table kxra.files add constraint files_lifecycle_state_check check(
 lifecycle_state in (
  'UPLOADING','QUARANTINED','SCANNING','CLEAN','EXTRACTING','EXTRACTED',
  'INDEXING','INDEXED','FAILED','REJECTED','NEEDS_REVIEW'
 )
);
alter table kxra.file_versions add constraint file_versions_lifecycle_state_check check(
 lifecycle_state in (
  'UPLOADING','QUARANTINED','SCANNING','CLEAN','EXTRACTING','EXTRACTED',
  'INDEXING','INDEXED','FAILED','REJECTED','NEEDS_REVIEW'
 )
);
alter table kxra.file_state_events add constraint file_state_events_to_state_check check(
 to_state in (
  'UPLOADING','QUARANTINED','SCANNING','CLEAN','EXTRACTING','EXTRACTED',
  'INDEXING','INDEXED','FAILED','REJECTED','NEEDS_REVIEW'
 )
);

-- An upload request is stable across a client retry. A repeated request returns
-- its original opaque object key only when every immutable property matches.
alter table kxra.file_versions
 add column upload_request_id uuid,
 add column source_record_version integer;
update kxra.file_versions version set
 upload_request_id=gen_random_uuid(),
 source_record_version=record.version
from kxra.records record where record.id=version.record_id;
alter table kxra.file_versions
 alter column upload_request_id set not null,
 alter column source_record_version set not null,
 add constraint file_versions_source_record_version_check check(source_record_version>0),
 add constraint file_versions_upload_request_unique unique(created_by,upload_request_id);

-- Derived evidence carries the exact extraction and source snapshot metadata.
alter table kxra.file_scan_runs add column signature_updated_at timestamptz;
update kxra.file_scan_runs set signature_updated_at=started_at;
alter table kxra.file_scan_runs alter column signature_updated_at set not null;

alter table kxra.knowledge_chunks
 add column source_record_version integer,
 add column page_number integer,
 add column start_offset integer,
 add column end_offset integer,
 add column extraction_adapter text,
 add column extraction_version text,
 add column classification kxra.classification,
 add column audience text;
update kxra.knowledge_chunks chunk set
 source_record_version=record.version,
 start_offset=0,
 end_offset=length(chunk.content),
 extraction_adapter=coalesce((
  select extraction.extractor_adapter from kxra.file_extractions extraction
  where extraction.file_version_id=chunk.file_version_id
  order by extraction.completed_at desc limit 1
 ),'KXRA_LEGACY_EXTRACTOR'),
 extraction_version=coalesce((
  select extraction.extractor_version from kxra.file_extractions extraction
  where extraction.file_version_id=chunk.file_version_id
  order by extraction.completed_at desc limit 1
 ),'1'),
 classification=record.classification,
 audience=record.visibility
from kxra.records record where record.id=chunk.record_id;
alter table kxra.knowledge_chunks
 alter column source_record_version set not null,
 alter column start_offset set not null,
 alter column end_offset set not null,
 alter column extraction_adapter set not null,
 alter column extraction_version set not null,
 alter column classification set not null,
 alter column audience set not null,
 add constraint knowledge_chunks_source_record_version_check check(source_record_version>0),
 add constraint knowledge_chunks_page_number_check check(page_number is null or page_number>0),
 add constraint knowledge_chunks_offsets_check check(start_offset>=0 and end_offset>start_offset),
 add constraint knowledge_chunks_extraction_adapter_check check(length(extraction_adapter) between 1 and 120),
 add constraint knowledge_chunks_extraction_version_check check(length(extraction_version) between 1 and 120),
 add constraint knowledge_chunks_audience_check check(audience in ('owner_only','project_shared'));

drop function kxra.create_file_upload(uuid,text,text,integer,text,text,uuid);
create function kxra.create_file_upload(
 p_project uuid,p_original_filename text,p_content_type text,p_content_length integer,
 p_content_sha256 text,p_file_visibility text,p_request uuid
) returns table(
 file_id uuid,record_id uuid,file_version_id uuid,object_key text,lifecycle_state text
) language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();f uuid=gen_random_uuid();r uuid;v uuid;
 membership kxra.organisation_memberships;safe_name text;key text;
 existing_version kxra.file_versions;existing_file kxra.files;existing_record kxra.records;
begin
 if o is null or p_request is null or not kxra_private.can_project(p_project,true)
  or p_content_length not between 1 and 20971520
  or p_content_sha256!~'^[a-f0-9]{64}$'
  or length(p_content_type) not between 1 and 200
  or p_file_visibility not in ('owner_only','project_shared')
 then raise exception 'File upload unavailable';end if;
 safe_name=trim(p_original_filename);
 if length(safe_name) not between 1 and 240 or safe_name~'[[:cntrl:]/\\]'
 then raise exception 'File upload unavailable';end if;
 select * into membership from kxra.organisation_memberships m
 where m.account_id=auth.uid() and m.org_id=o and m.state='ACTIVE'
  and (m.expires_at is null or m.expires_at>now()) and m.revoked_at is null;
 if not found or (
  membership.security_role not in ('KXRA_OWNER','ORG_ADMIN')
  and p_file_visibility<>'project_shared'
 ) then raise exception 'File upload unavailable';end if;

 select * into existing_version from kxra.file_versions candidate
 where candidate.created_by=auth.uid() and candidate.upload_request_id=p_request;
 if found then
  select * into existing_file from kxra.files candidate where candidate.id=existing_version.file_id;
  select * into existing_record from kxra.records candidate where candidate.id=existing_version.record_id;
  if existing_version.org_id<>o or existing_version.project_id<>p_project
   or existing_version.filename<>safe_name
   or existing_version.declared_mime<>p_content_type
   or existing_version.size_bytes<>p_content_length
   or existing_version.sha256<>p_content_sha256
   or existing_record.visibility<>p_file_visibility
  then raise exception 'File upload unavailable';end if;
  return query select existing_file.id,existing_record.id,existing_version.id,
   existing_version.object_key,existing_version.lifecycle_state;
  return;
 end if;

 if not kxra.consume_rate_limit(
  'file_upload',encode(sha256(convert_to(auth.uid()::text,'UTF8')),'hex'),50,3600
 ) then raise exception 'File upload unavailable';end if;
 key=o::text||'/'||p_project::text||'/'||f::text||'/v1';
 insert into kxra.records(
  org_id,project_id,kind,title,body,classification,visibility,created_by
 ) values(
  o,p_project,'note',safe_name,'File upload is being committed to private storage.',
  'USER-SUPPLIED INFORMATION',p_file_visibility,auth.uid()
 ) returning id into r;
 insert into kxra.files(
  id,org_id,project_id,record_id,filename,object_key,mime_type,size_bytes,
  sha256,scan_status,created_by,current_version,lifecycle_state
 ) values(
  f,o,p_project,r,safe_name,key,p_content_type,p_content_length,p_content_sha256,
  'quarantine',auth.uid(),1,'UPLOADING'
 );
 insert into kxra.file_versions(
  org_id,project_id,file_id,record_id,version,object_key,filename,
  declared_mime,size_bytes,sha256,created_by,upload_request_id,source_record_version,
  lifecycle_state
 ) values(
  o,p_project,f,r,1,key,safe_name,p_content_type,p_content_length,p_content_sha256,
  auth.uid(),p_request,1,'UPLOADING'
 ) returning id into v;
 insert into kxra.file_state_events(
  org_id,project_id,file_id,file_version_id,to_state,reason_code
 ) values(o,p_project,f,v,'UPLOADING','UPLOAD_INTENT_CREATED');
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'file.upload.intent_created',f,jsonb_build_object(
  'project_id',p_project,'record_id',r,'file_version_id',v,'request_id',p_request,
  'visibility',p_file_visibility,'size_bytes',p_content_length
 ));
 return query select f,r,v,key,'UPLOADING'::text;
end $$;

create function kxra.finalize_file_upload(
 p_file uuid,p_request uuid,p_actual_sha256 text,p_actual_bytes integer
) returns text language plpgsql security definer set search_path='' as $$
declare f kxra.files;v kxra.file_versions;
begin
 select * into f from kxra.files candidate where candidate.id=p_file for update;
 if not found then raise exception 'File upload unavailable';end if;
 select * into v from kxra.file_versions candidate
 where candidate.file_id=f.id and candidate.version=f.current_version for update;
 if v.id is null or v.created_by<>auth.uid() or v.upload_request_id<>p_request
  or p_actual_sha256<>v.sha256 or p_actual_bytes<>v.size_bytes
  or not kxra_private.can_project(f.project_id,true)
 then raise exception 'File upload unavailable';end if;
 if v.lifecycle_state='UPLOADING' then
  update kxra.file_versions set lifecycle_state='QUARANTINED',
   state_reason_code='PRIVATE_OBJECT_COMMITTED',state_changed_at=clock_timestamp()
  where id=v.id;
  update kxra.files set lifecycle_state='QUARANTINED',
   state_reason_code='PRIVATE_OBJECT_COMMITTED',state_changed_at=clock_timestamp()
  where id=f.id;
  update kxra.records set body='File is awaiting trusted processing.',updated_at=now()
  where id=f.record_id;
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code
  ) values(f.org_id,f.project_id,f.id,v.id,'UPLOADING','QUARANTINED','PRIVATE_OBJECT_COMMITTED');
  insert into kxra.file_processing_jobs(org_id,project_id,file_id,file_version_id)
  values(f.org_id,f.project_id,f.id,v.id) on conflict(file_version_id) do nothing;
  insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
  values(f.org_id,auth.uid(),'file.upload.committed',f.id,
   jsonb_build_object('file_version_id',v.id,'request_id',p_request));
  return 'QUARANTINED';
 end if;
 if v.lifecycle_state in ('QUARANTINED','SCANNING','CLEAN','EXTRACTING','EXTRACTED','INDEXING','INDEXED')
 then return v.lifecycle_state;end if;
 raise exception 'File upload unavailable';
end $$;

create or replace function kxra_private.claim_file_processing_job(worker text)
returns table(
 job_id uuid,org_id uuid,project_id uuid,file_id uuid,file_version_id uuid,
 object_key text,filename text,declared_mime text,size_bytes integer,sha256 text,
 attempt integer
) language plpgsql security definer set search_path='' as $$
declare claimed kxra.file_processing_jobs;v kxra.file_versions;f kxra.files;prior text;
begin
 if length(trim(worker)) not between 3 and 160 or worker~'[[:cntrl:]]'
 then raise exception 'Worker unavailable';end if;
 update kxra.file_processing_jobs job set
  state='FAILED',lease_expires_at=null,worker_reference=null,
  last_reason_code='RETRY_EXHAUSTED',updated_at=now()
 where job.state in ('PENDING','RETRY') and job.attempts>=job.max_attempts;
 select * into claimed from kxra.file_processing_jobs job
 where (
   job.state in ('PENDING','RETRY') and job.available_at<=now()
  ) or (
   job.state='RUNNING' and job.lease_expires_at<=now() and job.attempts<job.max_attempts
  )
 order by job.available_at,job.created_at,job.id
 for update skip locked limit 1;
 if not found then return;end if;
 update kxra.file_processing_jobs job set
  state='RUNNING',attempts=job.attempts+1,lease_expires_at=now()+interval '5 minutes',
  worker_reference=trim(worker),last_reason_code=null,updated_at=clock_timestamp()
 where job.id=claimed.id returning * into claimed;
 select * into v from kxra.file_versions candidate where candidate.id=claimed.file_version_id for update;
 select * into f from kxra.files candidate where candidate.id=claimed.file_id for update;
 if v.id is null or f.id is null or f.current_version<>v.version
  or v.lifecycle_state not in ('QUARANTINED','FAILED','SCANNING')
 then raise exception 'Worker unavailable';end if;
 if v.lifecycle_state<>'SCANNING' then
  prior=v.lifecycle_state;
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,prior,'SCANNING','TRUSTED_SCAN_STARTED',trim(worker));
  update kxra.file_versions set lifecycle_state='SCANNING',
   state_reason_code='TRUSTED_SCAN_STARTED',state_changed_at=clock_timestamp(),indexed_at=null
  where id=v.id;
  update kxra.files set lifecycle_state='SCANNING',
   state_reason_code='TRUSTED_SCAN_STARTED',state_changed_at=clock_timestamp(),indexed_at=null
  where id=f.id;
 end if;
 return query
 select claimed.id,v.org_id,v.project_id,v.file_id,v.id,v.object_key,v.filename,
  v.declared_mime,v.size_bytes,v.sha256,claimed.attempts;
end $$;

create or replace function kxra_private.complete_file_processing(
 job uuid,worker text,scan_outcome text,detected_type text,actual_hash text,
 scanner_name text,scanner_release text,scan_report jsonb,
 extraction_outcome text,extractor_name text,extractor_release text,
 extracted_hash text,chunks jsonb,reason text,retryable boolean
) returns text language plpgsql security definer set search_path='' as $$
declare j kxra.file_processing_jobs;v kxra.file_versions;f kxra.files;r kxra.records;
 item jsonb;expected_ordinal integer=0;final_state text;chunk_total integer=0;
 character_total integer=0;started timestamptz;signature_time timestamptz;
 previous_offset integer=-1;
begin
 select * into j from kxra.file_processing_jobs candidate where candidate.id=job for update;
 if not found or j.state<>'RUNNING' or j.worker_reference<>trim(worker)
  or j.lease_expires_at<=now()
 then raise exception 'Processing job unavailable';end if;
 started=j.updated_at;
 select * into v from kxra.file_versions candidate where candidate.id=j.file_version_id for update;
 select * into f from kxra.files candidate where candidate.id=j.file_id for update;
 select * into r from kxra.records candidate where candidate.id=v.record_id;
 if v.id is null or f.id is null or r.id is null or f.current_version<>v.version
  or v.lifecycle_state<>'SCANNING'
 then raise exception 'Processing job unavailable';end if;
 if scan_outcome not in ('CLEAN','REJECTED','FAILED')
  or extraction_outcome not in ('SKIPPED','EXTRACTED','FAILED')
  or actual_hash!~'^[a-f0-9]{64}$'
  or length(scanner_name) not between 1 and 120
  or length(scanner_release) not between 1 and 120
  or jsonb_typeof(scan_report)<>'object'
  or jsonb_typeof(chunks)<>'array' or jsonb_array_length(chunks)>500
  or length(trim(worker)) not between 3 and 160
 then raise exception 'Processing result unavailable';end if;
 begin
  signature_time=(scan_report->>'signature_updated_at')::timestamptz;
 exception when others then raise exception 'Processing result unavailable';
 end;
 if signature_time is null or signature_time>clock_timestamp()
 then raise exception 'Processing result unavailable';end if;
 if actual_hash<>v.sha256 then
  scan_outcome='REJECTED';extraction_outcome='SKIPPED';
  reason='CHECKSUM_MISMATCH';retryable=false;
 end if;
 if scan_outcome='CLEAN' and (detected_type is null or length(detected_type) not between 1 and 200)
 then raise exception 'Processing result unavailable';end if;
 if scan_outcome<>'CLEAN' and extraction_outcome<>'SKIPPED'
 then raise exception 'Processing result unavailable';end if;
 if extraction_outcome='EXTRACTED' then
  if scan_outcome<>'CLEAN' or extracted_hash!~'^[a-f0-9]{64}$'
   or jsonb_array_length(chunks)<1 or length(extractor_name) not between 1 and 120
   or length(extractor_release) not between 1 and 120
  then raise exception 'Processing result unavailable';end if;
  for item in select value from jsonb_array_elements(chunks) loop
   if jsonb_typeof(item)<>'object'
    or coalesce(item->>'ordinal','')!~'^[0-9]+$'
    or (item->>'ordinal')::integer<>expected_ordinal
    or coalesce(item->>'start_offset','')!~'^[0-9]+$'
    or coalesce(item->>'end_offset','')!~'^[1-9][0-9]*$'
    or (item->>'start_offset')::integer<=previous_offset
    or (item->>'end_offset')::integer<=(item->>'start_offset')::integer
    or length(coalesce(item->>'content','')) not between 1 and 8000
    or coalesce(item->>'content_sha256','')<>
       encode(sha256(convert_to(item->>'content','UTF8')),'hex')
    or coalesce(item->>'token_estimate','')!~'^[1-9][0-9]*$'
    or (item->>'token_estimate')::integer>4000
   then raise exception 'Processing chunks unavailable';end if;
   previous_offset=(item->>'start_offset')::integer;
   character_total=character_total+length(item->>'content');
   expected_ordinal=expected_ordinal+1;
  end loop;
  chunk_total=expected_ordinal;
 elsif jsonb_array_length(chunks)<>0 then
  raise exception 'Processing chunks unavailable';
 end if;

 insert into kxra.file_scan_runs(
  org_id,project_id,file_id,file_version_id,scanner_adapter,scanner_version,
  outcome,reason_code,detected_mime,actual_sha256,report,started_at,
  signature_updated_at,worker_reference
 ) values(
  v.org_id,v.project_id,v.file_id,v.id,scanner_name,scanner_release,
  scan_outcome,reason,detected_type,actual_hash,scan_report,started,
  signature_time,trim(worker)
 );

 if scan_outcome='CLEAN' then
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,'SCANNING','CLEAN','TRUSTED_SCAN_PASS',trim(worker));
  update kxra.file_versions set lifecycle_state='CLEAN',detected_mime=detected_type,
   state_reason_code='TRUSTED_SCAN_PASS',state_changed_at=clock_timestamp(),indexed_at=null where id=v.id;
  update kxra.files set lifecycle_state='CLEAN',detected_mime=detected_type,
   state_reason_code='TRUSTED_SCAN_PASS',state_changed_at=clock_timestamp(),indexed_at=null,
   scan_status='clean' where id=f.id;
 end if;

 if extraction_outcome in ('EXTRACTED','FAILED') then
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,'CLEAN','EXTRACTING','ISOLATED_EXTRACTION_STARTED',trim(worker));
  update kxra.file_versions set lifecycle_state='EXTRACTING',
   state_reason_code='ISOLATED_EXTRACTION_STARTED',state_changed_at=clock_timestamp() where id=v.id;
  update kxra.files set lifecycle_state='EXTRACTING',
   state_reason_code='ISOLATED_EXTRACTION_STARTED',state_changed_at=clock_timestamp() where id=f.id;
  insert into kxra.file_extractions(
   org_id,project_id,file_id,file_version_id,extractor_adapter,extractor_version,
   outcome,reason_code,extracted_sha256,character_count,chunk_count,
   configuration,started_at,worker_reference
  ) values(
   v.org_id,v.project_id,v.file_id,v.id,extractor_name,extractor_release,
   extraction_outcome,reason,case when extraction_outcome='EXTRACTED' then extracted_hash end,
   character_total,chunk_total,
   jsonb_build_object('max_chunk_chars',1200,'overlap_chars',120),started,trim(worker)
  );
 end if;

 if scan_outcome='CLEAN' and extraction_outcome='EXTRACTED' then
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,'EXTRACTING','EXTRACTED','ISOLATED_EXTRACTION_PASS',trim(worker));
  update kxra.file_versions set lifecycle_state='EXTRACTED',
   state_reason_code='ISOLATED_EXTRACTION_PASS',state_changed_at=clock_timestamp() where id=v.id;
  update kxra.files set lifecycle_state='EXTRACTED',
   state_reason_code='ISOLATED_EXTRACTION_PASS',state_changed_at=clock_timestamp() where id=f.id;
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,'EXTRACTED','INDEXING','VERSIONED_INDEX_STARTED',trim(worker));
  update kxra.file_versions set lifecycle_state='INDEXING',
   state_reason_code='VERSIONED_INDEX_STARTED',state_changed_at=clock_timestamp() where id=v.id;
  update kxra.files set lifecycle_state='INDEXING',
   state_reason_code='VERSIONED_INDEX_STARTED',state_changed_at=clock_timestamp() where id=f.id;
  delete from kxra.knowledge_chunks where file_version_id=v.id;
  for item in select value from jsonb_array_elements(chunks) loop
   insert into kxra.knowledge_chunks(
    org_id,project_id,record_id,file_id,file_version_id,source_version,
    source_record_version,ordinal,page_number,start_offset,end_offset,content,
    content_sha256,token_estimate,extraction_adapter,extraction_version,
    classification,audience
   ) values(
    v.org_id,v.project_id,v.record_id,v.file_id,v.id,v.version,
    v.source_record_version,(item->>'ordinal')::integer,null,
    (item->>'start_offset')::integer,(item->>'end_offset')::integer,
    item->>'content',item->>'content_sha256',(item->>'token_estimate')::integer,
    extractor_name,extractor_release,r.classification,r.visibility
   );
  end loop;
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,'INDEXING','INDEXED','VERSIONED_CHUNKS_INDEXED',trim(worker));
  update kxra.file_versions set lifecycle_state='INDEXED',detected_mime=detected_type,
   state_reason_code='VERSIONED_CHUNKS_INDEXED',state_changed_at=clock_timestamp(),indexed_at=clock_timestamp()
  where id=v.id;
  update kxra.files set lifecycle_state='INDEXED',detected_mime=detected_type,
   state_reason_code='VERSIONED_CHUNKS_INDEXED',state_changed_at=clock_timestamp(),indexed_at=clock_timestamp(),
   scan_status='clean' where id=f.id;
  update kxra.records set body='File passed trusted processing and is indexed.',updated_at=now()
  where id=f.record_id;
  update kxra.file_processing_jobs set state='COMPLETED',lease_expires_at=null,
   worker_reference=null,last_reason_code=null,updated_at=clock_timestamp() where id=j.id;
  final_state='INDEXED';
 elsif scan_outcome='REJECTED' then
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,'SCANNING','REJECTED',coalesce(reason,'SCAN_REJECTED'),trim(worker));
  update kxra.file_versions set lifecycle_state='REJECTED',detected_mime=detected_type,
   state_reason_code=coalesce(reason,'SCAN_REJECTED'),state_changed_at=clock_timestamp(),indexed_at=null where id=v.id;
  update kxra.files set lifecycle_state='REJECTED',detected_mime=detected_type,
   state_reason_code=coalesce(reason,'SCAN_REJECTED'),state_changed_at=clock_timestamp(),indexed_at=null,
   scan_status='rejected' where id=f.id;
  update kxra.records set body='File was rejected by trusted processing.',updated_at=now()
  where id=f.record_id;
  update kxra.file_processing_jobs set state='COMPLETED',lease_expires_at=null,
   worker_reference=null,last_reason_code=coalesce(reason,'SCAN_REJECTED'),updated_at=clock_timestamp() where id=j.id;
  final_state='REJECTED';
 else
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,
   case when scan_outcome='CLEAN' then 'EXTRACTING' else 'SCANNING' end,
   'FAILED',coalesce(reason,'PROCESSING_FAILED'),trim(worker));
  update kxra.file_versions set lifecycle_state='FAILED',detected_mime=detected_type,
   state_reason_code=coalesce(reason,'PROCESSING_FAILED'),state_changed_at=clock_timestamp(),indexed_at=null where id=v.id;
  update kxra.files set lifecycle_state='FAILED',detected_mime=detected_type,
   state_reason_code=coalesce(reason,'PROCESSING_FAILED'),state_changed_at=clock_timestamp(),indexed_at=null,
   scan_status=case when scan_outcome='CLEAN' then 'clean' else 'quarantine' end where id=f.id;
  update kxra.records set body='File processing failed and requires review.',updated_at=now()
  where id=f.record_id;
  update kxra.file_processing_jobs set
   state=case when retryable and attempts<max_attempts then 'RETRY' else 'FAILED' end,
   available_at=case when retryable and attempts<max_attempts
    then now()+make_interval(secs=>least(300,attempts*attempts*5)) else available_at end,
   lease_expires_at=null,worker_reference=null,
   last_reason_code=coalesce(reason,'PROCESSING_FAILED'),updated_at=clock_timestamp()
  where id=j.id;
  final_state='FAILED';
 end if;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,null,'file.processing.'||lower(final_state),v.file_id,
  jsonb_build_object('file_version_id',v.id,'job_id',j.id,'reason_code',reason,
   'chunk_count',chunk_total,'worker_reference',trim(worker)));
 return final_state;
end $$;

revoke all on function kxra.create_file_upload(uuid,text,text,integer,text,text,uuid),
 kxra.finalize_file_upload(uuid,uuid,text,integer)
from public;
grant execute on function kxra.create_file_upload(uuid,text,text,integer,text,text,uuid),
 kxra.finalize_file_upload(uuid,uuid,text,integer)
to authenticated;

commit;
