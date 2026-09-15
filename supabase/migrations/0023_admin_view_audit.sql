begin;

create function kxra.record_admin_view() returns void
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();
begin
 if not kxra_private.is_owner(o) then raise exception 'Admin unavailable';end if;
 insert into kxra.audit_events(org_id,actor_id,action,metadata)
 values(o,auth.uid(),'admin.viewed',jsonb_build_object('surface','administration'));
end $$;

revoke all on function kxra.record_admin_view() from public;
grant execute on function kxra.record_admin_view() to authenticated;

commit;
