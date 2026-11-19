-- Extend the existing file lifecycle and room runner; no private-room upload shortcut.
alter table kxra.team_rooms add constraint team_room_project_scope unique(id,org_id,project_id);
create table kxra.team_room_files(
 id uuid primary key default gen_random_uuid(),org_id uuid not null,project_id uuid not null,room_id uuid not null,
 file_version_id uuid not null,active boolean not null default true,
 created_by uuid not null references kxra.account_identities(account_id),created_at timestamptz not null default now(),
 unique(room_id,file_version_id),
 foreign key(room_id,org_id,project_id) references kxra.team_rooms(id,org_id,project_id),
 foreign key(org_id,project_id,file_version_id) references kxra.file_versions(org_id,project_id,id)
);
create table kxra.team_skill_versions(
 id uuid primary key default gen_random_uuid(),org_id uuid not null,room_id uuid not null,
 name text not null check(length(name) between 1 and 100),version integer not null check(version>0),
 instructions text not null check(length(instructions) between 1 and 4000),
 content_sha256 text not null check(content_sha256=encode(sha256(convert_to(instructions,'UTF8')),'hex')),
 state text not null default 'DRAFT' check(state in ('DRAFT','APPROVED','REJECTED','REVOKED')),
 created_by uuid not null references kxra.account_identities(account_id),created_at timestamptz not null default now(),
 reviewed_by uuid references kxra.account_identities(account_id),reviewed_at timestamptz,
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),unique(id,room_id),unique(room_id,name,version)
);
create table kxra.team_agent_skills(
 id uuid primary key default gen_random_uuid(),org_id uuid not null,room_id uuid not null,
 agent_id uuid not null,skill_id uuid not null,enabled boolean not null default true,
 created_by uuid not null references kxra.account_identities(account_id),created_at timestamptz not null default now(),
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),
 foreign key(agent_id,room_id) references kxra.team_agents(id,room_id),
 foreign key(skill_id,room_id) references kxra.team_skill_versions(id,room_id),unique(agent_id,skill_id)
);
alter table kxra.team_runs
 add column chunk_ids uuid[] not null default '{}',add column chunk_hashes text[] not null default '{}',
 add column skill_ids uuid[] not null default '{}',add column skill_hashes text[] not null default '{}',
 add constraint team_run_resource_bounds check(
  cardinality(chunk_ids)<=3 and cardinality(skill_ids)<=3
  and cardinality(chunk_ids)=cardinality(chunk_hashes) and cardinality(skill_ids)=cardinality(skill_hashes)
  and array_position(chunk_ids,null) is null and array_position(skill_ids,null) is null
  and coalesce(array_ndims(chunk_ids),1)=1 and coalesce(array_ndims(skill_ids),1)=1
 );

create function kxra_private.team_source_eligible(r uuid,v uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select kxra_private.can_team_room(r) and exists(
  select 1 from kxra.team_rooms room join kxra.file_versions version
   on version.org_id=room.org_id and version.project_id=room.project_id and version.id=v
  join kxra.files file on file.id=version.file_id and file.current_version=version.version
  join kxra.records record on record.id=version.record_id
  where room.id=r and file.lifecycle_state='INDEXED' and version.lifecycle_state='INDEXED'
   and record.visibility='project_shared' and kxra_private.can_record(record.id)
 )
$$;
create function kxra_private.team_chunk_allowed(r uuid,c uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_room_files attachment join kxra.knowledge_chunks chunk
  on chunk.file_version_id=attachment.file_version_id and chunk.id=c
  where attachment.room_id=r and attachment.active
   and chunk.content_sha256=encode(sha256(convert_to(chunk.content,'UTF8')),'hex')
   and kxra_private.team_source_eligible(r,attachment.file_version_id))
$$;
create function kxra_private.team_skill_allowed(r uuid,a uuid,s uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select kxra_private.can_team_room(r) and exists(select 1 from kxra.team_agent_skills binding
  join kxra.team_skill_versions skill on skill.id=binding.skill_id and skill.room_id=binding.room_id
  where binding.room_id=r and binding.agent_id=a and skill.id=s and binding.enabled and skill.state='APPROVED')
$$;
create function kxra_private.team_context_active(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_runs run where run.id=i
  and not exists(select 1 from unnest(run.chunk_ids) with ordinality source(id,n)
   left join kxra.knowledge_chunks chunk on chunk.id=source.id
   where chunk.id is null or not kxra_private.team_chunk_allowed(run.room_id,source.id)
    or chunk.content_sha256 is distinct from run.chunk_hashes[source.n])
  and not exists(select 1 from unnest(run.skill_ids) with ordinality source(id,n)
   left join kxra.team_skill_versions skill on skill.id=source.id
   where skill.id is null or not kxra_private.team_skill_allowed(run.room_id,run.agent_id,source.id)
    or skill.content_sha256 is distinct from run.skill_hashes[source.n]))
$$;
create function kxra_private.can_team_run(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from kxra.team_runs run where run.id=i
  and kxra_private.can_team_room(run.room_id) and kxra_private.team_context_active(i))
$$;
drop policy run_read on kxra.team_runs;
create policy run_read on kxra.team_runs for select to authenticated using(kxra_private.can_team_run(id));
alter table kxra.team_room_files enable row level security;
alter table kxra.team_skill_versions enable row level security;
alter table kxra.team_agent_skills enable row level security;
create policy room_file_read on kxra.team_room_files for select to authenticated
 using(kxra_private.team_source_eligible(room_id,file_version_id));
create policy room_skill_read on kxra.team_skill_versions for select to authenticated using(kxra_private.can_team_room(room_id));
create policy agent_skill_read on kxra.team_agent_skills for select to authenticated using(kxra_private.can_team_room(room_id));
revoke all on kxra.team_room_files,kxra.team_skill_versions,kxra.team_agent_skills from public,anon,authenticated;
grant select on kxra.team_room_files,kxra.team_skill_versions,kxra.team_agent_skills to authenticated;
revoke all on function kxra_private.team_source_eligible(uuid,uuid),kxra_private.team_chunk_allowed(uuid,uuid),
 kxra_private.team_skill_allowed(uuid,uuid,uuid),kxra_private.team_context_active(uuid),kxra_private.can_team_run(uuid) from public,anon;
grant execute on function kxra_private.team_source_eligible(uuid,uuid),kxra_private.team_chunk_allowed(uuid,uuid),
 kxra_private.team_skill_allowed(uuid,uuid,uuid),kxra_private.team_context_active(uuid),kxra_private.can_team_run(uuid) to authenticated;

create function kxra.team_file_attach(r uuid,v uuid,enabled boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 if enabled and not kxra_private.team_source_eligible(r,v) then raise insufficient_privilege;end if;
 if enabled then
  insert into kxra.team_room_files(org_id,project_id,room_id,file_version_id,created_by)
   select org_id,project_id,id,v,auth.uid() from kxra.team_rooms where id=r
   on conflict(room_id,file_version_id) do update set active=true returning id into result;
 else
  update kxra.team_room_files set active=false where room_id=r and file_version_id=v returning id into result;
 end if;
 if result is null then raise insufficient_privilege;end if;return result;
end $$;
create function kxra.team_skill_propose(i uuid,r uuid,n text,b text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; next_version integer;
begin
 if not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(r::text||':'||n));
 if exists(select 1 from kxra.team_skill_versions where id=i) then
  if not exists(select 1 from kxra.team_skill_versions where id=i and room_id=r and name=n and instructions=b and created_by=auth.uid()) then raise exception 'Idempotency conflict';end if;
  return i;
 end if;
 select coalesce(max(version),0)+1 into next_version from kxra.team_skill_versions where room_id=r and name=n;
 insert into kxra.team_skill_versions(id,org_id,room_id,name,version,instructions,content_sha256,created_by)
 select i,org_id,id,n,next_version,b,encode(sha256(convert_to(b,'UTF8')),'hex'),auth.uid() from kxra.team_rooms where id=r returning id into result;
 return result;
end $$;
create function kxra.team_skill_review(i uuid,decision text) returns void
language plpgsql security definer set search_path='' as $$
begin
 update kxra.team_skill_versions set state=decision,reviewed_by=auth.uid(),reviewed_at=now()
 where id=i and kxra_private.manages_team_room(room_id)
  and ((state='DRAFT' and decision in ('APPROVED','REJECTED')) or (state='APPROVED' and decision='REVOKED'));
 if not found then raise exception 'Skill review stale or unavailable';end if;
end $$;
create function kxra_private.guard_team_skill() returns trigger
language plpgsql set search_path='' as $$
begin
 if (new.id,new.org_id,new.room_id,new.name,new.version,new.instructions,new.content_sha256,new.created_by,new.created_at)
  is distinct from (old.id,old.org_id,old.room_id,old.name,old.version,old.instructions,old.content_sha256,old.created_by,old.created_at)
 then raise exception 'Skill versions are immutable';end if;return new;
end $$;
revoke all on function kxra_private.guard_team_skill() from public,anon,authenticated;
create trigger team_skill_immutable before update on kxra.team_skill_versions for each row execute function kxra_private.guard_team_skill();
create function kxra.team_agent_skill(a uuid,s uuid,active boolean) returns void
language plpgsql security definer set search_path='' as $$
declare ag kxra.team_agents; sk kxra.team_skill_versions;
begin
 select * into ag from kxra.team_agents where id=a;
 if not found or not kxra_private.manages_team_room(ag.room_id) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(a::text));
 select * into sk from kxra.team_skill_versions where id=s and room_id=ag.room_id;
 if not found or (active and sk.state<>'APPROVED') then raise insufficient_privilege;end if;
 if active and exists(select 1 from kxra.team_agent_skills binding join kxra.team_skill_versions skill on skill.id=binding.skill_id
  where binding.agent_id=a and binding.enabled and skill.name=sk.name and skill.id<>s) then raise exception 'Detach the previous version first';end if;
 if active and (select count(*) from kxra.team_agent_skills where agent_id=a and enabled and skill_id<>s)>=3 then raise exception 'Three skills per agent maximum';end if;
 insert into kxra.team_agent_skills(org_id,room_id,agent_id,skill_id,enabled,created_by)
 values(ag.org_id,ag.room_id,a,s,active,auth.uid()) on conflict(agent_id,skill_id) do update set enabled=excluded.enabled;
end $$;

create function kxra.team_run_start_context(i uuid,r uuid,a uuid,m uuid,ids uuid[],digest text,chunks uuid[],hashes text[],skills uuid[],skill_digests text[]) returns jsonb
language plpgsql security definer set search_path='' as $$
declare connection jsonb;
begin
 if session_user<>'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 if chunks is null or hashes is null or skills is null or skill_digests is null
  or cardinality(chunks)>3 or cardinality(skills)>3
  or cardinality(chunks)<>cardinality(hashes) or cardinality(skills)<>cardinality(skill_digests)
  or cardinality(chunks)<>(select count(distinct x) from unnest(chunks) x)
  or cardinality(skills)<>(select count(distinct x) from unnest(skills) x)
  or exists(select 1 from unnest(chunks) with ordinality source(id,n) left join kxra.knowledge_chunks chunk on chunk.id=source.id
   where not kxra_private.team_chunk_allowed(r,source.id) or chunk.id is null or chunk.content_sha256 is distinct from hashes[source.n])
  or exists(select 1 from unnest(skills) with ordinality source(id,n) left join kxra.team_skill_versions skill on skill.id=source.id
   where not kxra_private.team_skill_allowed(r,a,source.id) or skill.id is null or skill.content_sha256 is distinct from skill_digests[source.n])
 then raise insufficient_privilege;end if;
 connection=kxra.team_run_start(i,r,a,m,ids,digest);
 update kxra.team_runs set chunk_ids=chunks,chunk_hashes=hashes,skill_ids=skills,skill_hashes=skill_digests where id=i;
 return connection;
end $$;
create function kxra.team_run_ready(i uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select session_user='kxra_app' and exists(select 1 from kxra.team_runs run join kxra.team_agents agent on agent.id=run.agent_id
  where run.id=i and run.requested_by=auth.uid() and run.status='RUNNING' and agent.enabled
   and kxra_private.can_team_room(run.room_id,true) and kxra_private.team_connection_active(agent.connection_id,run.room_id)
   and kxra_private.team_context_active(i))
$$;
create or replace function kxra.team_run_finish(i uuid,result text,code text,tin integer,tout integer) returns void
language plpgsql security definer set search_path='' as $$
declare r kxra.team_runs;
begin
 if session_user <> 'kxra_app' then raise insufficient_privilege;end if;
 select * into r from kxra.team_runs where id=i and requested_by=auth.uid() for update;
 if not found or r.status<>'RUNNING' then return;end if;
 if not kxra_private.can_team_room(r.room_id,true) or not kxra_private.team_context_active(i)
  or not exists(select 1 from kxra.team_agents a where a.id=r.agent_id and a.enabled and kxra_private.team_connection_active(a.connection_id,r.room_id))
 then update kxra.team_runs set status='CANCELLED',output='',error_code='ACCESS_CHANGED',finished_at=now() where id=i;return;end if;
 update kxra.team_runs set status=case when code is null then 'SUCCEEDED' else 'FAILED' end,
  output=case when code is null then result else '' end,error_code=code,input_tokens=tin,output_tokens=tout,finished_at=now() where id=i;
end $$;
revoke all on function kxra.team_file_attach(uuid,uuid,boolean),kxra.team_skill_propose(uuid,uuid,text,text),kxra.team_skill_review(uuid,text),
 kxra.team_agent_skill(uuid,uuid,boolean),kxra.team_run_start_context(uuid,uuid,uuid,uuid,uuid[],text,uuid[],text[],uuid[],text[]),kxra.team_run_ready(uuid) from public,anon;
grant execute on function kxra.team_file_attach(uuid,uuid,boolean),kxra.team_skill_propose(uuid,uuid,text,text),kxra.team_skill_review(uuid,text),
 kxra.team_agent_skill(uuid,uuid,boolean),kxra.team_run_start_context(uuid,uuid,uuid,uuid,uuid[],text,uuid[],text[],uuid[],text[]),kxra.team_run_ready(uuid) to authenticated;
create trigger team_file_audit after insert or update on kxra.team_room_files for each row execute function kxra_private.audit_team_change();
create trigger team_skill_audit after insert or update on kxra.team_skill_versions for each row execute function kxra_private.audit_team_change();
create trigger team_agent_skill_audit after insert or update on kxra.team_agent_skills for each row execute function kxra_private.audit_team_change();
