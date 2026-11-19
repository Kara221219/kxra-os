-- Local extension only. Never add to frozen release migration discovery.
begin;
create table kxra_private.github_connections(
 id uuid primary key default gen_random_uuid(),org_id uuid not null references kxra.organisations,
 user_id uuid not null references kxra.account_identities(account_id),session_version integer not null,
 state text not null default 'ACTIVE' check(state in ('ACTIVE','REVOKED')),
 allow_write boolean not null,grant_version integer not null default 1,
 credential_ref text not null,expires_at timestamptz not null default clock_timestamp()+interval '1 hour',
 binding jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index github_connections_owner on kxra_private.github_connections(org_id,user_id);
create table kxra_private.github_reads(
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references kxra_private.github_connections,
 grant_version integer not null,consumed boolean not null default false,
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes'
);
create table kxra_private.github_writes(
 id uuid primary key,connection_id uuid not null references kxra_private.github_connections,
 read_id uuid not null unique references kxra_private.github_reads,
 payload jsonb not null,digest text not null,expires_at timestamptz not null,
 state text not null default 'PENDING' check(state in ('PENDING','APPROVED','QUEUED','DISPATCHING','UNCERTAIN','ACCEPTED','REJECTED','NOT_EXECUTED','CANCELLED')),
 attempt_id uuid,dispatch_at timestamptz,cancel_requested boolean not null default false,
 reason text not null default 'REVIEW_REQUIRED',provider_comment_id bigint,
 created_at timestamptz not null default clock_timestamp()
);
create unique index github_provider_comment_bound on kxra_private.github_writes ((payload->>'org_id'),(payload->>'user_id'),(payload->'binding'->>'repository_id'),provider_comment_id) where provider_comment_id is not null;
create index github_writes_connection on kxra_private.github_writes(connection_id,created_at);
create table kxra_private.github_receipts(
 id bigint generated always as identity primary key,write_id uuid not null references kxra_private.github_writes,
 attempt_id uuid,event text not null,evidence jsonb not null default '{}',
 evidence_hash text not null,created_at timestamptz not null default clock_timestamp(),unique(write_id,event,evidence_hash)
);
create index github_receipts_write on kxra_private.github_receipts(write_id,id);
alter table kxra_private.github_connections enable row level security;
alter table kxra_private.github_reads enable row level security;
alter table kxra_private.github_writes enable row level security;
alter table kxra_private.github_receipts enable row level security;
create policy github_connections_deny on kxra_private.github_connections using(false);
create policy github_reads_deny on kxra_private.github_reads using(false);
create policy github_writes_deny on kxra_private.github_writes using(false);
create policy github_receipts_deny on kxra_private.github_receipts using(false);
revoke all on kxra_private.github_connections,kxra_private.github_reads,kxra_private.github_writes,kxra_private.github_receipts from public,anon,authenticated;
revoke all on sequence kxra_private.github_receipts_id_seq from public,anon,authenticated;

create function kxra_private.github_authority(c kxra_private.github_connections,write_access boolean default false) returns boolean
language sql stable security definer set search_path='' as $$
 select c.state='ACTIVE' and c.expires_at>clock_timestamp() and (not write_access or c.allow_write)
 and c.org_id=kxra_private.member_org() and c.user_id=auth.uid()
 and exists(select 1 from kxra.account_identities a where a.account_id=c.user_id and a.state='ACTIVE' and a.session_version=c.session_version)
$$;
revoke all on function kxra_private.github_authority(kxra_private.github_connections,boolean) from public,anon,authenticated;
create function kxra.github_connector(action text,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();c kxra_private.github_connections;r kxra_private.github_reads;w kxra_private.github_writes;
 kind text=current_setting('request.kxra.connector_actor',true);p jsonb;e jsonb;keys text[];i uuid;event text;
begin
 if auth.uid() is null or o is null or current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' then raise exception 'GitHub connector unavailable' using errcode='42501';end if;
 if kind is null or kind not in ('human','worker') then raise exception 'Connector actor unavailable' using errcode='42501';end if;
 if input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>12000 then raise exception 'Invalid connector input';end if;
 keys=case action
 when 'list' then array[]::text[] when 'connect_fixture' then array['allow_write']
 when 'context' then array['connection_id'] when 'record_read' then array['connection_id','grant_version']
 when 'prepare' then array['connection_id','read_id','note']
 when 'approve' then array['connection_id','write_id','digest']
 when 'enqueue' then array['connection_id','write_id','digest']
 when 'cancel' then array['connection_id','write_id']
 when 'revoke' then array['connection_id'] when 'rotate_fixture_grant' then array['connection_id']
 when 'dispatch_context' then array['connection_id','write_id']
 when 'claim' then array['connection_id','write_id','digest']
 when 'not_sent' then array['connection_id','write_id','reason']
 when 'record_outcome' then array['connection_id','write_id','attempt_id','digest','outcome','evidence']
 when 'recover' then array['connection_id']
 else null end;
 if keys is null or (select count(*) from jsonb_object_keys(input))<>cardinality(keys) or exists(select 1 from jsonb_object_keys(input) k where not(k=any(keys))) then raise exception 'Invalid connector input';end if;
 if (kind='human' and action in ('context','record_read','dispatch_context','claim','not_sent','record_outcome'))
 or (kind='worker' and action not in ('context','record_read','dispatch_context','claim','not_sent','record_outcome')) then raise exception 'Connector operation unavailable' using errcode='42501';end if;
 if action='list' then
  return jsonb_build_object('connections',coalesce((select jsonb_agg(to_jsonb(x)-'credential_ref' order by x.created_at,x.id) from kxra_private.github_connections x where x.org_id=o and x.user_id=auth.uid()),'[]'),
   'writes',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from kxra_private.github_writes x join kxra_private.github_connections cc on cc.id=x.connection_id where cc.org_id=o and cc.user_id=auth.uid()),'[]'),
   'receipts',coalesce((select jsonb_agg(to_jsonb(rr) order by rr.id) from kxra_private.github_receipts rr join kxra_private.github_writes ww on ww.id=rr.write_id join kxra_private.github_connections cc on cc.id=ww.connection_id where cc.org_id=o and cc.user_id=auth.uid()),'[]'));
 end if;
 if action='connect_fixture' then
  if jsonb_typeof(input->'allow_write') is distinct from 'boolean' then raise exception 'Explicit scope required';end if;
  i=gen_random_uuid();
  insert into kxra_private.github_connections(id,org_id,user_id,session_version,allow_write,credential_ref,binding)
  select i,o,auth.uid(),a.session_version,(input->>'allow_write')::boolean,'fixture:github:'||i||':v1',
   jsonb_build_object('provider','github','api_version','2026-03-10','owner','fixture-org','repo','fixture-repo','issue_number',1,'repository_id',404,'account_id',101,'installation_id',303,'author_id',202)
  from kxra.account_identities a where a.account_id=auth.uid() and a.state='ACTIVE' returning * into c;
  if not found then raise exception 'Account unavailable';end if;
  return to_jsonb(c)-'credential_ref';
 end if;
 -- All operations lock connection before a write. This is the dispatch/revocation fence.
 select * into c from kxra_private.github_connections where id=(input->>'connection_id')::uuid and org_id=o and user_id=auth.uid();
 if not found then raise exception 'Scoped connection unavailable' using errcode='42501';end if;
 if action in ('prepare','claim') then
  perform pg_advisory_xact_lock(hashtextextended('github-target:'||o||':'||auth.uid()||':'||c.binding::text,0));
 end if;
 select * into c from kxra_private.github_connections where id=c.id for update;
 if not found then raise exception 'Scoped connection unavailable' using errcode='42501';end if;
 if action in ('revoke','rotate_fixture_grant') then
  if action='rotate_fixture_grant' then
   if c.state<>'ACTIVE' then raise exception 'Revoked connection cannot refresh';end if;
   update kxra_private.github_connections set grant_version=grant_version+1,credential_ref='fixture:github:'||id||':v'||(grant_version+1),expires_at=clock_timestamp()+interval '1 hour' where id=c.id returning * into c;
  else update kxra_private.github_connections set state='REVOKED' where id=c.id returning * into c;end if;
  update kxra_private.github_writes set state='CANCELLED',reason=case action when 'revoke' then 'REVOKED_BEFORE_DISPATCH' else 'GRANT_CHANGED' end where connection_id=c.id and state in ('PENDING','APPROVED','QUEUED');
  update kxra_private.github_writes set cancel_requested=true where connection_id=c.id and state in ('DISPATCHING','UNCERTAIN');
  return to_jsonb(c)-'credential_ref';
 end if;
 if action='recover' then
  update kxra_private.github_writes set state='UNCERTAIN',reason='WORKER_LOST_AFTER_CLAIM'
   where connection_id=c.id and state='DISPATCHING' and dispatch_at<=clock_timestamp()-interval '5 seconds';
  return jsonb_build_object('recovered',true);
 end if;
 if action='context' then
  if not kxra_private.github_authority(c) then raise exception 'Read authority unavailable' using errcode='42501';end if;
  return to_jsonb(c);
 end if;
 if action='record_read' then
  if not kxra_private.github_authority(c) or c.grant_version is distinct from (input->>'grant_version')::integer then raise exception 'Read authority changed' using errcode='42501';end if;
  insert into kxra_private.github_reads(connection_id,grant_version) values(c.id,c.grant_version) returning * into r;
  return to_jsonb(r);
 end if;
 if action='prepare' then
  if not kxra_private.github_authority(c,true) then raise exception 'Write authority unavailable' using errcode='42501';end if;
  select * into r from kxra_private.github_reads where id=(input->>'read_id')::uuid and connection_id=c.id for update;
  if not found or r.consumed or r.expires_at<=clock_timestamp() or r.grant_version<>c.grant_version then raise exception 'Fresh scoped read required';end if;
  if jsonb_typeof(input->'note') is distinct from 'string' or length(btrim(input->>'note')) not between 1 and 2000 or length(input->>'note')>2000 then raise exception 'Invalid comment';end if;
  if exists(select 1 from kxra_private.github_writes old join kxra_private.github_connections cc on cc.id=old.connection_id where cc.org_id=o and cc.user_id=auth.uid() and cc.binding=c.binding and old.state in ('DISPATCHING','UNCERTAIN')) then raise exception 'Resolve existing uncertain write first';end if;
  i=gen_random_uuid();p=jsonb_build_object('org_id',o,'user_id',auth.uid(),'connection_id',c.id,'binding',c.binding,'credential_ref',c.credential_ref,'grant_version',c.grant_version,'scope','issues:write','session_version',c.session_version,'body',(input->>'note')||E'\n\n<!-- kxra-write:'||i||' -->');
  update kxra_private.github_reads set consumed=true where id=r.id;
  insert into kxra_private.github_writes(id,connection_id,read_id,payload,digest,expires_at) values(i,c.id,r.id,p,encode(sha256(convert_to(p::text,'UTF8')),'hex'),least(r.expires_at,c.expires_at)) returning * into w;
  return to_jsonb(w);
 end if;
 select * into w from kxra_private.github_writes where id=(input->>'write_id')::uuid and connection_id=c.id for update;
 if not found then raise exception 'Scoped write unavailable' using errcode='42501';end if;
 if action='dispatch_context' then return jsonb_build_object('connection',to_jsonb(c),'write',to_jsonb(w));end if;
 if action='cancel' then
  if w.state in ('PENDING','APPROVED','QUEUED') then update kxra_private.github_writes set state='CANCELLED',reason='CANCELLED_BEFORE_DISPATCH' where id=w.id returning * into w;
  elsif w.state in ('DISPATCHING','UNCERTAIN') then update kxra_private.github_writes set cancel_requested=true where id=w.id returning * into w;end if;
  return to_jsonb(w);
 end if;
 if action='not_sent' then
  if input->>'reason' not in ('GRANT_UNAVAILABLE','PROVIDER_PREFLIGHT_REJECTED','PREFLIGHT_UNAVAILABLE') then raise exception 'Invalid outcome';end if;
  if w.state='QUEUED' then update kxra_private.github_writes set state='NOT_EXECUTED',reason=input->>'reason' where id=w.id returning * into w;
   insert into kxra_private.github_receipts(write_id,event,evidence,evidence_hash) values(w.id,'NOT_EXECUTED',jsonb_build_object('reason',w.reason),w.digest) on conflict do nothing;
  end if;
  return to_jsonb(w);
 end if;
 if action='record_outcome' then
  if w.attempt_id is null or w.attempt_id is distinct from (input->>'attempt_id')::uuid or w.digest is distinct from input->>'digest' then raise exception 'Attempt binding mismatch';end if;
  if input->>'outcome' not in ('ACCEPTED','REJECTED','UNCERTAIN','RECONCILED_ACCEPTED','INCONCLUSIVE','NOT_EXECUTED') then raise exception 'Invalid outcome';end if;
  e=input->'evidence';
  if jsonb_typeof(e) is distinct from 'object' or exists(select 1 from jsonb_object_keys(e) k where k not in ('status','comment_id','body_sha256','author_id','issue_url','reason')) or octet_length(e::text)>1000 then raise exception 'Invalid bounded evidence';end if;
  if input->>'outcome' in ('ACCEPTED','RECONCILED_ACCEPTED') then
   if coalesce(e->>'comment_id','')!~'^[1-9][0-9]{0,15}$' or (e->>'comment_id')::numeric>9007199254740991 or e->>'body_sha256' is distinct from encode(sha256(convert_to(w.payload->>'body','UTF8')),'hex')
    or e->>'author_id' is distinct from w.payload->'binding'->>'author_id'
    or e->>'issue_url' is distinct from 'https://api.github.com/repos/'||(w.payload->'binding'->>'owner')||'/'||(w.payload->'binding'->>'repo')||'/issues/'||(w.payload->'binding'->>'issue_number') then raise exception 'Provider evidence mismatch';end if;
  end if;
  event=input->>'outcome';
  insert into kxra_private.github_receipts(write_id,attempt_id,event,evidence,evidence_hash) values(w.id,w.attempt_id,event,e,encode(sha256(convert_to(e::text,'UTF8')),'hex')) on conflict do nothing;
  -- Terminal accepted/rejected observations never regress under reordered delivery.
  if w.state in ('DISPATCHING','UNCERTAIN') then
   if event in ('ACCEPTED','RECONCILED_ACCEPTED') then update kxra_private.github_writes set state='ACCEPTED',reason=event,provider_comment_id=(e->>'comment_id')::bigint where id=w.id returning * into w;
   elsif event='NOT_EXECUTED' and w.state='DISPATCHING' then update kxra_private.github_writes set state='NOT_EXECUTED',reason='DEFINITE_LOCAL_NON_EXECUTION' where id=w.id returning * into w;
   elsif event='REJECTED' and w.state='DISPATCHING' then update kxra_private.github_writes set state='REJECTED',reason='PROVIDER_REJECTED' where id=w.id returning * into w;
   else update kxra_private.github_writes set state='UNCERTAIN',reason=case when event='INCONCLUSIVE' then 'READ_ONLY_RECONCILIATION_INCONCLUSIVE' else 'ACKNOWLEDGEMENT_UNCERTAIN' end where id=w.id returning * into w;end if;
  end if;
  return to_jsonb(w);
 end if;
 if action not in ('approve','enqueue','claim') then raise exception 'Unknown write operation';end if;
 if w.digest is distinct from input->>'digest' or w.digest is distinct from encode(sha256(convert_to(w.payload::text,'UTF8')),'hex') then raise exception 'Exact payload binding required';end if;
 if action='claim' and w.state<>'QUEUED' then return jsonb_build_object('write',to_jsonb(w),'claimed',false);end if;
 if action='claim' and exists(select 1 from kxra_private.github_writes old join kxra_private.github_connections cc on cc.id=old.connection_id where old.id<>w.id and cc.org_id=o and cc.user_id=auth.uid() and cc.binding=c.binding and old.state in ('DISPATCHING','UNCERTAIN')) then
  update kxra_private.github_writes set reason='HELD_UNRESOLVED_PRIOR_WRITE' where id=w.id returning * into w;
  return jsonb_build_object('write',to_jsonb(w),'claimed',false);
 end if;
 if not kxra_private.github_authority(c,true) or w.expires_at<=clock_timestamp()
 or w.payload->'binding' is distinct from c.binding or w.payload->>'credential_ref' is distinct from c.credential_ref
 or (w.payload->>'grant_version')::integer<>c.grant_version or (w.payload->>'session_version')::integer<>c.session_version then
  if action='claim' then update kxra_private.github_writes set state='NOT_EXECUTED',reason='AUTHORITY_WITHDRAWN_BEFORE_DISPATCH' where id=w.id returning * into w;return jsonb_build_object('write',to_jsonb(w),'claimed',false);end if;
  raise exception 'Approved authority unavailable' using errcode='42501';
 end if;
 if action='approve' then
  if w.state<>'PENDING' then raise exception 'Proposal not pending';end if;
  update kxra_private.github_writes set state='APPROVED',reason='EXACT_CUSTOMER_APPROVAL' where id=w.id returning * into w;
 elsif action='enqueue' then
  if w.state in ('QUEUED','DISPATCHING','UNCERTAIN','ACCEPTED','REJECTED','NOT_EXECUTED','CANCELLED') then return to_jsonb(w);end if;
  if w.state<>'APPROVED' then raise exception 'Explicit approval required';end if;
  update kxra_private.github_writes set state='QUEUED',reason='AWAITING_SINGLE_DISPATCH' where id=w.id returning * into w;
 else
  update kxra_private.github_writes set state='DISPATCHING',reason='DISPATCH_STARTED_CANCELLATION_NOT_GUARANTEED',attempt_id=gen_random_uuid(),dispatch_at=clock_timestamp() where id=w.id returning * into w;
  insert into kxra_private.github_receipts(write_id,attempt_id,event,evidence_hash) values(w.id,w.attempt_id,'DISPATCH_STARTED',w.digest);
 end if;
 if action='claim' then return jsonb_build_object('write',to_jsonb(w),'claimed',true);end if;
 return to_jsonb(w);
end $$;
revoke all on function kxra.github_connector(text,jsonb) from public,anon,authenticated;
grant execute on function kxra.github_connector(text,jsonb) to authenticated;
commit;
