-- Separate failure/restore domain only. Requires separately provisioned NOINHERIT runtime/operator roles.
-- No realm or enabled activation is seeded. Never install in the application database.
begin;
create schema kxra_github_fence;
revoke all on schema kxra_github_fence from public;
create table kxra_github_fence.realms(id uuid primary key,epoch bigint not null check(epoch between 1 and 9007199254740991),phase text not null default 'HOLD' check(phase in('ACTIVE','HOLD')),session_id uuid not null,hold_until timestamptz not null,session_expires timestamptz not null,scope_sha256 text not null check(scope_sha256~'^[a-f0-9]{64}$'));
create table kxra_github_fence.writes(realm uuid not null references kxra_github_fence.realms,write_id uuid not null,epoch bigint not null,reservation_id uuid not null unique,subject jsonb not null,state text not null check(state in('RESERVED','BURNED')),created_at timestamptz not null default clock_timestamp(),burned_at timestamptz,primary key(realm,write_id),check((state='BURNED')=(burned_at is not null)));
create index fence_write_epoch on kxra_github_fence.writes(realm,epoch,write_id);
create table kxra_github_fence.observations(realm uuid not null,session_id uuid not null,write_id uuid not null,classification text not null check(classification in('ACCEPTED','NOT_SENT','QUARANTINED')),evidence jsonb not null,evidence_sha256 text not null,observed_at timestamptz not null default clock_timestamp(),primary key(realm,session_id,write_id),foreign key(realm,write_id) references kxra_github_fence.writes);
create table kxra_github_fence.events(id bigint generated always as identity primary key,realm uuid not null references kxra_github_fence.realms,epoch bigint not null,session_id uuid not null,action text not null check(action in('HOLD','RESUME')),review_sha256 text not null,authority_sha256 text not null,created_at timestamptz not null default clock_timestamp(),unique(realm,session_id,action));
create function kxra_github_fence.immutable() returns trigger language plpgsql set search_path='' as $$begin
 if tg_table_name='writes' and tg_op='UPDATE' then if old.state='RESERVED' and new.state='BURNED' and new.burned_at is not null and (to_jsonb(new)-'state'-'burned_at')=(to_jsonb(old)-'state'-'burned_at') then return new;end if;end if;
 raise exception 'External fence history is immutable';end $$;
create trigger immutable before update or delete on kxra_github_fence.writes for each row execute function kxra_github_fence.immutable();
create trigger immutable before update or delete on kxra_github_fence.observations for each row execute function kxra_github_fence.immutable();
create trigger immutable before update or delete on kxra_github_fence.events for each row execute function kxra_github_fence.immutable();
create function kxra_github_fence.ack(w kxra_github_fence.writes) returns jsonb language sql immutable set search_path='' as $$select jsonb_build_object('realm',w.realm,'epoch',w.epoch,'reservation_id',w.reservation_id,'write_id',w.write_id,'attempt_id',w.subject->>'attempt_id','binding_sha256',w.subject->>'binding_sha256','operation_sha256',w.subject->>'operation_sha256')$$;
create function kxra_github_fence.runtime(r uuid,e bigint,action text,v jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare realm_row kxra_github_fence.realms;w kxra_github_fence.writes;s jsonb;k text;
begin
 if session_user<>'kxra_gh_fence' or action is null or action not in('RESERVE','SEND') or v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>3000 or (select count(*) from jsonb_object_keys(v))<>(case when action='SEND' then 2 else 1 end) or(v-'subject'-case when action='SEND' then 'reservation_id' else '' end)<>'{}'::jsonb then raise insufficient_privilege;end if;
 select * into realm_row from kxra_github_fence.realms where id=r for update;
 if not found or realm_row.phase<>'ACTIVE' or realm_row.epoch is distinct from e then raise insufficient_privilege;end if;
 s=v->'subject';
 if jsonb_typeof(s) is distinct from 'object' or (select count(*) from jsonb_object_keys(s))<>11 or (s-array['org_id','user_id','connection_id','write_id','attempt_id','binding_sha256','operation_sha256','body_sha256','repository_id','issue_id','author_id'])<>'{}'::jsonb then raise exception 'Invalid fence subject';end if;
 foreach k in array array['org_id','user_id','connection_id','write_id','attempt_id'] loop if jsonb_typeof(s->k)<>'string' or s->>k is distinct from (s->>k)::uuid::text then raise exception 'Invalid identity';end if;end loop;
 foreach k in array array['binding_sha256','operation_sha256','body_sha256'] loop if jsonb_typeof(s->k)<>'string' or coalesce(s->>k,'')!~'^[a-f0-9]{64}$' then raise exception 'Invalid digest';end if;end loop;
 foreach k in array array['repository_id','issue_id','author_id'] loop if jsonb_typeof(s->k)<>'number' or coalesce(s->>k,'')!~'^[1-9][0-9]{0,15}$' or(s->>k)::numeric>9007199254740991 then raise exception 'Invalid target';end if;end loop;
 if action='RESERVE' then
  insert into kxra_github_fence.writes(realm,write_id,epoch,reservation_id,subject,state) values(r,(s->>'write_id')::uuid,e,gen_random_uuid(),s,'RESERVED') on conflict do nothing returning * into w;
  if not found then raise exception 'Stable write already reserved' using errcode='42501';end if;
 else
  select * into w from kxra_github_fence.writes where realm=r and write_id=(s->>'write_id')::uuid for update;
  if not found or w.state<>'RESERVED' or w.epoch<>e or w.subject is distinct from s or w.reservation_id is distinct from(v->>'reservation_id')::uuid then raise insufficient_privilege;end if;
  update kxra_github_fence.writes set state='BURNED',burned_at=clock_timestamp() where realm=r and write_id=w.write_id returning * into w;
 end if;
 return kxra_github_fence.ack(w);
end $$;
create function kxra_github_fence.reconcile(r uuid,action text,v jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c kxra_github_fence.realms;w kxra_github_fence.writes;o kxra_github_fence.observations;e jsonb;classification text;digest text;rows jsonb;after_id uuid;session uuid;
begin
 if session_user<>'kxra_gh_reconcile' or action is null or action not in('HOLD','LIST','OBSERVE','RESUME') or v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>2000 then raise insufficient_privilege;end if;
 select * into c from kxra_github_fence.realms where id=r for update;if not found then raise insufficient_privilege;end if;
 if action='HOLD' then
  if (v-array['session_id','review_sha256','authority_sha256'])<>'{}'::jsonb or (select count(*) from jsonb_object_keys(v))<>3 or coalesce(v->>'review_sha256','')!~'^[a-f0-9]{64}$' or coalesce(v->>'authority_sha256','')!~'^[a-f0-9]{64}$' then raise exception 'Explicit restore review required';end if;
  session=(v->>'session_id')::uuid;
  if c.session_id=session then if not exists(select 1 from kxra_github_fence.events x where x.realm=r and x.session_id=session and x.action='HOLD' and x.review_sha256=v->>'review_sha256' and x.authority_sha256=v->>'authority_sha256') then raise exception 'Conflicting restore session';end if;
  else
   if exists(select 1 from kxra_github_fence.events x where x.realm=r and x.session_id=session) then raise exception 'Old restore session';end if;
   update kxra_github_fence.realms set epoch=epoch+1,phase='HOLD',session_id=session,hold_until=clock_timestamp()+interval '3 seconds',session_expires=clock_timestamp()+interval '10 minutes' where id=r returning * into c;
   insert into kxra_github_fence.events(realm,epoch,session_id,action,review_sha256,authority_sha256)values(r,c.epoch,session,'HOLD',v->>'review_sha256',v->>'authority_sha256');
  end if;
  return jsonb_build_object('phase',c.phase,'epoch',c.epoch,'session_id',c.session_id,'hold_until',c.hold_until);
 end if;
 if action='LIST' then
  if(v-'after')<>'{}'::jsonb then raise exception 'Invalid cursor';end if;after_id=nullif(v->>'after','')::uuid;
  select coalesce(jsonb_agg(jsonb_build_object('write_id',x.write_id,'state',x.state,'subject',x.subject,'reservation_id',x.reservation_id,'classification',obs.classification) order by x.write_id),'[]'::jsonb) into rows from(select * from kxra_github_fence.writes where realm=r and(after_id is null or write_id>after_id) order by write_id limit 100)x left join kxra_github_fence.observations obs on obs.realm=x.realm and obs.write_id=x.write_id and obs.session_id=c.session_id;
  return jsonb_build_object('phase',c.phase,'epoch',c.epoch,'session_id',c.session_id,'items',rows,'pending',(select count(*) from kxra_github_fence.writes x where x.realm=r and not exists(select 1 from kxra_github_fence.observations y where y.realm=r and y.session_id=c.session_id and y.write_id=x.write_id)));
 end if;
 if c.phase<>'HOLD' or c.session_id is distinct from(v->>'session_id')::uuid or c.epoch is distinct from(v->>'epoch')::bigint or c.session_expires<=clock_timestamp() then raise insufficient_privilege;end if;
 if action='OBSERVE' then
  if(v-array['session_id','epoch','write_id','classification','evidence'])<>'{}'::jsonb or (select count(*) from jsonb_object_keys(v))<>5 then raise exception 'Invalid observation';end if;
  select * into w from kxra_github_fence.writes where realm=r and write_id=(v->>'write_id')::uuid;if not found then raise insufficient_privilege;end if;
  classification=v->>'classification';e=v->'evidence';
  if classification='ACCEPTED' then
   if jsonb_typeof(e) is distinct from 'object' or (select count(*) from jsonb_object_keys(e))<>5 or(e-array['status','comment_id','body_sha256','author_id','issue_id'])<>'{}'::jsonb or e->>'status'<>'200' or jsonb_typeof(e->'status')<>'number' or jsonb_typeof(e->'author_id')<>'number' or jsonb_typeof(e->'issue_id')<>'number' or jsonb_typeof(e->'body_sha256')<>'string' or jsonb_typeof(e->'comment_id')<>'number' or coalesce(e->>'comment_id','')!~'^[1-9][0-9]{0,15}$' or(e->>'comment_id')::numeric>9007199254740991 or e->>'body_sha256' is distinct from w.subject->>'body_sha256' or e->>'author_id' is distinct from w.subject->>'author_id' or e->>'issue_id' is distinct from w.subject->>'issue_id' then raise exception 'Matching independent observation required';end if;
  elsif classification='NOT_SENT' then if w.state<>'RESERVED' or e is distinct from '{"reason":"EXTERNAL_SEND_NEVER_CONSUMED"}'::jsonb then raise exception 'Nonexecution not established';end if;
  elsif classification='QUARANTINED' then if e is distinct from '{"reason":"OUTCOME_UNCONFIRMED_NO_REPLAY"}'::jsonb then raise exception 'Uncertainty must remain explicit';end if;
  else raise exception 'Invalid classification';end if;
  digest=encode(sha256(convert_to(e::text,'UTF8')),'hex');select * into o from kxra_github_fence.observations where realm=r and session_id=c.session_id and write_id=w.write_id;
  if found then if o.classification is distinct from classification or o.evidence_sha256<>digest then raise exception 'Conflicting observation';end if;else insert into kxra_github_fence.observations values(r,c.session_id,w.write_id,classification,e,digest,clock_timestamp());end if;
  return jsonb_build_object('recorded',true,'classification',classification,'dispatch_authority',false);
 end if;
 if(v-array['session_id','epoch','review_sha256','authority_sha256'])<>'{}'::jsonb or (select count(*) from jsonb_object_keys(v))<>4 or coalesce(v->>'review_sha256','')!~'^[a-f0-9]{64}$' or coalesce(v->>'authority_sha256','')!~'^[a-f0-9]{64}$' or c.hold_until>clock_timestamp() or exists(select 1 from kxra_github_fence.writes x where x.realm=r and not exists(select 1 from kxra_github_fence.observations y where y.realm=r and y.session_id=c.session_id and y.write_id=x.write_id)) then raise exception 'Restore reconciliation incomplete';end if;
 update kxra_github_fence.realms set phase='ACTIVE' where id=r;
 insert into kxra_github_fence.events(realm,epoch,session_id,action,review_sha256,authority_sha256)values(r,c.epoch,c.session_id,'RESUME',v->>'review_sha256',v->>'authority_sha256');
 return jsonb_build_object('phase','ACTIVE','epoch',c.epoch,'session_id',c.session_id);
end $$;
alter table kxra_github_fence.realms enable row level security;alter table kxra_github_fence.writes enable row level security;alter table kxra_github_fence.observations enable row level security;alter table kxra_github_fence.events enable row level security;
revoke all on all tables in schema kxra_github_fence from public,kxra_gh_fence,kxra_gh_reconcile;
revoke all on all sequences in schema kxra_github_fence from public,kxra_gh_fence,kxra_gh_reconcile;
revoke all on all functions in schema kxra_github_fence from public,kxra_gh_fence,kxra_gh_reconcile;
grant usage on schema kxra_github_fence to kxra_gh_fence,kxra_gh_reconcile;
grant execute on function kxra_github_fence.runtime(uuid,bigint,text,jsonb) to kxra_gh_fence;
grant execute on function kxra_github_fence.reconcile(uuid,text,jsonb) to kxra_gh_reconcile;
commit;
