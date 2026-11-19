begin;

-- The original parameter name collided with file_versions.version under
-- PL/pgSQL's strict ambiguity checks. Recreate the private worker function with
-- an explicit identifier; its signature and privilege boundary stay unchanged.
drop function kxra_private.record_object_reconciliation(uuid,uuid,text,text,text);

create function kxra_private.record_object_reconciliation(
 run uuid,version_id uuid,key text,observed_hash text,item_outcome text
) returns void language plpgsql security definer set search_path='' as $$
declare r kxra.object_reconciliation_runs;v kxra.file_versions;previous_state text;
begin
 select * into r from kxra.object_reconciliation_runs candidate
 where candidate.id=run and candidate.state='RUNNING' for update;
 if not found or length(key) not between 1 and 500
  or item_outcome not in ('VERIFIED','RECOVERED_FROM_ORPHAN','QUARANTINED_ORPHAN','MISSING','HASH_MISMATCH')
  or (observed_hash is not null and observed_hash!~'^[a-f0-9]{64}$')
 then raise exception 'Reconciliation unavailable';end if;
 if version_id is not null then
  select * into v from kxra.file_versions candidate where candidate.id=version_id for update;
  if not found or v.object_key<>key then raise exception 'Reconciliation unavailable';end if;
 end if;
 insert into kxra.object_reconciliation_items(
  run_id,org_id,project_id,file_id,file_version_id,object_key,observed_sha256,outcome
 ) values(run,v.org_id,v.project_id,v.file_id,v.id,key,observed_hash,item_outcome);
 if version_id is not null and item_outcome in ('MISSING','HASH_MISMATCH') then
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
 elsif version_id is not null and item_outcome='RECOVERED_FROM_ORPHAN'
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

revoke all on function kxra_private.record_object_reconciliation(uuid,uuid,text,text,text)
 from public,authenticated,anon;
grant execute on function kxra_private.record_object_reconciliation(uuid,uuid,text,text,text)
 to kxra_worker;

commit;
