-- Local production-contract candidate. Explicit installation after baseline119;
-- release owner assigns any promoted migration. No policy/evidence is seeded.
begin;
create table kxra_private.ai_connection_intents(
 id uuid primary key,org_id uuid not null references kxra.organisations,actor_id uuid not null,
 session_version integer not null,provider text not null check(provider in('OPENAI','ANTHROPIC','GOOGLE','OPENROUTER','COMPATIBLE')),
 model text not null check(length(model) between 1 and 160),endpoint_id text not null check(length(endpoint_id)<=80),
 endpoint_sha256 text not null check(endpoint_sha256~'^[a-f0-9]{64}$'),fingerprint text not null check(fingerprint~'^[a-f0-9]{64}$'),
 business_review_id uuid references kxra_private.business_eligibility_reviews,
 created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null default clock_timestamp()+interval '24 hours'
);
create table kxra_private.ai_connection_reviews(
 id uuid primary key default gen_random_uuid(),sequence bigint generated always as identity unique,
 intent_id uuid not null references kxra_private.ai_connection_intents,
 state text not null check(state in('ELIGIBLE','BLOCKED','REVIEW_REQUIRED')),
 account_mode text not null check(account_mode in('CUSTOMER_BILLED','GOOGLE_PAID','UNKNOWN')),
 account_reference_sha256 text not null check(account_reference_sha256~'^[a-f0-9]{64}$'),
 provider_evidence_sha256 text not null check(provider_evidence_sha256~'^[a-f0-9]{64}$'),
 reviewer_reference text not null check(length(reviewer_reference) between 1 and 160),
 reviewed_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,
 withdrawn_at timestamptz,check(expires_at>reviewed_at)
);
create table kxra_private.ai_connection_bindings(
 connection_id uuid primary key references kxra.team_connections,
 review_id uuid not null references kxra_private.ai_connection_reviews,
 credential_sha256 text not null check(credential_sha256~'^[a-f0-9]{64}$')
);
create table kxra_private.ai_run_admissions(
 run_id uuid primary key references kxra.team_runs,connection_id uuid not null references kxra.team_connections,
 review_id uuid references kxra_private.ai_connection_reviews,
 connection_sha256 text not null check(connection_sha256~'^[a-f0-9]{64}$')
);
create function kxra_private.ai_evidence_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='ai_connection_reviews' and tg_op='UPDATE' and old.withdrawn_at is null and new.withdrawn_at is not null and (to_jsonb(new)-'withdrawn_at')=(to_jsonb(old)-'withdrawn_at') then return new;end if;
 raise exception 'AI admission evidence is immutable';
end $$;
create trigger ai_intent_immutable before update or delete on kxra_private.ai_connection_intents for each row execute function kxra_private.ai_evidence_guard();
create trigger ai_review_immutable before update or delete on kxra_private.ai_connection_reviews for each row execute function kxra_private.ai_evidence_guard();
create trigger ai_binding_immutable before update or delete on kxra_private.ai_connection_bindings for each row execute function kxra_private.ai_evidence_guard();
create trigger ai_run_immutable before update or delete on kxra_private.ai_run_admissions for each row execute function kxra_private.ai_evidence_guard();
alter table kxra_private.ai_connection_intents enable row level security;
alter table kxra_private.ai_connection_reviews enable row level security;
alter table kxra_private.ai_connection_bindings enable row level security;
alter table kxra_private.ai_run_admissions enable row level security;
revoke all on kxra_private.ai_connection_intents,kxra_private.ai_connection_reviews,kxra_private.ai_connection_bindings,kxra_private.ai_run_admissions from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker;
revoke all on sequence kxra_private.ai_connection_reviews_sequence_seq from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker;
create function kxra_private.ai_business_review(o uuid) returns uuid language sql security definer set search_path='' as $$
 select kxra_private.business_current_review(o,b.customer_id,b.scope_id,b.offer_key,b.mapping_revision,m.terms_review_sha256)
 from kxra_private.live_billing_bindings b join kxra_private.live_billing_mappings m on m.scope_id=b.scope_id and m.offer_key=b.offer_key and m.revision=b.mapping_revision where b.org_id=o
$$;
create function kxra_private.ai_intent_review(i uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare t kxra_private.ai_connection_intents;r kxra_private.ai_connection_reviews;d kxra_private.business_declarations;b kxra_private.business_eligibility_reviews;
begin
 select * into t from kxra_private.ai_connection_intents where id=i;
 if not found or t.business_review_id is null or t.business_review_id is distinct from kxra_private.ai_business_review(t.org_id) then return null;end if;
 select * into b from kxra_private.business_eligibility_reviews where id=t.business_review_id;
 select * into d from kxra_private.business_declarations where id=b.declaration_id;
 if upper(trim(d.provider)) is distinct from t.provider then return null;end if;
 if not exists(select 1 from kxra.account_identities a join kxra.organisation_memberships m on m.account_id=a.account_id and m.org_id=t.org_id where a.account_id=t.actor_id and a.state='ACTIVE' and a.session_version=t.session_version and m.state='ACTIVE' and m.revoked_at is null and m.starts_at<=clock_timestamp() and (m.expires_at is null or m.expires_at>clock_timestamp())) then return null;end if;
 select * into r from kxra_private.ai_connection_reviews where intent_id=i order by sequence desc limit 1;
 if not found or r.state<>'ELIGIBLE' or r.withdrawn_at is not null or r.reviewed_at>clock_timestamp() or r.expires_at<=clock_timestamp() or (t.provider='GOOGLE' and r.account_mode<>'GOOGLE_PAID') or (t.provider<>'GOOGLE' and r.account_mode<>'CUSTOMER_BILLED') then return null;end if;
 return r.id;
end $$;
create function kxra.ai_connection_admission(i uuid,p text,m text,e text,f text,h text) returns jsonb language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();t kxra_private.ai_connection_intents;sv integer;current_id uuid;
begin
 if session_user<>'kxra_app' or o is null or not coalesce(kxra_private.mfa_owner(o),false) then raise insufficient_privilege;end if;
 select session_version into sv from kxra.account_identities where account_id=auth.uid() and state='ACTIVE';
 if sv is null or sv is distinct from (auth.jwt()->>'session_version')::integer then raise insufficient_privilege;end if;
 if i is null or p not in('OPENAI','ANTHROPIC','GOOGLE','OPENROUTER','COMPATIBLE') or m is null or length(m) not between 1 and 160 or e is null or length(e)>80 or coalesce(f,'')!~'^[a-f0-9]{64}$' or coalesce(h,'')!~'^[a-f0-9]{64}$' then raise exception 'Invalid AI admission';end if;
 insert into kxra_private.ai_connection_intents(id,org_id,actor_id,session_version,provider,model,endpoint_id,fingerprint,endpoint_sha256,business_review_id) values(i,o,auth.uid(),sv,p,m,e,f,h,kxra_private.ai_business_review(o)) on conflict(id) do nothing;
 select * into t from kxra_private.ai_connection_intents where id=i;
 if (t.org_id,t.actor_id,t.session_version,t.provider,t.model,t.endpoint_id,t.fingerprint,t.endpoint_sha256) is distinct from (o,auth.uid(),sv,p,m,e,f,h) then raise insufficient_privilege;end if;
 current_id=kxra_private.ai_intent_review(i);
 return jsonb_build_object('connection_id',i,'state',case when current_id is not null and t.expires_at>clock_timestamp() then 'ELIGIBLE' else 'REVIEW_REQUIRED' end);
end $$;
alter function kxra.team_connection_save(uuid,text,text,text,text,text) rename to ai_previous_connection_save;
create function kxra.team_connection_save(i uuid,n text,p text,m text,e text,k text) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if p is distinct from 'FIXTURE' or current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' or m is distinct from 'fixture-draft' or k is distinct from 'fixture' or e is distinct from '' then raise insufficient_privilege;end if;
 return kxra.ai_previous_connection_save(i,n,p,m,e,k);
end $$;
create function kxra.team_connection_save_admitted(i uuid,n text,p text,m text,e text,k text,f text) returns uuid language plpgsql security definer set search_path='' as $$
declare t kxra_private.ai_connection_intents;review uuid;
begin
 if session_user<>'kxra_app' then raise insufficient_privilege;end if;
 select * into t from kxra_private.ai_connection_intents where id=i and org_id=kxra_private.member_org() and actor_id=auth.uid() for update;
 review=kxra_private.ai_intent_review(i);
 if not found or t.expires_at<=clock_timestamp() or review is null or (t.provider,t.model,t.endpoint_id,t.fingerprint) is distinct from (p,m,e,f) or t.session_version is distinct from (auth.jwt()->>'session_version')::integer or coalesce(k,'')='' then raise insufficient_privilege;end if;
 perform kxra.ai_previous_connection_save(i,n,p,m,e,k);
 insert into kxra_private.ai_connection_bindings values(i,review,encode(sha256(convert_to(k,'UTF8')),'hex'));
 return i;
end $$;
alter function kxra.team_connection_toggle(uuid,boolean) rename to ai_previous_connection_toggle;
create function kxra.team_connection_toggle(i uuid,active boolean) returns void language plpgsql security definer set search_path='' as $$
declare c kxra.team_connections;
begin
 if session_user<>'kxra_app' or not exists(select 1 from kxra.account_identities account where account.account_id=auth.uid() and account.state='ACTIVE' and account.session_version=(auth.jwt()->>'session_version')::integer) then raise insufficient_privilege;end if;
 select * into c from kxra.team_connections where id=i and org_id=kxra_private.member_org() and created_by=auth.uid();
 if not found then raise insufficient_privilege;end if;
 if active and c.provider<>'FIXTURE' and kxra_private.ai_connection_review(i) is null then raise insufficient_privilege;end if;
 perform kxra.ai_previous_connection_toggle(i,active);
end $$;
create function kxra_private.ai_connection_review(i uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c kxra.team_connections;t kxra_private.ai_connection_intents;b kxra_private.ai_connection_bindings;review uuid;
begin
 select * into c from kxra.team_connections where id=i;
 if not found then return null;end if;
 select * into t from kxra_private.ai_connection_intents where id=i;
 select * into b from kxra_private.ai_connection_bindings where connection_id=i;
 review=kxra_private.ai_intent_review(i);
 if review is null or b.review_id is distinct from review or (c.org_id,c.created_by,c.provider,c.model,c.endpoint_id) is distinct from (t.org_id,t.actor_id,t.provider,t.model,t.endpoint_id) or b.credential_sha256 is distinct from encode(sha256(convert_to(c.encrypted_key,'UTF8')),'hex') then return null;end if;
 return review;
end $$;
alter function kxra_private.team_connection_active(uuid,uuid) rename to ai_previous_connection_active;
create function kxra_private.team_connection_active(connection uuid,room uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare c kxra.team_connections;
begin
 if not kxra_private.ai_previous_connection_active(connection,room) then return false;end if;
 select * into c from kxra.team_connections where id=connection;
 if c.provider='FIXTURE' then return current_setting('request.kxra.execution_mode',true)='fixture' and c.model='fixture-draft' and c.encrypted_key='fixture' and c.endpoint_id='';end if;
 return kxra_private.ai_connection_review(connection) is not null;
end $$;
alter function kxra.team_run_start(uuid,uuid,uuid,uuid,uuid[],text) rename to ai_previous_run_start;
create function kxra.team_run_start(i uuid,r uuid,a uuid,m uuid,ids uuid[],digest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb;review uuid;
begin
 if session_user<>'kxra_app' or not exists(select 1 from kxra.account_identities account where account.account_id=auth.uid() and account.state='ACTIVE' and account.session_version=(auth.jwt()->>'session_version')::integer) then raise insufficient_privilege;end if;
 c=kxra.ai_previous_run_start(i,r,a,m,ids,digest);
 if c->>'provider'<>'FIXTURE' then
  review=kxra_private.ai_connection_review((c->>'id')::uuid);
  if review is null then raise insufficient_privilege;end if;
 end if;
 insert into kxra_private.ai_run_admissions values(i,(c->>'id')::uuid,review,encode(sha256(convert_to(jsonb_build_array(c->>'provider',c->>'model',c->>'endpoint_id',c->>'encrypted_key')::text,'UTF8')),'hex'));
 return c;
end $$;
create function kxra.ai_run_admission(i uuid,h text,k text) returns boolean language plpgsql security definer set search_path='' as $$
declare b kxra_private.ai_run_admissions;t kxra_private.ai_connection_intents;c kxra.team_connections;
begin
 if session_user<>'kxra_app' or not kxra.team_run_ready(i) then return false;end if;
 select * into b from kxra_private.ai_run_admissions where run_id=i;
 select * into t from kxra_private.ai_connection_intents where id=b.connection_id;
 select * into c from kxra.team_connections where id=b.connection_id;
 return b.review_id is not null and b.review_id is not distinct from kxra_private.ai_connection_review(b.connection_id) and t.endpoint_sha256 is not distinct from h and encode(sha256(convert_to(c.encrypted_key,'UTF8')),'hex') is not distinct from k
 and exists(select 1 from kxra.team_runs run join kxra.team_agents agent on agent.id=run.agent_id where run.id=i and agent.connection_id=b.connection_id)
 and exists(select 1 from kxra.account_identities account where account.account_id=auth.uid() and account.state='ACTIVE' and account.session_version=(auth.jwt()->>'session_version')::integer);
end $$;
-- Keep publication bound to the original run admission, including an agent
-- rebinding to another otherwise eligible connection during provider execution.
alter function kxra.team_run_finish(uuid,text,text,integer,integer) rename to ai_previous_run_finish;
create function kxra.team_run_finish(i uuid,result text,code text,tin integer,tout integer) returns void language plpgsql security definer set search_path='' as $$
declare r kxra.team_runs;t kxra_private.ai_connection_intents;c kxra.team_connections;b kxra_private.ai_run_admissions;valid boolean=false;
begin
 if session_user<>'kxra_app' or not exists(select 1 from kxra.account_identities account where account.account_id=auth.uid() and account.state='ACTIVE' and account.session_version=(auth.jwt()->>'session_version')::integer) then raise insufficient_privilege;end if;
 select * into r from kxra.team_runs where id=i and requested_by=auth.uid() for update;
 if not found or r.status<>'RUNNING' then return;end if;
 select * into b from kxra_private.ai_run_admissions where run_id=i;
 select * into c from kxra.team_connections where id=b.connection_id;
 if b.review_id is null then
  valid=b.run_id is not null and c.provider='FIXTURE' and current_setting('request.kxra.execution_mode',true)='fixture'
   and b.connection_sha256=encode(sha256(convert_to(jsonb_build_array(c.provider,c.model,c.endpoint_id,c.encrypted_key)::text,'UTF8')),'hex')
   and exists(select 1 from kxra.team_agents agent where agent.id=r.agent_id and agent.connection_id=b.connection_id)
   and kxra.team_run_ready(i);
 else
  select * into t from kxra_private.ai_connection_intents where id=b.connection_id;
  valid=kxra.ai_run_admission(i,t.endpoint_sha256,encode(sha256(convert_to(c.encrypted_key,'UTF8')),'hex'));
 end if;
 if not coalesce(valid,false) then
  update kxra.team_runs set status='CANCELLED',output='',error_code='AI_ADMISSION_CHANGED',finished_at=now() where id=i;
  return;
 end if;
 perform kxra.ai_previous_run_finish(i,result,code,tin,tout);
end $$;
revoke all on function kxra.team_run_finish(uuid,text,text,integer,integer) from public,anon;
grant execute on function kxra.team_run_finish(uuid,text,text,integer,integer) to authenticated;
revoke all on function kxra_private.ai_evidence_guard(),kxra_private.ai_business_review(uuid),kxra_private.ai_intent_review(uuid),kxra_private.ai_connection_review(uuid),kxra_private.ai_previous_connection_active(uuid,uuid),kxra.ai_previous_connection_save(uuid,text,text,text,text,text),kxra.ai_previous_connection_toggle(uuid,boolean),kxra.ai_previous_run_start(uuid,uuid,uuid,uuid,uuid[],text),kxra.ai_previous_run_finish(uuid,text,text,integer,integer) from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker;
revoke all on function kxra.team_connection_toggle(uuid,boolean) from public,anon;
grant execute on function kxra.team_connection_toggle(uuid,boolean) to authenticated;
revoke all on function kxra.ai_connection_admission(uuid,text,text,text,text,text),kxra.team_connection_save(uuid,text,text,text,text,text),kxra.team_connection_save_admitted(uuid,text,text,text,text,text,text),kxra.team_run_start(uuid,uuid,uuid,uuid,uuid[],text),kxra.ai_run_admission(uuid,text,text) from public,anon;
grant execute on function kxra.ai_connection_admission(uuid,text,text,text,text,text),kxra.team_connection_save(uuid,text,text,text,text,text),kxra.team_connection_save_admitted(uuid,text,text,text,text,text,text),kxra.team_run_start(uuid,uuid,uuid,uuid,uuid[],text),kxra.ai_run_admission(uuid,text,text) to authenticated;
-- Read-only own-intent projection. No key/fingerprint/evidence or caller-selected scope.
create function kxra.ai_connection_status(i uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();t kxra_private.ai_connection_intents;r kxra_private.ai_connection_reviews;current_business uuid;current_review uuid;state text;reason text;action text;
begin
 if session_user<>'kxra_app' or o is null or not coalesce(kxra_private.mfa_owner(o),false) or not exists(select 1 from kxra.account_identities a where a.account_id=auth.uid() and a.state='ACTIVE' and a.session_version=(auth.jwt()->>'session_version')::integer) then raise insufficient_privilege;end if;
 if i is null then
  select * into t from kxra_private.ai_connection_intents where org_id=o and actor_id=auth.uid() order by created_at desc,id desc limit 1;
 else
  select * into t from kxra_private.ai_connection_intents where id=i and org_id=o and actor_id=auth.uid();
 end if;
 if not found then if i is null then return null;else raise insufficient_privilege;end if;end if;
 if exists(select 1 from kxra_private.ai_connection_bindings where connection_id=t.id) then
  if kxra_private.ai_connection_review(t.id) is not null then state='SAVED';reason='SAVED';action='USE_CONNECTIONS';
  else state='REVIEW_REQUIRED';reason='SAVED_AUTHORITY_CHANGED';action='CONTACT_SUPPORT';end if;
 elsif t.session_version is distinct from (auth.jwt()->>'session_version')::integer then
  state='NEW_INTENT_REQUIRED';reason='SESSION_CHANGED';action='CREATE_NEW_INTENT';
 elsif t.expires_at<=clock_timestamp() then
  state='NEW_INTENT_REQUIRED';reason='INTENT_EXPIRED';action='CREATE_NEW_INTENT';
 else
  current_business=kxra_private.ai_business_review(o);
  if t.business_review_id is null then
   state='NEW_INTENT_REQUIRED';reason=case when current_business is null then 'BUSINESS_REVIEW_REQUIRED' else 'BUSINESS_REVIEW_UNBOUND' end;action=case when current_business is null then 'COMPLETE_BUSINESS_REVIEW' else 'CREATE_NEW_INTENT' end;
  elsif t.business_review_id is distinct from current_business then
   state='NEW_INTENT_REQUIRED';reason='BUSINESS_REVIEW_CHANGED';action=case when current_business is null then 'COMPLETE_BUSINESS_REVIEW' else 'CREATE_NEW_INTENT' end;
  elsif not exists(select 1 from kxra_private.business_eligibility_reviews b join kxra_private.business_declarations d on d.id=b.declaration_id where b.id=t.business_review_id and upper(trim(d.provider))=t.provider) then
   state='NEW_INTENT_REQUIRED';reason='BUSINESS_PROVIDER_MISMATCH';action='COMPLETE_BUSINESS_REVIEW';
  else
   current_review=kxra_private.ai_intent_review(t.id);
   if current_review is not null then state='ELIGIBLE';reason='CLEARED';action='RESUBMIT_SAME_DETAILS';
   else
    select * into r from kxra_private.ai_connection_reviews where intent_id=t.id order by sequence desc limit 1;
    state='REVIEW_REQUIRED';action='CONTACT_SUPPORT';
    if not found then reason='AWAITING_PROVIDER_REVIEW';action='WAIT_FOR_REVIEW';
    elsif r.state='BLOCKED' then state='BLOCKED';reason='PROVIDER_REVIEW_BLOCKED';
    elsif r.withdrawn_at is not null then reason='REVIEW_WITHDRAWN';
    elsif r.reviewed_at>clock_timestamp() or r.expires_at<=clock_timestamp() then reason='REVIEW_NOT_CURRENT';
    elsif (t.provider='GOOGLE' and r.account_mode<>'GOOGLE_PAID') or (t.provider<>'GOOGLE' and r.account_mode<>'CUSTOMER_BILLED') then reason='ACCOUNT_MODE_REVIEW_REQUIRED';
    else reason='AWAITING_PROVIDER_REVIEW';action='WAIT_FOR_REVIEW';end if;
   end if;
  end if;
 end if;
 return jsonb_build_object('admission_id',t.id,'provider',t.provider,'model',t.model,'endpoint_id',t.endpoint_id,'state',state,'reason',reason,'next_action',action,'expires_at',t.expires_at);
end $$;
revoke all on function kxra.ai_connection_status(uuid) from public,anon,kxra_billing_worker,kxra_ai_worker;
grant execute on function kxra.ai_connection_status(uuid) to authenticated;
commit;
