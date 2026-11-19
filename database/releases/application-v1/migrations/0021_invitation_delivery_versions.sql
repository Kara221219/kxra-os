begin;

alter table kxra.invitations add column delivery_version integer not null default 1
 check(delivery_version>0);

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
  delivery_version=kxra.invitations.delivery_version+1,state='PENDING',sent_at=null,
  delivery_error=null,updated_at=now()
 where kxra.invitations.id=invite.id returning * into invite;
 queued=kxra_private.queue_email(
  invite.org_id,invite.id,null,'INVITATION_REMINDER',invite.recipient_email,
  jsonb_build_object('invitation_id',invite.id,'invitation_version',invite.version,
   'delivery_version',invite.delivery_version,'expires_at',invite.expires_at,
   'project_count',(select count(*) from kxra.invitation_project_grants g where g.invitation_id=invite.id)),
  'invitation:'||invite.id||':delivery:'||invite.delivery_version
 );
 insert into kxra.account_security_events(org_id,actor_id,event_type,metadata)
 values(invite.org_id,auth.uid(),'INVITATION_RESENT',
  jsonb_build_object('invitation_id',invite.id,'invitation_version',invite.version,
   'delivery_version',invite.delivery_version));
 -- The compatibility output named version represents the delivery generation.
 -- The approved grant version remains invitations.version and is unchanged.
 return query select invite.id,invite.delivery_version,invite.expires_at,queued,invite.recipient_email;
end $$;

create or replace function kxra.mark_invitation_delivery(
 invitation uuid,expected_version integer,outbox uuid,delivered boolean,
 provider_id text,error_message text default null
) returns void
language plpgsql security definer set search_path='' as $$
declare invite kxra.invitations;mail kxra.transactional_email_outbox;
begin
 select * into invite from kxra.invitations i where i.id=invitation for update;
 select * into mail from kxra.transactional_email_outbox e where e.id=outbox for update;
 if not found or invite.id is null or not kxra_private.is_owner(invite.org_id)
  or invite.delivery_version is distinct from expected_version
  or mail.invitation_id<>invite.id or mail.state<>'PENDING' or delivered is null
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

grant select on kxra.request_rate_limits to authenticated,anon;

commit;
