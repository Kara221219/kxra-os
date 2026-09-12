-- NOT AUTOMATICALLY RUN. Reviewed staging-only administrator operation.
-- psql variables: owner_user_id, organisation_id, owner_display_name.
-- The user UUID must already exist in Supabase Auth with a confirmed email.
-- No passwords, tokens or credentials belong here. Do not run on local fixtures.
begin;
select set_config('kxra.bootstrap.user', :'owner_user_id', true);
select set_config('kxra.bootstrap.org', :'organisation_id', true);
select set_config('kxra.bootstrap.name', :'owner_display_name', true);
do $$ declare u uuid=current_setting('kxra.bootstrap.user')::uuid;o uuid=current_setting('kxra.bootstrap.org')::uuid;begin
 if not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then raise exception 'Confirmed auth user required';end if;
 if exists(select 1 from kxra.members where org_id=o and role='owner') then raise exception 'Owner already exists; use a reviewed recovery process';end if;
 insert into kxra.organisations(id,name) values(o,'KXRA Group') on conflict(id) do nothing;
 insert into kxra.members(id,org_id,display_name,role) values(u,o,current_setting('kxra.bootstrap.name'),'owner');
 insert into kxra.audit_events(org_id,actor_id,action,resource_id) values(o,u,'owner.bootstrap',u);
end $$;
commit;
