begin;

-- Consequential owner actions require AAL2 obtained within the last 15 minutes.
create or replace function kxra_private.mfa_owner(o uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select kxra_private.is_owner(o)
  and coalesce(auth.jwt()->>'aal','')='aal2'
  and coalesce(auth.jwt()->>'auth_time','')~'^\d{1,12}$'
  and to_timestamp((auth.jwt()->>'auth_time')::double precision)>=now()-interval '15 minutes'
  and to_timestamp((auth.jwt()->>'auth_time')::double precision)<=now()+interval '1 minute'
$$;

create table kxra.invitations(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations,
 project_id uuid not null,
 email_digest text not null check(email_digest~'^[a-f0-9]{64}$'),
 token_digest text not null unique check(token_digest~'^[a-f0-9]{64}$'),
 role text not null check(role in ('viewer','contributor')),
 state text not null default 'pending' check(state in ('pending','redeemed','revoked')),
 approved_by uuid not null,
 redeemed_by uuid,
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 redeemed_at timestamptz,
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 check(
  (state='pending' and redeemed_by is null and redeemed_at is null) or
  (state='redeemed' and redeemed_by is not null and redeemed_at is not null) or
  (state='revoked' and redeemed_by is null and redeemed_at is null)
 )
);
create index invitation_target on kxra.invitations(org_id,project_id,email_digest,state);
alter table kxra.invitations enable row level security;
grant select on kxra.invitations to authenticated,anon;
create policy invitations_owner_read on kxra.invitations for select using(
 kxra_private.is_owner(org_id)
);

create function kxra.create_invitation(
 project uuid,email text,member_role text,token_hash text,expiry timestamptz
) returns table(id uuid,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();normalized text=lower(trim(email));created kxra.invitations;
 begin
 if not kxra_private.mfa_owner(o) or not kxra_private.can_project(project)
  or normalized!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or member_role not in ('viewer','contributor') or token_hash!~'^[a-f0-9]{64}$'
  or expiry<=now() or expiry>now()+interval '7 days'
 then raise exception 'Invitation unavailable';end if;
 update kxra.invitations set state='revoked'
 where org_id=o and project_id=project and email_digest=encode(sha256(convert_to(normalized,'UTF8')),'hex')
  and state='pending';
 insert into kxra.invitations(org_id,project_id,email_digest,token_digest,role,approved_by,expires_at)
 values(o,project,encode(sha256(convert_to(normalized,'UTF8')),'hex'),token_hash,member_role,auth.uid(),expiry)
 returning * into created;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'invitation.created',created.id,jsonb_build_object('project_id',project,'role',member_role,'expires_at',expiry));
 return query select created.id,created.expires_at;
 end $$;

create function kxra.redeem_invitation(token_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
 declare invitation kxra.invitations;identity uuid=auth.uid();email text=lower(trim(auth.jwt()->>'email'));member kxra.members;label text;
 begin
 if identity is null or token_hash!~'^[a-f0-9]{64}$'
  or coalesce(auth.jwt()->>'email_verified','')<>'true'
  or email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 then raise exception 'Invitation unavailable';end if;
 select * into invitation from kxra.invitations
 where token_digest=token_hash and state='pending' for update;
 if not found or invitation.expires_at<=now()
  or invitation.email_digest<>encode(sha256(convert_to(email,'UTF8')),'hex')
 then raise exception 'Invitation unavailable';end if;
 select * into member from kxra.members where id=identity for update;
 if found and (member.org_id<>invitation.org_id or member.role<>'partner' or not member.active)
 then raise exception 'Invitation unavailable';end if;
 if not found then
  label=left(coalesce(nullif(trim(auth.jwt()->>'display_name'),''),split_part(email,'@',1)),120);
  insert into kxra.members(id,org_id,display_name,role,active)
  values(identity,invitation.org_id,label,'partner',true);
 end if;
 insert into kxra.project_memberships(org_id,project_id,user_id,role,active,expires_at)
 values(invitation.org_id,invitation.project_id,identity,invitation.role,true,null)
 on conflict(project_id,user_id) do update set role=excluded.role,active=true,expires_at=null;
 update kxra.invitations set state='redeemed',redeemed_by=identity,redeemed_at=now()
 where id=invitation.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(invitation.org_id,identity,'invitation.redeemed',invitation.id,jsonb_build_object('project_id',invitation.project_id,'role',invitation.role));
 return invitation.project_id;
 end $$;

revoke all on all functions in schema kxra_private from public;
revoke all on function kxra.create_invitation(uuid,text,text,text,timestamptz),kxra.redeem_invitation(text) from public;
grant execute on function kxra.create_invitation(uuid,text,text,text,timestamptz),kxra.redeem_invitation(text) to authenticated;

commit;
