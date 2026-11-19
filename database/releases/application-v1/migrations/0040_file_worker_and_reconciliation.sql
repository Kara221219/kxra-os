begin;

create function kxra_private.claim_file_processing_job(worker text)
returns table(
 job_id uuid,org_id uuid,project_id uuid,file_id uuid,file_version_id uuid,
 object_key text,filename text,declared_mime text,size_bytes integer,sha256 text,
 attempt integer
) language plpgsql security definer set search_path='' as $$
declare claimed kxra.file_processing_jobs;
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
  worker_reference=trim(worker),last_reason_code=null,updated_at=now()
 where job.id=claimed.id returning * into claimed;
 return query
 select claimed.id,v.org_id,v.project_id,v.file_id,v.id,v.object_key,v.filename,
  v.declared_mime,v.size_bytes,v.sha256,claimed.attempts
 from kxra.file_versions v where v.id=claimed.file_version_id;
end $$;

create function kxra_private.complete_file_processing(
 job uuid,worker text,scan_outcome text,detected_type text,actual_hash text,
 scanner_name text,scanner_release text,scan_report jsonb,
 extraction_outcome text,extractor_name text,extractor_release text,
 extracted_hash text,chunks jsonb,reason text,retryable boolean
) returns text language plpgsql security definer set search_path='' as $$
declare j kxra.file_processing_jobs;v kxra.file_versions;f kxra.files;
 item jsonb;expected_ordinal integer=0;final_state text;chunk_total integer=0;
 character_total integer=0;started timestamptz=clock_timestamp();
begin
 select * into j from kxra.file_processing_jobs candidate where candidate.id=job for update;
 if not found or j.state<>'RUNNING' or j.worker_reference<>trim(worker)
  or j.lease_expires_at<=now()
 then raise exception 'Processing job unavailable';end if;
 select * into v from kxra.file_versions candidate where candidate.id=j.file_version_id for update;
 select * into f from kxra.files candidate where candidate.id=j.file_id for update;
 if v.id is null or f.id is null or f.current_version<>v.version
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
    or length(coalesce(item->>'content','')) not between 1 and 8000
    or coalesce(item->>'content_sha256','')<>
       encode(sha256(convert_to(item->>'content','UTF8')),'hex')
    or coalesce(item->>'token_estimate','')!~'^[1-9][0-9]*$'
    or (item->>'token_estimate')::integer>4000
   then raise exception 'Processing chunks unavailable';end if;
   character_total=character_total+length(item->>'content');
   expected_ordinal=expected_ordinal+1;
  end loop;
  chunk_total=expected_ordinal;
 elsif jsonb_array_length(chunks)<>0 then
  raise exception 'Processing chunks unavailable';
 end if;

 insert into kxra.file_scan_runs(
  org_id,project_id,file_id,file_version_id,scanner_adapter,scanner_version,
  outcome,reason_code,detected_mime,actual_sha256,report,started_at,worker_reference
 ) values(
  v.org_id,v.project_id,v.file_id,v.id,scanner_name,scanner_release,
  scan_outcome,reason,detected_type,actual_hash,scan_report,started,trim(worker)
 );

 if scan_outcome='CLEAN' then
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,v.lifecycle_state,'CLEAN','TRUSTED_SCAN_PASS',trim(worker));
  update kxra.file_versions set lifecycle_state='CLEAN',detected_mime=detected_type,
   state_reason_code='TRUSTED_SCAN_PASS',state_changed_at=now(),indexed_at=null where id=v.id;
  update kxra.files set lifecycle_state='CLEAN',detected_mime=detected_type,
   state_reason_code='TRUSTED_SCAN_PASS',state_changed_at=now(),indexed_at=null,
   scan_status='clean' where id=f.id;
 end if;

 if extraction_outcome in ('EXTRACTED','FAILED') then
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
  delete from kxra.knowledge_chunks where file_version_id=v.id;
  for item in select value from jsonb_array_elements(chunks) loop
   insert into kxra.knowledge_chunks(
    org_id,project_id,record_id,file_id,file_version_id,source_version,
    ordinal,content,content_sha256,token_estimate
   ) values(
    v.org_id,v.project_id,v.record_id,v.file_id,v.id,v.version,
    (item->>'ordinal')::integer,item->>'content',item->>'content_sha256',
    (item->>'token_estimate')::integer
   );
  end loop;
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,'CLEAN','EXTRACTED','ISOLATED_EXTRACTION_PASS',trim(worker));
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,'EXTRACTED','INDEXED','VERSIONED_CHUNKS_INDEXED',trim(worker));
  update kxra.file_versions set lifecycle_state='INDEXED',detected_mime=detected_type,
   state_reason_code='VERSIONED_CHUNKS_INDEXED',state_changed_at=now(),indexed_at=now()
  where id=v.id;
  update kxra.files set lifecycle_state='INDEXED',detected_mime=detected_type,
   state_reason_code='VERSIONED_CHUNKS_INDEXED',state_changed_at=now(),indexed_at=now(),
   scan_status='clean' where id=f.id;
  update kxra.file_processing_jobs set state='COMPLETED',lease_expires_at=null,
   worker_reference=null,last_reason_code=null,updated_at=now() where id=j.id;
  final_state='INDEXED';
 elsif scan_outcome='REJECTED' then
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,v.lifecycle_state,'REJECTED',coalesce(reason,'SCAN_REJECTED'),trim(worker));
  update kxra.file_versions set lifecycle_state='REJECTED',detected_mime=detected_type,
   state_reason_code=coalesce(reason,'SCAN_REJECTED'),state_changed_at=now(),indexed_at=null where id=v.id;
  update kxra.files set lifecycle_state='REJECTED',detected_mime=detected_type,
   state_reason_code=coalesce(reason,'SCAN_REJECTED'),state_changed_at=now(),indexed_at=null,
   scan_status='rejected' where id=f.id;
  update kxra.file_processing_jobs set state='COMPLETED',lease_expires_at=null,
   worker_reference=null,last_reason_code=coalesce(reason,'SCAN_REJECTED'),updated_at=now() where id=j.id;
  final_state='REJECTED';
 else
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,
   case when scan_outcome='CLEAN' then 'CLEAN' else v.lifecycle_state end,
   'FAILED',coalesce(reason,'PROCESSING_FAILED'),trim(worker));
  update kxra.file_versions set lifecycle_state='FAILED',detected_mime=detected_type,
   state_reason_code=coalesce(reason,'PROCESSING_FAILED'),state_changed_at=now(),indexed_at=null where id=v.id;
  update kxra.files set lifecycle_state='FAILED',detected_mime=detected_type,
   state_reason_code=coalesce(reason,'PROCESSING_FAILED'),state_changed_at=now(),indexed_at=null,
   scan_status=case when scan_outcome='CLEAN' then 'clean' else 'quarantine' end where id=f.id;
  update kxra.file_processing_jobs set
   state=case when retryable and attempts<max_attempts then 'RETRY' else 'FAILED' end,
   available_at=case when retryable and attempts<max_attempts
    then now()+make_interval(secs=>least(300,attempts*attempts*5)) else available_at end,
   lease_expires_at=null,worker_reference=null,
   last_reason_code=coalesce(reason,'PROCESSING_FAILED'),updated_at=now()
  where id=j.id;
  final_state='FAILED';
 end if;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,null,'file.processing.'||lower(final_state),v.file_id,
  jsonb_build_object('file_version_id',v.id,'job_id',j.id,'reason_code',reason,
   'chunk_count',chunk_total,'worker_reference',trim(worker)));
 return final_state;
end $$;

create function kxra_private.expected_file_objects()
returns table(
 org_id uuid,project_id uuid,file_id uuid,file_version_id uuid,
 object_key text,sha256 text,size_bytes integer,lifecycle_state text
) language sql stable security definer set search_path='' as $$
 select v.org_id,v.project_id,v.file_id,v.id,v.object_key,v.sha256,v.size_bytes,v.lifecycle_state
 from kxra.file_versions v order by v.object_key
$$;

create function kxra_private.begin_object_reconciliation(
 adapter_name text,worker text
) returns uuid language plpgsql security definer set search_path='' as $$
declare run uuid;
begin
 if length(adapter_name) not between 1 and 120 or length(trim(worker)) not between 3 and 160
 then raise exception 'Reconciliation unavailable';end if;
 insert into kxra.object_reconciliation_runs(adapter,worker_reference)
 values(adapter_name,trim(worker)) returning id into run;
 return run;
end $$;

create function kxra_private.record_object_reconciliation(
 run uuid,version uuid,key text,observed_hash text,item_outcome text
) returns void language plpgsql security definer set search_path='' as $$
declare r kxra.object_reconciliation_runs;v kxra.file_versions;previous_state text;
begin
 select * into r from kxra.object_reconciliation_runs candidate
 where candidate.id=run and candidate.state='RUNNING' for update;
 if not found or length(key) not between 1 and 500
  or item_outcome not in ('VERIFIED','RECOVERED_FROM_ORPHAN','QUARANTINED_ORPHAN','MISSING','HASH_MISMATCH')
  or (observed_hash is not null and observed_hash!~'^[a-f0-9]{64}$')
 then raise exception 'Reconciliation unavailable';end if;
 if version is not null then
  select * into v from kxra.file_versions candidate where candidate.id=version for update;
  if not found or v.object_key<>key then raise exception 'Reconciliation unavailable';end if;
 end if;
 insert into kxra.object_reconciliation_items(
  run_id,org_id,project_id,file_id,file_version_id,object_key,observed_sha256,outcome
 ) values(run,v.org_id,v.project_id,v.file_id,v.id,key,observed_hash,item_outcome);
 if version is not null and item_outcome in ('MISSING','HASH_MISMATCH') then
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,v.lifecycle_state,'FAILED',
   case item_outcome when 'MISSING' then 'OBJECT_MISSING' else 'OBJECT_HASH_MISMATCH' end,
   r.worker_reference);
  update kxra.file_versions set lifecycle_state='FAILED',indexed_at=null,
   state_reason_code=case item_outcome when 'MISSING' then 'OBJECT_MISSING' else 'OBJECT_HASH_MISMATCH' end,
   state_changed_at=now() where id=v.id;
  update kxra.files set lifecycle_state='FAILED',indexed_at=null,
   state_reason_code=case item_outcome when 'MISSING' then 'OBJECT_MISSING' else 'OBJECT_HASH_MISMATCH' end,
   state_changed_at=now() where id=v.file_id and current_version=v.version;
 elsif version is not null and item_outcome='RECOVERED_FROM_ORPHAN'
  and v.lifecycle_state='FAILED' and v.state_reason_code in ('OBJECT_MISSING','OBJECT_HASH_MISMATCH') then
  select e.to_state into previous_state from kxra.file_state_events e
  where e.file_version_id=v.id and e.to_state not in ('FAILED','REJECTED')
  order by e.id desc limit 1;
  previous_state=coalesce(previous_state,'QUARANTINE');
  insert into kxra.file_state_events(
   org_id,project_id,file_id,file_version_id,from_state,to_state,reason_code,worker_reference
  ) values(v.org_id,v.project_id,v.file_id,v.id,'FAILED',previous_state,
   'OBJECT_RECOVERED_FROM_ORPHAN',r.worker_reference);
  update kxra.file_versions set lifecycle_state=previous_state,
   indexed_at=case when previous_state='INDEXED' then now() else null end,
   state_reason_code='OBJECT_RECOVERED_FROM_ORPHAN',state_changed_at=now() where id=v.id;
  update kxra.files set lifecycle_state=previous_state,
   indexed_at=case when previous_state='INDEXED' then now() else null end,
   state_reason_code='OBJECT_RECOVERED_FROM_ORPHAN',state_changed_at=now()
  where id=v.file_id and current_version=v.version;
 end if;
end $$;

create function kxra_private.complete_object_reconciliation(run uuid,failure text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 update kxra.object_reconciliation_runs r set
  state=case when failure is null then 'COMPLETED' else 'FAILED' end,
  completed_at=now(),failure_code=failure,
  expected_count=(select count(*) from kxra.file_versions),
  observed_count=(select count(*) from kxra.object_reconciliation_items i where i.run_id=r.id),
  recovered_count=(select count(*) from kxra.object_reconciliation_items i where i.run_id=r.id and i.outcome='RECOVERED_FROM_ORPHAN'),
  quarantined_count=(select count(*) from kxra.object_reconciliation_items i where i.run_id=r.id and i.outcome='QUARANTINED_ORPHAN'),
  mismatch_count=(select count(*) from kxra.object_reconciliation_items i where i.run_id=r.id and i.outcome in ('MISSING','HASH_MISMATCH'))
 where r.id=run and r.state='RUNNING';
 if not found then raise exception 'Reconciliation unavailable';end if;
end $$;

revoke all on function kxra_private.claim_file_processing_job(text),
 kxra_private.complete_file_processing(uuid,text,text,text,text,text,text,jsonb,text,text,text,text,jsonb,text,boolean),
 kxra_private.expected_file_objects(),
 kxra_private.begin_object_reconciliation(text,text),
 kxra_private.record_object_reconciliation(uuid,uuid,text,text,text),
 kxra_private.complete_object_reconciliation(uuid,text)
from public,authenticated,anon;
grant execute on function kxra_private.claim_file_processing_job(text),
 kxra_private.complete_file_processing(uuid,text,text,text,text,text,text,jsonb,text,text,text,text,jsonb,text,boolean),
 kxra_private.expected_file_objects(),
 kxra_private.begin_object_reconciliation(text,text),
 kxra_private.record_object_reconciliation(uuid,uuid,text,text,text),
 kxra_private.complete_object_reconciliation(uuid,text)
to kxra_worker;

commit;
