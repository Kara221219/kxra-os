-- Review-only production payload after exact AI118. No grants, policy, terms or financial data are seeded.
begin;
create table kxra_private.review_operator_grants(
 id uuid primary key default gen_random_uuid(),platform_org_id uuid not null references kxra.organisations,
 reviewer_id uuid not null references kxra.account_identities(account_id),session_version integer not null check(session_version>0),
 target_org_id uuid not null references kxra.organisations,kind text not null check(kind in('BUSINESS','AI')),
 provider text not null check(provider in('OPENAI','ANTHROPIC','GOOGLE','OPENROUTER','COMPATIBLE')),
 policy_id uuid not null references kxra_private.business_eligibility_policies,
 can_withdraw boolean not null default false,can_replace boolean not null default false,max_valid_seconds integer not null check(max_valid_seconds between 1 and 31536000),
 owner_review_reference text not null check(length(owner_review_reference) between 1 and 160),
 valid_from timestamptz not null,valid_until timestamptz not null check(valid_until>valid_from),revoked_at timestamptz,
 check(platform_org_id<>target_org_id)
);
create unique index review_operator_one_current on kxra_private.review_operator_grants(reviewer_id,platform_org_id,target_org_id,kind,provider,policy_id) where revoked_at is null;
create index review_operator_grant_lookup on kxra_private.review_operator_grants(reviewer_id,platform_org_id,kind,target_org_id) where revoked_at is null;
create table kxra_private.review_requests(
 id uuid primary key default gen_random_uuid(),grant_id uuid not null references kxra_private.review_operator_grants,
 reviewer_id uuid not null references kxra.account_identities(account_id),session_version integer not null,
 subject_id uuid not null,public_snapshot jsonb not null check(jsonb_typeof(public_snapshot)='object'),context_sha256 text not null check(context_sha256~'^[a-f0-9]{64}$'),
 opened_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null check(expires_at>opened_at)
);
create index review_request_lookup on kxra_private.review_requests(grant_id,reviewer_id,subject_id,opened_at desc);
create table kxra_private.review_operation_receipts(
 id uuid primary key,request_id uuid not null unique references kxra_private.review_requests,
 reviewer_id uuid not null references kxra.account_identities(account_id),
 command_sha256 text not null check(command_sha256~'^[a-f0-9]{64}$'),result jsonb not null check(jsonb_typeof(result)='object'),
 recorded_at timestamptz not null default clock_timestamp()
);
alter table kxra_private.review_operator_grants enable row level security;
alter table kxra_private.review_requests enable row level security;
alter table kxra_private.review_operation_receipts enable row level security;
revoke all on kxra_private.review_operator_grants,kxra_private.review_requests,kxra_private.review_operation_receipts from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker;
create function kxra_private.review_operations_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='review_operator_grants' and tg_op='UPDATE' and old.revoked_at is null and new.revoked_at is not null and (to_jsonb(new)-'revoked_at')=(to_jsonb(old)-'revoked_at') then return new;end if;
 raise exception 'Review operation history is immutable';
end $$;
create trigger review_grant_immutable before update or delete on kxra_private.review_operator_grants for each row execute function kxra_private.review_operations_immutable();
create trigger review_request_immutable before update or delete on kxra_private.review_requests for each row execute function kxra_private.review_operations_immutable();
create trigger review_receipt_immutable before update or delete on kxra_private.review_operation_receipts for each row execute function kxra_private.review_operations_immutable();
create function kxra_private.review_operator_active(g uuid,p text) returns boolean language sql volatile security definer set search_path='' as $$
 select session_user='kxra_app' and coalesce(kxra_private.mfa_owner(kxra_private.member_org()),false) and exists(
 select 1 from kxra_private.review_operator_grants r join kxra_private.business_eligibility_policies policy on policy.id=r.policy_id
 join kxra.account_identities a on a.account_id=r.reviewer_id
 join kxra.organisations platform on platform.id=r.platform_org_id
 join kxra.organisations customer on customer.id=r.target_org_id
 where r.id=g and r.platform_org_id=kxra_private.member_org() and platform.organisation_kind='KXRA' and platform.state='ACTIVE'
 and customer.organisation_kind='CUSTOMER' and customer.state='ACTIVE' and r.reviewer_id=auth.uid()
 and a.state='ACTIVE' and a.email_verified_at is not null and a.session_version=r.session_version and r.session_version=(auth.jwt()->>'session_version')::integer
 and exists(select 1 from kxra.organisation_memberships m where m.org_id=platform.id and m.account_id=auth.uid() and m.security_role='KXRA_OWNER' and m.state='ACTIVE' and m.revoked_at is null and m.starts_at<=clock_timestamp() and (m.expires_at is null or m.expires_at>clock_timestamp()))
 and not exists(select 1 from kxra.organisation_memberships m where m.org_id=customer.id and m.account_id=auth.uid() and m.state='ACTIVE' and m.revoked_at is null)
 and r.revoked_at is null and r.valid_from<=clock_timestamp() and r.valid_until>clock_timestamp()
 and policy.enabled and policy.effective_at<=clock_timestamp() and policy.expires_at>clock_timestamp() and policy.evidence_sha256=p
 and policy.id=(select id from kxra_private.business_eligibility_policies where first_enabled_at is not null order by sequence desc limit 1))
$$;
-- A policy activation changes a global current-version pointer. Serialize only
-- rare policy writes, not ordinary customer operations, with review decisions.
create function kxra_private.review_policy_write_fence() returns trigger language plpgsql set search_path='' as $$
begin perform pg_advisory_xact_lock(hashtextextended('kxra-review-current-policy-v1',0));return null;end $$;
create trigger a00_review_policy_write_fence before insert or update or delete on kxra_private.business_eligibility_policies for each statement execute function kxra_private.review_policy_write_fence();
create function kxra_private.review_authority_fence(g uuid,subject_actor uuid,p text) returns void language plpgsql security definer set search_path='' as $$
declare grant_row kxra_private.review_operator_grants;
begin
 select * into grant_row from kxra_private.review_operator_grants where id=g;
 perform pg_advisory_xact_lock_shared(hashtextextended('kxra-review-current-policy-v1',0));
 -- Strong account locks also fence new membership FK checks; existing revoked
 -- memberships are locked too so reactivation cannot defeat independence.
 perform account_id from kxra.account_identities where account_id in(grant_row.reviewer_id,subject_actor) order by account_id for update;
 perform id from kxra.organisation_memberships where account_id in(grant_row.reviewer_id,subject_actor) order by id for share;
 perform id from kxra.organisations where id in(grant_row.platform_org_id,grant_row.target_org_id) order by id for share;
 perform id from kxra_private.business_eligibility_policies where id=grant_row.policy_id for share;
 if not coalesce(kxra_private.review_operator_active(g,p),false) then raise insufficient_privilege;end if;
end $$;
-- Private frozen context; never returned to a browser. Includes exact account/binding/fingerprint authority.
create function kxra_private.review_subject_context(g uuid,s uuid) returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare grant_row kxra_private.review_operator_grants;d kxra_private.business_declarations;t kxra_private.ai_connection_intents;
 b kxra_private.live_billing_bindings;m kxra_private.live_billing_mappings;q kxra_private.live_paid_policies;doc kxra.legal_documents;
 policy kxra_private.business_eligibility_policies;prior jsonb;prior_subject uuid;subject_actor uuid;ready boolean=false;reason text='BILLING_OR_TERMS_REQUIRED';bound boolean=false;current_business uuid;org_name text;
begin
 select * into grant_row from kxra_private.review_operator_grants where id=g;
 select * into policy from kxra_private.business_eligibility_policies where id=grant_row.policy_id;
 select name into org_name from kxra.organisations where id=grant_row.target_org_id;
 select * into b from kxra_private.live_billing_bindings where org_id=grant_row.target_org_id;
 select * into m from kxra_private.live_billing_mappings where scope_id=b.scope_id and offer_key=b.offer_key and revision=b.mapping_revision and enabled;
 select * into q from kxra_private.live_paid_policies where scope_id=m.scope_id and offer_key=m.offer_key and mapping_revision=m.revision and enabled;
 select * into doc from kxra.legal_documents where id=q.terms_document_id and version=q.terms_document_version;
 if grant_row.kind='BUSINESS' then
  select * into d from kxra_private.business_declarations where id=s and org_id=grant_row.target_org_id;
  if not found or d.id is distinct from (select id from kxra_private.business_declarations where org_id=grant_row.target_org_id order by sequence desc limit 1) then raise insufficient_privilege;end if;
  subject_actor=d.actor_id;
  select jsonb_build_object('id',r.id,'state',r.state,'withdrawn',r.withdrawn_at is not null,'expires_at',r.expires_at) into prior from kxra_private.business_eligibility_reviews r where org_id=grant_row.target_org_id order by sequence desc limit 1;
  select declaration_id into prior_subject from kxra_private.business_eligibility_reviews where org_id=grant_row.target_org_id order by sequence desc limit 1;
  ready=b.customer_id is not null and m.scope_id is not null and q.id is not null and doc.id is not null and doc.status='APPROVED' and doc.effective_at<=clock_timestamp() and doc.owner_approval_reference is not null and doc.owner_approved_at is not null and doc.document_type='TERMS' and doc.audience in('CUSTOMER','ALL') and (m.terms_review_sha256,m.tax_review_sha256) is not distinct from (q.terms_review_sha256,q.tax_review_sha256) and doc.content_sha256=m.terms_review_sha256 and exists(select 1 from kxra.account_identities a join kxra.organisation_memberships membership on membership.account_id=a.account_id and membership.org_id=grant_row.target_org_id where a.account_id=d.actor_id and a.state='ACTIVE' and a.email_verified_at is not null and membership.security_role='ORG_ADMIN' and membership.state='ACTIVE' and membership.revoked_at is null and membership.starts_at<=clock_timestamp() and (membership.expires_at is null or membership.expires_at>clock_timestamp()));
 else
  select * into t from kxra_private.ai_connection_intents where id=s and org_id=grant_row.target_org_id;
  if not found then raise insufficient_privilege;end if;
  select * into d from kxra_private.business_declarations where org_id=grant_row.target_org_id order by sequence desc limit 1;
  subject_actor=t.actor_id;current_business=kxra_private.ai_business_review(grant_row.target_org_id);
  bound=exists(select 1 from kxra_private.ai_connection_bindings where connection_id=t.id);
  select jsonb_build_object('id',r.id,'state',r.state,'withdrawn',r.withdrawn_at is not null,'expires_at',r.expires_at) into prior from kxra_private.ai_connection_reviews r where intent_id=t.id order by sequence desc limit 1;
  ready=not bound and t.expires_at>clock_timestamp() and current_business is not null and t.business_review_id is not distinct from current_business and upper(trim(d.provider))=t.provider and exists(select 1 from kxra.account_identities a join kxra.organisation_memberships membership on membership.account_id=a.account_id and membership.org_id=t.org_id where a.account_id=t.actor_id and a.state='ACTIVE' and a.session_version=t.session_version and membership.state='ACTIVE' and membership.revoked_at is null and membership.starts_at<=clock_timestamp() and (membership.expires_at is null or membership.expires_at>clock_timestamp()));
  prior_subject=case when prior is not null then t.id else null end;
  reason=case when bound then 'SAVED_REQUIRES_NEW_INTENT' when t.expires_at<=clock_timestamp() then 'INTENT_EXPIRED' else 'BUSINESS_OR_ACCOUNT_REVIEW_REQUIRED' end;
 end if;
 if ready and prior_subject=s and not grant_row.can_replace then ready=false;reason='REPLACEMENT_REQUIRES_AUTHORITY';end if;
 if subject_actor is null or subject_actor=auth.uid() or (case when grant_row.kind='AI' then t.provider else upper(trim(d.provider)) end) is distinct from grant_row.provider then raise insufficient_privilege;end if;
 return jsonb_build_object('grant_id',grant_row.id,'grant_can_withdraw',grant_row.can_withdraw,'kind',grant_row.kind,'subject_id',s,'target_org_id',grant_row.target_org_id,'subject_actor',subject_actor,'subject_account_session',(select session_version from kxra.account_identities where account_id=subject_actor),'organization_name',org_name,
 'declaration',to_jsonb(d),'intent',case when grant_row.kind='AI' then to_jsonb(t) else null end,'binding',jsonb_build_object('org_id',b.org_id,'customer_id',b.customer_id,'scope_id',b.scope_id,'offer_key',b.offer_key,'mapping_revision',b.mapping_revision),'mapping',to_jsonb(m),'paid_policy',to_jsonb(q),'document',jsonb_build_object('id',doc.id,'version',doc.version,'content_sha256',doc.content_sha256,'status',doc.status,'effective_at',doc.effective_at,'owner_approval_reference',doc.owner_approval_reference,'owner_approved_at',doc.owner_approved_at),'policy',to_jsonb(policy),'current_business_review',current_business,'prior_review',prior,
 'ready',coalesce(ready,false),'reason',case when ready then 'READY' else reason end,'bound',bound);
end $$;
create function kxra_private.review_public_context(c jsonb,r uuid,e timestamptz,result jsonb default null,request_current boolean default false) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('request_id',r,'kind',c->>'kind','subject_id',c->>'subject_id','organization_name',c->>'organization_name','legal_name',c#>>'{declaration,legal_name}','country',c#>>'{declaration,country}','region',c#>>'{declaration,region}',
 'provider',case when c->>'kind'='AI' then c#>>'{intent,provider}' else upper(trim(c#>>'{declaration,provider}')) end,'model',case when c->>'kind'='AI' then c#>>'{intent,model}' else '' end,'endpoint_id',case when c->>'kind'='AI' then c#>>'{intent,endpoint_id}' else '' end,
 'policy_version',c#>>'{policy,version}','reason',c->>'reason','request_current',request_current,'can_decide',coalesce((c->>'ready')::boolean,false) and (r is null or request_current),'can_withdraw',request_current and coalesce((c->>'grant_can_withdraw')::boolean,false) and c#>>'{prior_review,id}' is not null and not coalesce((c#>>'{prior_review,withdrawn}')::boolean,false),'prior_review',case when c->'prior_review'='null'::jsonb then null else c->'prior_review' end,'expires_at',e,'receipt',result)
$$;
create function kxra.review_operations(action text,v jsonb,policy_sha text) returns jsonb language plpgsql security definer set search_path='' as $$
declare g kxra_private.review_operator_grants;r kxra_private.review_requests;receipt kxra_private.review_operation_receipts;
 c jsonb;digest text;cmd_digest text;review_id uuid;result jsonb;decision jsonb;until_time timestamptz;state text;prior_id uuid;rows jsonb;next_cursor text;
begin
 if session_user<>'kxra_app' or coalesce(action,'') not in('LIST','OPEN','VIEW','DECIDE','WITHDRAW') or jsonb_typeof(v)<>'object' or coalesce(policy_sha,'')!~'^[a-f0-9]{64}$' then raise insufficient_privilege;end if;
 if not coalesce(kxra_private.mfa_owner(kxra_private.member_org()),false) or not exists(select 1 from kxra.organisations where id=kxra_private.member_org() and organisation_kind='KXRA' and state='ACTIVE') then raise insufficient_privilege;end if;
 if action='LIST' then
  if (v-'after')<>'{}'::jsonb or (v?'after' and coalesce(v->>'after','')!~'^(BUSINESS|AI):[a-f0-9-]{36}$') then raise exception 'Invalid review query';end if;
  with subjects as(
   select grant_row.id grant_id,grant_row.kind,d.id subject_id,grant_row.kind||':'||d.id::text cursor_key from kxra_private.review_operator_grants grant_row join kxra_private.business_declarations d on d.org_id=grant_row.target_org_id where grant_row.kind='BUSINESS' and kxra_private.review_operator_active(grant_row.id,policy_sha) and d.id=(select id from kxra_private.business_declarations where org_id=d.org_id order by sequence desc limit 1) and d.actor_id<>auth.uid() and upper(trim(d.provider))=grant_row.provider
   union all
   select grant_row.id,grant_row.kind,t.id,grant_row.kind||':'||t.id::text from kxra_private.review_operator_grants grant_row join kxra_private.ai_connection_intents t on t.org_id=grant_row.target_org_id where grant_row.kind='AI' and kxra_private.review_operator_active(grant_row.id,policy_sha) and t.actor_id<>auth.uid() and t.provider=grant_row.provider
  ), distinct_subjects as(select distinct on(cursor_key) * from subjects where cursor_key>coalesce(v->>'after','') order by cursor_key,grant_id),limited as(select * from distinct_subjects order by cursor_key limit 21), numbered as(select *,row_number()over(order by cursor_key) n from limited)
  select coalesce(jsonb_agg(kxra_private.review_public_context(kxra_private.review_subject_context(grant_id,subject_id),null,null) order by cursor_key) filter(where n<=20),'[]'::jsonb),case when count(*)>20 then max(cursor_key)filter(where n=20) else null end into rows,next_cursor from numbered;
  return jsonb_build_object('items',rows,'next_cursor',next_cursor);
 end if;
 if action='OPEN' then
  if (v-'kind'-'subject_id')<>'{}'::jsonb or v->>'kind' not in('BUSINESS','AI') then raise exception 'Invalid review request';end if;
  -- Choose only an independently configured grant; no caller target/org/reviewer/role is accepted.
  select * into g from kxra_private.review_operator_grants x where x.kind=v->>'kind' and kxra_private.review_operator_active(x.id,policy_sha) and ((x.kind='BUSINESS' and exists(select 1 from kxra_private.business_declarations where id=(v->>'subject_id')::uuid and org_id=x.target_org_id and actor_id<>auth.uid() and upper(trim(provider))=x.provider)) or (x.kind='AI' and exists(select 1 from kxra_private.ai_connection_intents where id=(v->>'subject_id')::uuid and org_id=x.target_org_id and actor_id<>auth.uid() and provider=x.provider))) order by x.id limit 1 for update;
  if not found or not kxra_private.review_operator_active(g.id,policy_sha) then raise insufficient_privilege;end if;
  c=kxra_private.review_subject_context(g.id,(v->>'subject_id')::uuid);perform kxra_private.review_authority_fence(g.id,(c->>'subject_actor')::uuid,policy_sha);c=kxra_private.review_subject_context(g.id,(v->>'subject_id')::uuid);digest=encode(sha256(convert_to(c::text,'UTF8')),'hex');
  select * into r from kxra_private.review_requests where grant_id=g.id and reviewer_id=auth.uid() and subject_id=(v->>'subject_id')::uuid and context_sha256=digest and expires_at>clock_timestamp() and not exists(select 1 from kxra_private.review_operation_receipts where request_id=review_requests.id) order by opened_at desc limit 1;
  if not found then
   if (select count(*) from kxra_private.review_requests where grant_id=g.id and opened_at>clock_timestamp()-interval '1 day')>=1000 then raise exception 'Review request capacity exhausted';end if;
   review_id=gen_random_uuid();until_time=least(clock_timestamp()+interval '15 minutes',g.valid_until,(c#>>'{policy,expires_at}')::timestamptz);
   insert into kxra_private.review_requests(id,grant_id,reviewer_id,session_version,subject_id,public_snapshot,context_sha256,expires_at) values(review_id,g.id,auth.uid(),g.session_version,(v->>'subject_id')::uuid,kxra_private.review_public_context(c,review_id,until_time,null,true),digest,until_time) returning * into r;
  end if;
  return kxra_private.review_public_context(c,r.id,r.expires_at,null,true);
 end if;
 -- Lock grant first (revocation linearizes), then immutable request and subject. Revocation never silently rewrites old decisions.
 select grant_id into prior_id from kxra_private.review_requests where id=(v->>'request_id')::uuid and reviewer_id=auth.uid();
 select * into g from kxra_private.review_operator_grants where id=prior_id for update;
 if not found or not kxra_private.review_operator_active(g.id,policy_sha) then raise insufficient_privilege;end if;
 select * into r from kxra_private.review_requests where id=(v->>'request_id')::uuid and grant_id=g.id and reviewer_id=auth.uid() and session_version=g.session_version for update;
 if not found then raise insufficient_privilege;end if;
 select * into receipt from kxra_private.review_operation_receipts where request_id=r.id;
 if action='VIEW' then
  perform kxra_private.review_authority_fence(g.id,case when g.kind='BUSINESS' then (select actor_id from kxra_private.business_declarations where id=r.subject_id) else (select actor_id from kxra_private.ai_connection_intents where id=r.subject_id) end,policy_sha);
  if (v-'request_id')<>'{}'::jsonb then raise exception 'Invalid review query';end if;
  if receipt.id is not null then return r.public_snapshot||jsonb_build_object('request_current',false,'can_decide',false,'can_withdraw',false,'receipt',receipt.result);end if;
  begin c=kxra_private.review_subject_context(g.id,r.subject_id);exception when insufficient_privilege then return r.public_snapshot||jsonb_build_object('request_current',false,'can_decide',false,'can_withdraw',false);end;
  return kxra_private.review_public_context(c,r.id,r.expires_at,null,r.expires_at>clock_timestamp() and r.context_sha256=encode(sha256(convert_to(c::text,'UTF8')),'hex'));
 end if;
 if (v-'request_id'-'operation_id'-'decision'-'attested')<>'{}'::jsonb or coalesce((v->>'attested')::boolean,false) is not true then raise exception 'Independent review attestation required';end if;
 cmd_digest=encode(sha256(convert_to(jsonb_build_object('action',action,'request_id',r.id,'decision',v->'decision','attested',v->'attested')::text,'UTF8')),'hex');
 if receipt.id is not null then
  perform kxra_private.review_authority_fence(g.id,case when g.kind='BUSINESS' then (select actor_id from kxra_private.business_declarations where id=r.subject_id) else (select actor_id from kxra_private.ai_connection_intents where id=r.subject_id) end,policy_sha);
  if receipt.id=(v->>'operation_id')::uuid and receipt.command_sha256=cmd_digest and receipt.reviewer_id=auth.uid() then return receipt.result;end if;
  raise exception 'Review request already completed';
 end if;
 if exists(select 1 from kxra_private.review_operation_receipts where id=(v->>'operation_id')::uuid) then raise exception 'Review operation conflicts';end if;
 if g.kind='BUSINESS' then perform 1 from kxra_private.business_declarations where id=r.subject_id for update;else perform 1 from kxra_private.ai_connection_intents where id=r.subject_id for update;end if;
 c=kxra_private.review_subject_context(g.id,r.subject_id);
 perform kxra_private.review_authority_fence(g.id,(c->>'subject_actor')::uuid,policy_sha);
 c=kxra_private.review_subject_context(g.id,r.subject_id);
 if r.expires_at<=clock_timestamp() or r.context_sha256 is distinct from encode(sha256(convert_to(c::text,'UTF8')),'hex') then raise exception 'Review request changed or expired';end if;
 decision=v->'decision';
 if jsonb_typeof(decision) is distinct from 'object' then raise exception 'Invalid review decision';end if;
 if not coalesce(kxra_private.review_operator_active(g.id,policy_sha),false) or r.expires_at<=clock_timestamp() then raise insufficient_privilege;end if;
 if action='WITHDRAW' then
  if not g.can_withdraw or decision is distinct from '{}'::jsonb then raise insufficient_privilege;end if;
  prior_id=(c#>>'{prior_review,id}')::uuid;
  if prior_id is null or (c#>>'{prior_review,withdrawn}')::boolean then raise exception 'No current review to withdraw';end if;
  if g.kind='BUSINESS' then update kxra_private.business_eligibility_reviews set withdrawn_at=clock_timestamp() where id=prior_id and org_id=g.target_org_id and withdrawn_at is null;else update kxra_private.ai_connection_reviews set withdrawn_at=clock_timestamp() where id=prior_id and intent_id=r.subject_id and withdrawn_at is null;end if;
  if not found then raise exception 'Review changed';end if;
  review_id=prior_id;state='WITHDRAWN';
 else
  if not coalesce((c->>'ready')::boolean,false) or jsonb_typeof(decision)<>'object' then raise exception 'Review prerequisites changed';end if;
  until_time=(decision->>'expires_at')::timestamptz;
  if until_time is null or until_time<=clock_timestamp() or until_time>least(g.valid_until,clock_timestamp()+g.max_valid_seconds*interval '1 second',(c#>>'{policy,expires_at}')::timestamptz) then raise exception 'Review validity exceeds authority';end if;
  if g.kind='BUSINESS' then
   if (select array_agg(k order by k) from jsonb_object_keys(decision) k) is distinct from array['expires_at','legal_evidence_sha256','legal_status','payment_evidence_sha256','payment_status','provider_evidence_sha256','provider_status','tax_evidence_sha256','tax_status']::text[] or (decision-'expires_at'-'legal_status'-'payment_status'-'provider_status'-'tax_status'-'legal_evidence_sha256'-'payment_evidence_sha256'-'provider_evidence_sha256'-'tax_evidence_sha256')<>'{}'::jsonb then raise exception 'Invalid business decision';end if;
   insert into kxra_private.business_eligibility_reviews(org_id,declaration_id,policy_id,scope_id,customer_id,offer_key,mapping_revision,terms_document_id,terms_document_version,terms_sha256,mapping_tax_sha256,legal_status,payment_status,provider_status,tax_status,legal_evidence_sha256,payment_evidence_sha256,provider_evidence_sha256,tax_evidence_sha256,expires_at,reviewer_reference)
   values(g.target_org_id,r.subject_id,g.policy_id,(c#>>'{binding,scope_id}')::uuid,c#>>'{binding,customer_id}',c#>>'{binding,offer_key}',(c#>>'{binding,mapping_revision}')::integer,(c#>>'{document,id}')::uuid,(c#>>'{document,version}')::integer,c#>>'{mapping,terms_review_sha256}',c#>>'{mapping,tax_review_sha256}',decision->>'legal_status',decision->>'payment_status',decision->>'provider_status',decision->>'tax_status',decision->>'legal_evidence_sha256',decision->>'payment_evidence_sha256',decision->>'provider_evidence_sha256',decision->>'tax_evidence_sha256',until_time,'review-operation:'||(v->>'operation_id')) returning id,business_eligibility_reviews.state into review_id,state;
  else
   if (select array_agg(k order by k) from jsonb_object_keys(decision) k) is distinct from array['account_mode','account_reference_sha256','expires_at','provider_evidence_sha256','state']::text[] or (decision-'expires_at'-'state'-'account_mode'-'account_reference_sha256'-'provider_evidence_sha256')<>'{}'::jsonb or (decision->>'state'='ELIGIBLE' and ((g.provider='GOOGLE' and decision->>'account_mode'<>'GOOGLE_PAID') or (g.provider<>'GOOGLE' and decision->>'account_mode'<>'CUSTOMER_BILLED'))) then raise exception 'Invalid AI decision';end if;
   insert into kxra_private.ai_connection_reviews(intent_id,state,account_mode,account_reference_sha256,provider_evidence_sha256,reviewer_reference,expires_at) values(r.subject_id,decision->>'state',decision->>'account_mode',decision->>'account_reference_sha256',decision->>'provider_evidence_sha256','review-operation:'||(v->>'operation_id'),until_time) returning id,ai_connection_reviews.state into review_id,state;
  end if;
 end if;
 result=jsonb_build_object('operation_id',(v->>'operation_id')::uuid,'request_id',r.id,'kind',g.kind,'subject_id',r.subject_id,'review_id',review_id,'state',state,'expires_at',until_time,'entitlement_authority',false,'provider_acceptance',false);
 insert into kxra_private.review_operation_receipts values((v->>'operation_id')::uuid,r.id,auth.uid(),cmd_digest,result,clock_timestamp());
 return result;
end $$;
revoke all on function kxra_private.review_operations_immutable(),kxra_private.review_policy_write_fence(),kxra_private.review_authority_fence(uuid,uuid,text),kxra_private.review_operator_active(uuid,text),kxra_private.review_subject_context(uuid,uuid),kxra_private.review_public_context(jsonb,uuid,timestamptz,jsonb,boolean) from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker;
revoke all on function kxra.review_operations(text,jsonb,text) from public,anon,kxra_billing_worker,kxra_ai_worker;
grant execute on function kxra.review_operations(text,jsonb,text) to authenticated;
commit;
