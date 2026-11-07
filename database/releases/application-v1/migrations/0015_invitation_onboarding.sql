begin;

create function kxra_private.normalize_email(value text) returns text
language sql immutable set search_path='' as $$
 select lower(trim(value))
$$;

create function kxra_private.email_hint(value text) returns text
language sql immutable set search_path='' as $$
 select case
  when value is null or position('@' in value)=0 then 'hidden recipient'
  else left(split_part(value,'@',1),1)||'***@'||split_part(value,'@',2)
 end
$$;

create function kxra_private.queue_email(
 o uuid,invitation uuid,account uuid,template_name text,recipient text,
 safe_payload jsonb,operation text
) returns uuid
language plpgsql security definer set search_path='' as $$
declare created_id uuid; normalized text=kxra_private.normalize_email(recipient);
begin
 if normalized!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or template_name not in (
   'PARTNER_INVITATION','INVITATION_REMINDER','PASSWORD_RESET','EMAIL_VERIFICATION',
   'WELCOME','SECURITY_ALERT','PROJECT_ASSIGNMENT','ACCESS_REMOVED','APPROVAL_REQUIRED'
  )
  or jsonb_typeof(safe_payload) is distinct from 'object'
 then raise exception 'Email intent unavailable';end if;
 insert into kxra.transactional_email_outbox(
  org_id,invitation_id,user_id,template_key,recipient_digest,recipient_hint,payload,operation_key
 ) values(
  o,invitation,account,template_name,
  encode(sha256(convert_to(normalized,'UTF8')),'hex'),
  kxra_private.email_hint(normalized),safe_payload,operation
 ) on conflict(operation_key) do update set operation_key=excluded.operation_key
 returning id into created_id;
 return created_id;
end $$;

create function kxra.create_multi_project_invitation(
 email text,grants jsonb,note text,token_hash text,expiry timestamptz
) returns table(id uuid,expires_at timestamptz,outbox_id uuid)
language plpgsql security definer set search_path='' as $$
declare
 o uuid=kxra_private.member_org(); normalized text=kxra_private.normalize_email(email);
 created kxra.invitations; item jsonb; project uuid; member_role text;
 membership_expiry timestamptz; first_project uuid; first_role text;
 seen uuid[]='{}'::uuid[]; queued uuid;
begin
 if not kxra_private.mfa_owner(o)
  or normalized!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or token_hash!~'^[a-f0-9]{64}$' or expiry<=now() or expiry>now()+interval '7 days'
  or jsonb_typeof(grants) is distinct from 'array'
  or jsonb_array_length(grants)<1 or jsonb_array_length(grants)>10
  or note is not null and length(note)>2000
 then raise exception 'Invitation unavailable';end if;

 for item in select value from jsonb_array_elements(grants) loop
  if jsonb_typeof(item) is distinct from 'object'
   or not(item ?& array['project_id','role'])
   or item-array['project_id','role','expires_at']<>'{}'::jsonb
   or jsonb_typeof(item->'project_id') is distinct from 'string'
   or jsonb_typeof(item->'role') is distinct from 'string'
  then raise exception 'Invalid invitation grant';end if;
  project=(item->>'project_id')::uuid;
  member_role=item->>'role';
  membership_expiry=case when item ? 'expires_at' and jsonb_typeof(item->'expires_at')='string'
   then (item->>'expires_at')::timestamptz else null end;
  if member_role not in ('viewer','contributor') or project=any(seen)
   or not exists(select 1 from kxra.projects p where p.id=project and p.org_id=o)
   or membership_expiry is not null and membership_expiry<=now()
  then raise exception 'Invalid invitation grant';end if;
  seen=array_append(seen,project);
  if first_project is null then first_project=project;first_role=member_role;end if;
 end loop;

 update kxra.invitations set state='REVOKED',revoked_at=now(),updated_at=now()
 where org_id=o and email_digest=encode(sha256(convert_to(normalized,'UTF8')),'hex')
  and state in ('PENDING','SENT','DELIVERY_FAILED') and kxra.invitations.expires_at>now();

 insert into kxra.invitations(
  org_id,project_id,email_digest,token_digest,role,state,approved_by,
  recipient_email,note,expires_at
 ) values(
  o,first_project,encode(sha256(convert_to(normalized,'UTF8')),'hex'),token_hash,
  first_role,'PENDING',auth.uid(),normalized,nullif(trim(note),''),expiry
 ) returning * into created;

 for item in select value from jsonb_array_elements(grants) loop
  insert into kxra.invitation_project_grants(
   invitation_id,org_id,project_id,role,membership_expires_at
  ) values(
   created.id,o,(item->>'project_id')::uuid,item->>'role',
   case when item ? 'expires_at' and jsonb_typeof(item->'expires_at')='string'
    then (item->>'expires_at')::timestamptz else null end
  );
 end loop;

 queued=kxra_private.queue_email(
  o,created.id,null,'PARTNER_INVITATION',normalized,
  jsonb_build_object(
   'invitation_id',created.id,'invitation_version',created.version,
   'expires_at',created.expires_at,'project_count',jsonb_array_length(grants),
   'note_present',created.note is not null
  ),'invitation:'||created.id||':v'||created.version
 );
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'invitation.created',created.id,
  jsonb_build_object('version',created.version,'project_count',jsonb_array_length(grants),'expires_at',expiry));
 return query select created.id,created.expires_at,queued;
end $$;

-- Compatibility wrapper for the reviewed one-project API. New UI uses the
-- multi-project function and never lets the browser choose identity fields.
create or replace function kxra.create_invitation(
 project uuid,email text,member_role text,token_hash text,expiry timestamptz
) returns table(id uuid,expires_at timestamptz)
language sql security definer set search_path='' as $$
 select created.id,created.expires_at
 from kxra.create_multi_project_invitation(
  email,
  jsonb_build_array(jsonb_build_object('project_id',project,'role',member_role)),
  null,token_hash,expiry
 ) created
$$;

create function kxra.preview_invitation(token_hash text)
returns table(
 invitation_id uuid,invitation_version integer,recipient_email text,
 recipient_hint text,expires_at timestamptz,state text,grants jsonb
)
language sql stable security definer set search_path='' as $$
 select i.id,i.version,i.recipient_email,kxra_private.email_hint(i.recipient_email),
  i.expires_at,i.state,
  jsonb_agg(jsonb_build_object(
   'project_id',g.project_id,'project_code',p.code,'project_name',p.name,
   'role',g.role,'expires_at',g.membership_expires_at
  ) order by p.code)
 from kxra.invitations i
 join kxra.invitation_project_grants g on g.invitation_id=i.id and g.org_id=i.org_id
 join kxra.projects p on p.id=g.project_id and p.org_id=g.org_id
 where i.token_digest=token_hash and token_hash~'^[a-f0-9]{64}$'
  and i.state in ('PENDING','SENT','DELIVERY_FAILED') and i.expires_at>now()
  and i.recipient_email is not null
 group by i.id,i.version,i.recipient_email,i.expires_at,i.state
$$;

create function kxra.register_invited_profile(
 invitation uuid,invitation_version integer,token_hash text
) returns text
language plpgsql security definer set search_path='' as $$
declare
 invite kxra.invitations; identity uuid=auth.uid();
 email text=kxra_private.normalize_email(auth.jwt()->>'email'); verified boolean;
 profile kxra.profiles;
begin
 verified=coalesce(auth.jwt()->>'email_verified','')='true';
 if identity is null or invitation_version is null or invitation_version<1
  or token_hash!~'^[a-f0-9]{64}$'
  or email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 then raise exception 'Invitation unavailable';end if;
 select * into invite from kxra.invitations i
 where i.id=invitation and i.version=invitation_version and i.token_digest=token_hash
  and i.state in ('PENDING','SENT','DELIVERY_FAILED') and i.expires_at>now()
 for update;
 if not found or invite.email_digest<>encode(sha256(convert_to(email,'UTF8')),'hex')
 then raise exception 'Invitation unavailable';end if;
 select * into profile from kxra.profiles p where p.user_id=identity for update;
 if found and (
  profile.org_id<>invite.org_id or profile.email_digest is distinct from invite.email_digest
  or profile.account_state in ('SUSPENDED','REVOKED')
 ) then raise exception 'Account unavailable';end if;
 if not found then
  insert into kxra.profiles(
   user_id,org_id,email_digest,account_state,email_verified_at
  ) values(
   identity,invite.org_id,invite.email_digest,
   case when verified then 'EMAIL_VERIFIED' else 'REGISTERED' end,
   case when verified then now() else null end
  );
  insert into kxra.account_security_events(org_id,user_id,actor_id,event_type)
  values(invite.org_id,identity,identity,'REGISTERED');
 elsif verified and profile.email_verified_at is null then
  update kxra.profiles set account_state='EMAIL_VERIFIED',email_verified_at=now(),updated_at=now()
  where user_id=identity;
 end if;
 return case when verified then 'EMAIL_VERIFIED' else 'REGISTERED' end;
end $$;

create function kxra.mark_current_email_verified() returns void
language plpgsql security definer set search_path='' as $$
declare identity uuid=auth.uid();email text=kxra_private.normalize_email(auth.jwt()->>'email');p kxra.profiles;
begin
 if identity is null or coalesce(auth.jwt()->>'email_verified','')<>'true'
 then raise exception 'Verified identity required';end if;
 select * into p from kxra.profiles where user_id=identity for update;
 if not found or p.email_digest is distinct from encode(sha256(convert_to(email,'UTF8')),'hex')
  or p.account_state in ('SUSPENDED','REVOKED')
 then raise exception 'Verified identity required';end if;
 if p.email_verified_at is null then
  update kxra.profiles set email_verified_at=now(),account_state='EMAIL_VERIFIED',updated_at=now()
  where user_id=identity;
  insert into kxra.account_security_events(org_id,user_id,actor_id,event_type)
  values(p.org_id,identity,identity,'EMAIL_VERIFIED');
 end if;
end $$;

create function kxra.redeem_invitation_version(
 invitation uuid,invitation_version integer,token_hash text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 invite kxra.invitations;identity uuid=auth.uid();
 email text=kxra_private.normalize_email(auth.jwt()->>'email');profile kxra.profiles;
 member kxra.members;grant_row kxra.invitation_project_grants;project_ids uuid[]='{}'::uuid[];
 label text;needs_onboarding boolean;
begin
 if identity is null or coalesce(auth.jwt()->>'email_verified','')<>'true'
  or email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or invitation_version is null or invitation_version<1 or token_hash!~'^[a-f0-9]{64}$'
 then raise exception 'Invitation unavailable';end if;
 select * into invite from kxra.invitations i
 where i.id=invitation and i.version=invitation_version and i.token_digest=token_hash
  and i.state in ('PENDING','SENT','DELIVERY_FAILED') for update;
 if not found or invite.expires_at<=now()
  or invite.email_digest<>encode(sha256(convert_to(email,'UTF8')),'hex')
 then raise exception 'Invitation unavailable';end if;

 select * into profile from kxra.profiles p where p.user_id=identity for update;
 if found and (
  profile.org_id<>invite.org_id or profile.email_digest is distinct from invite.email_digest
  or profile.account_state in ('SUSPENDED','REVOKED')
 ) then raise exception 'Invitation unavailable';end if;
 if not found then
  insert into kxra.profiles(user_id,org_id,email_digest,account_state,email_verified_at)
  values(identity,invite.org_id,invite.email_digest,'EMAIL_VERIFIED',now()) returning * into profile;
 elsif profile.email_verified_at is null then
  update kxra.profiles set email_verified_at=now(),account_state='EMAIL_VERIFIED',updated_at=now()
  where user_id=identity returning * into profile;
 end if;

 select * into member from kxra.members m where m.id=identity for update;
 if found and (member.org_id<>invite.org_id or member.role<>'partner' or not member.active)
 then raise exception 'Invitation unavailable';end if;
 if not found then
  label=left(coalesce(nullif(trim(auth.jwt()->>'display_name'),''),split_part(email,'@',1)),120);
  insert into kxra.members(id,org_id,display_name,role,active)
  values(identity,invite.org_id,label,'partner',true);
 end if;

 for grant_row in
  select * from kxra.invitation_project_grants g where g.invitation_id=invite.id order by g.project_id
 loop
  insert into kxra.project_memberships(org_id,project_id,user_id,role,active,expires_at)
  values(invite.org_id,grant_row.project_id,identity,grant_row.role,true,grant_row.membership_expires_at)
  on conflict(project_id,user_id) do update set
   role=excluded.role,active=true,expires_at=excluded.expires_at;
  project_ids=array_append(project_ids,grant_row.project_id);
 end loop;
 if coalesce(array_length(project_ids,1),0)=0 then raise exception 'Invitation unavailable';end if;

 needs_onboarding=profile.onboarding_completed_at is null;
 update kxra.profiles set
  account_state=case when needs_onboarding then 'ONBOARDING' else 'ACTIVE' end,
  email_verified_at=coalesce(email_verified_at,now()),updated_at=now()
 where user_id=identity;
 insert into kxra.user_preferences(user_id,org_id) values(identity,invite.org_id)
 on conflict(user_id) do nothing;
 insert into kxra.onboarding_progress(user_id,org_id,current_step,completed_steps,completed_at)
 values(identity,invite.org_id,case when needs_onboarding then 1 else 9 end,
  case when needs_onboarding then '{}'::integer[] else array[1,2,3,4,5,6,7,8,9] end,
  case when needs_onboarding then null else profile.onboarding_completed_at end)
 on conflict(user_id) do nothing;
 update kxra.invitations set state='REDEEMED',redeemed_by=identity,redeemed_at=now(),updated_at=now()
 where id=invite.id;
 insert into kxra.account_security_events(org_id,user_id,actor_id,event_type,metadata)
 values(invite.org_id,identity,identity,'INVITATION_REDEEMED',
  jsonb_build_object('invitation_id',invite.id,'invitation_version',invite.version,'project_count',array_length(project_ids,1)));
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(invite.org_id,identity,'invitation.redeemed',invite.id,
  jsonb_build_object('version',invite.version,'project_ids',to_jsonb(project_ids),'onboarding_required',needs_onboarding));
 return jsonb_build_object('project_ids',to_jsonb(project_ids),'onboarding_required',needs_onboarding,'current_step',case when needs_onboarding then 1 else 9 end);
end $$;

create or replace function kxra.redeem_invitation(token_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare invite kxra.invitations;result jsonb;
begin
 select * into invite from kxra.invitations i
 where i.token_digest=token_hash and i.state in ('PENDING','SENT','DELIVERY_FAILED') for update;
 if not found then raise exception 'Invitation unavailable';end if;
 perform kxra.register_invited_profile(invite.id,invite.version,token_hash);
 result=kxra.redeem_invitation_version(invite.id,invite.version,token_hash);
 return (result->'project_ids'->>0)::uuid;
end $$;

create function kxra.resend_invitation(invitation uuid,new_token_hash text)
returns table(id uuid,version integer,expires_at timestamptz,outbox_id uuid,recipient_email text)
language plpgsql security definer set search_path='' as $$
declare invite kxra.invitations;queued uuid;
begin
 select * into invite from kxra.invitations i where i.id=invitation for update;
 if not found or not kxra_private.mfa_owner(invite.org_id)
  or invite.state not in ('PENDING','SENT','DELIVERY_FAILED') or invite.expires_at<=now()
  or new_token_hash!~'^[a-f0-9]{64}$' or invite.recipient_email is null
 then raise exception 'Invitation unavailable';end if;
 update kxra.transactional_email_outbox set state='CANCELLED',updated_at=now()
 where invitation_id=invite.id and state in ('PENDING','DELIVERY_FAILED');
 update kxra.invitations set token_digest=new_token_hash,version=kxra.invitations.version+1,state='PENDING',
  sent_at=null,delivery_error=null,updated_at=now()
 where kxra.invitations.id=invite.id returning * into invite;
 queued=kxra_private.queue_email(
  invite.org_id,invite.id,null,'INVITATION_REMINDER',invite.recipient_email,
  jsonb_build_object('invitation_id',invite.id,'invitation_version',invite.version,
   'expires_at',invite.expires_at,'project_count',(select count(*) from kxra.invitation_project_grants g where g.invitation_id=invite.id)),
  'invitation:'||invite.id||':v'||invite.version
 );
 insert into kxra.account_security_events(org_id,actor_id,event_type,metadata)
 values(invite.org_id,auth.uid(),'INVITATION_RESENT',jsonb_build_object('invitation_id',invite.id,'version',invite.version));
 return query select invite.id,invite.version,invite.expires_at,queued,invite.recipient_email;
end $$;

create function kxra.revoke_invitation(invitation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare invite kxra.invitations;
begin
 select * into invite from kxra.invitations i where i.id=invitation for update;
 if not found or not kxra_private.mfa_owner(invite.org_id)
  or invite.state not in ('PENDING','SENT','DELIVERY_FAILED')
 then raise exception 'Invitation unavailable';end if;
 update kxra.invitations set state='REVOKED',revoked_at=now(),updated_at=now() where id=invite.id;
 update kxra.transactional_email_outbox set state='CANCELLED',updated_at=now()
 where invitation_id=invite.id and state in ('PENDING','DELIVERY_FAILED');
 insert into kxra.account_security_events(org_id,actor_id,event_type,metadata)
 values(invite.org_id,auth.uid(),'INVITATION_REVOKED',jsonb_build_object('invitation_id',invite.id,'version',invite.version));
 insert into kxra.audit_events(org_id,actor_id,action,resource_id)
 values(invite.org_id,auth.uid(),'invitation.revoked',invite.id);
end $$;

create function kxra.mark_invitation_delivery(
 invitation uuid,expected_version integer,outbox uuid,delivered boolean,
 provider_id text,error_message text default null
) returns void
language plpgsql security definer set search_path='' as $$
declare invite kxra.invitations;mail kxra.transactional_email_outbox;
begin
 select * into invite from kxra.invitations i where i.id=invitation for update;
 select * into mail from kxra.transactional_email_outbox e where e.id=outbox for update;
 if not found or invite.id is null or not kxra_private.is_owner(invite.org_id)
  or invite.version is distinct from expected_version or mail.invitation_id<>invite.id
  or mail.state<>'PENDING' or delivered is null
 then raise exception 'Delivery update unavailable';end if;
 update kxra.transactional_email_outbox set
  state=case when delivered then 'SENT' else 'DELIVERY_FAILED' end,
  attempt_count=attempt_count+1,provider_message_id=case when delivered then provider_id else null end,
  last_error=case when delivered then null else left(coalesce(error_message,'Delivery failed'),1000) end,
  updated_at=now()
 where id=mail.id;
 update kxra.invitations set state=case when delivered then 'SENT' else 'DELIVERY_FAILED' end,
  sent_at=case when delivered then now() else sent_at end,
  delivery_error=case when delivered then null else left(coalesce(error_message,'Delivery failed'),1000) end,
  updated_at=now()
 where id=invite.id;
end $$;

create function kxra.update_own_profile(contents jsonb) returns void
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
 then raise exception 'Profile update unavailable';end if;
 update kxra.profiles set first_name=first,last_name=last,job_title=job,company=employer,
  phone=phone_value,updated_at=now() where user_id=p.user_id;
 update kxra.members set display_name=left(first||' '||last,120)
 where id=p.user_id and org_id=p.org_id;
 insert into kxra.account_security_events(org_id,user_id,actor_id,event_type)
 values(p.org_id,p.user_id,p.user_id,'PROFILE_UPDATED');
end $$;

create function kxra.update_own_preferences(contents jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare p kxra.profiles;timezone_value text;
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
 insert into kxra.user_preferences(
  user_id,org_id,timezone,email_notifications,whatsapp_notifications,display_density
 ) values(
  p.user_id,p.org_id,timezone_value,(contents->>'email_notifications')::boolean,
  (contents->>'whatsapp_notifications')::boolean,contents->>'display_density'
 ) on conflict(user_id) do update set
  timezone=excluded.timezone,email_notifications=excluded.email_notifications,
  whatsapp_notifications=excluded.whatsapp_notifications,
  display_density=excluded.display_density,updated_at=now();
 insert into kxra.account_security_events(org_id,user_id,actor_id,event_type)
 values(p.org_id,p.user_id,p.user_id,'PREFERENCES_UPDATED');
end $$;

create function kxra.record_mfa_state(new_state text,factor_reference text default null) returns void
language plpgsql security definer set search_path='' as $$
declare p kxra.profiles;
begin
 select * into p from kxra.profiles where user_id=auth.uid() for update;
 if not found or p.account_state in ('SUSPENDED','REVOKED') or new_state not in (
  'NOT_ENROLLED','ENROLLING','ENROLLED','RECOVERY_REQUIRED'
 ) or (
  (p.mfa_state='NOT_ENROLLED' and new_state not in ('ENROLLING','NOT_ENROLLED')) or
  (p.mfa_state='ENROLLING' and new_state not in ('ENROLLED','NOT_ENROLLED')) or
  (p.mfa_state='ENROLLED' and new_state not in ('NOT_ENROLLED','RECOVERY_REQUIRED','ENROLLED')) or
  (p.mfa_state='RECOVERY_REQUIRED' and new_state not in ('ENROLLED','NOT_ENROLLED'))
 ) then raise exception 'MFA update unavailable';end if;
 update kxra.profiles set mfa_state=new_state,
  provider_factor_ref=case when new_state='NOT_ENROLLED' then null else nullif(factor_reference,'') end,
  updated_at=now() where user_id=p.user_id;
 insert into kxra.account_security_events(org_id,user_id,actor_id,event_type,metadata)
 values(p.org_id,p.user_id,p.user_id,'MFA_STATE_CHANGED',jsonb_build_object('state',new_state));
end $$;

create function kxra.record_password_event(event_name text) returns void
language plpgsql security definer set search_path='' as $$
declare p kxra.profiles;
begin
 select * into p from kxra.profiles where user_id=auth.uid();
 if not found or p.account_state in ('SUSPENDED','REVOKED')
  or event_name not in ('PASSWORD_CHANGED','PASSWORD_RESET_REQUESTED')
 then raise exception 'Security event unavailable';end if;
 insert into kxra.account_security_events(org_id,user_id,actor_id,event_type)
 values(p.org_id,p.user_id,p.user_id,event_name);
end $$;

create function kxra.revoke_own_sessions(reason text,provider_state text) returns integer
language plpgsql security definer set search_path='' as $$
declare p kxra.profiles;new_version integer;
begin
 select * into p from kxra.profiles where user_id=auth.uid() for update;
 if not found or p.account_state in ('SUSPENDED','REVOKED')
  or length(trim(reason)) not between 1 and 1000
  or provider_state not in ('LOCAL_APPLIED','PROVIDER_PENDING','PROVIDER_CONFIRMED','FAILED')
 then raise exception 'Session revocation unavailable';end if;
 update kxra.profiles set session_version=session_version+1,updated_at=now()
 where user_id=p.user_id returning session_version into new_version;
 insert into kxra.session_revocations(org_id,user_id,requested_by,reason,provider_state,
  completed_at) values(p.org_id,p.user_id,p.user_id,reason,provider_state,
   case when provider_state in ('LOCAL_APPLIED','PROVIDER_CONFIRMED') then now() else null end);
 insert into kxra.account_security_events(org_id,user_id,actor_id,event_type,
  metadata) values(p.org_id,p.user_id,p.user_id,'SESSIONS_REVOKED',jsonb_build_object('session_version',new_version));
 return new_version;
end $$;

create function kxra.onboarding_projects()
returns table(project_id uuid,project_code text,project_name text,project_role text,expires_at timestamptz)
language sql stable security definer set search_path='' as $$
 select p.id,p.code,p.name,pm.role,pm.expires_at
 from kxra.profiles profile
 join kxra.project_memberships pm on pm.user_id=profile.user_id and pm.org_id=profile.org_id
 join kxra.projects p on p.id=pm.project_id and p.org_id=pm.org_id
 where profile.user_id=auth.uid() and profile.account_state in ('ONBOARDING','ACTIVE')
  and pm.active and (pm.expires_at is null or pm.expires_at>now())
 order by p.code
$$;

create function kxra.complete_onboarding_step(step integer,contents jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare
 p kxra.profiles;progress kxra.onboarding_progress;item jsonb;agreement kxra.agreement_documents;
 required_count integer;accepted_count integer;next_step integer;recipient text;queued uuid;
begin
 select * into p from kxra.profiles where user_id=auth.uid() for update;
 select * into progress from kxra.onboarding_progress where user_id=auth.uid() for update;
 if p.user_id is null or progress.user_id is null or p.account_state<>'ONBOARDING'
  or step is null or step<1 or step>9 or step>progress.current_step
  or jsonb_typeof(contents) is distinct from 'object'
 then raise exception 'Onboarding step unavailable';end if;

 if step=1 then
  if contents<>jsonb_build_object('acknowledged',true) then raise exception 'Welcome acknowledgement required';end if;
 elsif step=2 then
  perform kxra.update_own_profile(contents);
 elsif step=3 then
  if not(contents ? 'security_acknowledged') or contents->'security_acknowledged'<>'true'::jsonb
   or contents-array['security_acknowledged']<>'{}'::jsonb
  then raise exception 'Security acknowledgement required';end if;
 elsif step=4 then
  if contents<>jsonb_build_object('access_acknowledged',true)
   or not exists(select 1 from kxra.project_memberships pm where pm.user_id=p.user_id and pm.active and (pm.expires_at is null or pm.expires_at>now()))
  then raise exception 'Project access acknowledgement required';end if;
 elsif step=5 then
  if contents<>jsonb_build_object('working_acknowledged',true) then raise exception 'Working acknowledgement required';end if;
 elsif step=6 then
  if contents-array['whatsapp_choice']<>'{}'::jsonb
   or contents->>'whatsapp_choice' not in ('SKIP','CONNECT_LATER')
  then raise exception 'WhatsApp choice required';end if;
  update kxra.onboarding_progress set whatsapp_choice=contents->>'whatsapp_choice' where user_id=p.user_id;
 elsif step=7 then
  perform kxra.update_own_preferences(contents);
 elsif step=8 then
  if not(contents ? 'agreement_ids') or jsonb_typeof(contents->'agreement_ids')<>'array'
   or coalesce(contents->'placeholder_acknowledged','false'::jsonb)<>'true'::jsonb
   or contents-array['agreement_ids','placeholder_acknowledged']<>'{}'::jsonb
  then raise exception 'Agreement acknowledgement required';end if;
  for item in select value from jsonb_array_elements(contents->'agreement_ids') loop
   if jsonb_typeof(item)<>'string' then raise exception 'Agreement acknowledgement required';end if;
   select * into agreement from kxra.agreement_documents d
   where d.id=(item#>>'{}')::uuid and d.org_id=p.org_id and d.required and d.status in ('APPROVED','UNAPPROVED_PLACEHOLDER');
   if not found then raise exception 'Agreement acknowledgement required';end if;
   insert into kxra.agreement_acceptances(user_id,org_id,agreement_id,agreement_version)
   values(p.user_id,p.org_id,agreement.id,agreement.version) on conflict do nothing;
  end loop;
  select count(*) into required_count from kxra.agreement_documents d
  where d.org_id=p.org_id and d.required and d.status in ('APPROVED','UNAPPROVED_PLACEHOLDER');
  select count(*) into accepted_count from kxra.agreement_acceptances a
  join kxra.agreement_documents d on d.id=a.agreement_id and d.version=a.agreement_version
  where a.user_id=p.user_id and d.org_id=p.org_id and d.required and d.status in ('APPROVED','UNAPPROVED_PLACEHOLDER');
  if required_count=0 or accepted_count<>required_count then raise exception 'Every required agreement version must be acknowledged';end if;
 elsif step=9 then
  if contents<>jsonb_build_object('complete',true)
   or not(progress.completed_steps@>array[1,2,3,4,5,6,7,8])
   or p.first_name is null or p.last_name is null
   or not exists(select 1 from kxra.user_preferences pref where pref.user_id=p.user_id)
  then raise exception 'Onboarding is incomplete';end if;
  select count(*) into required_count from kxra.agreement_documents d
  where d.org_id=p.org_id and d.required and d.status in ('APPROVED','UNAPPROVED_PLACEHOLDER');
  select count(*) into accepted_count from kxra.agreement_acceptances a
  join kxra.agreement_documents d on d.id=a.agreement_id and d.version=a.agreement_version
  where a.user_id=p.user_id and d.org_id=p.org_id and d.required and d.status in ('APPROVED','UNAPPROVED_PLACEHOLDER');
  if required_count=0 or accepted_count<>required_count then raise exception 'Onboarding is incomplete';end if;
 end if;

 update kxra.onboarding_progress set
  completed_steps=(select array_agg(distinct value order by value) from unnest(completed_steps||step) value),
  current_step=case when step=9 then 9 else greatest(current_step,step+1) end,
  updated_at=now(),completed_at=case when step=9 then now() else completed_at end
 where user_id=p.user_id returning current_step into next_step;
 if step=9 then
  update kxra.profiles set account_state='ACTIVE',onboarding_completed_at=now(),updated_at=now()
  where user_id=p.user_id;
  select i.recipient_email into recipient from kxra.invitations i
  where i.redeemed_by=p.user_id and i.state='REDEEMED' and i.recipient_email is not null
  order by i.redeemed_at desc limit 1;
  if recipient is not null then
   queued=kxra_private.queue_email(p.org_id,null,p.user_id,'WELCOME',recipient,
    jsonb_build_object('user_id',p.user_id,'onboarding_completed',true),
    'welcome:'||p.user_id||':1');
  end if;
  insert into kxra.account_security_events(org_id,user_id,actor_id,event_type)
  values(p.org_id,p.user_id,p.user_id,'ONBOARDING_COMPLETED');
  insert into kxra.audit_events(org_id,actor_id,action,resource_id)
  values(p.org_id,p.user_id,'onboarding.completed',p.user_id);
 end if;
 return next_step;
end $$;

revoke all on all functions in schema kxra_private from public;
revoke all on function kxra_private.normalize_email(text),kxra_private.email_hint(text),
 kxra_private.queue_email(uuid,uuid,uuid,text,text,jsonb,text)
from authenticated,anon;
revoke all on function
 kxra.create_multi_project_invitation(text,jsonb,text,text,timestamptz),
 kxra.create_invitation(uuid,text,text,text,timestamptz),
 kxra.register_invited_profile(uuid,integer,text),kxra.mark_current_email_verified(),
 kxra.redeem_invitation_version(uuid,integer,text),kxra.redeem_invitation(text),
 kxra.resend_invitation(uuid,text),kxra.revoke_invitation(uuid),
 kxra.mark_invitation_delivery(uuid,integer,uuid,boolean,text,text),
 kxra.update_own_profile(jsonb),kxra.update_own_preferences(jsonb),
 kxra.record_mfa_state(text,text),kxra.record_password_event(text),
 kxra.revoke_own_sessions(text,text),kxra.onboarding_projects(),
 kxra.complete_onboarding_step(integer,jsonb)
from public;
grant execute on function
 kxra.create_multi_project_invitation(text,jsonb,text,text,timestamptz),
 kxra.create_invitation(uuid,text,text,text,timestamptz),
 kxra.register_invited_profile(uuid,integer,text),kxra.mark_current_email_verified(),
 kxra.redeem_invitation_version(uuid,integer,text),kxra.redeem_invitation(text),
 kxra.resend_invitation(uuid,text),kxra.revoke_invitation(uuid),
 kxra.mark_invitation_delivery(uuid,integer,uuid,boolean,text,text),
 kxra.update_own_profile(jsonb),kxra.update_own_preferences(jsonb),
 kxra.record_mfa_state(text,text),kxra.record_password_event(text),
 kxra.revoke_own_sessions(text,text),kxra.onboarding_projects(),
 kxra.complete_onboarding_step(integer,jsonb)
to authenticated;
grant execute on function kxra.preview_invitation(text) to authenticated,anon;

commit;
