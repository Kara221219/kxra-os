-- Operational case details; no provider/booking/hiring/contract execution.
create function kxra_private.case_details_valid(k text,d jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if d is null or jsonb_typeof(d)<>'object' or length(d::text)>32768 then return false;end if;
 if k='REMODEL' then return coalesce(d-array['property','scope','exclusions','estimate_pence','currency','milestone']='{}'::jsonb
  and jsonb_typeof(d->'property')='string' and length(trim(d->>'property')) between 1 and 240
  and jsonb_typeof(d->'scope')='string' and length(trim(d->>'scope')) between 1 and 4000
  and jsonb_typeof(d->'exclusions')='string' and length(d->>'exclusions')<=2000
  and jsonb_typeof(d->'milestone')='string' and length(trim(d->>'milestone')) between 1 and 500
  and d->>'currency'='GBP' and jsonb_typeof(d->'estimate_pence')='number' and (d->>'estimate_pence')~'^[0-9]{1,12}$',false);
 elsif k='ROLE' then return coalesce(d-array['role_brief','criteria']='{}'::jsonb
  and jsonb_typeof(d->'role_brief')='string' and length(trim(d->>'role_brief')) between 1 and 4000
  and jsonb_typeof(d->'criteria')='string' and length(trim(d->>'criteria')) between 1 and 2000,false);
 elsif k='APPLICATION' then return coalesce(d-array['application_reference','evidence','review_note']='{}'::jsonb
  and jsonb_typeof(d->'application_reference')='string' and length(trim(d->>'application_reference')) between 1 and 160
  and jsonb_typeof(d->'evidence')='string' and length(trim(d->>'evidence')) between 1 and 4000
  and jsonb_typeof(d->'review_note')='string' and length(trim(d->>'review_note')) between 1 and 2000,false);
 elsif k='TRAVEL' then return coalesce(d-array['traveller_reference','destination','starts_on','ends_on','proposal','exclusions']='{}'::jsonb
  and jsonb_typeof(d->'traveller_reference')='string' and length(trim(d->>'traveller_reference')) between 1 and 160
  and jsonb_typeof(d->'destination')='string' and length(trim(d->>'destination')) between 1 and 240
  and jsonb_typeof(d->'proposal')='string' and length(trim(d->>'proposal')) between 1 and 4000
  and jsonb_typeof(d->'exclusions')='string' and length(d->>'exclusions')<=2000
  and (d->>'starts_on')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and (d->>'ends_on')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  and (d->>'ends_on')::date >= (d->>'starts_on')::date,false);
 end if;return false;
exception when others then return false;
end $$;
revoke all on function kxra_private.case_details_valid(text,jsonb) from public,anon;
grant execute on function kxra_private.case_details_valid(text,jsonb) to authenticated;
-- Three dedicated case workflows; no external consequences.
create table kxra.team_case_records(
 id uuid primary key,org_id uuid not null,room_id uuid not null,
 kind text not null check(kind in ('REMODEL','ROLE','APPLICATION','TRAVEL')),
 title text not null check(length(trim(title)) between 1 and 160),
 body text not null default '' check(length(body)<=4000),
 responsible text not null check(length(trim(responsible)) between 1 and 160),
 next_step text not null check(length(trim(next_step)) between 1 and 500),due_on date,
 parent_id uuid,stage text not null,version integer not null default 1 check(version>0),
 created_by uuid not null references kxra.account_identities(account_id),
 updated_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,room_id),foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),
 foreign key(parent_id,room_id) references kxra.team_case_records(id,room_id),
 details jsonb not null check(kxra_private.case_details_valid(kind,details)),
 check((kind='REMODEL' and parent_id is null and stage in ('BRIEF','ESTIMATE_DRAFT','SCOPE_REVIEWED','MILESTONE_PLANNED','HANDOFF','ARCHIVED'))
  or (kind='ROLE' and parent_id is null and stage in ('DRAFT','OPEN','CLOSED'))
  or (kind='APPLICATION' and parent_id is not null and stage in ('APPLIED','REVIEW','INTERVIEW','DECISION_RECORDED','ARCHIVED'))
  or (kind='TRAVEL' and parent_id is null and stage in ('ENQUIRY','PROPOSAL_DRAFT','REVIEWED','NEXT_STEP_AGREED','ARCHIVED','CANCELLED')))
);
create index team_case_records_room on kxra.team_case_records(room_id,kind,created_at desc,id desc);
create index team_case_records_creator on kxra.team_case_records(parent_id,room_id);
create table kxra.team_case_actions(
 id uuid primary key,org_id uuid not null,room_id uuid not null,kind text not null check(kind in ('REMODEL','ROLE','APPLICATION','TRAVEL')),
 source_id uuid not null,source_version integer not null check(source_version>0),
 source_hash text not null,source_snapshot jsonb not null,
 target_stage text not null,note text not null check(length(trim(note)) between 1 and 4000),
 state text not null default 'PROPOSED' check(state in ('PROPOSED','APPROVED','REJECTED','CANCELLED','EXECUTED')),
 version integer not null default 1 check(version>0),requested_by uuid not null references kxra.account_identities(account_id),
 reviewed_by uuid references kxra.account_identities(account_id),reviewed_at timestamptz,
 expires_at timestamptz not null default now()+interval '7 days',result jsonb,executed_at timestamptz,
 created_at timestamptz not null default now(),foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),
 foreign key(source_id,room_id) references kxra.team_case_records(id,room_id),
 check((state='EXECUTED')=(result is not null and executed_at is not null)),
 check(expires_at>created_at)
);
create index team_case_actions_room on kxra.team_case_actions(room_id,kind,created_at desc,id desc);
create index team_case_actions_source on kxra.team_case_actions(source_id,room_id);
alter table kxra.team_case_records enable row level security;
alter table kxra.team_case_actions enable row level security;
create policy case_records_read on kxra.team_case_records for select to authenticated using(kxra_private.can_team_room(room_id) and (kind not in ('ROLE','APPLICATION') or exists(select 1 from kxra.team_rooms r where r.id=room_id and r.access='PRIVATE')));
create policy case_actions_read on kxra.team_case_actions for select to authenticated using(kxra_private.can_team_room(room_id) and (kind not in ('ROLE','APPLICATION') or exists(select 1 from kxra.team_rooms r where r.id=room_id and r.access='PRIVATE')));
revoke all on kxra.team_case_records,kxra.team_case_actions from public,anon,authenticated;
grant select on kxra.team_case_records to authenticated;
grant select(id,org_id,room_id,kind,source_id,source_version,source_snapshot,target_stage,note,state,version,requested_by,reviewed_by,reviewed_at,expires_at,result,executed_at,created_at) on kxra.team_case_actions to authenticated;

create function kxra_private.case_transition(k text,s text,t text) returns boolean
language sql immutable set search_path='' as $$
 select case when k='REMODEL' then
  (s='BRIEF' and t in ('ESTIMATE_DRAFT','ARCHIVED')) or (s='ESTIMATE_DRAFT' and t in ('SCOPE_REVIEWED','ARCHIVED'))
  or (s='SCOPE_REVIEWED' and t in ('MILESTONE_PLANNED','ARCHIVED')) or (s='MILESTONE_PLANNED' and t in ('HANDOFF','ARCHIVED')) or (s='HANDOFF' and t='ARCHIVED')
 when k='ROLE' then (s='DRAFT' and t='OPEN') or (s='OPEN' and t='CLOSED') or (s='CLOSED' and t='OPEN')
 when k='APPLICATION' then (s='APPLIED' and t in ('REVIEW','ARCHIVED')) or (s='REVIEW' and t in ('INTERVIEW','ARCHIVED')) or (s='INTERVIEW' and t in ('DECISION_RECORDED','ARCHIVED')) or (s='DECISION_RECORDED' and t='ARCHIVED')
 when k='TRAVEL' then (s='ENQUIRY' and t in ('PROPOSAL_DRAFT','CANCELLED')) or (s='PROPOSAL_DRAFT' and t in ('REVIEWED','CANCELLED')) or (s='REVIEWED' and t in ('NEXT_STEP_AGREED','CANCELLED')) or (s='NEXT_STEP_AGREED' and t='ARCHIVED') else false end
$$;
create function kxra_private.case_snapshot(i uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('title',r.title,'body',r.body,'responsible',r.responsible,'next_step',r.next_step,'due_on',r.due_on,
  'stage',r.stage,'version',r.version,'details',r.details,'parent_id',r.parent_id,'parent_title',c.title,'parent_version',c.version)
 from kxra.team_case_records r left join kxra.team_case_records c on c.id=r.parent_id and c.room_id=r.room_id where r.id=i
$$;
create function kxra_private.case_hash(i uuid) returns text
language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(kxra_private.case_snapshot(i)::text,'UTF8')),'hex')
$$;
revoke all on function kxra_private.case_transition(text,text,text),kxra_private.case_snapshot(uuid),kxra_private.case_hash(uuid) from public,anon,authenticated;

create function kxra.team_case_save(i uuid,r uuid,k text,expected integer,n text,b text,person text,step text,d date,parent uuid,p_details jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare rec kxra.team_case_records;o uuid;
begin
 if session_user<>'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 if k in ('ROLE','APPLICATION') and not exists(select 1 from kxra.team_rooms where id=r and access='PRIVATE') then raise exception 'Recruiting requires a private room';end if;
 if k is null or k not in ('REMODEL','ROLE','APPLICATION','TRAVEL') or i is null or expected is null or expected<0 then raise exception 'Invalid record';end if;
 perform pg_advisory_xact_lock(hashtext(i::text));
 select * into rec from kxra.team_case_records where id=i for update;
 if found then
  if rec.room_id<>r or rec.kind<>k or rec.parent_id is distinct from parent then raise insufficient_privilege;end if;
  if (rec.title,rec.body,rec.responsible,rec.next_step,rec.due_on,rec.details) is not distinct from (trim(n),b,trim(person),trim(step),d,p_details)
   and ((expected=0 and rec.created_by=auth.uid()) or (rec.version=expected+1 and rec.updated_by=auth.uid())) then return i;end if;
  if rec.version<>expected or rec.stage in ('HANDOFF','DECISION_RECORDED','ARCHIVED','CANCELLED') then raise exception 'Record changed';end if;
  update kxra.team_case_records set title=trim(n),body=b,responsible=trim(person),next_step=trim(step),due_on=d,details=p_details,
   stage=case when k='REMODEL' and rec.stage<>'BRIEF' then 'ESTIMATE_DRAFT' when k='TRAVEL' and rec.stage<>'ENQUIRY' then 'PROPOSAL_DRAFT' when k='ROLE' then 'DRAFT' when k='APPLICATION' then 'APPLIED' else rec.stage end,
   version=version+1,updated_by=auth.uid(),updated_at=now() where id=i;
 else
  if expected<>0 then raise exception 'Record unavailable';end if;
  if k='APPLICATION' then
   perform 1 from kxra.team_case_records where id=parent and room_id=r and kind='ROLE' and stage='OPEN' for share;
   if not found then raise exception 'Open role unavailable';end if;
  end if;
  select org_id into o from kxra.team_rooms where id=r;
  insert into kxra.team_case_records(id,org_id,room_id,kind,title,body,responsible,next_step,due_on,parent_id,stage,created_by,updated_by,details)
  values(i,o,r,k,trim(n),b,trim(person),trim(step),d,parent,case k when 'REMODEL' then 'BRIEF' when 'ROLE' then 'DRAFT' when 'APPLICATION' then 'APPLIED' else 'ENQUIRY' end,auth.uid(),auth.uid(),p_details);
 end if;return i;
end $$;
create function kxra.team_case_propose(i uuid,r uuid,k text,source uuid,expected integer,target text,reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare rec kxra.team_case_records;a kxra.team_case_actions;
begin
 if session_user<>'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 if k in ('ROLE','APPLICATION') and not exists(select 1 from kxra.team_rooms where id=r and access='PRIVATE') then raise exception 'Recruiting requires a private room';end if;
 perform pg_advisory_xact_lock(hashtext(i::text));
 select * into a from kxra.team_case_actions where id=i;
 if found then
  if a.room_id<>r or a.kind is distinct from k or a.requested_by<>auth.uid()
   or (a.source_id,a.source_version,a.target_stage,a.note) is distinct from (source,expected,target,trim(reason)) then raise exception 'Request conflict';end if;
  return i;
 end if;
 select * into rec from kxra.team_case_records where id=source and room_id=r and kind=k for update;
 if not found or rec.version is distinct from expected or not kxra_private.case_transition(k,rec.stage,target) then raise exception 'Record changed or transition unavailable';end if;
 if rec.parent_id is not null then
  perform 1 from kxra.team_case_records where id=rec.parent_id and room_id=r and kind='ROLE' and stage='OPEN' for share;
  if not found then raise exception 'Open role unavailable';end if;
 end if;
 insert into kxra.team_case_actions(id,org_id,room_id,kind,source_id,source_version,source_hash,source_snapshot,target_stage,note,requested_by)
 values(i,rec.org_id,r,k,source,expected,kxra_private.case_hash(source),kxra_private.case_snapshot(source),target,trim(reason),auth.uid());return i;
end $$;
create function kxra.team_case_review(r uuid,k text,i uuid,expected integer,decision text) returns void
language plpgsql security definer set search_path='' as $$
declare a kxra.team_case_actions;
begin
 if session_user<>'kxra_app' or not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 if k in ('ROLE','APPLICATION') and not exists(select 1 from kxra.team_rooms where id=r and access='PRIVATE') then raise exception 'Recruiting requires a private room';end if;
 select * into a from kxra.team_case_actions where id=i and room_id=r and kind=k for update;
 if not found then raise insufficient_privilege;end if;
 if a.version=expected+1 and a.state=decision and a.reviewed_by=auth.uid() then return;end if;
 if expected is null or a.version<>expected or decision is null or decision not in ('APPROVED','REJECTED','CANCELLED')
  or a.state not in ('PROPOSED','APPROVED') or (decision<>'CANCELLED' and a.state<>'PROPOSED') then raise exception 'Review changed';end if;
 if decision='APPROVED' and (a.expires_at<=now() or a.source_hash is distinct from kxra_private.case_hash(a.source_id)) then raise exception 'Source changed';end if;
 update kxra.team_case_actions set state=decision,version=version+1,reviewed_by=auth.uid(),reviewed_at=now() where id=i;
end $$;
create function kxra.team_case_execute(r uuid,k text,i uuid,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a kxra.team_case_actions;rec kxra.team_case_records;receipt jsonb;
begin
 if session_user<>'kxra_app' or not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 if k in ('ROLE','APPLICATION') and not exists(select 1 from kxra.team_rooms where id=r and access='PRIVATE') then raise exception 'Recruiting requires a private room';end if;
 select * into a from kxra.team_case_actions where id=i and room_id=r and kind=k for update;
 if not found then raise insufficient_privilege;end if;
 if a.state='EXECUTED' then
  if expected is distinct from a.version-1 then raise exception 'Review changed';end if;
  return a.result||jsonb_build_object('replayed',true);
 end if;
 if a.version is distinct from expected or a.state<>'APPROVED' or a.expires_at<=now() then raise exception 'Approval unavailable';end if;
 select * into rec from kxra.team_case_records where id=a.source_id and room_id=r and kind=k for update;
 if not found then raise insufficient_privilege;end if;
 if rec.parent_id is not null then
  perform 1 from kxra.team_case_records where id=rec.parent_id and room_id=r and kind='ROLE' and stage='OPEN' for share;
  if not found then raise exception 'Open role unavailable';end if;
 end if;
 if rec.version<>a.source_version or a.source_hash is distinct from kxra_private.case_hash(rec.id)
  or not kxra_private.case_transition(k,rec.stage,a.target_stage) then raise exception 'Source changed';end if;
 update kxra.team_case_records set stage=a.target_stage,version=version+1,updated_by=auth.uid(),updated_at=now() where id=rec.id;
 receipt=jsonb_build_object('record_id',rec.id,'version',rec.version+1,'stage',a.target_stage,'action_id',i,'replayed',false);
 update kxra.team_case_actions set state='EXECUTED',version=version+1,result=receipt,executed_at=now() where id=i;
 return receipt;
end $$;
create function kxra_private.guard_case() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='team_case_records' then
  if (new.id,new.org_id,new.room_id,new.kind,new.parent_id,new.created_by,new.created_at) is distinct from
   (old.id,old.org_id,old.room_id,old.kind,old.parent_id,old.created_by,old.created_at) then raise exception 'Record identity immutable';end if;
 else
  if old.state='EXECUTED' or (new.id,new.org_id,new.room_id,new.kind,new.source_id,new.source_version,new.source_hash,new.source_snapshot,new.target_stage,new.note,new.requested_by,new.expires_at,new.created_at)
   is distinct from (old.id,old.org_id,old.room_id,old.kind,old.source_id,old.source_version,old.source_hash,old.source_snapshot,old.target_stage,old.note,old.requested_by,old.expires_at,old.created_at) then raise exception 'Review payload immutable';end if;
 end if;return new;
end $$;
revoke all on function kxra_private.guard_case() from public,anon,authenticated;
create trigger case_record_identity before update on kxra.team_case_records for each row execute function kxra_private.guard_case();
create trigger case_action_identity before update on kxra.team_case_actions for each row execute function kxra_private.guard_case();
create trigger pilot_case_record before insert or update on kxra.team_case_records for each row execute function kxra_private.guard_pilot_work();
create trigger pilot_case_action before insert on kxra.team_case_actions for each row execute function kxra_private.guard_pilot_work();
create trigger case_record_audit after insert or update on kxra.team_case_records for each row execute function kxra_private.audit_team_change();
create trigger case_action_audit after insert or update on kxra.team_case_actions for each row execute function kxra_private.audit_team_change();
revoke all on function kxra.team_case_save(uuid,uuid,text,integer,text,text,text,text,date,uuid,jsonb),kxra.team_case_propose(uuid,uuid,text,uuid,integer,text,text),kxra.team_case_review(uuid,text,uuid,integer,text),kxra.team_case_execute(uuid,text,uuid,integer) from public,anon;
grant execute on function kxra.team_case_save(uuid,uuid,text,integer,text,text,text,text,date,uuid,jsonb),kxra.team_case_propose(uuid,uuid,text,uuid,integer,text,text),kxra.team_case_review(uuid,text,uuid,integer,text),kxra.team_case_execute(uuid,text,uuid,integer) to authenticated;
