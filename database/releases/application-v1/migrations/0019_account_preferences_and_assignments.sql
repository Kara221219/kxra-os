begin;

create or replace function kxra.update_own_profile(contents jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p kxra.profiles;first text;last text;job text;employer text;phone_value text;
begin
 select * into p from kxra.profiles where user_id=auth.uid() for update;
 if not found or p.account_state in ('SUSPENDED','REVOKED') or jsonb_typeof(contents)<>'object'
  or contents-array['first_name','last_name','job_title','company','phone']<>'{}'::jsonb
  or not(contents ?& array['first_name','last_name'])
 then raise exception 'Profile update unavailable';end if;
 first=nullif(trim(contents->>'first_name'),'');last=nullif(trim(contents->>'last_name'),'');
 job=nullif(trim(contents->>'job_title'),'');employer=nullif(trim(contents->>'company'),'');
 phone_value=nullif(trim(contents->>'phone'),'');
 if first is null or last is null or length(first)>100 or length(last)>100
  or length(coalesce(job,''))>160 or length(coalesce(employer,''))>200
  or length(coalesce(phone_value,''))>40
  or (phone_value is not null and phone_value!~'^\+?[0-9 ()-]{7,40}$')
 then raise exception 'Profile update unavailable';end if;
 update kxra.profiles set first_name=first,last_name=last,job_title=job,company=employer,
  phone=phone_value,updated_at=now() where user_id=p.user_id;
 update kxra.members set display_name=left(first||' '||last,120)
 where id=p.user_id and org_id=p.org_id;
 insert into kxra.account_security_events(org_id,user_id,actor_id,event_type)
 values(p.org_id,p.user_id,p.user_id,'PROFILE_UPDATED');
end $$;

create function kxra.unpair_own_whatsapp() returns void
language plpgsql security definer set search_path='' as $$
declare p kxra.profiles;
begin
 select * into p from kxra.profiles where user_id=auth.uid() for update;
 if not found or p.account_state in ('SUSPENDED','REVOKED')
 then raise exception 'Pairing action unavailable';end if;
 update kxra.whatsapp_pairings set revoked_at=coalesce(revoked_at,now())
 where user_id=p.user_id and org_id=p.org_id and revoked_at is null;
 update kxra.user_preferences set whatsapp_notifications=false,updated_at=now()
 where user_id=p.user_id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id)
 values(p.org_id,p.user_id,'whatsapp.unpaired',p.user_id);
end $$;

create or replace function kxra.change_membership(a uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v kxra.approvals;m kxra.members;recipient text;queued uuid;project_name text;
begin
 select * into v from kxra.approvals where id=a for update;
 perform kxra_private.check_approval(v,'approved');
 if v.action<>'membership.change' then raise exception 'Wrong action';end if;
 select * into m from kxra.members where id=(v.payload->>'user_id')::uuid
  and org_id=v.org_id and role='partner' and active for update;
 if not found or m.access_version is distinct from (v.payload->>'expected_access_version')::integer
 then raise exception 'Stale membership approval';end if;
 insert into kxra.project_memberships(org_id,project_id,user_id,role,active,expires_at)
 values(v.org_id,v.project_id,m.id,v.payload->>'role',(v.payload->>'active')::boolean,
  (v.payload->>'expires_at')::timestamptz)
 on conflict(project_id,user_id) do update set role=excluded.role,
  active=excluded.active,expires_at=excluded.expires_at;
 update kxra.approvals set state='executed',consumed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'membership.changed',v.project_id,
  jsonb_build_object('user_id',m.id,'role',v.payload->>'role','active',(v.payload->>'active')::boolean));

 select i.recipient_email into recipient from kxra.invitations i
 where i.redeemed_by=m.id and i.recipient_email is not null
 order by i.redeemed_at desc limit 1;
 select name into project_name from kxra.projects where id=v.project_id;
 if recipient is not null then
  queued=kxra_private.queue_email(v.org_id,null,m.id,'PROJECT_ASSIGNMENT',recipient,
   jsonb_build_object('project_id',v.project_id,'project_name',project_name,
    'role',v.payload->>'role','active',(v.payload->>'active')::boolean),
   'project-assignment:'||v.id);
 end if;
end $$;

revoke all on function kxra.update_own_profile(jsonb),kxra.unpair_own_whatsapp(),
 kxra.change_membership(uuid) from public;
grant execute on function kxra.update_own_profile(jsonb),kxra.unpair_own_whatsapp(),
 kxra.change_membership(uuid) to authenticated;

commit;
