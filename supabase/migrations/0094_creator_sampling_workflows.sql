-- Room-scoped operational records. No outreach, shipment, provider or notification.
create table kxra.team_collaboration_records(
 id uuid primary key,org_id uuid not null,room_id uuid not null,
 kind text not null check(kind in ('CREATOR','SAMPLE')),
 title text not null check(length(trim(title)) between 1 and 160),
 body text not null default '' check(length(body)<=4000),
 responsible text not null check(length(trim(responsible)) between 1 and 160),
 next_step text not null check(length(trim(next_step)) between 1 and 500),due_on date,
 creator_id uuid,stage text not null,version integer not null default 1 check(version>0),
 created_by uuid not null references kxra.account_identities(account_id),
 updated_by uuid not null references kxra.account_identities(account_id),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,room_id),foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),
 foreign key(creator_id,room_id) references kxra.team_collaboration_records(id,room_id),
 check((kind='CREATOR' and creator_id is null and stage in ('RESEARCH','SHORTLIST','BRIEF_REVIEW','COLLABORATING','COMPLETE','ARCHIVED'))
  or (kind='SAMPLE' and creator_id is not null and stage in ('REQUESTED','PREPARED','DELIVERED','POST_REVIEW','COMPLETE','CANCELLED')))
);
create index team_collaboration_records_room on kxra.team_collaboration_records(room_id,kind,created_at desc,id desc);
create index team_collaboration_records_creator on kxra.team_collaboration_records(creator_id,room_id);
create table kxra.team_collaboration_actions(
 id uuid primary key,org_id uuid not null,room_id uuid not null,kind text not null check(kind in ('CREATOR','SAMPLE')),
 source_id uuid not null,source_version integer not null check(source_version>0),
 source_hash text not null,source_snapshot jsonb not null,
 target_stage text not null,note text not null check(length(trim(note)) between 1 and 4000),
 state text not null default 'PROPOSED' check(state in ('PROPOSED','APPROVED','REJECTED','CANCELLED','EXECUTED')),
 version integer not null default 1 check(version>0),requested_by uuid not null references kxra.account_identities(account_id),
 reviewed_by uuid references kxra.account_identities(account_id),reviewed_at timestamptz,
 expires_at timestamptz not null default now()+interval '7 days',result jsonb,executed_at timestamptz,
 created_at timestamptz not null default now(),foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),
 foreign key(source_id,room_id) references kxra.team_collaboration_records(id,room_id),
 check((state='EXECUTED')=(result is not null and executed_at is not null)),
 check(expires_at>created_at)
);
create index team_collaboration_actions_room on kxra.team_collaboration_actions(room_id,kind,created_at desc,id desc);
create index team_collaboration_actions_source on kxra.team_collaboration_actions(source_id,room_id);
alter table kxra.team_collaboration_records enable row level security;
alter table kxra.team_collaboration_actions enable row level security;
create policy collaboration_records_read on kxra.team_collaboration_records for select to authenticated using(kxra_private.can_team_room(room_id));
create policy collaboration_actions_read on kxra.team_collaboration_actions for select to authenticated using(kxra_private.can_team_room(room_id));
revoke all on kxra.team_collaboration_records,kxra.team_collaboration_actions from public,anon,authenticated;
grant select on kxra.team_collaboration_records to authenticated;
grant select(id,org_id,room_id,kind,source_id,source_version,source_snapshot,target_stage,note,state,version,requested_by,reviewed_by,reviewed_at,expires_at,result,executed_at,created_at) on kxra.team_collaboration_actions to authenticated;

create function kxra_private.collaboration_transition(k text,s text,t text) returns boolean
language sql immutable set search_path='' as $$
 select case when k='CREATOR' then
  (s='RESEARCH' and t in ('SHORTLIST','ARCHIVED')) or (s='SHORTLIST' and t in ('BRIEF_REVIEW','ARCHIVED'))
  or (s='BRIEF_REVIEW' and t in ('COLLABORATING','SHORTLIST','ARCHIVED'))
  or (s='COLLABORATING' and t in ('COMPLETE','ARCHIVED')) or (s='COMPLETE' and t='ARCHIVED')
 when k='SAMPLE' then
  (s='REQUESTED' and t in ('PREPARED','CANCELLED')) or (s='PREPARED' and t in ('DELIVERED','CANCELLED'))
  or (s='DELIVERED' and t='POST_REVIEW') or (s='POST_REVIEW' and t='COMPLETE') else false end
$$;
create function kxra_private.collaboration_snapshot(i uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('title',r.title,'body',r.body,'responsible',r.responsible,'next_step',r.next_step,'due_on',r.due_on,
  'stage',r.stage,'version',r.version,'creator_id',r.creator_id,'creator_title',c.title,'creator_version',c.version)
 from kxra.team_collaboration_records r left join kxra.team_collaboration_records c on c.id=r.creator_id and c.room_id=r.room_id where r.id=i
$$;
create function kxra_private.collaboration_hash(i uuid) returns text
language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(kxra_private.collaboration_snapshot(i)::text,'UTF8')),'hex')
$$;
revoke all on function kxra_private.collaboration_transition(text,text,text),kxra_private.collaboration_snapshot(uuid),kxra_private.collaboration_hash(uuid) from public,anon,authenticated;

create function kxra.team_collaboration_save(i uuid,r uuid,k text,expected integer,n text,b text,person text,step text,d date,creator uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare rec kxra.team_collaboration_records;o uuid;
begin
 if session_user<>'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 if k is null or k not in ('CREATOR','SAMPLE') or i is null or expected is null or expected<0 then raise exception 'Invalid record';end if;
 perform pg_advisory_xact_lock(hashtext(i::text));
 select * into rec from kxra.team_collaboration_records where id=i for update;
 if found then
  if rec.room_id<>r or rec.kind<>k or rec.creator_id is distinct from creator then raise insufficient_privilege;end if;
  if (rec.title,rec.body,rec.responsible,rec.next_step,rec.due_on) is not distinct from (trim(n),b,trim(person),trim(step),d)
   and ((expected=0 and rec.created_by=auth.uid()) or (rec.version=expected+1 and rec.updated_by=auth.uid())) then return i;end if;
  if rec.version<>expected or rec.stage in ('COMPLETE','ARCHIVED','CANCELLED') then raise exception 'Record changed';end if;
  update kxra.team_collaboration_records set title=trim(n),body=b,responsible=trim(person),next_step=trim(step),due_on=d,
   version=version+1,updated_by=auth.uid(),updated_at=now() where id=i;
 else
  if expected<>0 then raise exception 'Record unavailable';end if;
  if k='SAMPLE' then
   perform 1 from kxra.team_collaboration_records where id=creator and room_id=r and kind='CREATOR' and stage<>'ARCHIVED' for share;
   if not found then raise exception 'Creator unavailable';end if;
  end if;
  select org_id into o from kxra.team_rooms where id=r;
  insert into kxra.team_collaboration_records(id,org_id,room_id,kind,title,body,responsible,next_step,due_on,creator_id,stage,created_by,updated_by)
  values(i,o,r,k,trim(n),b,trim(person),trim(step),d,creator,case when k='CREATOR' then 'RESEARCH' else 'REQUESTED' end,auth.uid(),auth.uid());
 end if;return i;
end $$;
create function kxra.team_collaboration_propose(i uuid,r uuid,k text,source uuid,expected integer,target text,reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare rec kxra.team_collaboration_records;a kxra.team_collaboration_actions;
begin
 if session_user<>'kxra_app' or not kxra_private.can_team_room(r,true) then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock(hashtext(i::text));
 select * into a from kxra.team_collaboration_actions where id=i;
 if found then
  if a.room_id<>r or a.kind is distinct from k or a.requested_by<>auth.uid()
   or (a.source_id,a.source_version,a.target_stage,a.note) is distinct from (source,expected,target,trim(reason)) then raise exception 'Request conflict';end if;
  return i;
 end if;
 select * into rec from kxra.team_collaboration_records where id=source and room_id=r and kind=k for update;
 if not found or rec.version is distinct from expected or not kxra_private.collaboration_transition(k,rec.stage,target) then raise exception 'Record changed or transition unavailable';end if;
 if rec.creator_id is not null then
  perform 1 from kxra.team_collaboration_records where id=rec.creator_id and room_id=r and kind='CREATOR' and stage<>'ARCHIVED' for share;
  if not found then raise exception 'Creator unavailable';end if;
 end if;
 insert into kxra.team_collaboration_actions(id,org_id,room_id,kind,source_id,source_version,source_hash,source_snapshot,target_stage,note,requested_by)
 values(i,rec.org_id,r,k,source,expected,kxra_private.collaboration_hash(source),kxra_private.collaboration_snapshot(source),target,trim(reason),auth.uid());return i;
end $$;
create function kxra.team_collaboration_review(r uuid,k text,i uuid,expected integer,decision text) returns void
language plpgsql security definer set search_path='' as $$
declare a kxra.team_collaboration_actions;
begin
 if session_user<>'kxra_app' or not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 select * into a from kxra.team_collaboration_actions where id=i and room_id=r and kind=k for update;
 if not found then raise insufficient_privilege;end if;
 if a.version=expected+1 and a.state=decision and a.reviewed_by=auth.uid() then return;end if;
 if expected is null or a.version<>expected or decision is null or decision not in ('APPROVED','REJECTED','CANCELLED')
  or a.state not in ('PROPOSED','APPROVED') or (decision<>'CANCELLED' and a.state<>'PROPOSED') then raise exception 'Review changed';end if;
 if decision='APPROVED' and (a.expires_at<=now() or a.source_hash is distinct from kxra_private.collaboration_hash(a.source_id)) then raise exception 'Source changed';end if;
 update kxra.team_collaboration_actions set state=decision,version=version+1,reviewed_by=auth.uid(),reviewed_at=now() where id=i;
end $$;
create function kxra.team_collaboration_execute(r uuid,k text,i uuid,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a kxra.team_collaboration_actions;rec kxra.team_collaboration_records;receipt jsonb;
begin
 if session_user<>'kxra_app' or not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 select * into a from kxra.team_collaboration_actions where id=i and room_id=r and kind=k for update;
 if not found then raise insufficient_privilege;end if;
 if a.state='EXECUTED' then
  if expected is distinct from a.version-1 then raise exception 'Review changed';end if;
  return a.result||jsonb_build_object('replayed',true);
 end if;
 if a.version is distinct from expected or a.state<>'APPROVED' or a.expires_at<=now() then raise exception 'Approval unavailable';end if;
 select * into rec from kxra.team_collaboration_records where id=a.source_id and room_id=r and kind=k for update;
 if not found then raise insufficient_privilege;end if;
 if rec.creator_id is not null then
  perform 1 from kxra.team_collaboration_records where id=rec.creator_id and room_id=r and stage<>'ARCHIVED' for share;
  if not found then raise exception 'Creator unavailable';end if;
 end if;
 if rec.version<>a.source_version or a.source_hash is distinct from kxra_private.collaboration_hash(rec.id)
  or not kxra_private.collaboration_transition(k,rec.stage,a.target_stage) then raise exception 'Source changed';end if;
 update kxra.team_collaboration_records set stage=a.target_stage,version=version+1,updated_by=auth.uid(),updated_at=now() where id=rec.id;
 receipt=jsonb_build_object('record_id',rec.id,'version',rec.version+1,'stage',a.target_stage,'action_id',i,'replayed',false);
 update kxra.team_collaboration_actions set state='EXECUTED',version=version+1,result=receipt,executed_at=now() where id=i;
 return receipt;
end $$;
create function kxra_private.guard_collaboration() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='team_collaboration_records' then
  if (new.id,new.org_id,new.room_id,new.kind,new.creator_id,new.created_by,new.created_at) is distinct from
   (old.id,old.org_id,old.room_id,old.kind,old.creator_id,old.created_by,old.created_at) then raise exception 'Record identity immutable';end if;
 else
  if old.state='EXECUTED' or (new.id,new.org_id,new.room_id,new.kind,new.source_id,new.source_version,new.source_hash,new.source_snapshot,new.target_stage,new.note,new.requested_by,new.expires_at,new.created_at)
   is distinct from (old.id,old.org_id,old.room_id,old.kind,old.source_id,old.source_version,old.source_hash,old.source_snapshot,old.target_stage,old.note,old.requested_by,old.expires_at,old.created_at) then raise exception 'Review payload immutable';end if;
 end if;return new;
end $$;
revoke all on function kxra_private.guard_collaboration() from public,anon,authenticated;
create trigger collaboration_record_identity before update on kxra.team_collaboration_records for each row execute function kxra_private.guard_collaboration();
create trigger collaboration_action_identity before update on kxra.team_collaboration_actions for each row execute function kxra_private.guard_collaboration();
create trigger pilot_collaboration_record before insert or update on kxra.team_collaboration_records for each row execute function kxra_private.guard_pilot_work();
create trigger pilot_collaboration_action before insert on kxra.team_collaboration_actions for each row execute function kxra_private.guard_pilot_work();
create trigger collaboration_record_audit after insert or update on kxra.team_collaboration_records for each row execute function kxra_private.audit_team_change();
create trigger collaboration_action_audit after insert or update on kxra.team_collaboration_actions for each row execute function kxra_private.audit_team_change();
revoke all on function kxra.team_collaboration_save(uuid,uuid,text,integer,text,text,text,text,date,uuid),kxra.team_collaboration_propose(uuid,uuid,text,uuid,integer,text,text),kxra.team_collaboration_review(uuid,text,uuid,integer,text),kxra.team_collaboration_execute(uuid,text,uuid,integer) from public,anon;
grant execute on function kxra.team_collaboration_save(uuid,uuid,text,integer,text,text,text,text,date,uuid),kxra.team_collaboration_propose(uuid,uuid,text,uuid,integer,text,text),kxra.team_collaboration_review(uuid,text,uuid,integer,text),kxra.team_collaboration_execute(uuid,text,uuid,integer) to authenticated;
