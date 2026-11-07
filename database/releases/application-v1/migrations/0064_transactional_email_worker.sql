begin;

do $$ begin
 if not exists(select 1 from pg_roles where rolname='kxra_email_worker') then
  create role kxra_email_worker nologin noinherit nobypassrls;
 end if;
end $$;

grant usage on schema kxra,kxra_private to kxra_email_worker;

alter table kxra.transactional_email_outbox
 drop constraint transactional_email_outbox_state_check;
alter table kxra.transactional_email_outbox
 add constraint transactional_email_outbox_state_check check(state in (
  'PENDING','RUNNING','SENT','DELIVERED','DELIVERY_FAILED','CANCELLED','BOUNCED',
  'RECONCILIATION_REQUIRED'
 ));
alter table kxra.transactional_email_outbox
 add column lease_expires_at timestamptz,
 add column worker_reference text check(
  worker_reference is null or length(trim(worker_reference)) between 3 and 160
 ),
 add column provider_state text check(
  provider_state is null or provider_state in (
   'ACCEPTED','DELIVERED','DELAYED','BOUNCED','COMPLAINED','FAILED','SUPPRESSED'
 )),
 add column max_attempts integer not null default 5 check(max_attempts between 1 and 10),
 add constraint transactional_email_outbox_lease_check check(
  (state='RUNNING')=(lease_expires_at is not null and worker_reference is not null)
 );

create table kxra.transactional_email_delivery_secrets(
 outbox_id uuid primary key references kxra.transactional_email_outbox(id) on delete cascade,
 org_id uuid not null references kxra.organisations(id),
 ciphertext text not null check(length(ciphertext) between 16 and 2000),
 nonce text not null check(length(nonce) between 16 and 64),
 auth_tag text not null check(length(auth_tag) between 16 and 64),
 secret_sha256 text not null check(secret_sha256~'^[a-f0-9]{64}$'),
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 consumed_at timestamptz,
 unique(org_id,outbox_id)
);

create table kxra.transactional_email_provider_events(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 outbox_id uuid not null references kxra.transactional_email_outbox(id),
 provider_event_id text not null check(length(provider_event_id) between 3 and 240),
 provider_message_id text not null check(length(provider_message_id) between 3 and 240),
 event_type text not null check(event_type in (
  'DELIVERED','DELAYED','BOUNCED','COMPLAINED','FAILED','SUPPRESSED'
 )),
 occurred_at timestamptz not null,
 received_at timestamptz not null default now(),
 unique(provider_event_id),
 unique(org_id,id)
);

create index transactional_email_worker_queue
 on kxra.transactional_email_outbox(state,next_attempt_at,created_at,id)
 where state in ('PENDING','DELIVERY_FAILED','RUNNING');
create unique index transactional_email_provider_message
 on kxra.transactional_email_outbox(provider_message_id)
 where provider_message_id is not null;

alter table kxra.transactional_email_delivery_secrets enable row level security;
alter table kxra.transactional_email_provider_events enable row level security;
grant select on kxra.transactional_email_delivery_secrets,
 kxra.transactional_email_provider_events to authenticated,anon;
create policy transactional_email_secrets_owner_read
 on kxra.transactional_email_delivery_secrets for select
 using(kxra_private.is_owner(org_id));
create policy transactional_email_events_owner_read
 on kxra.transactional_email_provider_events for select
 using(kxra_private.is_owner(org_id));

create function kxra_private.guard_invitation_email_reconciliation()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.token_digest is distinct from old.token_digest and exists(
  select 1 from kxra.transactional_email_outbox value
  where value.invitation_id=old.id and value.state='RECONCILIATION_REQUIRED'
 ) then raise exception 'Email delivery requires reconciliation';end if;
 return new;
end $$;
create trigger invitation_email_reconciliation_guard
 before update of token_digest on kxra.invitations
 for each row execute function kxra_private.guard_invitation_email_reconciliation();

create function kxra.attach_transactional_email_secret(
 p_outbox uuid,p_ciphertext text,p_nonce text,p_auth_tag text,p_secret_sha256 text
) returns void
language plpgsql security definer set search_path='' as $$
declare mail kxra.transactional_email_outbox;invite kxra.invitations;
begin
 select * into mail from kxra.transactional_email_outbox value
 where value.id=p_outbox for update;
 select * into invite from kxra.invitations value
 where value.id=mail.invitation_id;
 if mail.id is null or invite.id is null or mail.state<>'PENDING'
  or not kxra_private.mfa_owner(mail.org_id)
  or invite.org_id<>mail.org_id or invite.token_digest<>p_secret_sha256
  or p_ciphertext is null or length(p_ciphertext) not between 16 and 2000
  or p_nonce is null or length(p_nonce) not between 16 and 64
  or p_auth_tag is null or length(p_auth_tag) not between 16 and 64
  or p_secret_sha256!~'^[a-f0-9]{64}$'
 then raise exception 'Email delivery secret unavailable';end if;
 insert into kxra.transactional_email_delivery_secrets(
  outbox_id,org_id,ciphertext,nonce,auth_tag,secret_sha256,created_by
 ) values(p_outbox,mail.org_id,p_ciphertext,p_nonce,p_auth_tag,p_secret_sha256,auth.uid())
 on conflict(outbox_id) do nothing;
 if not found then raise exception 'Email delivery secret conflict';end if;
end $$;

create function kxra_private.claim_transactional_email(p_worker text)
returns table(
 outbox_id uuid,org_id uuid,invitation_id uuid,user_id uuid,template_key text,
 template_version integer,recipient text,recipient_hint text,payload jsonb,
 operation_key text,ciphertext text,nonce text,auth_tag text,secret_sha256 text,
 project_names text[],attempt integer
) language plpgsql security definer set search_path='' as $$
declare mail kxra.transactional_email_outbox;recipient_value text;
begin
 if length(trim(p_worker)) not between 3 and 160 or p_worker~'[[:cntrl:]]'
 then raise exception 'Email worker unavailable';end if;
 update kxra.transactional_email_outbox value set
  state='RECONCILIATION_REQUIRED',lease_expires_at=null,worker_reference=null,
  last_error='Worker lease expired after provider dispatch may have begun',updated_at=now()
 where value.state='RUNNING' and value.lease_expires_at<=now();
 update kxra.transactional_email_outbox value set state='BOUNCED',
  last_error='EMAIL_RETRY_EXHAUSTED',next_attempt_at=null,updated_at=now()
 where value.state='DELIVERY_FAILED' and value.attempt_count>=value.max_attempts;
 select value.* into mail from kxra.transactional_email_outbox value
 left join kxra.transactional_email_delivery_secrets secret on secret.outbox_id=value.id
 where value.state in ('PENDING','DELIVERY_FAILED')
  and coalesce(value.next_attempt_at,'-infinity'::timestamptz)<=now()
  and value.attempt_count<value.max_attempts
  and (value.invitation_id is null or secret.outbox_id is not null)
 order by value.created_at,value.id for update of value skip locked limit 1;
 if not found then return;end if;
 if mail.invitation_id is not null then
  select value.recipient_email into recipient_value from kxra.invitations value
  where value.id=mail.invitation_id and value.org_id=mail.org_id
   and value.state in ('PENDING','DELIVERY_FAILED')
   and value.expires_at>now()
   and value.delivery_version=coalesce((mail.payload->>'delivery_version')::integer,1);
 elsif mail.user_id is not null then
  select value.recipient_email into recipient_value from kxra.invitations value
  where value.org_id=mail.org_id and value.redeemed_by=mail.user_id
   and value.recipient_email is not null order by value.redeemed_at desc limit 1;
 end if;
 if recipient_value is null then
  update kxra.transactional_email_outbox set state='CANCELLED',updated_at=now()
  where id=mail.id;return;
 end if;
 update kxra.transactional_email_outbox value set state='RUNNING',
  attempt_count=value.attempt_count+1,lease_expires_at=now()+interval '2 minutes',
  worker_reference=trim(p_worker),last_error=null,updated_at=now()
 where value.id=mail.id returning * into mail;
 return query select mail.id,mail.org_id,mail.invitation_id,mail.user_id,
  mail.template_key,mail.template_version,recipient_value,mail.recipient_hint,
  mail.payload,mail.operation_key,secret.ciphertext,secret.nonce,secret.auth_tag,
  secret.secret_sha256,
  coalesce((select array_agg(project.code||' · '||project.name order by project.code)
   from kxra.invitation_project_grants grant_row join kxra.projects project
    on project.id=grant_row.project_id and project.org_id=grant_row.org_id
   where grant_row.invitation_id=mail.invitation_id),'{}'::text[]),mail.attempt_count
 from kxra.transactional_email_delivery_secrets secret where secret.outbox_id=mail.id
 union all
 select mail.id,mail.org_id,mail.invitation_id,mail.user_id,
  mail.template_key,mail.template_version,recipient_value,mail.recipient_hint,
  mail.payload,mail.operation_key,null,null,null,null,'{}'::text[],mail.attempt_count
 where mail.invitation_id is null;
end $$;

create function kxra_private.authorize_transactional_email(
 p_outbox uuid,p_worker text
) returns boolean
language plpgsql security definer set search_path='' as $$
declare mail kxra.transactional_email_outbox;invite kxra.invitations;
begin
 select * into mail from kxra.transactional_email_outbox value
 where value.id=p_outbox for update;
 if mail.id is null or mail.state<>'RUNNING' or mail.worker_reference<>trim(p_worker)
  or mail.lease_expires_at<=now() then return false;end if;
 if mail.invitation_id is not null then
  select * into invite from kxra.invitations value where value.id=mail.invitation_id;
  if invite.id is null or invite.state not in ('PENDING','DELIVERY_FAILED')
   or invite.expires_at<=now()
   or invite.delivery_version<>coalesce((mail.payload->>'delivery_version')::integer,1)
   or not exists(select 1 from kxra.transactional_email_delivery_secrets secret
    where secret.outbox_id=mail.id and secret.secret_sha256=invite.token_digest)
  then update kxra.transactional_email_outbox set state='CANCELLED',
    lease_expires_at=null,worker_reference=null,updated_at=now() where id=mail.id;
   return false;end if;
 elsif mail.template_key not in ('ACCESS_REMOVED','SECURITY_ALERT') and not exists(
  select 1 from kxra.profiles profile where profile.user_id=mail.user_id
   and profile.org_id=mail.org_id and profile.account_state='ACTIVE'
 ) then update kxra.transactional_email_outbox set state='CANCELLED',
   lease_expires_at=null,worker_reference=null,updated_at=now() where id=mail.id;
  return false;
 end if;
 return true;
end $$;

create function kxra_private.complete_transactional_email(
 p_outbox uuid,p_worker text,p_result text,p_provider_message_id text,
 p_error_code text,p_retry_after_seconds integer
) returns text
language plpgsql security definer set search_path='' as $$
declare mail kxra.transactional_email_outbox;next_state text;
begin
 select * into mail from kxra.transactional_email_outbox value
 where value.id=p_outbox for update;
 if mail.id is null or mail.state<>'RUNNING' or mail.worker_reference<>trim(p_worker)
  or mail.lease_expires_at<=now() or p_result not in ('ACCEPTED','RETRY','PERMANENT','AMBIGUOUS')
  or p_provider_message_id is not null and length(p_provider_message_id)>240
  or p_error_code is not null and p_error_code!~'^[A-Z][A-Z0-9_]{2,79}$'
 then raise exception 'Email delivery result unavailable';end if;
 next_state=case p_result when 'ACCEPTED' then 'SENT'
  when 'RETRY' then case when mail.attempt_count>=mail.max_attempts then 'BOUNCED' else 'DELIVERY_FAILED' end
  when 'PERMANENT' then 'BOUNCED'
  else 'RECONCILIATION_REQUIRED' end;
 update kxra.transactional_email_outbox set state=next_state,
  provider_message_id=case when p_result='ACCEPTED' then p_provider_message_id else provider_message_id end,
  provider_state=case when p_result='ACCEPTED' then 'ACCEPTED'
   when p_result='PERMANENT' then 'FAILED' else provider_state end,
  last_error=case when p_result='ACCEPTED' then null else coalesce(p_error_code,'EMAIL_PROVIDER_UNKNOWN') end,
  next_attempt_at=case when p_result='RETRY' and mail.attempt_count<mail.max_attempts
   then now()+make_interval(secs=>least(greatest(coalesce(p_retry_after_seconds,30),5),3600)) else null end,
  lease_expires_at=null,worker_reference=null,updated_at=now() where id=mail.id;
 if p_result='ACCEPTED' then
  update kxra.transactional_email_delivery_secrets set consumed_at=coalesce(consumed_at,now())
  where outbox_id=mail.id;
  update kxra.invitations set state='SENT',sent_at=now(),delivery_error=null,updated_at=now()
  where id=mail.invitation_id and state in ('PENDING','DELIVERY_FAILED')
   and delivery_version=coalesce((mail.payload->>'delivery_version')::integer,1);
 elsif mail.invitation_id is not null and p_result in ('RETRY','PERMANENT') then
  update kxra.invitations set state='DELIVERY_FAILED',
   delivery_error=coalesce(p_error_code,'EMAIL_PROVIDER_UNKNOWN'),updated_at=now()
  where id=mail.invitation_id and state in ('PENDING','DELIVERY_FAILED');
 end if;
 return next_state;
end $$;

create function kxra_private.record_transactional_email_provider_event(
 p_event_id text,p_message_id text,p_event_type text,p_occurred_at timestamptz
) returns text
language plpgsql security definer set search_path='' as $$
declare mail kxra.transactional_email_outbox;existing kxra.transactional_email_provider_events;
begin
 if length(p_event_id) not between 3 and 240 or length(p_message_id) not between 3 and 240
  or p_event_type not in ('DELIVERED','DELAYED','BOUNCED','COMPLAINED','FAILED','SUPPRESSED')
  or p_occurred_at is null or p_occurred_at>now()+interval '5 minutes'
 then raise exception 'Email provider event unavailable';end if;
 select * into existing from kxra.transactional_email_provider_events value
 where value.provider_event_id=p_event_id;
 if existing.id is not null then
  if existing.provider_message_id<>p_message_id or existing.event_type<>p_event_type
   or existing.occurred_at<>p_occurred_at
  then raise exception 'Email provider event conflict';end if;
  return (select value.state from kxra.transactional_email_outbox value
   where value.id=existing.outbox_id);
 end if;
 select * into mail from kxra.transactional_email_outbox value
 where value.provider_message_id=p_message_id for update;
 if mail.id is null or mail.state not in ('SENT','DELIVERED','BOUNCED')
 then raise exception 'Email provider event unavailable';end if;
 insert into kxra.transactional_email_provider_events(
  org_id,outbox_id,provider_event_id,provider_message_id,event_type,occurred_at
 ) values(mail.org_id,mail.id,p_event_id,p_message_id,p_event_type,p_occurred_at);
 update kxra.transactional_email_outbox set
  state=case when p_event_type='DELIVERED' then 'DELIVERED'
   when p_event_type in ('BOUNCED','COMPLAINED','FAILED','SUPPRESSED') then 'BOUNCED'
   else state end,
  provider_state=p_event_type,last_error=case
   when p_event_type in ('BOUNCED','COMPLAINED','FAILED','SUPPRESSED')
    then 'RESEND_'||p_event_type else null end,updated_at=now()
 where id=mail.id;
 return (select value.state from kxra.transactional_email_outbox value where value.id=mail.id);
end $$;

revoke all on function kxra.attach_transactional_email_secret(uuid,text,text,text,text)
 from public,anon;
grant execute on function kxra.attach_transactional_email_secret(uuid,text,text,text,text)
 to authenticated;
revoke all on function kxra_private.claim_transactional_email(text),
 kxra_private.authorize_transactional_email(uuid,text),
 kxra_private.complete_transactional_email(uuid,text,text,text,text,integer),
 kxra_private.record_transactional_email_provider_event(text,text,text,timestamptz)
 from public,authenticated,anon;
grant execute on function kxra_private.claim_transactional_email(text),
 kxra_private.authorize_transactional_email(uuid,text),
 kxra_private.complete_transactional_email(uuid,text,text,text,text,integer),
 kxra_private.record_transactional_email_provider_event(text,text,text,timestamptz)
 to kxra_email_worker;

commit;
