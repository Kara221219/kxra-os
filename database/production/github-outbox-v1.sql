-- Review-only production outbox boundary after genuine AI118/review119. No activation, connection or capability rows seeded.
begin;
create function kxra_private.ghp_object(v jsonb,keys text[]) returns text language sql immutable set search_path='' as $$
 select '{'||string_agg(to_json(k)::text||':'||(v->k)::text,',' order by ord)||'}' from unnest(keys)with ordinality t(k,ord)
$$;
create function kxra_private.ghp_sha(v text) returns text language sql immutable strict set search_path='' as $$select encode(sha256(convert_to(v,'UTF8')),'hex')$$;
create function kxra_private.ghp_iso(v timestamptz) returns text language sql immutable strict set search_path='' as $$select to_char(v at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')$$;
create function kxra_private.ghp_binding_valid(v jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text;n text;keys text[]=array['provider','api_version','org_id','user_id','connection_id','session_version','grant_version','credential_ref','credential_version','app_id','installation_id','account_id','repository_id','issue_id','issue_number','author_id','owner','repo','expires_at'];
begin
 if v is null or jsonb_typeof(v)<>'object' or (select count(*) from jsonb_object_keys(v))<>cardinality(keys) or exists(select 1 from unnest(keys)t where not(v?t)) then return false;end if;
 if v->>'provider'<>'github' or v->>'api_version'<>'2026-03-10' or coalesce(v->>'credential_ref','')!~'^vault:github:[A-Za-z0-9_:/-]{1,160}$' or coalesce(v->>'owner','')!~'^[A-Za-z0-9]([A-Za-z0-9-]{0,37}[A-Za-z0-9])?$' or coalesce(v->>'repo','')!~'^[A-Za-z0-9_.-]{1,100}$' or v->>'repo' in('.','..') then return false;end if;
 foreach k in array array['provider','api_version','org_id','user_id','connection_id','credential_ref','owner','repo','expires_at'] loop if jsonb_typeof(v->k)<>'string' then return false;end if;end loop;
 foreach k in array array['org_id','user_id','connection_id'] loop if v->>k is distinct from (v->>k)::uuid::text then return false;end if;end loop;
 foreach k in array array['session_version','grant_version','credential_version','app_id','installation_id','account_id','repository_id','issue_id','issue_number','author_id'] loop
  n=v->>k;if jsonb_typeof(v->k)<>'number' or n!~'^[1-9][0-9]{0,15}$' or n::numeric>9007199254740991 then return false;end if;
 end loop;
 return v->>'expires_at'=kxra_private.ghp_iso((v->>'expires_at')::timestamptz);
exception when others then return false;
end $$;
create function kxra_private.ghp_binding_hash(v jsonb) returns text language plpgsql immutable set search_path='' as $$
begin
 if not kxra_private.ghp_binding_valid(v) then raise exception 'Invalid connector binding';end if;
 return kxra_private.ghp_sha(kxra_private.ghp_object(v,array['provider','api_version','org_id','user_id','connection_id','session_version','grant_version','credential_ref','credential_version','app_id','installation_id','account_id','repository_id','issue_id','issue_number','author_id','owner','repo','expires_at']));
end $$;
create function kxra_private.ghp_operation_text(v jsonb) returns text language plpgsql immutable set search_path='' as $$
declare keys text[];
begin
 if v is null or jsonb_typeof(v)<>'object' then raise exception 'Invalid connector operation';end if;
 keys=case v->>'kind' when 'REPOSITORY' then array['kind'] when 'ISSUE' then array['kind'] when 'COMMENTS' then array['kind','page'] when 'COMMENT' then array['kind','write_id','body','approved_at','expires_at','attempt_id','approval_digest'] else null end;
 if keys is null or (select count(*) from jsonb_object_keys(v))<>cardinality(keys) or exists(select 1 from unnest(keys)t where not(v?t)) then raise exception 'Invalid connector operation';end if;
 if v->>'kind'='COMMENTS' and (jsonb_typeof(v->'page')<>'number' or v->>'page' not in('1','2','3')) then raise exception 'Invalid connector page';end if;
 return kxra_private.ghp_object(v,keys);
end $$;
create function kxra_private.ghp_operation_hash(binding_hash text,v jsonb) returns text language sql immutable set search_path='' as $$select kxra_private.ghp_sha('{"binding_sha256":'||to_json(binding_hash)::text||',"operation":'||kxra_private.ghp_operation_text(v)||'}')$$;
create function kxra_private.ghp_utf16(v text) returns integer language sql immutable strict set search_path='' as $$select coalesce(sum(case when ascii(substr(v,i,1))>65535 then 2 else 1 end),0)::integer from generate_series(1,length(v))i$$;

create table kxra_private.ghp_activations(id uuid primary key default gen_random_uuid(),enabled boolean not null default false,review_sha256 text not null check(review_sha256~'^[a-f0-9]{64}$'),owner_review_reference text not null check(length(owner_review_reference) between 1 and 160),valid_from timestamptz not null,valid_until timestamptz not null check(valid_until>valid_from),receipt_ttl_seconds integer not null check(receipt_ttl_seconds between 1 and 86400),revoked_at timestamptz);
create table kxra_private.ghp_connections(id uuid primary key,org_id uuid not null references kxra.organisations,user_id uuid not null references kxra.account_identities(account_id),activation_id uuid not null references kxra_private.ghp_activations,business_review_id uuid not null references kxra_private.business_eligibility_reviews,
 binding jsonb not null check(kxra_private.ghp_binding_valid(binding)),binding_sha256 text generated always as(kxra_private.ghp_binding_hash(binding))stored,
 allow_write boolean not null default false,revoked_at timestamptz,created_at timestamptz not null default clock_timestamp(),check((binding->>'connection_id')::uuid=id and (binding->>'org_id')::uuid=org_id and (binding->>'user_id')::uuid=user_id));
create index ghp_connection_owner on kxra_private.ghp_connections(org_id,user_id);create index ghp_connection_activation on kxra_private.ghp_connections(activation_id);create index ghp_connection_review on kxra_private.ghp_connections(business_review_id);create index ghp_connection_user on kxra_private.ghp_connections(user_id);
create table kxra_private.ghp_reads(id uuid primary key default gen_random_uuid(),connection_id uuid not null references kxra_private.ghp_connections,binding_sha256 text not null,evidence_sha256 text not null check(evidence_sha256~'^[a-f0-9]{64}$'),created_at timestamptz not null default clock_timestamp(),expires_at timestamptz not null,used_by uuid);
create index ghp_read_connection on kxra_private.ghp_reads(connection_id);
create table kxra_private.ghp_writes(id uuid primary key,connection_id uuid not null references kxra_private.ghp_connections,read_id uuid not null unique references kxra_private.ghp_reads,
 body text not null check(kxra_private.ghp_utf16(body) between 1 and 2100 and octet_length(body)<=8400),proposed_at timestamptz not null,expires_at timestamptz not null,proposal_digest text not null check(proposal_digest~'^[a-f0-9]{64}$'),
 state text not null default 'PENDING' check(state in('PENDING','APPROVED','QUEUED','DISPATCHING','UNCERTAIN','ACCEPTED','REJECTED','NOT_EXECUTED','CANCELLED')),
 approved_at timestamptz,approved_auth_time timestamptz,approved_by uuid references kxra.account_identities(account_id),approval_digest text,attempt_id uuid unique,cancel_requested boolean not null default false,provider_comment_id bigint,
 check(expires_at>proposed_at and expires_at<=proposed_at+interval '5 minutes'),check((approved_at is null)=(approval_digest is null)),check((approved_at is null)=(approved_auth_time is null)),check(approved_at is null or (approved_at>=proposed_at and approved_at<expires_at)),check(provider_comment_id is null or (provider_comment_id between 1 and 9007199254740991 and state='ACCEPTED')));
create index ghp_write_connection_state on kxra_private.ghp_writes(connection_id,state,proposed_at);create index ghp_write_approver on kxra_private.ghp_writes(approved_by);
create table kxra_private.ghp_attempts(id uuid primary key,write_id uuid not null unique references kxra_private.ghp_writes,worker_token_sha256 text not null,operation jsonb not null,operation_sha256 text not null check(operation_sha256~'^[a-f0-9]{64}$'),binding_sha256 text not null,created_at timestamptz not null default clock_timestamp());
alter table kxra_private.ghp_writes add foreign key(attempt_id) references kxra_private.ghp_attempts deferrable initially deferred;
alter table kxra_private.ghp_reads add foreign key(used_by) references kxra_private.ghp_writes deferrable initially deferred;
create index ghp_read_used on kxra_private.ghp_reads(used_by);
create table kxra_private.ghp_capabilities(token_sha256 text primary key check(token_sha256~'^[a-f0-9]{64}$'),purpose text not null check(purpose in('READ_WORKER','DISPATCH_WORKER','ATTEMPT_DISPATCH','ATTEMPT_RECEIPT')),
 connection_id uuid not null references kxra_private.ghp_connections,attempt_id uuid references kxra_private.ghp_attempts,session_version bigint not null check(session_version>0),grant_version bigint not null check(grant_version>0),valid_from timestamptz not null,expires_at timestamptz not null check(expires_at>valid_from),revoked_at timestamptz,owner_review_reference text not null check(length(owner_review_reference) between 1 and 160),check((purpose in('READ_WORKER','DISPATCH_WORKER'))=(attempt_id is null)));
alter table kxra_private.ghp_attempts add foreign key(worker_token_sha256) references kxra_private.ghp_capabilities deferrable initially deferred;
create index ghp_cap_connection on kxra_private.ghp_capabilities(connection_id);create index ghp_cap_attempt on kxra_private.ghp_capabilities(attempt_id);create index ghp_attempt_worker on kxra_private.ghp_attempts(worker_token_sha256);
create unique index ghp_cap_attempt_purpose on kxra_private.ghp_capabilities(attempt_id,purpose) where attempt_id is not null;
create table kxra_private.ghp_consumptions(attempt_id uuid primary key references kxra_private.ghp_attempts,binding_sha256 text not null,operation_sha256 text not null,consumed_at timestamptz not null default clock_timestamp());
create table kxra_private.ghp_receipts(id uuid primary key default gen_random_uuid(),attempt_id uuid not null references kxra_private.ghp_attempts,outcome text not null check(outcome in('ACCEPTED','REJECTED','NOT_EXECUTED','UNCERTAIN')),evidence jsonb not null,evidence_sha256 text not null,created_at timestamptz not null default clock_timestamp(),unique(attempt_id,outcome,evidence_sha256));
create table kxra_private.ghp_effects(repository_id bigint not null,issue_id bigint not null,comment_id bigint not null,attempt_id uuid not null unique references kxra_private.ghp_attempts,primary key(repository_id,issue_id,comment_id));

-- Deny direct DML and freeze history. Only the small checked entry points below can mutate lifecycle columns.
create function kxra_private.ghp_immutable() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if tg_table_name='ghp_connections' then if old.revoked_at is null and new.revoked_at is not null and (to_jsonb(new)-'revoked_at'-'binding_sha256')=(to_jsonb(old)-'revoked_at'-'binding_sha256') then return new;end if;
  elsif tg_table_name='ghp_capabilities' then if old.revoked_at is null and new.revoked_at is not null and (to_jsonb(new)-'revoked_at')=(to_jsonb(old)-'revoked_at') then return new;end if;
  elsif tg_table_name='ghp_activations' then if (to_jsonb(new)-'revoked_at'-'enabled')=(to_jsonb(old)-'revoked_at'-'enabled') and (new.enabled=old.enabled or (old.enabled and not new.enabled)) and (new.revoked_at is not distinct from old.revoked_at or(old.revoked_at is null and new.revoked_at is not null)) then return new;end if;
  elsif tg_table_name='ghp_reads' then if old.used_by is null and new.used_by is not null and (to_jsonb(new)-'used_by')=(to_jsonb(old)-'used_by') then return new;end if;
  elsif tg_table_name='ghp_writes' then
  if (to_jsonb(new)-'state'-'approved_at'-'approved_auth_time'-'approved_by'-'approval_digest'-'attempt_id'-'cancel_requested'-'provider_comment_id')=(to_jsonb(old)-'state'-'approved_at'-'approved_auth_time'-'approved_by'-'approval_digest'-'attempt_id'-'cancel_requested'-'provider_comment_id') and not(old.cancel_requested and not new.cancel_requested)
   and (old.state=new.state or (old.state='PENDING' and new.state in('APPROVED','CANCELLED')) or(old.state='APPROVED' and new.state in('QUEUED','CANCELLED')) or(old.state='QUEUED' and new.state in('DISPATCHING','CANCELLED')) or(old.state='DISPATCHING' and new.state in('UNCERTAIN','ACCEPTED','REJECTED','NOT_EXECUTED')) or(old.state='UNCERTAIN' and new.state='ACCEPTED'))
   and (old.approved_at is null or (new.approved_at,new.approved_auth_time,new.approved_by,new.approval_digest) is not distinct from(old.approved_at,old.approved_auth_time,old.approved_by,old.approval_digest)) and (old.attempt_id is null or new.attempt_id is not distinct from old.attempt_id) and (old.provider_comment_id is null or new.provider_comment_id is not distinct from old.provider_comment_id) then return new;end if;
  end if;
 end if;
 raise exception 'Connector history is immutable';
end $$;
do $$declare t text;begin foreach t in array array['ghp_activations','ghp_connections','ghp_capabilities','ghp_reads','ghp_writes','ghp_attempts','ghp_consumptions','ghp_receipts','ghp_effects'] loop
 execute format('alter table kxra_private.%I enable row level security',t);execute format('revoke all on kxra_private.%I from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker',t);execute format('create trigger ghp_immutable before update or delete on kxra_private.%I for each row execute function kxra_private.ghp_immutable()',t);
 end loop;end $$;

-- Common pre-statement writer fence protects authority rows and phantom requirements.
-- Independent key avoids upgrading existing review-operation shared locks. No policy/data changes.
create function kxra_private.ghp_authority_writer() returns trigger language plpgsql security definer set search_path='' as $$
begin perform pg_advisory_xact_lock(hashtextextended('kxra-ghp-authority-v1',0));return null;end $$;
do $$declare t text;begin foreach t in array array['kxra.account_identities','kxra.organisation_memberships','kxra.organisations','kxra.legal_documents','kxra.legal_document_requirements','kxra.legal_acceptances','kxra_private.live_billing_bindings','kxra_private.live_paid_access','kxra_private.live_paid_policies','kxra_private.live_billing_mappings','kxra_private.live_billing_activation','kxra_private.modern_billing_execution_identity','kxra_private.billing_admission_lanes','kxra_private.live_customer_intents','kxra_private.live_paid_receipts','kxra_private.business_eligibility_reviews','kxra_private.business_eligibility_policies'] loop
 execute format('create trigger ghp_authority_writer before insert or update or delete on %s for each statement execute function kxra_private.ghp_authority_writer()',t);
 end loop;end $$;

create function kxra_private.ghp_human(c kxra_private.ghp_connections) returns boolean language sql volatile security definer set search_path='' as $$
 select session_user='kxra_app' and auth.uid()=c.user_id and kxra_private.member_org()=c.org_id and coalesce(kxra_private.mfa_owner(c.org_id),false)
 and coalesce(current_setting('request.kxra.github_capability',true),'')='' and coalesce(current_setting('request.kxra.github_receipt',true),'')=''
 and coalesce(auth.jwt()->>'auth_time','')~'^[0-9]{1,12}$' and to_timestamp((auth.jwt()->>'auth_time')::double precision)>=clock_timestamp()-interval '15 minutes' and to_timestamp((auth.jwt()->>'auth_time')::double precision)<=clock_timestamp()+interval '1 minute'
 and exists(select 1 from kxra.account_identities a join kxra.organisation_memberships m on m.account_id=a.account_id and m.org_id=c.org_id join kxra.organisations o on o.id=m.org_id
 where a.account_id=c.user_id and a.state='ACTIVE' and a.email_verified_at is not null and a.session_version=(auth.jwt()->>'session_version')::bigint and m.state='ACTIVE' and m.revoked_at is null and m.starts_at<=clock_timestamp() and (m.expires_at is null or m.expires_at>clock_timestamp()) and m.security_role='ORG_ADMIN' and m.relationship_type='CUSTOMER' and o.state='ACTIVE' and o.organisation_kind='CUSTOMER')
$$;
create function kxra_private.ghp_fence(c kxra_private.ghp_connections,policy_sha text) returns void language plpgsql security definer set search_path='' as $$
declare a kxra_private.ghp_activations;r kxra_private.business_eligibility_reviews;
begin
 perform pg_advisory_xact_lock_shared(hashtextextended('kxra-ghp-authority-v1',0));
 select * into a from kxra_private.ghp_activations where id=c.activation_id for share;
 select * into r from kxra_private.business_eligibility_reviews where id=c.business_review_id;
 if c.revoked_at is not null or not a.enabled or a.revoked_at is not null or a.review_sha256 is distinct from policy_sha or a.valid_from>clock_timestamp() or a.valid_until<=clock_timestamp() or (c.binding->>'expires_at')::timestamptz<=clock_timestamp() then raise insufficient_privilege;end if;
 if not exists(select 1 from kxra.account_identities x join kxra.organisation_memberships m on m.account_id=x.account_id join kxra.organisations o on o.id=m.org_id where x.account_id=c.user_id and x.state='ACTIVE' and x.email_verified_at is not null and x.session_version=(c.binding->>'session_version')::bigint and m.org_id=c.org_id and m.security_role='ORG_ADMIN' and m.relationship_type='CUSTOMER' and m.state='ACTIVE' and m.revoked_at is null and m.starts_at<=clock_timestamp() and (m.expires_at is null or m.expires_at>clock_timestamp()) and o.state='ACTIVE' and o.organisation_kind='CUSTOMER') then raise insufficient_privilege;end if;
 if not coalesce(kxra_private.live_billing_legal_allowed(c.org_id,c.user_id),false) then raise insufficient_privilege;end if;
 if not coalesce(kxra_private.live_paid_entitled(c.org_id),false) or not exists(select 1 from kxra_private.live_paid_access p join kxra_private.live_paid_policies q on q.id=p.policy_id and q.revision=p.policy_revision where p.org_id=c.org_id and p.valid_until>clock_timestamp() and p.period_end>clock_timestamp() and p.period_start<=clock_timestamp() and p.checked_at>clock_timestamp()-make_interval(secs=>q.proof_ttl_seconds))
 or kxra_private.ai_business_review(c.org_id) is distinct from c.business_review_id or r.withdrawn_at is not null or r.expires_at<=clock_timestamp() or not exists(select 1 from kxra_private.business_eligibility_policies p where p.id=r.policy_id and p.enabled and p.expires_at>clock_timestamp()) then raise insufficient_privilege;end if;
end $$;
create function kxra_private.ghp_cap(channel text) returns kxra_private.ghp_capabilities language plpgsql security definer set search_path='' as $$
declare token text;c kxra_private.ghp_capabilities;
begin
 if session_user<>'kxra_app' or auth.uid() is not null or coalesce(current_setting('request.kxra.org_id',true),'')<>'' then raise insufficient_privilege;end if;
 if channel='worker' then if coalesce(current_setting('request.kxra.github_receipt',true),'')<>'' then raise insufficient_privilege;end if;token=current_setting('request.kxra.github_capability',true);
 elsif channel='receipt' then if coalesce(current_setting('request.kxra.github_capability',true),'')<>'' then raise insufficient_privilege;end if;token=current_setting('request.kxra.github_receipt',true);else raise insufficient_privilege;end if;
 if coalesce(token,'')!~'^[A-Za-z0-9_-]{43}$' then raise insufficient_privilege;end if;
 select * into c from kxra_private.ghp_capabilities where token_sha256=kxra_private.ghp_sha(token);
 if not found then raise insufficient_privilege;end if;return c;
end $$;
create function kxra_private.ghp_cap_current(k kxra_private.ghp_capabilities,c kxra_private.ghp_connections) returns boolean language sql volatile set search_path='' as $$select k.connection_id=c.id and k.revoked_at is null and k.valid_from<=clock_timestamp() and k.expires_at>clock_timestamp() and k.session_version=(c.binding->>'session_version')::bigint and k.grant_version=(c.binding->>'grant_version')::bigint$$;
create function kxra_private.ghp_approval_hash(c kxra_private.ghp_connections,w kxra_private.ghp_writes) returns text language sql stable set search_path='' as $$
 select kxra_private.ghp_sha(kxra_private.ghp_object(jsonb_build_object('binding_sha256',c.binding_sha256,'scope','issues:write','write_id',w.id,'body',w.body,'approved_at',kxra_private.ghp_iso(w.approved_at),'expires_at',kxra_private.ghp_iso(w.expires_at)),array['binding_sha256','scope','write_id','body','approved_at','expires_at']))
$$;
create function kxra_private.ghp_projection(c kxra_private.ghp_connections,w kxra_private.ghp_writes) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('write_id',w.id,'connection_id',c.id,'state',w.state,'body',w.body,'expires_at',kxra_private.ghp_iso(w.expires_at),'proposal_digest',w.proposal_digest,'approval_digest',w.approval_digest,'approved_at',kxra_private.ghp_iso(w.approved_at),'attempt_id',w.attempt_id,'cancel_requested',w.cancel_requested,'provider_comment_id',w.provider_comment_id,'target',c.binding-'org_id'-'user_id'-'connection_id'-'credential_ref'-'expires_at','consumed',exists(select 1 from kxra_private.ghp_consumptions where attempt_id=w.attempt_id))
$$;
create function kxra.github_prod_human(action text,v jsonb,policy_sha text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c kxra_private.ghp_connections;w kxra_private.ghp_writes;r kxra_private.ghp_reads;stamp timestamptz;until_at timestamptz;body text;digest text;keys text[];
begin
 keys=case action when 'PROPOSE' then array['connection_id','write_id','read_id','note'] when 'APPROVE' then array['connection_id','write_id','proposal_digest','attested'] when 'ENQUEUE' then array['connection_id','write_id','approval_digest'] when 'VIEW' then array['connection_id','write_id'] when 'CANCEL' then array['connection_id','write_id'] when 'RECOVER' then array['connection_id','write_id'] when 'REVOKE' then array['connection_id'] else null end;
 if keys is null or v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>16000 or (select count(*) from jsonb_object_keys(v))<>cardinality(keys) or exists(select 1 from unnest(keys)t where not(v?t)) then raise exception 'Invalid connector command';end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('kxra-ghp-authority-v1',0));
 select * into c from kxra_private.ghp_connections where id=(v->>'connection_id')::uuid and org_id=kxra_private.member_org() and user_id=auth.uid() for update;
 if not found then raise insufficient_privilege;end if;
 if action='PROPOSE' then
  select * into w from kxra_private.ghp_writes where id=(v->>'write_id')::uuid and connection_id=c.id for update;
 elsif action<>'REVOKE' then
  select * into w from kxra_private.ghp_writes where id=(v->>'write_id')::uuid and connection_id=c.id for update;if not found then raise insufficient_privilege;end if;
 end if;
 if action in('PROPOSE','APPROVE','ENQUEUE') then perform kxra_private.ghp_fence(c,policy_sha);end if;
 if not coalesce(kxra_private.ghp_human(c),false) then raise insufficient_privilege;end if;
 if action='VIEW' then return kxra_private.ghp_projection(c,w);end if;
 if action='REVOKE' then
  update kxra_private.ghp_connections set revoked_at=clock_timestamp() where id=c.id and revoked_at is null;
  update kxra_private.ghp_writes set state=case when state in('PENDING','APPROVED','QUEUED') then 'CANCELLED' else state end,cancel_requested=true where connection_id=c.id and state in('PENDING','APPROVED','QUEUED','DISPATCHING','UNCERTAIN');return jsonb_build_object('revoked',true);
 end if;
 if action='CANCEL' then
  if w.state in('PENDING','APPROVED','QUEUED','DISPATCHING','UNCERTAIN') then update kxra_private.ghp_writes set state=case when state in('PENDING','APPROVED','QUEUED') then 'CANCELLED' else state end,cancel_requested=true where id=w.id returning * into w;end if;return kxra_private.ghp_projection(c,w);
 end if;
 if action='RECOVER' then if w.state='DISPATCHING' then update kxra_private.ghp_writes set state='UNCERTAIN' where id=w.id returning * into w;end if;return kxra_private.ghp_projection(c,w);end if;
 if not c.allow_write then raise insufficient_privilege;end if;
 if action='PROPOSE' then
  if jsonb_typeof(v->'note')<>'string' or kxra_private.ghp_utf16(v->>'note') not between 1 and 2000 or length(trim(v->>'note'))=0 then raise exception 'Invalid connector note';end if;
  body=(v->>'note')||E'\n\n<!-- kxra-write:'||(v->>'write_id')::uuid::text||' -->';
  if w.id is not null then if w.connection_id is distinct from c.id or w.read_id is distinct from (v->>'read_id')::uuid or w.body is distinct from body then raise exception 'Conflicting connector proposal';end if;return kxra_private.ghp_projection(c,w);end if;
  select * into r from kxra_private.ghp_reads where id=(v->>'read_id')::uuid and connection_id=c.id for update;
  if not found or r.used_by is not null or r.expires_at<=clock_timestamp() or r.binding_sha256<>c.binding_sha256 then raise insufficient_privilege;end if;
  stamp=date_trunc('milliseconds',clock_timestamp());until_at=date_trunc('milliseconds',least(stamp+interval '5 minutes',r.expires_at,(c.binding->>'expires_at')::timestamptz));
  digest=kxra_private.ghp_sha(kxra_private.ghp_object(jsonb_build_object('binding_sha256',c.binding_sha256,'scope','issues:write','write_id',(v->>'write_id')::uuid,'read_id',r.id,'body',body,'expires_at',kxra_private.ghp_iso(until_at)),array['binding_sha256','scope','write_id','read_id','body','expires_at']));
  insert into kxra_private.ghp_writes(id,connection_id,read_id,body,proposed_at,expires_at,proposal_digest) values((v->>'write_id')::uuid,c.id,r.id,body,stamp,until_at,digest) returning * into w;update kxra_private.ghp_reads set used_by=w.id where id=r.id;return kxra_private.ghp_projection(c,w);
 end if;
 if w.expires_at<=clock_timestamp() or w.cancel_requested then raise insufficient_privilege;end if;
 if action='APPROVE' then
  if v->'attested' is distinct from 'true'::jsonb or w.proposal_digest is distinct from v->>'proposal_digest' then raise insufficient_privilege;end if;
  if w.state='APPROVED' then return kxra_private.ghp_projection(c,w);end if;if w.state<>'PENDING' then raise exception 'Connector proposal not pending';end if;
  w.approved_at=date_trunc('milliseconds',clock_timestamp());w.approved_auth_time=to_timestamp((auth.jwt()->>'auth_time')::double precision);w.approved_by=auth.uid();w.approval_digest=kxra_private.ghp_approval_hash(c,w);
  update kxra_private.ghp_writes set state='APPROVED',approved_at=w.approved_at,approved_auth_time=w.approved_auth_time,approved_by=w.approved_by,approval_digest=w.approval_digest where id=w.id returning * into w;
 elsif action='ENQUEUE' then
  if w.approval_digest is distinct from v->>'approval_digest' then raise insufficient_privilege;end if;
  if w.state='APPROVED' then update kxra_private.ghp_writes set state='QUEUED' where id=w.id returning * into w;elsif w.state<>'QUEUED' then raise exception 'Connector write cannot be enqueued';end if;
 end if;
 return kxra_private.ghp_projection(c,w);
end $$;

create function kxra.github_prod_worker(action text,v jsonb,policy_sha text) returns jsonb language plpgsql security definer set search_path='' as $$
declare k kxra_private.ghp_capabilities;worker kxra_private.ghp_capabilities;c kxra_private.ghp_connections;w kxra_private.ghp_writes;a kxra_private.ghp_attempts;r kxra_private.ghp_reads;act kxra_private.ghp_activations;op jsonb;bh text;oh text;keys text[];stamp timestamptz;
begin
 keys=case action when 'READ_CONTEXT' then array[]::text[] when 'RECORD_READ' then array['evidence_sha256'] when 'CLAIM' then array['write_id','attempt_id','dispatch_sha256','receipt_sha256'] when 'CURRENT' then array['binding_sha256','operation','operation_sha256'] when 'CONSUME' then array['binding_sha256','operation','operation_sha256'] else null end;
 if keys is null or v is null or jsonb_typeof(v)<>'object' or octet_length(v::text)>20000 or (select count(*) from jsonb_object_keys(v))<>cardinality(keys) or exists(select 1 from unnest(keys)t where not(v?t)) then raise exception 'Invalid connector worker command';end if;
 k=kxra_private.ghp_cap('worker');
 if (action in('READ_CONTEXT','RECORD_READ') and k.purpose<>'READ_WORKER') or(action='CLAIM' and k.purpose<>'DISPATCH_WORKER') or(action='CURRENT' and k.purpose not in('READ_WORKER','ATTEMPT_DISPATCH')) or(action='CONSUME' and k.purpose<>'ATTEMPT_DISPATCH') then raise insufficient_privilege;end if;
 perform pg_advisory_xact_lock_shared(hashtextextended('kxra-ghp-authority-v1',0));
 select * into c from kxra_private.ghp_connections where id=k.connection_id for update;if not found then raise insufficient_privilege;end if;
 if action='CLAIM' then select * into w from kxra_private.ghp_writes where id=(v->>'write_id')::uuid and connection_id=c.id for update;if not found then raise insufficient_privilege;end if;
 elsif k.attempt_id is not null then select * into a from kxra_private.ghp_attempts where id=k.attempt_id;select * into w from kxra_private.ghp_writes where id=a.write_id for update;select * into a from kxra_private.ghp_attempts where id=k.attempt_id for update;end if;
 perform token_sha256 from kxra_private.ghp_capabilities where token_sha256=k.token_sha256 or token_sha256=a.worker_token_sha256 order by token_sha256 for share;
 select * into k from kxra_private.ghp_capabilities where token_sha256=k.token_sha256;
 if not coalesce(kxra_private.ghp_cap_current(k,c),false) then raise insufficient_privilege;end if;
 perform kxra_private.ghp_fence(c,policy_sha);
 -- Recheck deadlines after every authority lock wait.
 if not coalesce(kxra_private.ghp_cap_current(k,c),false) then raise insufficient_privilege;end if;
 if action in('READ_CONTEXT','RECORD_READ') then
  if k.purpose<>'READ_WORKER' then raise insufficient_privilege;end if;
  if action='READ_CONTEXT' then return jsonb_build_object('binding',c.binding,'binding_sha256',c.binding_sha256);end if;
  if coalesce(v->>'evidence_sha256','')!~'^[a-f0-9]{64}$' then raise exception 'Invalid read evidence';end if;
  insert into kxra_private.ghp_reads(connection_id,binding_sha256,evidence_sha256,expires_at) values(c.id,c.binding_sha256,v->>'evidence_sha256',least(clock_timestamp()+interval '5 minutes',k.expires_at,(c.binding->>'expires_at')::timestamptz)) returning * into r;
  return jsonb_build_object('read_id',r.id,'binding_sha256',r.binding_sha256,'expires_at',kxra_private.ghp_iso(r.expires_at));
 end if;
 if action='CLAIM' then
  if k.purpose<>'DISPATCH_WORKER' or not c.allow_write then raise insufficient_privilege;end if;
  if w.state<>'QUEUED' then return jsonb_build_object('claimed',false,'write_id',w.id,'state',w.state);end if;
  if w.cancel_requested or w.expires_at<=clock_timestamp() or w.approved_at is null or w.approved_auth_time<clock_timestamp()-interval '15 minutes' or w.approved_auth_time>clock_timestamp()+interval '1 minute' or w.approved_by<>c.user_id or w.approval_digest is distinct from kxra_private.ghp_approval_hash(c,w) then raise insufficient_privilege;end if;
  if coalesce(v->>'dispatch_sha256','')!~'^[a-f0-9]{64}$' or coalesce(v->>'receipt_sha256','')!~'^[a-f0-9]{64}$' or v->>'dispatch_sha256'=v->>'receipt_sha256' then raise exception 'Invalid attempt capabilities';end if;
  op=jsonb_build_object('kind','COMMENT','write_id',w.id,'body',w.body,'approved_at',kxra_private.ghp_iso(w.approved_at),'expires_at',kxra_private.ghp_iso(w.expires_at),'attempt_id',(v->>'attempt_id')::uuid,'approval_digest',w.approval_digest);oh=kxra_private.ghp_operation_hash(c.binding_sha256,op);
  insert into kxra_private.ghp_attempts(id,write_id,worker_token_sha256,operation,operation_sha256,binding_sha256) values((v->>'attempt_id')::uuid,w.id,k.token_sha256,op,oh,c.binding_sha256) returning * into a;
  select * into act from kxra_private.ghp_activations where id=c.activation_id;
  stamp=clock_timestamp();
  insert into kxra_private.ghp_capabilities(token_sha256,purpose,connection_id,attempt_id,session_version,grant_version,valid_from,expires_at,owner_review_reference) values
   (v->>'dispatch_sha256','ATTEMPT_DISPATCH',c.id,a.id,k.session_version,k.grant_version,stamp,least(w.expires_at,k.expires_at,act.valid_until),'attempt:'||a.id),
   (v->>'receipt_sha256','ATTEMPT_RECEIPT',c.id,a.id,k.session_version,k.grant_version,stamp,stamp+make_interval(secs=>act.receipt_ttl_seconds),'receipt:'||a.id);
  update kxra_private.ghp_writes set state='DISPATCHING',attempt_id=a.id where id=w.id;
  return jsonb_build_object('claimed',true,'binding',c.binding,'operation',op,'operation_sha256',oh);
 end if;
 op=v->'operation';bh=c.binding_sha256;oh=kxra_private.ghp_operation_hash(bh,op);
 if bh is distinct from v->>'binding_sha256' or oh is distinct from v->>'operation_sha256' then raise insufficient_privilege;end if;
 if k.purpose='READ_WORKER' and action='CURRENT' and op->>'kind' in('REPOSITORY','ISSUE','COMMENTS') then return jsonb_build_object('state','ACTIVE','binding_sha256',bh,'operation_sha256',oh);end if;
 if k.purpose<>'ATTEMPT_DISPATCH' or a.id is null or w.state<>'DISPATCHING' or w.cancel_requested or w.expires_at<=clock_timestamp() or w.approved_auth_time<clock_timestamp()-interval '15 minutes' or w.approved_auth_time>clock_timestamp()+interval '1 minute' or w.approval_digest is distinct from kxra_private.ghp_approval_hash(c,w) then raise insufficient_privilege;end if;
 select * into worker from kxra_private.ghp_capabilities where token_sha256=a.worker_token_sha256;
 if worker.purpose<>'DISPATCH_WORKER' or not coalesce(kxra_private.ghp_cap_current(worker,c),false) then raise insufficient_privilege;end if;
 if op->>'kind'='COMMENT' then
  if not c.allow_write or op is distinct from a.operation or oh is distinct from a.operation_sha256 or a.binding_sha256<>bh then raise insufficient_privilege;end if;
  if action='CONSUME' then
   insert into kxra_private.ghp_consumptions(attempt_id,binding_sha256,operation_sha256) values(a.id,bh,oh) on conflict do nothing;
   if not found then raise exception 'Attempt already consumed' using errcode='42501';end if;
   return jsonb_build_object('consumed',true,'binding_sha256',bh,'operation_sha256',oh,'write_id',w.id,'attempt_id',a.id);
  end if;
  return jsonb_build_object('state','DISPATCHING','binding_sha256',bh,'operation_sha256',oh,'write_id',w.id,'attempt_id',a.id);
 end if;
 if action<>'CURRENT' or op->>'kind' not in('REPOSITORY','ISSUE','COMMENTS') then raise insufficient_privilege;end if;
 return jsonb_build_object('state','ACTIVE','binding_sha256',bh,'operation_sha256',oh);
end $$;

create function kxra.github_prod_receipt(attempt uuid,operation_sha text,outcome text,evidence jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare k kxra_private.ghp_capabilities;c kxra_private.ghp_connections;w kxra_private.ghp_writes;a kxra_private.ghp_attempts;h text;v_comment_id bigint;known boolean;keys text[];
begin
 k=kxra_private.ghp_cap('receipt');if k.purpose<>'ATTEMPT_RECEIPT' or k.attempt_id is distinct from attempt then raise insufficient_privilege;end if;
 select * into c from kxra_private.ghp_connections where id=k.connection_id for update;
 select * into a from kxra_private.ghp_attempts where id=attempt;select * into w from kxra_private.ghp_writes where id=a.write_id for update;select * into a from kxra_private.ghp_attempts where id=attempt for update;
 select * into k from kxra_private.ghp_capabilities where token_sha256=k.token_sha256 for update;
 if k.revoked_at is not null or k.valid_from>clock_timestamp() or k.expires_at<=clock_timestamp() or a.operation_sha256 is distinct from operation_sha or a.binding_sha256 is distinct from c.binding_sha256 or not exists(select 1 from kxra_private.ghp_consumptions where attempt_id=a.id and operation_sha256=a.operation_sha256 and binding_sha256=a.binding_sha256) then raise insufficient_privilege;end if;
 if outcome is null or outcome not in('ACCEPTED','REJECTED','UNCERTAIN','NOT_EXECUTED') or evidence is null or jsonb_typeof(evidence)<>'object' or octet_length(evidence::text)>1000 then raise exception 'Invalid historical receipt';end if;
 keys=case outcome when 'ACCEPTED' then array['reason','status','comment_id','body_sha256','author_id','issue_id'] when 'REJECTED' then array['reason','status'] else array['reason'] end;
 if (select count(*) from jsonb_object_keys(evidence))<>cardinality(keys) or exists(select 1 from unnest(keys)t where not(evidence?t)) then raise exception 'Invalid historical evidence';end if;
 if jsonb_typeof(evidence->'reason')<>'string' then raise exception 'Invalid receipt reason';end if;
 if outcome='ACCEPTED' then
  if jsonb_typeof(evidence->'status')<>'number' or jsonb_typeof(evidence->'comment_id')<>'number' or jsonb_typeof(evidence->'author_id')<>'number' or jsonb_typeof(evidence->'issue_id')<>'number' or jsonb_typeof(evidence->'body_sha256')<>'string' then raise exception 'Invalid receipt field types';end if;
  if (evidence->>'reason'='MATCHING_ACKNOWLEDGEMENT' and evidence->>'status'='201') or(evidence->>'reason'='MATCHING_RECONCILIATION' and evidence->>'status'='200') then null;else raise exception 'Invalid acknowledgement status';end if;
  if coalesce(evidence->>'comment_id','')!~'^[1-9][0-9]{0,15}$' or (evidence->>'comment_id')::numeric>9007199254740991 or evidence->>'body_sha256' is distinct from kxra_private.ghp_sha(w.body) or evidence->>'author_id' is distinct from c.binding->>'author_id' or evidence->>'issue_id' is distinct from c.binding->>'issue_id' then raise exception 'Historical evidence mismatch';end if;v_comment_id=(evidence->>'comment_id')::bigint;
 elsif outcome='REJECTED' then
  if jsonb_typeof(evidence->'status')<>'number' or evidence->>'reason'<>'PROVIDER_REJECTED' or evidence->>'status' not in('401','403','404','410','422','429') then raise exception 'Invalid rejection';end if;
 elsif outcome='UNCERTAIN' then if evidence->>'reason'<>'RESPONSE_UNCONFIRMED' then raise exception 'Invalid uncertainty';end if;
 else if evidence->>'reason'<>'AUTHORITY_OR_PREFLIGHT_UNAVAILABLE' then raise exception 'Invalid nonexecution';end if;end if;
 h=kxra_private.ghp_sha(evidence::text);
 select exists(select 1 from kxra_private.ghp_receipts where attempt_id=a.id and ghp_receipts.outcome=github_prod_receipt.outcome and evidence_sha256=h) into known;
 if known then return jsonb_build_object('recorded',true,'state',w.state,'duplicate',true);end if;
 if (select count(*) from kxra_private.ghp_receipts where attempt_id=a.id)>=8 then raise exception 'Receipt observation budget exhausted';end if;
 if w.state='ACCEPTED' then if outcome<>'ACCEPTED' or w.provider_comment_id is distinct from v_comment_id then raise exception 'Conflicting terminal receipt';end if;
 elsif w.state not in('DISPATCHING','UNCERTAIN') or(w.state='UNCERTAIN' and outcome not in('UNCERTAIN','ACCEPTED')) then raise exception 'Conflicting historical receipt';end if;
 if outcome='ACCEPTED' then
  insert into kxra_private.ghp_effects(repository_id,issue_id,comment_id,attempt_id) values((c.binding->>'repository_id')::bigint,(c.binding->>'issue_id')::bigint,v_comment_id,a.id) on conflict do nothing;
  if not exists(select 1 from kxra_private.ghp_effects e where e.repository_id=(c.binding->>'repository_id')::bigint and e.issue_id=(c.binding->>'issue_id')::bigint and e.comment_id=v_comment_id and e.attempt_id=a.id) then raise exception 'Provider effect already attributed';end if;
 end if;
 insert into kxra_private.ghp_receipts(attempt_id,outcome,evidence,evidence_sha256) values(a.id,outcome,evidence,h);
 update kxra_private.ghp_writes set state=case outcome when 'ACCEPTED' then 'ACCEPTED' when 'REJECTED' then 'REJECTED' when 'NOT_EXECUTED' then 'NOT_EXECUTED' else 'UNCERTAIN' end,provider_comment_id=case when outcome='ACCEPTED' then v_comment_id else provider_comment_id end where id=w.id;
 return jsonb_build_object('recorded',true,'state',outcome,'duplicate',false);
end $$;
-- Every helper is private. No direct table/sequence, setup or policy provisioning grants.
do $$declare r record;begin for r in select p.oid::regprocedure name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kxra_private' and p.proname like 'ghp\_%' escape '\' loop execute format('revoke all on function %s from public,anon,authenticated,kxra_billing_worker,kxra_ai_worker',r.name);end loop;end $$;
revoke all on function kxra.github_prod_human(text,jsonb,text),kxra.github_prod_worker(text,jsonb,text),kxra.github_prod_receipt(uuid,text,text,jsonb) from public,anon,kxra_billing_worker,kxra_ai_worker;
grant execute on function kxra.github_prod_human(text,jsonb,text),kxra.github_prod_worker(text,jsonb,text),kxra.github_prod_receipt(uuid,text,text,jsonb) to authenticated;
commit;
