-- Unnumbered, unwired proposal AFTER genuine AI118 and paired-admission-v1.
-- No policy, activation, token, device session, credential or access grant is seeded/issued.
begin;
create table kxra_paired_admission.transport_policies(
 id uuid primary key,sequence bigint generated always as identity unique,policy_sha256 text not null check(policy_sha256~'^[a-f0-9]{64}$'),
 auth_route text not null check(auth_route='CUSTOMER_API_KEY'),
 enabled boolean not null default false,expires_at timestamptz not null,revoked_at timestamptz,
 review_reference text not null check(length(review_reference) between 1 and 160)
);
create table kxra_paired_admission.setup_requests(
 id uuid primary key,org_id uuid not null references kxra.organisations,
 account_id uuid not null references kxra.account_identities(account_id),
 session_version integer not null,membership_version integer not null,
 room_id uuid not null references kxra.team_rooms,agent_id uuid not null unique references kxra_paired_admission.agents,
 ai_intent_id uuid not null references kxra_private.ai_connection_intents,
 auth_route text not null check(auth_route in('CUSTOMER_API_KEY','CHATGPT_SUBSCRIPTION')),
 label text not null check(length(label) between 1 and 100),
 policy_binding jsonb,created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',cancelled_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '5 minutes')
);
create index paired_setup_owner on kxra_paired_admission.setup_requests(org_id,account_id,created_at);
create function kxra_paired_admission.setup_human(o uuid,u uuid,r uuid,sv integer,mv integer) returns boolean
language sql volatile security definer set search_path='' as $$
 select coalesce(session_user='kxra_app' and auth.uid()=u and kxra_private.member_org()=o
 and kxra_private.mfa_owner(o) and kxra_private.can_team_room(r,true)
 and (auth.jwt()->>'auth_time')~'^[0-9]{1,12}$'
 and to_timestamp((auth.jwt()->>'auth_time')::double precision) between clock_timestamp()-interval '15 minutes' and clock_timestamp()+interval '1 minute'
 and exists(select 1 from kxra.account_identities a join kxra.organisation_memberships m on m.account_id=a.account_id
  join kxra.organisations org on org.id=m.org_id join kxra.team_rooms room on room.org_id=org.id
  join kxra.team_room_members rm on rm.room_id=room.id and rm.account_id=a.account_id and rm.active
  where a.account_id=u and a.state='ACTIVE' and a.email_verified_at is not null
  and a.session_version=sv and sv=(auth.jwt()->>'session_version')::integer
  and m.org_id=o and m.version=mv and m.state='ACTIVE' and m.security_role='ORG_ADMIN' and m.relationship_type='CUSTOMER'
  and m.starts_at<=clock_timestamp() and(m.expires_at is null or m.expires_at>clock_timestamp()) and m.revoked_at is null
  and org.state='ACTIVE' and org.organisation_kind='CUSTOMER' and room.id=r),false)
$$;
create function kxra_paired_admission.setup_policy(s kxra_paired_admission.setup_requests) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare t kxra_private.ai_connection_intents;ar kxra_private.ai_connection_reviews;paid kxra_private.live_paid_access;
 tp kxra_paired_admission.transport_policies;br uuid;binding jsonb;
begin
 if s.auth_route='CHATGPT_SUBSCRIPTION' then return jsonb_build_object('reason','SUBSCRIPTION_PROVIDER_CONFIRMATION_REQUIRED');end if;
 if not kxra_paired_admission.setup_human(s.org_id,s.account_id,s.room_id,s.session_version,s.membership_version) then raise insufficient_privilege;end if;
 if not coalesce(kxra_private.live_billing_legal_allowed(s.org_id,s.account_id),false) then return jsonb_build_object('reason','TERMS_REQUIRED');end if;
 if not coalesce(kxra_private.live_paid_entitled(s.org_id),false) then return jsonb_build_object('reason','PAID_PROOF_REQUIRED');end if;
 select * into paid from kxra_private.live_paid_access where org_id=s.org_id;
 if paid.valid_until<=clock_timestamp() or paid.period_start>clock_timestamp() or paid.period_end<=clock_timestamp() or not exists(select 1 from kxra_private.live_paid_policies q where q.id=paid.policy_id and q.revision=paid.policy_revision and paid.checked_at>clock_timestamp()-make_interval(secs=>q.proof_ttl_seconds)) then return jsonb_build_object('reason','PAID_PROOF_REQUIRED');end if;
 br=kxra_private.ai_business_review(s.org_id);
 if br is null or not exists(select 1 from kxra_private.business_eligibility_reviews b join kxra_private.business_eligibility_policies bp on bp.id=b.policy_id where b.id=br and b.withdrawn_at is null and b.expires_at>clock_timestamp() and bp.enabled and bp.expires_at>clock_timestamp()) then return jsonb_build_object('reason','BUSINESS_REVIEW_REQUIRED');end if;
 select * into t from kxra_private.ai_connection_intents where id=s.ai_intent_id and org_id=s.org_id and actor_id=s.account_id
  and session_version=s.session_version and provider='OPENAI' and business_review_id=br and expires_at>clock_timestamp();
 if not found then return jsonb_build_object('reason','AI_REVIEW_REQUIRED');end if;
 select * into ar from kxra_private.ai_connection_reviews where id=kxra_private.ai_intent_review(t.id);
 if not found or ar.account_mode<>'CUSTOMER_BILLED' or ar.withdrawn_at is not null or ar.expires_at<=clock_timestamp() then return jsonb_build_object('reason','AI_REVIEW_REQUIRED');end if;
 select * into tp from kxra_paired_admission.transport_policies where auth_route='CUSTOMER_API_KEY' order by sequence desc limit 1;
 if not found or not tp.enabled or tp.revoked_at is not null or tp.expires_at<=clock_timestamp() then return jsonb_build_object('reason','TRANSPORT_REVIEW_REQUIRED');end if;
 binding=jsonb_build_object('business_review_id',br,'ai_intent_id',t.id,'ai_review_id',ar.id,'account_binding_sha256',ar.account_reference_sha256,
  'model_sha256',encode(sha256(convert_to(t.model,'UTF8')),'hex'),'transport_policy_id',tp.id,'tool_policy_sha256',tp.policy_sha256,
  'paid_policy_id',paid.policy_id,'paid_policy_revision',paid.policy_revision,'terms_sha256',paid.terms_review_sha256);
 return jsonb_build_object('reason','POLICY_READY_SETUP_HELD','binding',binding);
end $$;
create function kxra_paired_admission.setup_status(i uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare s kxra_paired_admission.setup_requests;p jsonb;reason text;
begin
 select * into s from kxra_paired_admission.setup_requests where id=i;
 if not found or not kxra_paired_admission.setup_human(s.org_id,s.account_id,s.room_id,s.session_version,s.membership_version) then raise insufficient_privilege;end if;
 if s.cancelled_at is not null then reason='CANCELLED';
 elsif s.expires_at<=clock_timestamp() then reason='EXPIRED';
 else p=kxra_paired_admission.setup_policy(s);reason=p->>'reason';
  if reason='POLICY_READY_SETUP_HELD' and s.policy_binding is distinct from p->'binding' then reason='NEW_REQUEST_REQUIRED';end if;
 end if;
 return jsonb_build_object('request_id',s.id,'agent_id',s.agent_id,'room_id',s.room_id,'reason',reason,
  'expires_at',to_char(s.expires_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'activation_allowed',false,'credential_issued',false);
end $$;
create function kxra_paired_admission.request_setup(i uuid,r uuid,ai uuid,route text,n text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s kxra_paired_admission.setup_requests;o uuid=kxra_private.member_org();u uuid=auth.uid();sv integer;mv integer;p jsonb;ag uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('kxra-paired-policy-v1',0));
 select a.session_version,m.version into sv,mv from kxra.account_identities a join kxra.organisation_memberships m on m.account_id=a.account_id where a.account_id=u and m.org_id=o;
 if not kxra_paired_admission.setup_human(o,u,r,sv,mv) then raise insufficient_privilege;end if;
 if i is null or ai is null or route is null or route not in('CUSTOMER_API_KEY','CHATGPT_SUBSCRIPTION') or n is null or length(n) not between 1 and 100 then raise invalid_parameter_value;end if;
 perform 1 from kxra_private.ai_connection_intents where id=ai and org_id=o and actor_id=u and session_version=sv and provider='OPENAI';
 if not found then raise insufficient_privilege;end if;
 -- Serialize same-owner creations for idempotency and bounded pending-request capacity.
 perform pg_advisory_xact_lock(hashtextextended('paired-setup-owner:'||o::text||':'||u::text,0));
 select * into s from kxra_paired_admission.setup_requests where id=i;
 if found then
  if(s.org_id,s.account_id,s.session_version,s.membership_version,s.room_id,s.ai_intent_id,s.auth_route,s.label) is distinct from(o,u,sv,mv,r,ai,route,n) then raise insufficient_privilege;end if;
  return kxra_paired_admission.setup_status(i);
 end if;
 if(select count(*) from kxra_paired_admission.setup_requests where org_id=o and account_id=u and expires_at>clock_timestamp() and cancelled_at is null)>=20 then raise exception 'Pending setup capacity reached';end if;
 ag=gen_random_uuid();
 insert into kxra_paired_admission.agents(id,org_id,account_id,room_id)values(ag,o,u,r);
 insert into kxra_paired_admission.setup_requests(id,org_id,account_id,session_version,membership_version,room_id,agent_id,ai_intent_id,auth_route,label)
 values(i,o,u,sv,mv,r,ag,ai,route,n) returning * into s;
 p=kxra_paired_admission.setup_policy(s);
 update kxra_paired_admission.setup_requests set policy_binding=p->'binding' where id=i;
 return kxra_paired_admission.setup_status(i);
end $$;
create function kxra_paired_admission.cancel_setup(i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s kxra_paired_admission.setup_requests;
begin
 perform pg_advisory_xact_lock(hashtextextended('kxra-paired-policy-v1',0));
 select * into s from kxra_paired_admission.setup_requests where id=i for update;
 if not found or not kxra_paired_admission.setup_human(s.org_id,s.account_id,s.room_id,s.session_version,s.membership_version) then raise insufficient_privilege;end if;
 update kxra_paired_admission.setup_requests set cancelled_at=coalesce(cancelled_at,clock_timestamp()) where id=i;
 return kxra_paired_admission.setup_status(i);
end $$;
-- Rebind both RLS and mutation wrappers: renaming alone would leave policy OIDs
-- pointing at the earlier storage predicate and allow composition to be bypassed.
alter function kxra_paired_admission.current_task(uuid) rename to storage_current_task;
alter function kxra_paired_admission.consume(uuid,uuid,uuid,text,uuid) rename to storage_consume;
create function kxra_paired_admission.current_task(t uuid) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare a kxra_paired_admission.authorities;s kxra_paired_admission.setup_requests;p jsonb;
begin
 if not kxra_paired_admission.storage_current_task(t) then return false;end if;
 select * into a from kxra_paired_admission.authorities where task_id=t;
 select * into s from kxra_paired_admission.setup_requests where agent_id=(a.manifest->'task'->>'agent_id')::uuid;
 if not found or s.cancelled_at is not null or s.expires_at<=clock_timestamp() or s.auth_route<>'CUSTOMER_API_KEY' or s.policy_binding is null then return false;end if;
 p=kxra_paired_admission.setup_policy(s);
 return coalesce(p->>'reason'='POLICY_READY_SETUP_HELD' and p->'binding'=s.policy_binding
  and a.manifest->'runtime'->>'tool_policy_sha256'=s.policy_binding->>'tool_policy_sha256'
  and a.manifest->'runtime'->>'auth_binding_sha256'=s.policy_binding->>'account_binding_sha256'
  and a.manifest->'runtime'->>'model_sha256'=s.policy_binding->>'model_sha256',false);
end $$;
create function kxra_paired_admission.consume(t uuid,f uuid,a uuid,s text,p uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare deadline timestamptz;receipt jsonb;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('kxra-paired-policy-v1',0));
 if not kxra_paired_admission.current_task(t) then raise insufficient_privilege;end if;
 select least(to_timestamp((auth.jwt()->>'auth_time')::double precision)+interval '15 minutes',om.expires_at,sr.expires_at,tp.expires_at,pa.valid_until,pa.period_end,pa.checked_at+make_interval(secs=>pp.proof_ttl_seconds),ar.expires_at,ai.expires_at,br.expires_at,bp.expires_at) into deadline
 from kxra_paired_admission.authorities au join kxra_paired_admission.setup_requests sr on sr.agent_id=(au.manifest->'task'->>'agent_id')::uuid
 join kxra.organisation_memberships om on om.org_id=sr.org_id and om.account_id=sr.account_id
 join kxra_paired_admission.transport_policies tp on tp.id=(sr.policy_binding->>'transport_policy_id')::uuid
 join kxra_private.live_paid_access pa on pa.org_id=sr.org_id join kxra_private.live_paid_policies pp on pp.id=pa.policy_id and pp.revision=pa.policy_revision
 join kxra_private.ai_connection_reviews ar on ar.id=(sr.policy_binding->>'ai_review_id')::uuid
 join kxra_private.ai_connection_intents ai on ai.id=sr.ai_intent_id
 join kxra_private.business_eligibility_reviews br on br.id=(sr.policy_binding->>'business_review_id')::uuid
 join kxra_private.business_eligibility_policies bp on bp.id=br.policy_id where au.task_id=t;
 if deadline is null or deadline<=clock_timestamp() then raise insufficient_privilege;end if;
 receipt=kxra_paired_admission.storage_consume(t,f,a,s,p);
 if receipt->>'state'='CONSUMED' then receipt=jsonb_set(receipt,'{expires_at}',to_jsonb(to_char(least(deadline,(receipt->>'expires_at')::timestamptz) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')));end if;
 return receipt;
end $$;
drop policy scoped_authority on kxra_paired_admission.authorities;
create policy scoped_authority on kxra_paired_admission.authorities for select to authenticated using(kxra_paired_admission.current_task(task_id));
-- All mutable inputs consulted by the composed gates take the exclusive side
-- before row writes; never hold the shared side through inference or external IO.
create function kxra_paired_admission.policy_writer() returns trigger language plpgsql set search_path='' as $$begin perform pg_advisory_xact_lock(hashtextextended('kxra-paired-policy-v1',0));return null;end $$;
do $$declare t text;begin foreach t in array array['kxra.account_identities','kxra.organisation_memberships','kxra.organisations','kxra.invitations','kxra.project_memberships','kxra.projects','kxra.team_room_members','kxra.team_rooms','kxra.legal_documents','kxra.legal_document_requirements','kxra.legal_acceptances','kxra_private.live_billing_bindings','kxra_private.live_paid_access','kxra_private.live_paid_policies','kxra_private.live_billing_mappings','kxra_private.live_billing_activation','kxra_private.modern_billing_execution_identity','kxra_private.billing_admission_lanes','kxra_private.live_customer_intents','kxra_private.live_paid_receipts','kxra_private.business_declarations','kxra_private.business_eligibility_reviews','kxra_private.business_eligibility_policies','kxra_private.ai_connection_intents','kxra_private.ai_connection_reviews','kxra_paired_admission.transport_policies','kxra_paired_admission.setup_requests'] loop
 execute format('create trigger paired_policy_writer before insert or update or delete on %s for each statement execute function kxra_paired_admission.policy_writer()',t);
 end loop;end $$;
alter table kxra_paired_admission.transport_policies enable row level security;
alter table kxra_paired_admission.setup_requests enable row level security;
create policy own_setup on kxra_paired_admission.setup_requests for select to authenticated using(kxra_paired_admission.setup_human(org_id,account_id,room_id,session_version,membership_version));
revoke all on kxra_paired_admission.transport_policies,kxra_paired_admission.setup_requests from public,anon,authenticated,kxra_app;
revoke all on function kxra_paired_admission.storage_current_task(uuid),kxra_paired_admission.storage_consume(uuid,uuid,uuid,text,uuid),kxra_paired_admission.setup_human(uuid,uuid,uuid,integer,integer),kxra_paired_admission.setup_policy(kxra_paired_admission.setup_requests),kxra_paired_admission.policy_writer(),kxra_paired_admission.request_setup(uuid,uuid,uuid,text,text),kxra_paired_admission.setup_status(uuid),kxra_paired_admission.cancel_setup(uuid),kxra_paired_admission.current_task(uuid),kxra_paired_admission.consume(uuid,uuid,uuid,text,uuid) from public,anon,authenticated,kxra_app;
grant execute on function kxra_paired_admission.setup_human(uuid,uuid,uuid,integer,integer),kxra_paired_admission.request_setup(uuid,uuid,uuid,text,text),kxra_paired_admission.setup_status(uuid),kxra_paired_admission.cancel_setup(uuid),kxra_paired_admission.current_task(uuid),kxra_paired_admission.consume(uuid,uuid,uuid,text,uuid) to authenticated;
grant select(id,agent_id,room_id,label,created_at,expires_at,cancelled_at) on kxra_paired_admission.setup_requests to authenticated;
commit;
