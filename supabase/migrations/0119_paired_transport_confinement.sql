-- Companion to the corrected, unpublished 0118. Fresh installation only;
-- historical checkpoint hashes are evidence, not a hosted migration contract.
-- 0118 never grants private-schema access, even before this file is installed.
do $$ begin
 if to_regprocedure('kxra_pairing.paired_resolve(text,text)') is null
 or to_regprocedure('kxra_private.paired_resolve(text,text)') is not null
 or has_schema_privilege('kxra_app','kxra_private','USAGE') then
  raise exception 'Use the corrected fresh paired migration set; unsafe legacy checkpoint boundary';
 end if;
end $$;

create function kxra.paired_task_status(h text,tid uuid,f uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t kxra.paired_tasks;
begin
 -- Reuse the complete live session/owner/tenant/room/entitlement checks and
 -- ordered locks. This also expires stale leases, without replay or dispatch.
 perform kxra.paired_device(h,'HEARTBEAT','{}'::jsonb);
 select p.* into t from kxra.paired_tasks p join kxra_private.paired_sessions s on s.id=p.session_id
 where s.secret_hash=h and p.id=tid and p.fence=f;
 if t.id is null then raise insufficient_privilege;end if;
 return jsonb_build_object('state',t.state);
end $$;
revoke all on function kxra.paired_task_status(text,uuid,uuid) from public,anon;
grant execute on function kxra.paired_task_status(text,uuid,uuid) to authenticated;
