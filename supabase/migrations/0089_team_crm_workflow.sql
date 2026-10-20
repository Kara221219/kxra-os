-- Local record workflow, scoped to the room. No connector or external send.
create table kxra.team_workflow_records(
 id uuid primary key,org_id uuid not null,room_id uuid not null,kind text not null check(kind in ('LEAD','ACCOUNT','OPPORTUNITY')),
 title text not null check(length(trim(title)) between 1 and 160),body text not null default '' check(length(body)<=4000),
 next_step text not null check(length(trim(next_step)) between 1 and 500),state text not null default 'OPEN' check(state in ('OPEN','CONVERTED')),
 created_by uuid not null references kxra.account_identities(account_id),version integer not null default 1,
 source_id uuid,action_id uuid,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,room_id),unique(action_id,kind),foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),
 foreign key(source_id,room_id) references kxra.team_workflow_records(id,room_id),
 check((kind='LEAD')=(source_id is null and action_id is null))
);
create index team_workflow_records_room on kxra.team_workflow_records(room_id,created_at desc,id desc);
create table kxra.team_workflow_actions(
 id uuid primary key,org_id uuid not null,room_id uuid not null,source_id uuid not null,source_version integer not null,
 source_sha256 text not null,account_name text not null check(length(trim(account_name)) between 1 and 160),
 opportunity_name text not null check(length(trim(opportunity_name)) between 1 and 160),next_step text not null check(length(trim(next_step)) between 1 and 500),
 requested_by uuid not null references kxra.account_identities(account_id),state text not null default 'PROPOSED' check(state in ('PROPOSED','APPROVED','REJECTED','CANCELLED','EXECUTED')),
 version integer not null default 1,reviewed_by uuid references kxra.account_identities(account_id),reviewed_at timestamptz,
 expires_at timestamptz not null default now()+interval '7 days',account_id uuid,opportunity_id uuid,executed_at timestamptz,
 created_at timestamptz not null default now(),foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),
 foreign key(source_id,room_id) references kxra.team_workflow_records(id,room_id),unique(id,room_id),
 foreign key(account_id,room_id) references kxra.team_workflow_records(id,room_id),
 foreign key(opportunity_id,room_id) references kxra.team_workflow_records(id,room_id),
 check((state='EXECUTED')=(account_id is not null and opportunity_id is not null and executed_at is not null))
);
alter table kxra.team_workflow_records add foreign key(action_id,room_id) references kxra.team_workflow_actions(id,room_id);
create index team_workflow_actions_room on kxra.team_workflow_actions(room_id,created_at desc,id desc);
alter table kxra.team_workflow_records enable row level security;
alter table kxra.team_workflow_actions enable row level security;
create policy team_workflow_records_read on kxra.team_workflow_records for select to authenticated using(kxra_private.can_team_room(room_id));
create policy team_workflow_actions_read on kxra.team_workflow_actions for select to authenticated using(kxra_private.can_team_room(room_id));
revoke all on kxra.team_workflow_records,kxra.team_workflow_actions from public,anon,authenticated;
grant select on kxra.team_workflow_records to authenticated;
grant select(id,org_id,room_id,source_id,source_version,account_name,opportunity_name,next_step,requested_by,state,version,
 reviewed_by,reviewed_at,expires_at,account_id,opportunity_id,executed_at,created_at) on kxra.team_workflow_actions to authenticated;
create function kxra_private.team_lead_hash(i uuid) returns text language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_array(title,body,next_step)::text,'UTF8')),'hex') from kxra.team_workflow_records where id=i
$$;
revoke all on function kxra_private.team_lead_hash(uuid) from public,anon,authenticated;
create function kxra.team_lead_save(i uuid,r uuid,expected integer,n text,b text,step text) returns uuid
language plpgsql security definer set search_path='' as $$
declare rec kxra.team_workflow_records;o uuid;
begin
 if session_user<>'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(i::text));
 select * into rec from kxra.team_workflow_records where id=i for update;
 if found then
  if rec.room_id<>r or rec.kind<>'LEAD' then raise insufficient_privilege;end if;
  if expected=0 and rec.created_by=auth.uid() and (rec.title,rec.body,rec.next_step) is not distinct from (trim(n),b,trim(step)) then return i;end if;
  if rec.version is distinct from expected or rec.state<>'OPEN' then raise exception 'Lead changed';end if;
  update kxra.team_workflow_records set title=trim(n),body=b,next_step=trim(step),version=version+1,updated_at=now() where id=i;
 else
  if expected is distinct from 0 then raise exception 'Lead unavailable';end if;
  select org_id into o from kxra.team_rooms where id=r;
  insert into kxra.team_workflow_records(id,org_id,room_id,kind,title,body,next_step,created_by) values(i,o,r,'LEAD',trim(n),b,trim(step),auth.uid());
 end if;return i;
end $$;
create function kxra.team_crm_propose(i uuid,r uuid,source uuid,expected integer,account text,opportunity text,step text) returns uuid
language plpgsql security definer set search_path='' as $$
declare rec kxra.team_workflow_records;a kxra.team_workflow_actions;
begin
 if session_user<>'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(i::text));
 select * into a from kxra.team_workflow_actions where id=i;
 if found then
  if a.room_id<>r or a.requested_by<>auth.uid() or (a.source_id,a.source_version,a.account_name,a.opportunity_name,a.next_step)
  is distinct from (source,expected,trim(account),trim(opportunity),trim(step)) then raise exception 'Conversion request conflict';end if;return i;
 end if;
 select * into rec from kxra.team_workflow_records where id=source and room_id=r for update;
 if not found or rec.kind<>'LEAD' or rec.state<>'OPEN' or rec.version is distinct from expected then raise exception 'Lead changed';end if;
 insert into kxra.team_workflow_actions(id,org_id,room_id,source_id,source_version,source_sha256,account_name,opportunity_name,next_step,requested_by)
 values(i,rec.org_id,r,source,expected,kxra_private.team_lead_hash(source),trim(account),trim(opportunity),trim(step),auth.uid());return i;
end $$;
create function kxra.team_crm_review(r uuid,i uuid,expected integer,decision text) returns void
language plpgsql security definer set search_path='' as $$
declare a kxra.team_workflow_actions;
begin
 if session_user<>'kxra_app' or not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 select * into a from kxra.team_workflow_actions where id=i and room_id=r for update;
 if not found then raise insufficient_privilege;end if;
 if a.version is distinct from expected or decision is null or decision not in ('APPROVED','REJECTED','CANCELLED')
 or a.state not in ('PROPOSED','APPROVED') or (decision<>'CANCELLED' and a.state<>'PROPOSED') then raise exception 'Conversion changed';end if;
 if decision='APPROVED' and (a.expires_at<=now() or not exists(select 1 from kxra.team_workflow_records
  where id=a.source_id and room_id=r and state='OPEN' and version=a.source_version)
  or a.source_sha256 is distinct from kxra_private.team_lead_hash(a.source_id)) then raise exception 'Lead changed';end if;
 update kxra.team_workflow_actions set state=decision,version=version+1,reviewed_by=auth.uid(),reviewed_at=now() where id=i;
end $$;
create function kxra.team_crm_execute(r uuid,i uuid,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a kxra.team_workflow_actions;rec kxra.team_workflow_records;account uuid;opportunity uuid;
begin
 if session_user<>'kxra_app' or not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 select * into a from kxra.team_workflow_actions where id=i and room_id=r for update;
 if not found then raise insufficient_privilege;end if;
 if a.state='EXECUTED' then return jsonb_build_object('account_id',a.account_id,'opportunity_id',a.opportunity_id,'replayed',true);end if;
 if a.version is distinct from expected or a.state<>'APPROVED' or a.expires_at<=now() then raise exception 'Conversion approval unavailable';end if;
 select * into rec from kxra.team_workflow_records where id=a.source_id and room_id=r for update;
 if not found or rec.state<>'OPEN' or rec.version<>a.source_version or a.source_sha256 is distinct from kxra_private.team_lead_hash(a.source_id) then raise exception 'Lead changed';end if;
 account=gen_random_uuid();opportunity=gen_random_uuid();
 insert into kxra.team_workflow_records(id,org_id,room_id,kind,title,body,next_step,created_by,source_id,action_id)
 values(account,a.org_id,r,'ACCOUNT',a.account_name,'',a.next_step,auth.uid(),rec.id,a.id),
 (opportunity,a.org_id,r,'OPPORTUNITY',a.opportunity_name,'',a.next_step,auth.uid(),rec.id,a.id);
 update kxra.team_workflow_records set state='CONVERTED',version=version+1,updated_at=now() where id=rec.id;
 update kxra.team_workflow_actions set state='EXECUTED',version=version+1,account_id=account,opportunity_id=opportunity,executed_at=now() where id=i;
 return jsonb_build_object('account_id',account,'opportunity_id',opportunity,'replayed',false);
end $$;
create function kxra_private.guard_team_workflow() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='team_workflow_records' then
  if (new.id,new.org_id,new.room_id,new.kind,new.created_by,new.source_id,new.action_id,new.created_at) is distinct from
  (old.id,old.org_id,old.room_id,old.kind,old.created_by,old.source_id,old.action_id,old.created_at) or old.state<>'OPEN' or old.kind<>'LEAD' then raise exception 'Workflow record is immutable';end if;
 else
  if (new.id,new.org_id,new.room_id,new.source_id,new.source_version,new.source_sha256,new.account_name,new.opportunity_name,new.next_step,new.requested_by,new.expires_at,new.created_at)
  is distinct from (old.id,old.org_id,old.room_id,old.source_id,old.source_version,old.source_sha256,old.account_name,old.opportunity_name,old.next_step,old.requested_by,old.expires_at,old.created_at)
  then raise exception 'Workflow approval payload is immutable';end if;
 end if;return new;
end $$;
revoke all on function kxra_private.guard_team_workflow() from public,anon,authenticated;
create trigger team_workflow_record_guard before update on kxra.team_workflow_records for each row execute function kxra_private.guard_team_workflow();
create trigger team_workflow_action_guard before update on kxra.team_workflow_actions for each row execute function kxra_private.guard_team_workflow();
create trigger team_workflow_record_audit after insert or update on kxra.team_workflow_records for each row execute function kxra_private.audit_team_change();
create trigger team_workflow_action_audit after insert or update on kxra.team_workflow_actions for each row execute function kxra_private.audit_team_change();
revoke all on function kxra.team_lead_save(uuid,uuid,integer,text,text,text),kxra.team_crm_propose(uuid,uuid,uuid,integer,text,text,text),kxra.team_crm_review(uuid,uuid,integer,text),kxra.team_crm_execute(uuid,uuid,integer) from public,anon;
grant execute on function kxra.team_lead_save(uuid,uuid,integer,text,text,text),kxra.team_crm_propose(uuid,uuid,uuid,integer,text,text,text),kxra.team_crm_review(uuid,uuid,integer,text),kxra.team_crm_execute(uuid,uuid,integer) to authenticated;
