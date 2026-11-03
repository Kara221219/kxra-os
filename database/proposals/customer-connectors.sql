-- Local synthetic connector only. No credentials, URLs, OAuth grants or network worker.
begin;
create table kxra_private.customer_connectors (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references kxra.organisations(id),
 user_id uuid not null references kxra.account_identities(account_id),
 provider text not null default 'synthetic-notes' check(provider='synthetic-notes'),
 allow_write boolean not null,
 state text not null default 'ACTIVE' check(state in ('ACTIVE','REVOKED')),
 revision integer not null default 1,
 expires_at timestamptz not null default now()+interval '24 hours',
 created_at timestamptz not null default now()
);
create index customer_connectors_scope on kxra_private.customer_connectors(org_id,user_id);
create table kxra_private.connector_requests (
 id uuid primary key default gen_random_uuid(),
 connector_id uuid not null references kxra_private.customer_connectors(id),
 revision integer not null,
 state text not null default 'READ' check(state in ('READ','PENDING','APPROVED','REJECTED','EXECUTED')),
 payload jsonb,
 digest text,
 expires_at timestamptz not null default now()+interval '5 minutes'
);
create index connector_requests_connection on kxra_private.connector_requests(connector_id);
create table kxra_private.connector_notes (
 request_id uuid primary key references kxra_private.connector_requests(id),
 connector_id uuid not null references kxra_private.customer_connectors(id),
 note text not null,
 created_at timestamptz not null default now()
);
create index connector_notes_connection on kxra_private.connector_notes(connector_id,created_at);
alter table kxra_private.customer_connectors enable row level security;
alter table kxra_private.connector_requests enable row level security;
alter table kxra_private.connector_notes enable row level security;
-- No direct table access, including for authenticated; all mutation is the scoped RPC.
create policy connector_deny on kxra_private.customer_connectors using(false);
create policy connector_request_deny on kxra_private.connector_requests using(false);
create policy connector_note_deny on kxra_private.connector_notes using(false);
revoke all on kxra_private.customer_connectors,kxra_private.connector_requests,kxra_private.connector_notes from public,anon,authenticated;

create function kxra.customer_connector(action text, input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid; c kxra_private.customer_connectors; r kxra_private.connector_requests; result jsonb; keys text[];
begin
 o=kxra_private.member_org();
 if o is null or auth.uid() is null or current_setting('request.kxra.execution_mode',true) is distinct from 'fixture'
 then raise exception 'Connector unavailable' using errcode='42501';end if;
 if current_setting('request.kxra.connector_actor',true) is null or current_setting('request.kxra.connector_actor',true) not in ('human','agent')
 or (current_setting('request.kxra.connector_actor',true)='agent' and action not in ('read','prepare','execute'))
 then raise exception 'Connector capability unavailable' using errcode='42501';end if;
 if input is null or octet_length(input::text)>8192 or jsonb_typeof(input)<>'object' then raise exception 'Invalid connector input';end if;
 -- Exact RPC schemas protect direct database callers as well as HTTP callers.
 keys=case action when 'list' then array[]::text[] when 'connect' then array['allow_write']
 when 'read' then array['connector_id'] when 'revoke' then array['connector_id']
 when 'prepare' then array['connector_id','read_id','note']
 when 'approve' then array['connector_id','request_id','digest']
 when 'reject' then array['connector_id','request_id']
 when 'execute' then array['connector_id','request_id'] else null end;
 if keys is null or (select count(*) from jsonb_object_keys(input))<>cardinality(keys)
 or exists(select 1 from jsonb_object_keys(input) k where not(k=any(keys)))
 then raise exception 'Invalid connector input';end if;
 if action='list' then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at,x.id),'[]'::jsonb) into result
   from kxra_private.customer_connectors x where org_id=o and user_id=auth.uid();
  return jsonb_build_object('connections',result,'provider','synthetic-notes','tools',jsonb_build_array('notes.read','notes.append'),'synthetic',true);
 end if;
 if action='connect' then
  if jsonb_typeof(input->'allow_write') is distinct from 'boolean' then raise exception 'Explicit permissions required';end if;
  insert into kxra_private.customer_connectors(org_id,user_id,allow_write) values(o,auth.uid(),(input->>'allow_write')::boolean) returning * into c;
  return to_jsonb(c);
 end if;
 -- One lock order for all lifecycle and tool actions. Revocation cannot race a write.
 select * into c from kxra_private.customer_connectors where id=(input->>'connector_id')::uuid and org_id=o and user_id=auth.uid() for update;
 if not found then raise exception 'Connector unavailable' using errcode='42501';end if;
 if action='revoke' then
  update kxra_private.customer_connectors set state='REVOKED' where id=c.id;
  update kxra_private.connector_requests set state='REJECTED' where connector_id=c.id and state in ('READ','PENDING','APPROVED');
  return jsonb_build_object('state','REVOKED');
 end if;
 if c.state<>'ACTIVE' or c.expires_at<=clock_timestamp() then raise exception 'Connector inactive';end if;
 if action='read' then
  insert into kxra_private.connector_requests(connector_id,revision) values(c.id,c.revision) returning * into r;
  select coalesce(jsonb_agg(jsonb_build_object('note',note,'created_at',created_at) order by created_at,request_id),'[]'::jsonb) into result
   from kxra_private.connector_notes where connector_id=c.id;
  return jsonb_build_object('read_id',r.id,'revision',c.revision,'expires_at',r.expires_at,'notes',result,'untrusted_content',true);
 end if;
 if not c.allow_write then raise exception 'Write scope unavailable' using errcode='42501';end if;
 select * into r from kxra_private.connector_requests where id=coalesce(input->>'read_id',input->>'request_id')::uuid and connector_id=c.id for update;
 if not found or r.expires_at<=clock_timestamp() or r.revision<>c.revision then raise exception 'Request unavailable or stale';end if;
 if action='prepare' then
  if r.state<>'READ' or jsonb_typeof(input->'note') is distinct from 'string' or length(btrim(input->>'note')) not between 1 and 2000 or length(input->>'note')>2000
  then raise exception 'Invalid write proposal';end if;
  result=jsonb_build_object('tool','notes.append','note',input->>'note');
  update kxra_private.connector_requests set state='PENDING',payload=result,digest=encode(sha256(convert_to(result::text,'UTF8')),'hex') where id=r.id returning * into r;
 elsif action='approve' then
  if r.state<>'PENDING' or input->>'digest' is distinct from r.digest then raise exception 'Approval payload mismatch';end if;
  update kxra_private.connector_requests set state='APPROVED' where id=r.id returning * into r;
 elsif action='reject' then
  if r.state not in ('PENDING','APPROVED') then raise exception 'Request cannot be rejected';end if;
  update kxra_private.connector_requests set state='REJECTED' where id=r.id returning * into r;
 elsif action='execute' then
  if r.state<>'APPROVED' or r.digest is distinct from encode(sha256(convert_to(r.payload::text,'UTF8')),'hex') then raise exception 'Approved write required';end if;
  -- Synthetic provider effect and approval consumption commit atomically. Never
  -- replace this INSERT with network IO: real providers require an outbox/worker.
  insert into kxra_private.connector_notes(request_id,connector_id,note) values(r.id,c.id,r.payload->>'note');
  update kxra_private.connector_requests set state='EXECUTED' where id=r.id returning * into r;
  update kxra_private.customer_connectors set revision=revision+1 where id=c.id;
 end if;
 return to_jsonb(r);
end $$;
revoke all on function kxra.customer_connector(text,jsonb) from public,anon,authenticated;
grant execute on function kxra.customer_connector(text,jsonb) to authenticated;
commit;
