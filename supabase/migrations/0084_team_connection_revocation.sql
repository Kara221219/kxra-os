-- Recheck delegated model authority at both admission and publication.
-- Additive follow-up: never rewrite the prior migration's hash.
create function kxra_private.team_connection_active(connection uuid,room uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.team_connections c
  join kxra.team_rooms r on r.id=room and r.org_id=c.org_id
  join kxra.organisation_memberships m on m.account_id=c.created_by and m.org_id=c.org_id
  join kxra.account_identities a on a.account_id=m.account_id
  where c.id=connection and c.enabled and a.state='ACTIVE'
  and m.state='ACTIVE' and m.starts_at<=now() and m.revoked_at is null
  and (m.expires_at is null or m.expires_at>now())
  and (m.security_role in ('KXRA_OWNER','ORG_ADMIN') or exists(
   select 1 from kxra.project_memberships pm where pm.project_id=r.project_id
   and pm.user_id=c.created_by and pm.active and pm.role='contributor'
   and (pm.expires_at is null or pm.expires_at>now())))
  and (r.access='PROJECT' or exists(select 1 from kxra.team_room_members rm
   where rm.room_id=r.id and rm.account_id=c.created_by and rm.active))
 )
$$;
revoke all on function kxra_private.team_connection_active(uuid,uuid) from public,anon,authenticated;

create or replace function kxra.team_run_start(i uuid,r uuid,a uuid,m uuid,ids uuid[],digest text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ag kxra.team_agents; c kxra.team_connections;
begin
 if session_user <> 'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if exists(select 1 from kxra.team_runs where id=i) then raise exception 'Run already requested';end if;
 if (select count(*) from kxra.team_runs where requested_by=auth.uid() and created_at>now()-interval '24 hours')>=20 then raise exception 'Daily run limit reached';end if;
 if exists(select 1 from kxra.team_runs where requested_by=auth.uid() and status='RUNNING' and created_at>now()-interval '60 seconds') then raise exception 'Run already in progress';end if;
 select * into ag from kxra.team_agents where id=a and room_id=r and enabled;
 if not found then raise insufficient_privilege;end if;
 select * into c from kxra.team_connections where id=ag.connection_id and org_id=kxra_private.member_org() and kxra_private.team_connection_active(id,r);
 if not found then raise insufficient_privilege;end if;
 if cardinality(ids)>40 or not m=any(ids) or exists(select 1 from unnest(ids) x where not exists(select 1 from kxra.team_messages where id=x and room_id=r)) then raise insufficient_privilege;end if;
 insert into kxra.team_runs(id,room_id,agent_id,message_id,requested_by,context_ids,context_sha256) values(i,r,a,m,auth.uid(),ids,digest);
 return jsonb_build_object('id',c.id,'org_id',c.org_id,'provider',c.provider,'model',c.model,'endpoint_id',c.endpoint_id,'encrypted_key',c.encrypted_key);
end $$;
create or replace function kxra.team_run_finish(i uuid,result text,code text,tin integer,tout integer) returns void
language plpgsql security definer set search_path='' as $$
declare r kxra.team_runs;
begin
 if session_user <> 'kxra_app' then raise insufficient_privilege;end if;
 select * into r from kxra.team_runs where id=i and requested_by=auth.uid() for update;
 if not found or r.status<>'RUNNING' then return;end if;
 if not kxra_private.can_team_room(r.room_id,true) or not exists(select 1 from kxra.team_agents a join kxra.team_connections c on c.id=a.connection_id where a.id=r.agent_id and a.enabled and kxra_private.team_connection_active(c.id,r.room_id))
 then update kxra.team_runs set status='CANCELLED',error_code='ACCESS_CHANGED',finished_at=now() where id=i;return;end if;
 update kxra.team_runs set status=case when code is null then 'SUCCEEDED' else 'FAILED' end,
 output=case when code is null then result else '' end,error_code=code,input_tokens=tin,output_tokens=tout,finished_at=now() where id=i;
end $$;
