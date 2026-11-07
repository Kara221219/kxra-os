begin;
-- Accepted evidence cannot be reassigned or silently published with old history.
create or replace function kxra_private.guard_record() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_op='INSERT' then
  new.version=1;new.created_at=now();new.updated_at=now();
 else
  if (new.id,new.org_id,new.project_id,new.created_by,new.kind,new.created_at,new.source_code,new.visibility) is distinct from (old.id,old.org_id,old.project_id,old.created_by,old.kind,old.created_at,old.source_code,old.visibility) then raise exception 'Immutable scope';end if;
  if old.status not in ('draft','submitted') then raise exception 'Immutable accepted record';end if;
  new.version=old.version+1;new.updated_at=now();
 end if;return new;
end $$;
drop trigger records_guard on kxra.records;
create trigger records_guard before insert or update on kxra.records for each row execute function kxra_private.guard_record();
alter table kxra.approvals add constraint approval_hash_format check(payload_hash ~ '^[a-f0-9]{64}$');
alter table kxra.approvals add constraint approval_payload_shape check(
 case action
 when 'record.accept' then jsonb_typeof(payload->'record_id')='string' and payload ? 'record_id' and jsonb_typeof(payload->'version')='number' and payload ? 'version' and (payload->>'version')::numeric>0
 when 'membership.change' then project_id is not null and payload ?& array['user_id','role','active'] and jsonb_typeof(payload->'user_id')='string' and payload->>'role' in ('viewer','contributor') and jsonb_typeof(payload->'active')='boolean'
 else true end);
create or replace function kxra.accept_record(a uuid) returns void language plpgsql security definer set search_path='' as $$ declare v kxra.approvals;r kxra.records;begin
 select * into v from kxra.approvals where id=a for update;
 if not found or not kxra_private.mfa_owner(v.org_id) or v.state<>'approved' or v.action<>'record.accept' or v.expires_at<=now() or v.consumed_at is not null then raise exception 'Approval unavailable';end if;
 select * into r from kxra.records where id=(v.payload->>'record_id')::uuid for update;
 if not found or r.org_id is distinct from v.org_id or r.project_id is distinct from v.project_id or r.version is distinct from (v.payload->>'version')::int then raise exception 'Stale approval';end if;
 update kxra.records set status='accepted' where id=r.id;
 update kxra.approvals set state='executed',consumed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id) values(v.org_id,auth.uid(),'approval.executed',a);
end $$;
commit;
