begin;

create function kxra_private.require_whatsapp_worker() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if current_setting('role',true)<>'kxra_whatsapp_worker'
 then raise exception 'WhatsApp worker unavailable';end if;
end $$;

create function kxra_private.whatsapp_account_authorized(
 account uuid,o uuid,p uuid default null
) returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.account_identities a
  join kxra.organisation_memberships m
   on m.account_id=a.account_id and m.org_id=o
  join kxra.organisations organisation on organisation.id=o
  where a.account_id=account and a.state='ACTIVE'
   and m.state='ACTIVE' and m.starts_at<=now() and m.revoked_at is null
   and (m.expires_at is null or m.expires_at>now())
   and organisation.state='ACTIVE'
   and not exists(
    select 1 from kxra.legal_document_requirements r
    join kxra.legal_documents d on d.org_id=r.org_id and d.id=r.document_id
     and d.version=r.document_version and d.content_sha256=r.document_sha256
     and d.status='APPROVED'
    where r.org_id=o and r.state='ACTIVE' and r.mandatory
     and (r.membership_id is null or r.membership_id=m.id)
     and (r.relationship_type is null or r.relationship_type=m.relationship_type)
     and not exists(
      select 1 from kxra.legal_acceptances accepted
      where accepted.account_id=account and accepted.membership_id=m.id
       and accepted.requirement_id=r.id and accepted.document_id=r.document_id
       and accepted.document_version=r.document_version
       and accepted.document_sha256=r.document_sha256
       and accepted.response='ACCEPTED'
     )
   )
   and (p is null or m.security_role in ('KXRA_OWNER','ORG_ADMIN') or exists(
    select 1 from kxra.project_memberships pm
    where pm.org_id=o and pm.project_id=p and pm.user_id=account and pm.active
     and (pm.expires_at is null or pm.expires_at>now())
   ))
 )
$$;

create function kxra.create_whatsapp_pairing_challenge(
 phone_hash text,waba text,number_id text,challenge_hash text,
 request uuid,expires timestamptz
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();membership kxra.organisation_memberships;result uuid;
begin
 if o is null or request is null or phone_hash!~'^[a-f0-9]{64}$'
  or challenge_hash!~'^[a-f0-9]{64}$' or length(trim(waba)) not between 1 and 120
  or length(trim(number_id)) not between 1 and 120
  or expires<=now() or expires>now()+interval '10 minutes'
 then raise exception 'Pairing challenge unavailable';end if;
 select id into result from kxra.whatsapp_pairing_challenges
 where org_id=o and account_id=auth.uid() and request_id=request
  and phone_digest=phone_hash and waba_id=trim(waba) and phone_number_id=trim(number_id)
  and challenge_digest=challenge_hash;
 if found then return result;end if;
 select * into membership from kxra.organisation_memberships m
 where m.org_id=o and m.account_id=auth.uid() and m.state='ACTIVE'
  and m.revoked_at is null and (m.expires_at is null or m.expires_at>now()) for share;
 if not found then raise exception 'Pairing challenge unavailable';end if;
 update kxra.whatsapp_pairing_challenges set state='REVOKED',revoked_at=now()
 where org_id=o and account_id=auth.uid() and state='PENDING';
 insert into kxra.whatsapp_pairing_challenges(
  org_id,account_id,membership_version,phone_digest,waba_id,phone_number_id,
  challenge_digest,request_id,expires_at
 ) values(o,auth.uid(),membership.version,phone_hash,trim(waba),trim(number_id),
  challenge_hash,request,expires) returning id into result;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'whatsapp.pairing_challenge_created',result,
  jsonb_build_object('membership_version',membership.version,'expires_at',expires));
 return result;
end $$;

create function kxra.select_whatsapp_project(pairing uuid,project uuid,request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();p kxra.whatsapp_gateway_pairings;result uuid;
begin
 select id into result from kxra.whatsapp_project_selections
 where org_id=o and account_id=auth.uid() and request_id=request
  and pairing_id=pairing and project_id=project;
 if found then return result;end if;
 select * into p from kxra.whatsapp_gateway_pairings x
 where x.id=pairing and x.org_id=o and x.account_id=auth.uid()
  and x.state='ACTIVE' and x.revoked_at is null for update;
 if not found or request is null or not kxra_private.can_project(project,false)
 then raise exception 'WhatsApp project unavailable';end if;
 update kxra.whatsapp_project_selections set state='REVOKED',revoked_at=now()
 where pairing_id=p.id and state='ACTIVE';
 insert into kxra.whatsapp_project_selections(
  org_id,pairing_id,project_id,account_id,pairing_version,request_id
 ) values(o,p.id,project,auth.uid(),p.version,request) returning id into result;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'whatsapp.project_selected',result,
  jsonb_build_object('pairing_id',p.id,'project_id',project,'request_id',request));
 return result;
end $$;

create function kxra.revoke_whatsapp_pairing(pairing uuid,reason text,request uuid)
returns void language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();p kxra.whatsapp_gateway_pairings;
begin
 select * into p from kxra.whatsapp_gateway_pairings x where x.id=pairing
  and x.org_id=o and (x.account_id=auth.uid() or kxra_private.is_owner(o)) for update;
 if not found or p.state<>'ACTIVE' or request is null or length(trim(reason)) not between 3 and 1000
 then raise exception 'WhatsApp pairing unavailable';end if;
 update kxra.whatsapp_gateway_pairings set state='REVOKED',revoked_at=now(),
  revoke_reason=trim(reason),version=version+1,updated_at=now() where id=p.id;
 update kxra.whatsapp_project_selections set state='REVOKED',revoked_at=now()
  where pairing_id=p.id and state='ACTIVE';
 update kxra.whatsapp_outbound_intents set state='CANCELLED',
  cancellation_code='PAIRING_REVOKED',updated_at=now()
  where pairing_id=p.id and state in ('HELD','READY');
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'whatsapp.pairing_revoked',p.id,jsonb_build_object('request_id',request));
end $$;

create function kxra_private.complete_whatsapp_pairing(
 challenge uuid,challenge_hash text,phone_hash text,waba text,number_id text
) returns uuid language plpgsql security definer set search_path='' as $$
declare c kxra.whatsapp_pairing_challenges;result uuid;
begin
 perform kxra_private.require_whatsapp_worker();
 select * into c from kxra.whatsapp_pairing_challenges where id=challenge for update;
 if not found then raise exception 'Pairing challenge unavailable';end if;
 if c.state<>'PENDING' or c.expires_at<=now() or c.attempt_count>=c.maximum_attempts then
  if c.state='PENDING' then update kxra.whatsapp_pairing_challenges
   set state=case when c.expires_at<=now() then 'EXPIRED' else 'ATTEMPTS_EXHAUSTED' end
   where id=c.id;end if;
  return null;
 end if;
 if c.challenge_digest<>challenge_hash or c.phone_digest<>phone_hash
  or c.waba_id<>trim(waba) or c.phone_number_id<>trim(number_id)
 then
  update kxra.whatsapp_pairing_challenges set attempt_count=attempt_count+1,
   state=case when attempt_count+1>=maximum_attempts then 'ATTEMPTS_EXHAUSTED' else state end
  where id=c.id;
  return null;
 end if;
 if not kxra_private.whatsapp_account_authorized(c.account_id,c.org_id,null)
  or not exists(select 1 from kxra.organisation_memberships m where m.org_id=c.org_id
   and m.account_id=c.account_id and m.version=c.membership_version and m.state='ACTIVE')
 then
  update kxra.whatsapp_pairing_challenges set state='REVOKED',revoked_at=now()
   where id=c.id;
  return null;
 end if;
 update kxra.whatsapp_gateway_pairings set state='REVOKED',revoked_at=now(),
  revoke_reason='Replaced by a newly verified pairing',version=version+1,updated_at=now()
 where org_id=c.org_id and account_id=c.account_id and state='ACTIVE';
 insert into kxra.whatsapp_gateway_pairings(
  org_id,account_id,challenge_id,phone_digest,waba_id,phone_number_id,verified_at
 ) values(c.org_id,c.account_id,c.id,c.phone_digest,c.waba_id,c.phone_number_id,now())
 returning id into result;
 update kxra.whatsapp_pairing_challenges set state='COMPLETED',completed_at=now()
 where id=c.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(c.org_id,c.account_id,'whatsapp.pairing_completed',result,
  jsonb_build_object('challenge_id',c.id));
 return result;
end $$;

create function kxra_private.ingest_whatsapp_message(
 provider_event text,provider_message text,payload_hash text,
 phone_hash text,waba text,number_id text,intent text,content_hash text,
 content_ref text,media_id text default null,media_kind text default null,
 media_mime text default null,media_size bigint default null,voice_consent boolean default false
) returns table(event_id uuid,message_id uuid,project_id uuid,deduplicated boolean)
language plpgsql security definer set search_path='' as $$
declare p kxra.whatsapp_gateway_pairings;s kxra.whatsapp_project_selections;
 e kxra.whatsapp_ingress_events;m kxra.whatsapp_messages;
begin
 perform kxra_private.require_whatsapp_worker();
 if payload_hash!~'^[a-f0-9]{64}$' or content_hash!~'^[a-f0-9]{64}$'
  or intent not in ('IDEA','DISCUSSION','VALIDATION_REQUEST','RESEARCH_REQUEST','NOTE',
   'TASK_PROPOSAL','PROJECT_STATUS','MEDIA','VOICE_NOTE','HUMAN_HELP')
 then raise exception 'WhatsApp ingress unavailable';end if;
 select * into e from kxra.whatsapp_ingress_events
 where provider='META_WHATSAPP_CLOUD' and (provider_event_id=provider_event or provider_message_id=provider_message);
 if found then return query select e.id,mx.id,mx.project_id,true
  from kxra.whatsapp_messages mx where mx.ingress_event_id=e.id;return;end if;
 select * into p from kxra.whatsapp_gateway_pairings x
 where x.phone_digest=phone_hash and x.waba_id=trim(waba) and x.phone_number_id=trim(number_id)
  and x.state='ACTIVE' and x.revoked_at is null for share;
 if not found or not kxra_private.whatsapp_account_authorized(p.account_id,p.org_id,null)
 then raise exception 'WhatsApp pairing unavailable';end if;
 select * into s from kxra.whatsapp_project_selections x
 where x.pairing_id=p.id and x.state='ACTIVE';
 if intent<>'HUMAN_HELP' and (not found or s.pairing_version<>p.version
  or not kxra_private.whatsapp_account_authorized(p.account_id,p.org_id,s.project_id))
 then raise exception 'WhatsApp project unavailable';end if;
 insert into kxra.whatsapp_ingress_events(
  org_id,pairing_id,provider_event_id,provider_message_id,payload_sha256,
  signature_verified_at,state
 ) values(p.org_id,p.id,provider_event,provider_message,payload_hash,now(),'AUTHORIZED')
 returning * into e;
 insert into kxra.whatsapp_messages(
  org_id,ingress_event_id,pairing_id,account_id,project_id,intent_type,
  content_sha256,content_reference,state,authorization_checked_at
 ) values(p.org_id,e.id,p.id,p.account_id,
  case when intent='HUMAN_HELP' then null else s.project_id end,intent,content_hash,
  content_ref,case when intent='HUMAN_HELP' then 'TAKEOVER' else 'AUTHORIZED' end,now())
 returning * into m;
 if media_id is not null then
  if intent not in ('MEDIA','VOICE_NOTE') or media_kind not in ('DOCUMENT','IMAGE','VOICE')
   or media_mime is null then raise exception 'WhatsApp media unavailable';end if;
  insert into kxra.whatsapp_media_items(
   org_id,message_id,provider_media_id,media_kind,declared_mime_type,
   declared_size_bytes,transcription_consent,transcription_state
  ) values(p.org_id,m.id,media_id,media_kind,media_mime,media_size,voice_consent,
   case when media_kind='VOICE' and not voice_consent then 'BLOCKED' else 'NOT_REQUESTED' end);
 end if;
 update kxra.whatsapp_ingress_events set state='PROCESSED' where id=e.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(p.org_id,p.account_id,'whatsapp.message_ingested',m.id,
  jsonb_build_object('intent_type',intent,'project_id',m.project_id));
 return query select e.id,m.id,m.project_id,false;
end $$;

create function kxra_private.create_whatsapp_outbound_intent(
 inbound_message uuid,response_hash text,response_ref text,request uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare m kxra.whatsapp_messages;p kxra.whatsapp_gateway_pairings;
 membership kxra.organisation_memberships;result uuid;
begin
 perform kxra_private.require_whatsapp_worker();
 select * into m from kxra.whatsapp_messages where id=inbound_message for share;
 if not found or m.project_id is null or response_hash!~'^[a-f0-9]{64}$' or request is null
 then raise exception 'WhatsApp outbound unavailable';end if;
 select * into p from kxra.whatsapp_gateway_pairings where id=m.pairing_id for share;
 if not found or p.state<>'ACTIVE' or not kxra_private.whatsapp_account_authorized(
  p.account_id,p.org_id,m.project_id
 ) or exists(select 1 from kxra.whatsapp_takeovers t where t.pairing_id=p.id and t.state='ACTIVE')
 then raise exception 'WhatsApp outbound unavailable';end if;
 select * into membership from kxra.organisation_memberships x
  where x.org_id=p.org_id and x.account_id=p.account_id;
 insert into kxra.whatsapp_outbound_intents(
  org_id,pairing_id,message_id,project_id,pairing_version,project_access_version,
  response_sha256,response_reference,idempotency_key,state,cancellation_code,
  authorization_checked_at
 ) values(p.org_id,p.id,m.id,m.project_id,p.version,
  membership.version,response_hash,response_ref,request,
  'HELD','ADAPTER_DISABLED',now())
 on conflict(message_id) do update set updated_at=kxra.whatsapp_outbound_intents.updated_at
 returning id into result;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(p.org_id,p.account_id,'whatsapp.outbound_intent_created',result,
  jsonb_build_object('adapter','DISABLED','delivery_state','NOT_SENT'));
 return result;
end $$;

create function kxra_private.reauthorize_whatsapp_outbound(intent uuid)
returns text language plpgsql security definer set search_path='' as $$
declare i kxra.whatsapp_outbound_intents;p kxra.whatsapp_gateway_pairings;reason text;
begin
 perform kxra_private.require_whatsapp_worker();
 select * into i from kxra.whatsapp_outbound_intents where id=intent for update;
 if not found or i.state not in ('HELD','READY') then raise exception 'WhatsApp outbound unavailable';end if;
 select * into p from kxra.whatsapp_gateway_pairings where id=i.pairing_id;
 reason=case
  when p.state<>'ACTIVE' or p.version<>i.pairing_version then 'PAIRING_REVOKED'
  when not kxra_private.whatsapp_account_authorized(p.account_id,p.org_id,i.project_id) then 'PROJECT_UNAVAILABLE'
  when exists(select 1 from kxra.whatsapp_takeovers t where t.pairing_id=p.id and t.state='ACTIVE') then 'TAKEOVER_ACTIVE'
  else 'ADAPTER_DISABLED' end;
 update kxra.whatsapp_outbound_intents set state='CANCELLED',cancellation_code=reason,
  authorization_checked_at=now(),updated_at=now() where id=i.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(i.org_id,p.account_id,'whatsapp.outbound_cancelled',i.id,jsonb_build_object('reason',reason));
 return reason;
end $$;

revoke all on function kxra.create_whatsapp_pairing_challenge(text,text,text,text,uuid,timestamptz),
 kxra.select_whatsapp_project(uuid,uuid,uuid),
 kxra.revoke_whatsapp_pairing(uuid,text,uuid) from public,anon;
grant execute on function kxra.create_whatsapp_pairing_challenge(text,text,text,text,uuid,timestamptz),
 kxra.select_whatsapp_project(uuid,uuid,uuid),
 kxra.revoke_whatsapp_pairing(uuid,text,uuid) to authenticated;

revoke all on function kxra_private.require_whatsapp_worker(),
 kxra_private.whatsapp_account_authorized(uuid,uuid,uuid),
 kxra_private.complete_whatsapp_pairing(uuid,text,text,text,text),
 kxra_private.ingest_whatsapp_message(text,text,text,text,text,text,text,text,text,text,text,text,bigint,boolean),
 kxra_private.create_whatsapp_outbound_intent(uuid,text,text,uuid),
 kxra_private.reauthorize_whatsapp_outbound(uuid) from public,authenticated,anon;
grant execute on function kxra_private.require_whatsapp_worker(),
 kxra_private.whatsapp_account_authorized(uuid,uuid,uuid),
 kxra_private.complete_whatsapp_pairing(uuid,text,text,text,text),
 kxra_private.ingest_whatsapp_message(text,text,text,text,text,text,text,text,text,text,text,text,bigint,boolean),
 kxra_private.create_whatsapp_outbound_intent(uuid,text,text,uuid),
 kxra_private.reauthorize_whatsapp_outbound(uuid) to kxra_whatsapp_worker;

commit;
