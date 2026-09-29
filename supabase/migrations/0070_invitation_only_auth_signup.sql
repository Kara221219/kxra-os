begin;

-- Supabase Auth signup remains fail-closed unless the KXRA server first
-- proves an active invitation and creates a short-lived one-use challenge.
create table kxra.auth_signup_challenges(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 invitation_id uuid not null references kxra.invitations(id) on delete cascade,
 email_digest text not null check(email_digest~'^[a-f0-9]{64}$'),
 token_digest text not null check(token_digest~'^[a-f0-9]{64}$'),
 proof_digest text not null unique check(proof_digest~'^[a-f0-9]{64}$'),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now(),
 foreign key(org_id,invitation_id) references kxra.invitations(org_id,id),
 check(expires_at>created_at),
 check(consumed_at is null or consumed_at>=created_at)
);

create index auth_signup_challenge_invitation
 on kxra.auth_signup_challenges(invitation_id,created_at desc);
create index auth_signup_challenge_organisation
 on kxra.auth_signup_challenges(org_id);

alter table kxra.auth_signup_challenges enable row level security;
grant select on kxra.auth_signup_challenges to authenticated,anon;
create policy auth_signup_challenges_owner_read
 on kxra.auth_signup_challenges for select to authenticated
 using(kxra_private.is_owner(org_id));

create function kxra_private.prepare_invited_signup(
 p_token_digest text,p_proof_digest text
) returns timestamptz
language plpgsql security definer set search_path='' as $$
declare invite kxra.invitations;challenge_expiry timestamptz;
begin
 if p_token_digest!~'^[a-f0-9]{64}$' or p_proof_digest!~'^[a-f0-9]{64}$'
 then raise exception 'Registration unavailable';end if;

 select * into invite from kxra.invitations value
 where value.token_digest=p_token_digest
  and value.state in ('PENDING','SENT','DELIVERY_FAILED')
  and value.expires_at>now() and value.redeemed_by is null
 for update;
 if not found then raise exception 'Registration unavailable';end if;

 update kxra.auth_signup_challenges set consumed_at=now()
 where invitation_id=invite.id and consumed_at is null;
 challenge_expiry=least(invite.expires_at,now()+interval '5 minutes');
 insert into kxra.auth_signup_challenges(
  org_id,invitation_id,email_digest,token_digest,proof_digest,expires_at
 ) values(
  invite.org_id,invite.id,invite.email_digest,invite.token_digest,
  p_proof_digest,challenge_expiry
 );
 return challenge_expiry;
end $$;

revoke all on function kxra_private.prepare_invited_signup(text,text) from public;
grant execute on function kxra_private.prepare_invited_signup(text,text) to anon,authenticated;

-- This function is configured as Supabase Auth's Before User Created hook.
-- It is a security invoker and receives only the narrow grants below.
create function kxra_private.before_user_created(event jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare
 normalized_email text=lower(trim(event->'user'->>'email'));
 proof text=event->'user'->'user_metadata'->>'kxra_signup_challenge';
 accepted uuid;
begin
 if normalized_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  or proof!~'^[A-Za-z0-9_-]{43,128}$'
 then return jsonb_build_object('error',jsonb_build_object(
  'http_code',403,'message','Registration unavailable'));
 end if;

 update kxra.auth_signup_challenges challenge set consumed_at=now()
 from kxra.invitations invitation
 where challenge.invitation_id=invitation.id
  and challenge.org_id=invitation.org_id
  and challenge.email_digest=encode(sha256(convert_to(normalized_email,'UTF8')),'hex')
  and challenge.proof_digest=encode(sha256(convert_to(proof,'UTF8')),'hex')
  and challenge.token_digest=invitation.token_digest
  and challenge.consumed_at is null and challenge.expires_at>now()
  and invitation.email_digest=challenge.email_digest
  and invitation.state in ('PENDING','SENT','DELIVERY_FAILED')
  and invitation.expires_at>now() and invitation.redeemed_by is null
 returning challenge.id into accepted;

 if accepted is null then return jsonb_build_object(
  'error',jsonb_build_object('http_code',403,'message','Registration unavailable')
 );end if;
 return '{}'::jsonb;
end $$;

revoke all on function kxra_private.before_user_created(jsonb) from public,anon,authenticated;
grant usage on schema kxra,kxra_private to supabase_auth_admin;
grant execute on function kxra_private.before_user_created(jsonb) to supabase_auth_admin;
grant select(id,email_digest,token_digest,state,expires_at,redeemed_by,org_id)
 on kxra.invitations to supabase_auth_admin;
grant select(id,org_id,invitation_id,email_digest,token_digest,proof_digest,expires_at,consumed_at),
 update(consumed_at) on kxra.auth_signup_challenges to supabase_auth_admin;
create policy invitations_auth_signup_hook_read
 on kxra.invitations for select to supabase_auth_admin using(true);
create policy auth_signup_challenges_hook_read
 on kxra.auth_signup_challenges for select to supabase_auth_admin using(true);
create policy auth_signup_challenges_hook_consume
 on kxra.auth_signup_challenges for update to supabase_auth_admin
 using(true) with check(true);

commit;
