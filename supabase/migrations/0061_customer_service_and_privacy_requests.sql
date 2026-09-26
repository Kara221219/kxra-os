begin;

create table kxra.customer_service_requests(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 submitted_by uuid not null references kxra.account_identities(account_id),
 client_request_id uuid not null,
 request_type text not null check(request_type in (
  'SUPPORT','SUBSCRIPTION_CANCELLATION','SUBSCRIPTION_WITHDRAWAL',
  'DATA_ACCESS','DATA_ERASURE','DATA_RECTIFICATION'
 )),
 subject text not null check(length(trim(subject)) between 3 and 240),
 description text not null check(length(trim(description)) between 3 and 20000),
 related_subscription_id uuid references kxra.billing_subscriptions(id),
 state text not null default 'SUBMITTED' check(state in (
  'SUBMITTED','ACKNOWLEDGED','IN_PROGRESS','AWAITING_CUSTOMER',
  'RESOLVED','CLOSED','CANCELLED'
 )),
 request_hash text not null check(request_hash~'^[a-f0-9]{64}$'),
 version integer not null default 1 check(version>0),
 submitted_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 closed_at timestamptz,
 unique(org_id,client_request_id),
 check((state in ('CLOSED','CANCELLED'))=(closed_at is not null)),
 check(
  (request_type in ('SUBSCRIPTION_CANCELLATION','SUBSCRIPTION_WITHDRAWAL'))
   =(related_subscription_id is not null)
 )
);

create table kxra.customer_service_events(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 request_id uuid not null references kxra.customer_service_requests(id),
 client_request_id uuid not null,
 actor_id uuid not null references kxra.account_identities(account_id),
 event_type text not null check(event_type in (
  'SUBMITTED','ACKNOWLEDGED','IN_PROGRESS','CUSTOMER_REPLY',
  'CUSTOMER_INFORMATION_REQUIRED','RESOLVED','CLOSED','CANCELLED'
 )),
 from_state text,
 to_state text not null,
 customer_message text not null check(length(trim(customer_message)) between 1 and 10000),
 request_version integer not null check(request_version>0),
 created_at timestamptz not null default now(),
 unique(org_id,client_request_id)
);

create table kxra.customer_service_internal_notes(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 request_id uuid not null references kxra.customer_service_requests(id),
 client_request_id uuid not null,
 note text not null check(length(trim(note)) between 3 and 20000),
 evidence_reference text check(
  evidence_reference is null or length(trim(evidence_reference)) between 3 and 500
 ),
 created_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),
 unique(org_id,client_request_id)
);

create index customer_service_requests_owner_queue
 on kxra.customer_service_requests(org_id,state,submitted_at desc);
create index customer_service_events_timeline
 on kxra.customer_service_events(request_id,created_at,id);
create index customer_service_notes_timeline
 on kxra.customer_service_internal_notes(request_id,created_at,id);

create function kxra_private.can_manage_customer_service(o uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select kxra_private.is_platform_owner()
  or kxra_private.has_capability(o,'customer_service.manage')
$$;

create function kxra_private.can_view_customer_service_request(
 o uuid,submitter uuid,kind text
) returns boolean language sql stable security definer set search_path='' as $$
 select kxra_private.private_access_allowed(o) and (
  auth.uid()=submitter
  or kxra_private.can_manage_customer_service(o)
  or (kind in ('SUPPORT','SUBSCRIPTION_CANCELLATION','SUBSCRIPTION_WITHDRAWAL')
   and kxra_private.is_owner(o))
 )
$$;

alter table kxra.customer_service_requests enable row level security;
alter table kxra.customer_service_events enable row level security;
alter table kxra.customer_service_internal_notes enable row level security;

grant select on kxra.customer_service_requests,kxra.customer_service_events,
 kxra.customer_service_internal_notes to authenticated,anon;

create policy customer_service_requests_read on kxra.customer_service_requests
 for select using(kxra_private.can_view_customer_service_request(
  org_id,submitted_by,request_type
 ));
create policy customer_service_events_read on kxra.customer_service_events
 for select using(exists(
  select 1 from kxra.customer_service_requests request
  where request.id=request_id and request.org_id=org_id
   and kxra_private.can_view_customer_service_request(
    request.org_id,request.submitted_by,request.request_type
   )
 ));
create policy customer_service_internal_notes_read
 on kxra.customer_service_internal_notes for select using(
  kxra_private.can_manage_customer_service(org_id)
 );

create function kxra.customer_service_management_status()
returns boolean language sql stable security definer set search_path='' as $$
 select kxra_private.can_manage_customer_service(kxra_private.member_org())
$$;

create function kxra.submit_customer_service_request(
 kind text,request_subject text,request_description text,
 subscription uuid,request uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();created uuid;existing kxra.customer_service_requests;
 hash_value text;inserted boolean=false;
begin
 if o is null or request is null
  or kind not in ('SUPPORT','SUBSCRIPTION_CANCELLATION','SUBSCRIPTION_WITHDRAWAL',
   'DATA_ACCESS','DATA_ERASURE','DATA_RECTIFICATION')
  or length(trim(request_subject)) not between 3 and 240
  or length(trim(request_description)) not between 3 and 20000
  or ((kind in ('SUBSCRIPTION_CANCELLATION','SUBSCRIPTION_WITHDRAWAL'))
    <> (subscription is not null))
 then raise exception 'Customer service request unavailable';end if;
 if subscription is not null and not exists(
  select 1 from kxra.billing_subscriptions value
  where value.id=subscription and value.org_id=o
   and value.state in ('INCOMPLETE','TRIALING','ACTIVE','PAST_DUE','PAUSED','UNPAID')
 ) then raise exception 'Customer service request unavailable';end if;
 hash_value=encode(sha256(convert_to(jsonb_build_object(
  'org_id',o,'submitted_by',auth.uid(),'request_type',kind,
  'subject',trim(request_subject),'description',trim(request_description),
  'related_subscription_id',subscription
 )::text,'UTF8')),'hex');
 insert into kxra.customer_service_requests(
  org_id,submitted_by,client_request_id,request_type,subject,description,
  related_subscription_id,request_hash
 ) values(o,auth.uid(),request,kind,trim(request_subject),trim(request_description),
  subscription,hash_value)
 on conflict(org_id,client_request_id) do nothing returning id into created;
 inserted=created is not null;
 if created is null then
  select * into existing from kxra.customer_service_requests value
  where value.org_id=o and value.client_request_id=request;
  if existing.id is null or existing.submitted_by<>auth.uid()
   or existing.request_hash<>hash_value
  then raise exception 'Customer service request conflict';end if;
  return existing.id;
 end if;
 if inserted then
  insert into kxra.customer_service_events(
   org_id,request_id,client_request_id,actor_id,event_type,from_state,to_state,
   customer_message,request_version
  ) values(o,created,request,auth.uid(),'SUBMITTED',null,'SUBMITTED',
   'Request submitted.',1);
  insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
  values(o,auth.uid(),'customer_service.submitted',created,
   jsonb_build_object('request_type',kind,'request_hash',hash_value));
 end if;
 return created;
end $$;

create function kxra.reply_customer_service_request(
 service_request uuid,expected_hash text,expected_version integer,
 request uuid,message text
) returns integer language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.customer_service_requests;
 existing kxra.customer_service_events;next_version integer;
begin
 select * into value from kxra.customer_service_requests item
 where item.id=service_request for update;
 if value.id is null or value.org_id<>o or value.submitted_by<>auth.uid()
  or value.request_hash<>expected_hash or request is null
  or length(trim(message)) not between 1 and 10000
 then raise exception 'Customer service reply unavailable';end if;
 select * into existing from kxra.customer_service_events event
 where event.org_id=o and event.client_request_id=request;
 if existing.id is not null then
  if existing.request_id<>service_request or existing.actor_id<>auth.uid()
   or existing.event_type<>'CUSTOMER_REPLY'
   or existing.customer_message<>trim(message)
  then raise exception 'Customer service reply conflict';end if;
  return existing.request_version;
 end if;
 if value.version<>expected_version
  or value.state not in ('ACKNOWLEDGED','IN_PROGRESS','AWAITING_CUSTOMER')
 then raise exception 'Customer service reply unavailable';end if;
 next_version=value.version+1;
 update kxra.customer_service_requests set state='IN_PROGRESS',version=next_version,
  updated_at=now() where id=service_request;
 insert into kxra.customer_service_events(
  org_id,request_id,client_request_id,actor_id,event_type,from_state,to_state,
  customer_message,request_version
 ) values(o,service_request,request,auth.uid(),'CUSTOMER_REPLY',value.state,
  'IN_PROGRESS',trim(message),next_version);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'customer_service.customer_replied',service_request,
  jsonb_build_object('request_hash',expected_hash,'request_version',next_version));
 return next_version;
end $$;

create function kxra.cancel_customer_service_request(
 service_request uuid,expected_hash text,expected_version integer,
 request uuid,message text
) returns integer language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.customer_service_requests;
 existing kxra.customer_service_events;next_version integer;
begin
 select * into value from kxra.customer_service_requests item
 where item.id=service_request for update;
 if value.id is null or value.org_id<>o or value.submitted_by<>auth.uid()
  or value.request_hash<>expected_hash or request is null
  or length(trim(message)) not between 1 and 10000
 then raise exception 'Customer service cancellation unavailable';end if;
 select * into existing from kxra.customer_service_events event
 where event.org_id=o and event.client_request_id=request;
 if existing.id is not null then
  if existing.request_id<>service_request or existing.actor_id<>auth.uid()
   or existing.event_type<>'CANCELLED'
   or existing.customer_message<>trim(message)
  then raise exception 'Customer service cancellation conflict';end if;
  return existing.request_version;
 end if;
 if value.version<>expected_version
  or value.state not in ('SUBMITTED','ACKNOWLEDGED','AWAITING_CUSTOMER')
 then raise exception 'Customer service cancellation unavailable';end if;
 next_version=value.version+1;
 update kxra.customer_service_requests set state='CANCELLED',version=next_version,
  updated_at=now(),closed_at=now() where id=service_request;
 insert into kxra.customer_service_events(
  org_id,request_id,client_request_id,actor_id,event_type,from_state,to_state,
  customer_message,request_version
 ) values(o,service_request,request,auth.uid(),'CANCELLED',value.state,
  'CANCELLED',trim(message),next_version);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'customer_service.customer_cancelled',service_request,
  jsonb_build_object('request_hash',expected_hash,'request_version',next_version));
 return next_version;
end $$;

create function kxra.transition_customer_service_request(
 service_request uuid,expected_hash text,expected_version integer,
 request uuid,next_state text,message text
) returns integer language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.customer_service_requests;
 existing kxra.customer_service_events;next_version integer;event_name text;
begin
 select * into value from kxra.customer_service_requests item
 where item.id=service_request for update;
 if value.id is null or value.org_id<>o
  or not kxra_private.can_manage_customer_service(o)
  or value.request_hash<>expected_hash or request is null
  or length(trim(message)) not between 1 and 10000
 then raise exception 'Customer service transition unavailable';end if;
 select * into existing from kxra.customer_service_events event
 where event.org_id=o and event.client_request_id=request;
 event_name=case next_state
  when 'AWAITING_CUSTOMER' then 'CUSTOMER_INFORMATION_REQUIRED'
  else next_state end;
 if existing.id is not null then
  if existing.request_id<>service_request or existing.actor_id<>auth.uid()
   or existing.event_type<>event_name or existing.to_state<>next_state
   or existing.customer_message<>trim(message)
  then raise exception 'Customer service transition conflict';end if;
  return existing.request_version;
 end if;
 if value.version<>expected_version or not (
  (value.state='SUBMITTED' and next_state in ('ACKNOWLEDGED','CANCELLED'))
  or (value.state='ACKNOWLEDGED' and next_state in ('IN_PROGRESS','AWAITING_CUSTOMER','CANCELLED'))
  or (value.state='IN_PROGRESS' and next_state in ('AWAITING_CUSTOMER','RESOLVED','CANCELLED'))
  or (value.state='AWAITING_CUSTOMER' and next_state in ('IN_PROGRESS','CANCELLED'))
  or (value.state='RESOLVED' and next_state in ('IN_PROGRESS','CLOSED'))
 ) then raise exception 'Customer service transition unavailable';end if;
 next_version=value.version+1;
 update kxra.customer_service_requests set state=next_state,version=next_version,
  updated_at=now(),closed_at=case when next_state in ('CLOSED','CANCELLED')
   then now() else null end where id=service_request;
 insert into kxra.customer_service_events(
  org_id,request_id,client_request_id,actor_id,event_type,from_state,to_state,
  customer_message,request_version
 ) values(o,service_request,request,auth.uid(),event_name,value.state,next_state,
  trim(message),next_version);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'customer_service.transitioned',service_request,
  jsonb_build_object('request_hash',expected_hash,'request_version',next_version,
   'from_state',value.state,'to_state',next_state));
 return next_version;
end $$;

create function kxra.add_customer_service_internal_note(
 service_request uuid,request uuid,note_text text,evidence text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();value kxra.customer_service_requests;
 existing kxra.customer_service_internal_notes;created uuid;
begin
 select * into value from kxra.customer_service_requests item
 where item.id=service_request;
 if value.id is null or value.org_id<>o
  or not kxra_private.can_manage_customer_service(o) or request is null
  or length(trim(note_text)) not between 3 and 20000
  or (evidence is not null and length(trim(evidence)) not between 3 and 500)
 then raise exception 'Customer service note unavailable';end if;
 select * into existing from kxra.customer_service_internal_notes item
 where item.org_id=o and item.client_request_id=request;
 if existing.id is not null then
  if existing.request_id<>service_request or existing.note<>trim(note_text)
   or existing.evidence_reference is distinct from nullif(trim(evidence),'')
  then raise exception 'Customer service note conflict';end if;
  return existing.id;
 end if;
 insert into kxra.customer_service_internal_notes(
  org_id,request_id,client_request_id,note,evidence_reference,created_by
 ) values(o,service_request,request,trim(note_text),nullif(trim(evidence),''),auth.uid())
 returning id into created;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'customer_service.internal_note_added',created,
  jsonb_build_object('request_id',service_request));
 return created;
end $$;

revoke all on function kxra_private.can_manage_customer_service(uuid),
 kxra_private.can_view_customer_service_request(uuid,uuid,text)
from public,authenticated,anon;
grant execute on function kxra_private.can_manage_customer_service(uuid),
 kxra_private.can_view_customer_service_request(uuid,uuid,text)
to authenticated,anon;
revoke all on function kxra.customer_service_management_status(),
 kxra.submit_customer_service_request(text,text,text,uuid,uuid),
 kxra.reply_customer_service_request(uuid,text,integer,uuid,text),
 kxra.cancel_customer_service_request(uuid,text,integer,uuid,text),
 kxra.transition_customer_service_request(uuid,text,integer,uuid,text,text),
 kxra.add_customer_service_internal_note(uuid,uuid,text,text)
from public,anon;
grant execute on function kxra.customer_service_management_status(),
 kxra.submit_customer_service_request(text,text,text,uuid,uuid),
 kxra.reply_customer_service_request(uuid,text,integer,uuid,text),
 kxra.cancel_customer_service_request(uuid,text,integer,uuid,text),
 kxra.transition_customer_service_request(uuid,text,integer,uuid,text,text),
 kxra.add_customer_service_internal_note(uuid,uuid,text,text)
to authenticated;

commit;
