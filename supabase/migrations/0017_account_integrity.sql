begin;

-- 0015 was already exercised in the local review database before its
-- PL/pgSQL output-column ambiguity was discovered. Replacing the functions in
-- an additive migration keeps that database and a fresh install equivalent.
create or replace function kxra.create_multi_project_invitation(
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
  or (note is not null and length(note)>2000)
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
   or (membership_expiry is not null and membership_expiry<=now())
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

create or replace function kxra.resend_invitation(invitation uuid,new_token_hash text)
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
 update kxra.invitations set token_digest=new_token_hash,
  version=kxra.invitations.version+1,state='PENDING',sent_at=null,
  delivery_error=null,updated_at=now()
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

alter table kxra.agreement_documents add constraint agreement_documents_org_id_id_version_key
 unique(org_id,id,version);
alter table kxra.agreement_acceptances add constraint agreement_acceptances_document_version_fkey
 foreign key(org_id,agreement_id,agreement_version)
 references kxra.agreement_documents(org_id,id,version);

create function kxra_private.current_agreements_acknowledged(account uuid,o uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists(
  select 1 from kxra.agreement_documents d
  where d.org_id=o and d.required and d.status in ('APPROVED','UNAPPROVED_PLACEHOLDER')
   and not exists(
    select 1 from kxra.agreement_acceptances a
    where a.user_id=account and a.org_id=o and a.agreement_id=d.id
     and a.agreement_version=d.version
   )
 )
$$;

create or replace function kxra_private.member_org() returns uuid
language sql stable security definer set search_path='' as $$
 select m.org_id from kxra.members m
 join kxra.profiles p on p.user_id=m.id and p.org_id=m.org_id
 where m.id=auth.uid() and m.active and p.account_state='ACTIVE'
  and (m.role='owner' or kxra_private.current_agreements_acknowledged(m.id,m.org_id))
$$;

create or replace function kxra_private.can_project(p uuid,write_access boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.projects pr
  join kxra.members m on m.org_id=pr.org_id and m.id=auth.uid() and m.active
  join kxra.profiles profile on profile.user_id=m.id and profile.org_id=m.org_id
   and profile.account_state='ACTIVE'
  where pr.id=p and (
   m.role='owner' or (
    kxra_private.current_agreements_acknowledged(m.id,m.org_id) and exists(
     select 1 from kxra.project_memberships pm
     where pm.project_id=p and pm.user_id=m.id and pm.active
      and (pm.expires_at is null or pm.expires_at>now())
      and (not write_access or pm.role='contributor')
    )
   )
  )
 )
$$;

create function kxra.refresh_expired_invitations() returns integer
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();changed integer;
begin
 if not kxra_private.is_owner(o) then raise exception 'Invitation refresh unavailable';end if;
 update kxra.invitations set state='EXPIRED',updated_at=now()
 where org_id=o and state in ('PENDING','SENT','DELIVERY_FAILED') and expires_at<=now();
 get diagnostics changed=row_count;
 update kxra.transactional_email_outbox set state='CANCELLED',updated_at=now()
 where org_id=o and invitation_id in (
  select id from kxra.invitations where org_id=o and state='EXPIRED'
 ) and state in ('PENDING','DELIVERY_FAILED');
 return changed;
end $$;

create function kxra.resume_required_onboarding() returns integer
language plpgsql security definer set search_path='' as $$
declare p kxra.profiles;m kxra.members;
begin
 select * into p from kxra.profiles where user_id=auth.uid() for update;
 select * into m from kxra.members where id=auth.uid() and org_id=p.org_id for update;
 if p.user_id is null or m.id is null or not m.active or m.role<>'partner'
  or p.account_state in ('SUSPENDED','REVOKED')
 then raise exception 'Onboarding unavailable';end if;
 if p.account_state='ACTIVE' and not kxra_private.current_agreements_acknowledged(p.user_id,p.org_id) then
  update kxra.profiles set account_state='ONBOARDING',updated_at=now() where user_id=p.user_id;
  update kxra.onboarding_progress set current_step=8,
   completed_steps=array_remove(array_remove(completed_steps,8),9),completed_at=null,updated_at=now()
  where user_id=p.user_id;
  return 8;
 end if;
 return coalesce((select current_step from kxra.onboarding_progress where user_id=p.user_id),1);
end $$;

revoke all on function kxra_private.current_agreements_acknowledged(uuid,uuid) from public,authenticated,anon;
revoke all on function kxra.refresh_expired_invitations(),kxra.resume_required_onboarding() from public;
grant execute on function kxra.refresh_expired_invitations(),kxra.resume_required_onboarding() to authenticated;

commit;
