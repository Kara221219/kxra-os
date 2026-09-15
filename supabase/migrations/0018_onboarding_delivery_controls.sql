begin;

create table kxra.request_rate_limits(
 scope text not null check(length(scope) between 1 and 80),
 subject_digest text not null check(subject_digest~'^[a-f0-9]{64}$'),
 bucket_started_at timestamptz not null,
 request_count integer not null check(request_count>0),
 updated_at timestamptz not null default now(),
 primary key(scope,subject_digest,bucket_started_at)
);
alter table kxra.request_rate_limits enable row level security;
revoke all on kxra.request_rate_limits from public,authenticated,anon;

create function kxra.consume_rate_limit(
 scope_name text,subject_hash text,maximum integer,window_seconds integer
) returns boolean
language plpgsql security definer set search_path='' as $$
declare bucket timestamptz;current_count integer;
begin
 if length(scope_name) not between 1 and 80 or subject_hash!~'^[a-f0-9]{64}$'
  or maximum not between 1 and 1000 or window_seconds not between 10 and 86400
 then raise exception 'Rate limit unavailable';end if;
 bucket=to_timestamp(floor(extract(epoch from now())/window_seconds)*window_seconds);
 insert into kxra.request_rate_limits(scope,subject_digest,bucket_started_at,request_count)
 values(scope_name,subject_hash,bucket,1)
 on conflict(scope,subject_digest,bucket_started_at) do update set
  request_count=kxra.request_rate_limits.request_count+1,updated_at=now()
 returning request_count into current_count;
 return current_count<=maximum;
end $$;

create function kxra.onboarding_project_access()
returns table(
 project_id uuid,project_code text,project_name text,project_role text,
 access_expires_at timestamptz,summary text,permissions jsonb
)
language sql stable security definer set search_path='' as $$
 select p.id,p.code,p.name,pm.role,pm.expires_at,
  coalesce(nullif(p.next_action,''),'No project summary is available.'),
  case pm.role
   when 'contributor' then '["read shared project records","create ideas and notes","update own drafts","upload to quarantine"]'::jsonb
   else '["read shared project records"]'::jsonb
  end
 from kxra.profiles profile
 join kxra.project_memberships pm on pm.user_id=profile.user_id and pm.org_id=profile.org_id
 join kxra.projects p on p.id=pm.project_id and p.org_id=pm.org_id
 where profile.user_id=auth.uid() and profile.account_state in ('ONBOARDING','ACTIVE')
  and pm.active and (pm.expires_at is null or pm.expires_at>now())
 order by p.code
$$;

create or replace function kxra.update_own_preferences(contents jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p kxra.profiles;timezone_value text;whatsapp_requested boolean;
begin
 select * into p from kxra.profiles where user_id=auth.uid() for update;
 timezone_value=contents->>'timezone';
 if not found or p.account_state in ('SUSPENDED','REVOKED') or jsonb_typeof(contents)<>'object'
  or not(contents ?& array['timezone','email_notifications','whatsapp_notifications','display_density'])
  or contents-array['timezone','email_notifications','whatsapp_notifications','display_density']<>'{}'::jsonb
  or jsonb_typeof(contents->'email_notifications')<>'boolean'
  or jsonb_typeof(contents->'whatsapp_notifications')<>'boolean'
  or timezone_value is null or length(timezone_value) not between 1 and 100
  or contents->>'display_density' not in ('comfortable','compact')
 then raise exception 'Preferences update unavailable';end if;
 whatsapp_requested=(contents->>'whatsapp_notifications')::boolean;
 if whatsapp_requested and not exists(
  select 1 from kxra.whatsapp_pairings pairing
  where pairing.user_id=p.user_id and pairing.org_id=p.org_id
   and pairing.verified_at is not null and pairing.revoked_at is null
 ) then raise exception 'Verified WhatsApp pairing required';end if;
 insert into kxra.user_preferences(
  user_id,org_id,timezone,email_notifications,whatsapp_notifications,display_density
 ) values(
  p.user_id,p.org_id,timezone_value,(contents->>'email_notifications')::boolean,
  whatsapp_requested,contents->>'display_density'
 ) on conflict(user_id) do update set
  timezone=excluded.timezone,email_notifications=excluded.email_notifications,
  whatsapp_notifications=excluded.whatsapp_notifications,
  display_density=excluded.display_density,updated_at=now();
 insert into kxra.account_security_events(org_id,user_id,actor_id,event_type)
 values(p.org_id,p.user_id,p.user_id,'PREFERENCES_UPDATED');
end $$;

revoke all on function kxra.consume_rate_limit(text,text,integer,integer),
 kxra.onboarding_project_access(),kxra.update_own_preferences(jsonb) from public;
grant execute on function kxra.consume_rate_limit(text,text,integer,integer),
 kxra.onboarding_project_access(),kxra.update_own_preferences(jsonb) to authenticated;
grant execute on function kxra.consume_rate_limit(text,text,integer,integer) to anon;

commit;
