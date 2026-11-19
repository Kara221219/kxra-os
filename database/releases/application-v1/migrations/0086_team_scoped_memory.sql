-- Reviewed room-only memory. No company summaries, implicit sharing or recursive learning chains.
alter table kxra.team_runs add constraint team_run_room_identity unique(id,room_id);
alter table kxra.team_runs add column memory_ids uuid[] not null default '{}',
 add column memory_hashes text[] not null default '{}',
 add constraint team_run_memory_bounds check(cardinality(memory_ids)<=5 and cardinality(memory_ids)=cardinality(memory_hashes)
  and array_position(memory_ids,null) is null and coalesce(array_ndims(memory_ids),1)=1);
create table kxra.team_memory_versions(
 id uuid primary key,org_id uuid not null,room_id uuid not null,agent_id uuid not null,
 scope text not null default 'ROOM' check(scope='ROOM'),
 kind text not null check(kind in ('PREFERENCE','FEEDBACK','REFERENCE','CONTEXT')),
 title text not null check(length(title) between 1 and 100),title_key text not null check(title_key~'^[a-f0-9]{64}$'),
 version integer not null check(version>0),body text not null check(length(body)<=2000),
 content_sha256 text not null check(content_sha256~'^[a-f0-9]{64}$'),
 origin text not null check(origin in ('HUMAN','RUN')),source_run_id uuid,
 state text not null default 'DRAFT' check(state in ('DRAFT','APPROVED','REJECTED','REVOKED','DELETED')),
 requested_expires_at timestamptz,expires_at timestamptz not null,
 created_by uuid not null references kxra.account_identities(account_id),created_at timestamptz not null default now(),
 reviewed_by uuid references kxra.account_identities(account_id),reviewed_at timestamptz,
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),
 foreign key(agent_id,room_id) references kxra.team_agents(id,room_id),
 foreign key(source_run_id,room_id) references kxra.team_runs(id,room_id),
 unique(room_id,agent_id,kind,title_key,version),
 check((origin='HUMAN' and source_run_id is null) or (origin='RUN' and source_run_id is not null)),
 check(expires_at>created_at and expires_at<=created_at+interval '365 days'),
 check(requested_expires_at is null or requested_expires_at=expires_at),
 check((state='DELETED' and body='' and title='Removed memory') or
  (state<>'DELETED' and length(body)>0 and content_sha256=encode(sha256(convert_to(body,'UTF8')),'hex')
   and title_key=encode(sha256(convert_to(title,'UTF8')),'hex')))
);
create index team_memory_scope on kxra.team_memory_versions(room_id,agent_id,state,expires_at);

create function kxra_private.team_memory_source_allowed(r uuid,a uuid,s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select kxra_private.can_team_room(r) and (s is null or exists(
  select 1 from kxra.team_runs source where source.id=s and source.room_id=r and source.agent_id=a and source.status='SUCCEEDED'
  -- CASE is intentional: never recurse through a memory-derived source run.
  and case when cardinality(source.memory_ids)=0 then kxra_private.can_team_run(source.id) else false end))
$$;
create function kxra_private.team_memory_visible(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_memory_versions memory where memory.id=i
  and kxra_private.team_memory_source_allowed(memory.room_id,memory.agent_id,memory.source_run_id))
$$;
create function kxra_private.team_memory_allowed(i uuid,a uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_memory_versions memory where memory.id=i and memory.agent_id=a
  and memory.state='APPROVED' and memory.expires_at>now()
  and memory.content_sha256=encode(sha256(convert_to(memory.body,'UTF8')),'hex')
  and kxra_private.team_memory_source_allowed(memory.room_id,memory.agent_id,memory.source_run_id))
$$;
alter table kxra.team_memory_versions enable row level security;
create policy team_memory_read on kxra.team_memory_versions for select to authenticated using(kxra_private.team_memory_visible(id));
revoke all on kxra.team_memory_versions from public,anon,authenticated;
-- Do not expose retained body/title fingerprints after removal. The app computes
-- review hashes from currently readable text; trusted admission checks stored hashes.
grant select(id,org_id,room_id,agent_id,scope,kind,title,version,body,origin,source_run_id,state,
 requested_expires_at,expires_at,created_by,created_at,reviewed_by,reviewed_at) on kxra.team_memory_versions to authenticated;
revoke all on function kxra_private.team_memory_source_allowed(uuid,uuid,uuid),kxra_private.team_memory_visible(uuid),kxra_private.team_memory_allowed(uuid,uuid) from public,anon;
grant execute on function kxra_private.team_memory_source_allowed(uuid,uuid,uuid),kxra_private.team_memory_visible(uuid),kxra_private.team_memory_allowed(uuid,uuid) to authenticated;

create function kxra.team_memory_propose(i uuid,r uuid,a uuid,k text,n text,b text,s uuid,expiry timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare title_digest text=encode(sha256(convert_to(n,'UTF8')),'hex');next_version integer;
begin
 if not kxra_private.can_team_room(r,true) or not exists(select 1 from kxra.team_agents where id=a and room_id=r)
  or not kxra_private.team_memory_source_allowed(r,a,s) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(r::text||a::text||k||title_digest));
 if exists(select 1 from kxra.team_memory_versions where id=i) then
  if not exists(select 1 from kxra.team_memory_versions where id=i and room_id=r and agent_id=a and kind=k
   and title=n and body=b and source_run_id is not distinct from s and requested_expires_at is not distinct from expiry and created_by=auth.uid())
  then raise exception 'Idempotency conflict';end if;return i;
 end if;
 if expiry is not null and (expiry<=now() or expiry>now()+interval '365 days') then raise exception 'Memory expiry must be within one year';end if;
 select coalesce(max(version),0)+1 into next_version from kxra.team_memory_versions
  where room_id=r and agent_id=a and kind=k and title_key=title_digest;
 insert into kxra.team_memory_versions(id,org_id,room_id,agent_id,kind,title,title_key,version,body,content_sha256,
  origin,source_run_id,requested_expires_at,expires_at,created_by)
 select i,org_id,id,a,k,n,title_digest,next_version,b,encode(sha256(convert_to(b,'UTF8')),'hex'),
  case when s is null then 'HUMAN' else 'RUN' end,s,expiry,coalesce(expiry,now()+interval '90 days'),auth.uid()
 from kxra.team_rooms where id=r;
 return i;
end $$;
create function kxra.team_memory_review(r uuid,i uuid,decision text) returns void
language plpgsql security definer set search_path='' as $$
declare memory kxra.team_memory_versions;
begin
 select * into memory from kxra.team_memory_versions where id=i and room_id=r for update;
 if not found or not (kxra_private.manages_team_room(r) or
  (decision='DELETED' and memory.created_by=auth.uid() and kxra_private.can_team_room(r,true))) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(r::text||memory.agent_id::text||memory.kind||memory.title_key));
 if decision='APPROVED' and memory.state='DRAFT' then
  if not kxra_private.team_memory_visible(i) or memory.expires_at<=now() then raise insufficient_privilege;end if;
  if exists(select 1 from kxra.team_memory_versions other where other.room_id=r and other.agent_id=memory.agent_id
   and other.kind=memory.kind and other.title_key=memory.title_key and other.id<>i and other.state='APPROVED' and other.expires_at>now())
  then raise exception 'Withdraw the previous approved memory version first';end if;
 elsif not ((decision='REJECTED' and memory.state='DRAFT') or (decision='REVOKED' and memory.state='APPROVED')
  or (decision='DELETED' and memory.state<>'DELETED')) then raise exception 'Memory review stale or unavailable';end if;
 update kxra.team_memory_versions set state=decision,reviewed_by=auth.uid(),reviewed_at=now(),
  title=case when decision='DELETED' then 'Removed memory' else title end,
  body=case when decision='DELETED' then '' else body end where id=i;
end $$;
create function kxra_private.guard_team_memory() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.org_id,new.room_id,new.agent_id,new.scope,new.kind,new.title_key,new.version,new.content_sha256,
  new.origin,new.source_run_id,new.requested_expires_at,new.expires_at,new.created_by,new.created_at)
  is distinct from (old.id,old.org_id,old.room_id,old.agent_id,old.scope,old.kind,old.title_key,old.version,old.content_sha256,
  old.origin,old.source_run_id,old.requested_expires_at,old.expires_at,old.created_by,old.created_at)
  or ((new.title,new.body) is distinct from (old.title,old.body) and
   not (old.state<>'DELETED' and new.state='DELETED' and new.title='Removed memory' and new.body=''))
 then raise exception 'Memory versions are immutable except removal redaction';end if;return new;
end $$;
revoke all on function kxra_private.guard_team_memory() from public,anon,authenticated;
create trigger team_memory_immutable before update on kxra.team_memory_versions for each row execute function kxra_private.guard_team_memory();
create trigger team_memory_audit after insert or update on kxra.team_memory_versions for each row execute function kxra_private.audit_team_change();

create or replace function kxra_private.team_context_active(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_runs run where run.id=i
  and not exists(select 1 from unnest(run.chunk_ids) with ordinality source(id,n)
   left join kxra.knowledge_chunks chunk on chunk.id=source.id
   where chunk.id is null or not kxra_private.team_chunk_allowed(run.room_id,source.id)
    or chunk.content_sha256 is distinct from run.chunk_hashes[source.n])
  and not exists(select 1 from unnest(run.skill_ids) with ordinality source(id,n)
   left join kxra.team_skill_versions skill on skill.id=source.id
   where skill.id is null or not kxra_private.team_skill_allowed(run.room_id,run.agent_id,source.id)
    or skill.content_sha256 is distinct from run.skill_hashes[source.n])
  and not exists(select 1 from unnest(run.memory_ids) with ordinality source(id,n)
   left join kxra.team_memory_versions memory on memory.id=source.id
   where memory.id is null or memory.room_id<>run.room_id or not kxra_private.team_memory_allowed(source.id,run.agent_id)
    or memory.content_sha256 is distinct from run.memory_hashes[source.n]))
$$;
create function kxra.team_run_start_memory(i uuid,r uuid,a uuid,m uuid,ids uuid[],digest text,chunks uuid[],hashes text[],skills uuid[],skill_digests text[],memories uuid[],memory_digests text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare connection jsonb;
begin
 if session_user<>'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 if memories is null or memory_digests is null or cardinality(memories)>5 or cardinality(memories)<>cardinality(memory_digests)
  or cardinality(memories)<>(select count(distinct x) from unnest(memories) x)
  or exists(select 1 from unnest(memories) with ordinality source(id,n) left join kxra.team_memory_versions memory on memory.id=source.id
   where memory.id is null or memory.room_id<>r or not kxra_private.team_memory_allowed(source.id,a)
    or memory.content_sha256 is distinct from memory_digests[source.n]) then raise insufficient_privilege;end if;
 connection=kxra.team_run_start_context(i,r,a,m,ids,digest,chunks,hashes,skills,skill_digests);
 update kxra.team_runs set memory_ids=memories,memory_hashes=memory_digests where id=i;
 return connection;
end $$;
revoke all on function kxra.team_memory_propose(uuid,uuid,uuid,text,text,text,uuid,timestamptz),
 kxra.team_memory_review(uuid,uuid,text),kxra.team_run_start_memory(uuid,uuid,uuid,uuid,uuid[],text,uuid[],text[],uuid[],text[],uuid[],text[]) from public,anon;
grant execute on function kxra.team_memory_propose(uuid,uuid,uuid,text,text,text,uuid,timestamptz),
 kxra.team_memory_review(uuid,uuid,text),kxra.team_run_start_memory(uuid,uuid,uuid,uuid,uuid[],text,uuid[],text[],uuid[],text[],uuid[],text[]) to authenticated;
