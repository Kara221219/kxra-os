-- Local manual draft handoff only. No device identity, transport or tool execution.
create table kxra.team_bridge_requests(
 id uuid primary key,org_id uuid not null,room_id uuid not null,
 requested_by uuid not null references kxra.account_identities(account_id),
 request_session_version integer not null check(request_session_version>0),
 objective text not null check(length(trim(objective)) between 1 and 2000),
 packet_text text not null check(octet_length(packet_text)<=50000),
 packet_sha256 text not null check(packet_sha256~'^[a-f0-9]{64}$'),
 state text not null default 'PROPOSED' check(state in ('PROPOSED','APPROVED','EXPORTED','RESULT_PROPOSED','ACCEPTED','REJECTED','CANCELLED')),
 version integer not null default 1 check(version>0),
 export_count integer not null default 0 check(export_count between 0 and 1),
 export_receipt jsonb,result_text text check(length(result_text) between 1 and 12000 and octet_length(result_text)<=24000),
 reviewed_by uuid references kxra.account_identities(account_id),reviewed_at timestamptz,
 expires_at timestamptz not null,created_at timestamptz not null default now(),
 foreign key(room_id,org_id) references kxra.team_rooms(id,org_id),
 check(expires_at>created_at),check((export_count=1)=(export_receipt is not null)),
 check(state not in ('RESULT_PROPOSED','ACCEPTED') or result_text is not null)
);
create index team_bridge_room on kxra.team_bridge_requests(room_id,created_at desc,id desc);
alter table kxra.team_bridge_requests enable row level security;
create policy bridge_read on kxra.team_bridge_requests for select to authenticated using(requested_by=auth.uid() and org_id=kxra_private.member_org() and kxra_private.can_team_room(room_id));
revoke all on kxra.team_bridge_requests from public,anon,authenticated;
grant select(id,org_id,room_id,requested_by,objective,state,version,export_count,expires_at,created_at) on kxra.team_bridge_requests to authenticated;

create function kxra_private.bridge_actor(r uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare sv integer;room kxra.team_rooms;
begin
 if session_user<>'kxra_app' or (current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' and current_setting('request.kxra.local_self_service',true) is distinct from 'on') then raise insufficient_privilege;end if;
 select * into room from kxra.team_rooms where id=r for share;
 if not found then raise insufficient_privilege;end if;
 select session_version into sv from kxra.account_identities where account_id=auth.uid() and state='ACTIVE' for share;
 if sv is null or sv is distinct from (auth.jwt()->>'session_version')::integer then raise insufficient_privilege;end if;
 perform 1 from kxra.organisation_memberships where account_id=auth.uid() and org_id=room.org_id for share;
 perform 1 from kxra.project_memberships where user_id=auth.uid() and project_id=room.project_id for share;
 perform 1 from kxra.team_room_members where account_id=auth.uid() and room_id=r for share;
 if not kxra_private.manages_team_room(r) then raise insufficient_privilege;end if;
 return sv;
end $$;
create function kxra_private.bridge_sources(r uuid,p jsonb) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'org_id',room.org_id,'room_id',m.room_id,'body',m.body) order by s.n),'[]'::jsonb)
 from jsonb_array_elements(p->'sources') with ordinality s(value,n)
 join kxra.team_messages m on m.id=(s.value->>'id')::uuid and m.room_id=r
 join kxra.team_rooms room on room.id=m.room_id
$$;
create function kxra_private.bridge_current(i uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare a kxra.team_bridge_requests;sv integer;p jsonb;
begin
 select * into a from kxra.team_bridge_requests where id=i;
 if not found or a.requested_by<>auth.uid() or a.org_id<>kxra_private.member_org() then raise insufficient_privilege;end if;
 sv=kxra_private.bridge_actor(a.room_id);
 if sv<>a.request_session_version then raise insufficient_privilege;end if;
 p=a.packet_text::jsonb;
 perform 1 from kxra.team_messages where room_id=a.room_id and id in(select (x->>'id')::uuid from jsonb_array_elements(p->'sources') x) for share;
 return p->'sources'=kxra_private.bridge_sources(a.room_id,p);
end $$;
create function kxra_private.bridge_paid(o uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtext('pilot:'||o::text));
 if not kxra_private.pilot_entitled(o) then raise exception 'Pilot work admission unavailable';end if;
end $$;
revoke all on function kxra_private.bridge_actor(uuid),kxra_private.bridge_sources(uuid,jsonb),kxra_private.bridge_current(uuid),kxra_private.bridge_paid(uuid) from public,anon,authenticated;

create function kxra.team_bridge_scope(r uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare sv integer;room kxra.team_rooms;
begin
 sv=kxra_private.bridge_actor(r);select * into room from kxra.team_rooms where id=r;
 perform kxra_private.bridge_paid(room.org_id);
 return jsonb_build_object('actor_id',auth.uid(),'org_id',room.org_id,'room_id',r,'room_creator_id',room.created_by,
  'session_version',sv,'active',true,'can_read',true,'can_write',true,'entitled',true);
end $$;
revoke all on function kxra.team_bridge_scope(uuid) from public,anon;
grant execute on function kxra.team_bridge_scope(uuid) to authenticated;

create function kxra.team_bridge_create(i uuid,r uuid,raw_packet text) returns uuid
language plpgsql security definer set search_path='' as $$
declare p jsonb;room kxra.team_rooms;a kxra.team_bridge_requests;sv integer;stamp bigint;expected jsonb;
begin
 sv=kxra_private.bridge_actor(r);
 select * into room from kxra.team_rooms where id=r;
 perform pg_advisory_xact_lock(hashtext(i::text));
 select * into a from kxra.team_bridge_requests where id=i for update;
 if found then
  if a.room_id<>r or a.requested_by<>auth.uid() or a.request_session_version<>sv then raise insufficient_privilege;end if;
  -- A retry rebuilds its clock, but the immutable objective/source selection must match.
  p=raw_packet::jsonb;
  if (a.packet_text::jsonb-array['created_at','expires_at']) is distinct from (p-array['created_at','expires_at']) then raise exception 'Bridge request conflict';end if;
  return i;
 end if;
 perform kxra_private.bridge_paid(room.org_id);
 if raw_packet is null or octet_length(raw_packet)>50000 then raise exception 'Invalid packet';end if;
 p=raw_packet::jsonb;stamp=(p->>'created_at')::bigint;
 if jsonb_typeof(p)<>'object' or i is null or p->>'objective' is null or length(trim(p->>'objective')) not between 1 and 2000
  or jsonb_typeof(p->'sources')<>'array' or jsonb_array_length(p->'sources') not between 1 and 10
  or octet_length((p->'sources')::text)>24000
  or (select count(distinct x->>'id') from jsonb_array_elements(p->'sources') x)<>jsonb_array_length(p->'sources')
  or stamp is null or abs(stamp-floor(extract(epoch from clock_timestamp())*1000)::bigint)>30000 then raise exception 'Invalid packet';end if;
 perform 1 from kxra.team_messages where room_id=r and id in(select (x->>'id')::uuid from jsonb_array_elements(p->'sources') x) for share;
 expected=jsonb_build_object('protocol','kxra-native-draft/v1','request_id',i,'adapter','MANUAL_DRAFT','actor_id',auth.uid(),
  'org_id',room.org_id,'room_id',r,'session_version',sv,'objective',trim(p->>'objective'),'created_at',stamp,'expires_at',stamp+600000,
  'connection_status','UNCONNECTED','output_mode','DRAFT_TEXT_ONLY','source_trust','UNTRUSTED_QUOTED_DATA','execution_permitted',false,
  'sources',kxra_private.bridge_sources(r,p));
 if p is distinct from expected or jsonb_array_length(expected->'sources')<>jsonb_array_length(p->'sources') then raise exception 'Packet source or scope mismatch';end if;
 insert into kxra.team_bridge_requests(id,org_id,room_id,requested_by,request_session_version,objective,packet_text,packet_sha256,expires_at)
 values(i,room.org_id,r,auth.uid(),sv,trim(p->>'objective'),raw_packet,encode(sha256(convert_to(raw_packet,'UTF8')),'hex'),to_timestamp((stamp+600000)/1000.0));
 return i;
end $$;
create function kxra.team_bridge_view(r uuid,i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a kxra.team_bridge_requests;
begin
 perform kxra_private.bridge_actor(r);
 select * into a from kxra.team_bridge_requests where id=i and room_id=r and requested_by=auth.uid();
 if not found then raise insufficient_privilege;end if;
 if not kxra_private.bridge_current(i) then raise exception 'Bridge source changed';end if;
 if a.expires_at<=clock_timestamp() and a.state<>'ACCEPTED' then raise exception 'Bridge expired';end if;
 return jsonb_build_object('packet',a.packet_text::jsonb,'packet_sha256',a.packet_sha256,'result_text',a.result_text,'provenance','MANUAL_UNVERIFIED','execution_permitted',false);
end $$;
create function kxra.team_bridge_decide(r uuid,i uuid,expected integer,decision text) returns void
language plpgsql security definer set search_path='' as $$
declare a kxra.team_bridge_requests;
begin
 perform kxra_private.bridge_actor(r);
 select * into a from kxra.team_bridge_requests where id=i and room_id=r and requested_by=auth.uid() for update;
 if not found then raise insufficient_privilege;end if;
 if a.version=expected+1 and a.state=decision then return;end if;
 if expected is null or a.version<>expected or decision is null or decision not in ('APPROVED','ACCEPTED','REJECTED','CANCELLED')
  or a.state in ('ACCEPTED','REJECTED','CANCELLED') then raise exception 'Bridge review changed';end if;
 if decision='APPROVED' and a.state<>'PROPOSED' or decision='ACCEPTED' and a.state<>'RESULT_PROPOSED' then raise exception 'Bridge review unavailable';end if;
 if decision in ('APPROVED','ACCEPTED') then
  if a.expires_at<=clock_timestamp() or not kxra_private.bridge_current(i) then raise exception 'Bridge expired or source changed';end if;
  perform kxra_private.bridge_paid(a.org_id);
 end if;
 update kxra.team_bridge_requests set state=decision,version=version+1,reviewed_by=auth.uid(),reviewed_at=now() where id=i;
end $$;
create function kxra.team_bridge_export(r uuid,i uuid,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a kxra.team_bridge_requests;receipt jsonb;
begin
 perform kxra_private.bridge_actor(r);
 select * into a from kxra.team_bridge_requests where id=i and room_id=r and requested_by=auth.uid() for update;
 if not found then raise insufficient_privilege;end if;
 if a.expires_at<=clock_timestamp() or not kxra_private.bridge_current(i) then raise exception 'Bridge expired or source changed';end if;
 perform kxra_private.bridge_paid(a.org_id);
 if a.export_count=1 and expected=2 and a.state not in ('CANCELLED','REJECTED') then return a.export_receipt||jsonb_build_object('replayed',true);end if;
 if expected is distinct from 2 or a.version<>expected or a.state<>'APPROVED' then raise exception 'Bridge approval unavailable';end if;
 receipt=jsonb_build_object('request_id',i,'packet_sha256',a.packet_sha256,'packet',a.packet_text::jsonb,'replayed',false,'execution_permitted',false);
 update kxra.team_bridge_requests set state='EXPORTED',version=version+1,export_count=1,export_receipt=receipt where id=i;
 return receipt;
end $$;
create function kxra.team_bridge_result(r uuid,i uuid,expected integer,p_hash text,body text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a kxra.team_bridge_requests;
begin
 perform kxra_private.bridge_actor(r);
 select * into a from kxra.team_bridge_requests where id=i and room_id=r and requested_by=auth.uid() for update;
 if not found then raise insufficient_privilege;end if;
 if a.expires_at<=clock_timestamp() or not kxra_private.bridge_current(i) then raise exception 'Bridge expired or source changed';end if;
 if p_hash is distinct from a.packet_sha256 or body is null or length(trim(body)) not between 1 and 12000 or octet_length(trim(body))>24000 then raise exception 'Invalid bound draft';end if;
 if expected=3 and a.state in ('RESULT_PROPOSED','ACCEPTED') and a.result_text=trim(body) then return jsonb_build_object('request_id',i,'replayed',true,'provenance','MANUAL_UNVERIFIED');end if;
 if expected is distinct from 3 or a.version<>expected or a.state<>'EXPORTED' then raise exception 'Bridge handoff unavailable';end if;
 perform kxra_private.bridge_paid(a.org_id);
 update kxra.team_bridge_requests set state='RESULT_PROPOSED',version=version+1,result_text=trim(body) where id=i;
 return jsonb_build_object('request_id',i,'replayed',false,'provenance','MANUAL_UNVERIFIED');
end $$;
create function kxra_private.guard_bridge_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.org_id,new.room_id,new.requested_by,new.request_session_version,new.objective,new.packet_text,new.packet_sha256,new.expires_at,new.created_at)
 is distinct from (old.id,old.org_id,old.room_id,old.requested_by,old.request_session_version,old.objective,old.packet_text,old.packet_sha256,old.expires_at,old.created_at)
 or old.state in ('ACCEPTED','REJECTED','CANCELLED') or (old.export_count=1 and (new.export_count<>1 or new.export_receipt is distinct from old.export_receipt))
 or (old.result_text is not null and new.result_text is distinct from old.result_text) then raise exception 'Bridge identity or receipt immutable';end if;
 return new;
end $$;
revoke all on function kxra_private.guard_bridge_identity() from public,anon,authenticated;
create trigger bridge_identity before update on kxra.team_bridge_requests for each row execute function kxra_private.guard_bridge_identity();
create trigger bridge_audit after insert or update on kxra.team_bridge_requests for each row execute function kxra_private.audit_team_change();
revoke all on function kxra.team_bridge_create(uuid,uuid,text),kxra.team_bridge_view(uuid,uuid),kxra.team_bridge_decide(uuid,uuid,integer,text),kxra.team_bridge_export(uuid,uuid,integer),kxra.team_bridge_result(uuid,uuid,integer,text,text) from public,anon;
grant execute on function kxra.team_bridge_create(uuid,uuid,text),kxra.team_bridge_view(uuid,uuid),kxra.team_bridge_decide(uuid,uuid,integer,text),kxra.team_bridge_export(uuid,uuid,integer),kxra.team_bridge_result(uuid,uuid,integer,text,text) to authenticated;
