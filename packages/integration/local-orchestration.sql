-- Unnumbered fixture extension. Install only after the selected paired,
-- connector and custom-app fixture cohorts on an owned empty local target.
begin;
create table kxra_private.paired_delegations(
 id uuid primary key,task_id uuid not null references kxra.paired_tasks,
 connection_id uuid not null references kxra_private.github_connections,
 secret_hash text not null unique check(secret_hash~'^[a-f0-9]{64}$'),
 allow_proposal boolean not null,expires_at timestamptz not null,
 revoked boolean not null default false,created_at timestamptz not null default clock_timestamp()
);
create table kxra_private.paired_connector_reads(
 read_id uuid primary key references kxra_private.github_reads,
 delegation_id uuid not null references kxra_private.paired_delegations
);
create table kxra_private.paired_connector_writes(
 write_id uuid primary key references kxra_private.github_writes,
 delegation_id uuid not null references kxra_private.paired_delegations
);
create table kxra_private.paired_app_proposals(
 id uuid primary key,delegation_id uuid not null references kxra_private.paired_delegations,
 schema jsonb not null,digest text not null,created_at timestamptz not null default clock_timestamp(),
 unique(delegation_id,digest)
);
alter table kxra_private.paired_delegations enable row level security;
alter table kxra_private.paired_connector_reads enable row level security;
alter table kxra_private.paired_connector_writes enable row level security;
alter table kxra_private.paired_app_proposals enable row level security;
create policy paired_delegations_deny on kxra_private.paired_delegations using(false);
create policy paired_connector_reads_deny on kxra_private.paired_connector_reads using(false);
create policy paired_connector_writes_deny on kxra_private.paired_connector_writes using(false);
create policy paired_app_proposals_deny on kxra_private.paired_app_proposals using(false);
revoke all on kxra_private.paired_delegations,kxra_private.paired_connector_reads,kxra_private.paired_connector_writes,kxra_private.paired_app_proposals from public,anon,authenticated;

-- Human session only, entered by the server's human route. No device token
-- can approve/queue a write or register/publish an app through this facade.
create function kxra.paired_integration_control(op text,v jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t kxra.paired_tasks;d kxra_private.paired_delegations;c kxra_private.github_connections;p kxra_private.paired_app_proposals;sv integer;
begin
 if current_setting('request.kxra.integration_actor',true) is distinct from 'human' then raise insufficient_privilege;end if;
 select * into t from kxra.paired_tasks where id=(v->>'task_id')::uuid;
 if not found then raise insufficient_privilege;end if;
 sv=kxra_private.paired_actor(t.room_id);
 if t.owner_id<>auth.uid() or t.org_id<>kxra_private.member_org() or sv<>t.session_version
 or not kxra_private.mfa_owner(t.org_id) then raise insufficient_privilege;end if;
 perform kxra_private.bridge_paid(t.org_id);
 perform pg_advisory_xact_lock(hashtext('paired:'||t.room_id::text));
 select * into t from kxra.paired_tasks where id=t.id for update;
 if op='LIST' then
  return jsonb_build_object('delegations',coalesce((select jsonb_agg(to_jsonb(x)-'secret_hash') from kxra_private.paired_delegations x where x.task_id=t.id),'[]'),
   'app_proposals',coalesce((select jsonb_agg(to_jsonb(x)) from kxra_private.paired_app_proposals x join kxra_private.paired_delegations dd on dd.id=x.delegation_id where dd.task_id=t.id),'[]'));
 end if;
 if op='DELEGATE' then
  if t.state not in ('APPROVED','LEASED','RUNNING') or (t.state in ('LEASED','RUNNING') and (t.lease_until is null or t.lease_until<=clock_timestamp())) or not kxra_private.paired_current(t.id) then raise insufficient_privilege;end if;
  select * into c from kxra_private.github_connections where id=(v->>'connection_id')::uuid for update;
  if not found or not kxra_private.github_authority(c,(v->>'allow_proposal')::boolean) then raise insufficient_privilege;end if;
  if (select count(*) from kxra_private.paired_delegations where task_id=t.id)>=10 then raise exception 'Delegation capacity';end if;
  insert into kxra_private.paired_delegations(id,task_id,connection_id,secret_hash,allow_proposal,expires_at)
  values((v->>'delegation_id')::uuid,t.id,c.id,v->>'secret_hash',(v->>'allow_proposal')::boolean,least(t.expires_at,c.expires_at,clock_timestamp()+interval '5 minutes')) returning * into d;
  return to_jsonb(d)-'secret_hash';
 end if;
 select * into d from kxra_private.paired_delegations where id=(v->>'delegation_id')::uuid and task_id=t.id for update;
 if not found then raise insufficient_privilege;end if;
 if op='REVOKE' then
  update kxra_private.paired_delegations set revoked=true where id=d.id;
  -- Already claimed external writes stay quarantined; never infer nonexecution.
  update kxra_private.github_writes set state='CANCELLED',reason='DELEGATION_REVOKED' where id in(select write_id from kxra_private.paired_connector_writes where delegation_id=d.id) and state in ('PENDING','APPROVED','QUEUED');
  return jsonb_build_object('revoked',true);
 elsif op='IMPORT_APP' then
  if t.state not in ('APPROVED','LEASED','RUNNING','DONE') or (t.state in ('LEASED','RUNNING') and (t.lease_until is null or t.lease_until<=clock_timestamp())) or d.revoked or d.expires_at<=clock_timestamp() or not kxra_private.paired_current(t.id) then raise insufficient_privilege;end if;
  select * into p from kxra_private.paired_app_proposals where id=(v->>'proposal_id')::uuid and delegation_id=d.id;
  if not found or p.digest is distinct from v->>'digest' then raise insufficient_privilege;end if;
  -- This creates a reviewable immutable version only. Preview and publication
  -- remain separate explicit human actions in the existing app lifecycle.
  perform kxra.custom_app_register((v->>'app_id')::uuid,t.room_id,(v->>'expected_revision')::integer,p.schema);
  return jsonb_build_object('app_id',v->>'app_id','room_id',t.room_id,'review_required',true);
 end if;
 raise exception 'Unknown integration operation';
end $$;
revoke all on function kxra.paired_integration_control(text,jsonb) from public,anon;
grant execute on function kxra.paired_integration_control(text,jsonb) to authenticated;

-- Paired credential AND independently granted connector capability required.
-- No token purpose substitution; every transaction rechecks current room,
-- sources, account version, lease, session, task fence and connector authority.
create function kxra.paired_integration_device(h text,dh text,tid uuid,f uuid,op text,v jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t kxra.paired_tasks;d kxra_private.paired_delegations;c kxra_private.github_connections;r jsonb;p kxra_private.paired_app_proposals;old_kind text;wid uuid;
begin
 if current_setting('request.kxra.integration_actor',true) is distinct from 'device' then raise insufficient_privilege;end if;
 if (kxra.paired_task_status(h,tid,f)->>'state') is distinct from 'RUNNING' or not kxra_private.paired_current(tid) then raise insufficient_privilege;end if;
 select * into t from kxra.paired_tasks where id=tid;
 select * into d from kxra_private.paired_delegations where task_id=t.id and secret_hash=dh for update;
 if not found or d.revoked or d.expires_at<=clock_timestamp() then raise insufficient_privilege;end if;
 select * into c from kxra_private.github_connections where id=d.connection_id;
 if not found or not kxra_private.github_authority(c,false) then raise insufficient_privilege;end if;
 if op='app_propose' then
  select * into c from kxra_private.github_connections where id=d.connection_id for update;
  if not found or not kxra_private.github_authority(c,false) then raise insufficient_privilege;end if;
  if not d.allow_proposal or not kxra_private.custom_app_schema_valid(v->'schema') then raise exception 'Validated schema proposal required';end if;
  if (select count(*) from kxra_private.paired_app_proposals where delegation_id=d.id)>=10 then raise exception 'Proposal capacity';end if;
  insert into kxra_private.paired_app_proposals(id,delegation_id,schema,digest)
   values(gen_random_uuid(),d.id,v->'schema',encode(sha256(convert_to((v->'schema')::text,'UTF8')),'hex'))
   on conflict(delegation_id,digest) do update set digest=excluded.digest returning * into p;
  return to_jsonb(p);
 end if;
 if (v->>'connection_id')::uuid is distinct from d.connection_id then raise insufficient_privilege;end if;
 if op='prepare' then
  if not d.allow_proposal or not exists(select 1 from kxra_private.paired_connector_reads where read_id=(v->>'read_id')::uuid and delegation_id=d.id) then raise insufficient_privilege;end if;
 elsif op in ('dispatch_context','claim','not_sent','record_outcome') then
  wid=(v->>'write_id')::uuid;
  if not exists(select 1 from kxra_private.paired_connector_writes where write_id=wid and delegation_id=d.id) then raise insufficient_privilege;end if;
 elsif op not in ('context','record_read') then raise insufficient_privilege;
 end if;
 old_kind=current_setting('request.kxra.connector_actor',true);
 perform set_config('request.kxra.connector_actor',case when op='prepare' then 'human' else 'worker' end,true);
 r=kxra.github_connector(op,v);
 perform set_config('request.kxra.connector_actor',coalesce(old_kind,''),true);
 if op='record_read' then insert into kxra_private.paired_connector_reads(read_id,delegation_id) values((r->>'id')::uuid,d.id);
 elsif op='prepare' then insert into kxra_private.paired_connector_writes(write_id,delegation_id) values((r->>'id')::uuid,d.id);end if;
 return r;
end $$;
revoke all on function kxra.paired_integration_device(text,text,uuid,uuid,text,jsonb) from public,anon;
grant execute on function kxra.paired_integration_device(text,text,uuid,uuid,text,jsonb) to authenticated;
commit;
