begin;

-- Lifecycle states are changed only by typed security-definer transitions such
-- as submit_idea and accept_record. Direct authenticated SQL cannot self-accept.
create function kxra_private.guard_record_status() returns trigger
language plpgsql set search_path='' as $$ begin
 if current_user in ('authenticated','anon') and (
  (tg_op='INSERT' and new.status<>'draft') or
  (tg_op='UPDATE' and new.status is distinct from old.status)
 ) then raise exception 'Typed lifecycle transition required';end if;
 return new;
end $$;
create trigger records_status_guard before insert or update on kxra.records
for each row execute function kxra_private.guard_record_status();

revoke all on all functions in schema kxra_private from public;
revoke all on function kxra_private.guard_record_status() from authenticated,anon;

commit;
