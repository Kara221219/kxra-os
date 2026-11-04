-- SYNTHETIC ONLY. Separate from integration migration/extension discovery.
begin;
create table kxra_private.github_binding_challenges(
 id uuid primary key default gen_random_uuid(),connection_id uuid not null references kxra_private.github_connections,
 grant_version integer not null,expires_at timestamptz not null default clock_timestamp()+interval '5 minutes',consumed boolean not null default false
);
create table kxra_private.github_vault_bindings(
 connection_id uuid not null references kxra_private.github_connections,grant_version integer not null,
 credential_ref text not null,org_id uuid not null,user_id uuid not null,session_version integer not null,
 binding jsonb not null,attestation_sha256 text not null,revoked boolean not null default false,
 primary key(connection_id,grant_version)
);
create table kxra_private.github_vault_leases(
 connection_id uuid not null,grant_version integer not null,scope text not null check(scope in ('issues:read','issues:write')),
 expires_at timestamptz not null,envelope jsonb not null,primary key(connection_id,grant_version,scope),
 foreign key(connection_id,grant_version) references kxra_private.github_vault_bindings
);
create table kxra_private.github_receipt_permits(
 token_sha256 text primary key,write_id uuid not null unique references kxra_private.github_writes,
 attempt_id uuid not null,digest text not null,expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
 revoked boolean not null default false,observations integer not null default 0 check(observations between 0 and 8)
);
alter table kxra_private.github_binding_challenges enable row level security;
alter table kxra_private.github_vault_bindings enable row level security;
alter table kxra_private.github_vault_leases enable row level security;
alter table kxra_private.github_receipt_permits enable row level security;
create policy github_challenge_deny on kxra_private.github_binding_challenges using(false);
create policy github_binding_deny on kxra_private.github_vault_bindings using(false);
create policy github_lease_deny on kxra_private.github_vault_leases using(false);
create policy github_permit_deny on kxra_private.github_receipt_permits using(false);
revoke all on kxra_private.github_binding_challenges,kxra_private.github_vault_bindings,kxra_private.github_vault_leases,kxra_private.github_receipt_permits from public,anon,authenticated;

create function kxra.github_vault_fixture(action text,input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c kxra_private.github_connections;ch kxra_private.github_binding_challenges;b kxra_private.github_vault_bindings;l kxra_private.github_vault_leases;a jsonb;keys text[];
begin
 if current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' or current_setting('request.kxra.connector_actor',true) is distinct from 'vault' then raise exception 'Synthetic vault unavailable' using errcode='42501';end if;
 keys=case action when 'begin' then array['connection_id','grant_version'] when 'confirm' then array['connection_id','grant_version','challenge_id','attestation'] when 'seal' then array['connection_id','grant_version','scope','expires_at','envelope'] when 'resolve' then array['connection_id','grant_version','scope'] when 'revoke' then array['connection_id','grant_version'] else null end;
 if input is null or jsonb_typeof(input)<>'object' or octet_length(input::text)>6000 or keys is null or (select count(*) from jsonb_object_keys(input))<>cardinality(keys) or exists(select 1 from jsonb_object_keys(input) k where not(k=any(keys))) then raise exception 'Invalid vault input';end if;
 select * into c from kxra_private.github_connections where id=(input->>'connection_id')::uuid and org_id=kxra_private.member_org() and user_id=auth.uid() for update;
 if not found or not kxra_private.github_authority(c) or c.grant_version is distinct from (input->>'grant_version')::integer or c.session_version is distinct from (auth.jwt()->>'session_version')::integer then raise exception 'Vault authority unavailable' using errcode='42501';end if;
 if action='begin' then
  insert into kxra_private.github_binding_challenges(connection_id,grant_version) values(c.id,c.grant_version) returning * into ch;
  return to_jsonb(ch)-'consumed';
 end if;
 if action='confirm' then
  select * into ch from kxra_private.github_binding_challenges where id=(input->>'challenge_id')::uuid and connection_id=c.id for update;
  if not found or ch.consumed or ch.expires_at<=clock_timestamp() or ch.grant_version<>c.grant_version then raise exception 'Binding challenge unavailable';end if;
  a=input->'attestation';
  if a is distinct from jsonb_build_object('mode','synthetic','challenge_id',ch.id,'connection_id',c.id,'org_id',c.org_id,'user_id',c.user_id,'session_version',c.session_version,'grant_version',c.grant_version,'binding',c.binding,'app_id',501,'client_id','fixture-client','repository_selection','selected','repository_ids',jsonb_build_array((c.binding->>'repository_id')::integer),'metadata','read','issues',case when c.allow_write then 'write' else 'read' end,'issue_id',505,'issue_is_pull_request',false,'verified_account_id',(c.binding->>'account_id')::integer,'verified_author_id',(c.binding->>'author_id')::integer) then raise exception 'Synthetic installation binding mismatch';end if;
  insert into kxra_private.github_vault_bindings(connection_id,grant_version,credential_ref,org_id,user_id,session_version,binding,attestation_sha256) values(c.id,c.grant_version,c.credential_ref,c.org_id,c.user_id,c.session_version,c.binding,encode(sha256(convert_to(a::text,'UTF8')),'hex'));
  update kxra_private.github_binding_challenges set consumed=true where id=ch.id;
  return jsonb_build_object('verified',true,'grant_version',c.grant_version);
 end if;
 select * into b from kxra_private.github_vault_bindings where connection_id=c.id and grant_version=c.grant_version for update;
 if not found or b.revoked or b.credential_ref is distinct from c.credential_ref or b.binding is distinct from c.binding or b.session_version<>c.session_version then raise exception 'Verified vault binding unavailable';end if;
 if action='revoke' then update kxra_private.github_vault_bindings set revoked=true where connection_id=c.id and grant_version=c.grant_version;return jsonb_build_object('revoked',true);end if;
 if input->>'scope' not in ('issues:read','issues:write') or (input->>'scope'='issues:write' and not c.allow_write) then raise exception 'Vault scope unavailable';end if;
 if action='seal' then
  if (input->>'expires_at')::timestamptz<=clock_timestamp() or (input->>'expires_at')::timestamptz>c.expires_at or jsonb_typeof(input->'envelope') is distinct from 'object'
   or (input->'envelope'->>'key_id') is distinct from 'synthetic-memory-key-v1'
   or coalesce(input->'envelope'->>'iv','')!~'^[A-Za-z0-9_-]{16}$' or coalesce(input->'envelope'->>'tag','')!~'^[A-Za-z0-9_-]{22}$' or (coalesce(input->'envelope'->>'ciphertext','')!~'^[A-Za-z0-9_-]+$' or length(input->'envelope'->>'ciphertext')>256)
   or (select count(*) from jsonb_object_keys(input->'envelope'))<>4 then raise exception 'Invalid synthetic envelope';end if;
  insert into kxra_private.github_vault_leases values(c.id,c.grant_version,input->>'scope',(input->>'expires_at')::timestamptz,input->'envelope');
  return jsonb_build_object('sealed',true,'grant_version',c.grant_version,'scope',input->>'scope');
 end if;
 select * into l from kxra_private.github_vault_leases where connection_id=c.id and grant_version=c.grant_version and scope=input->>'scope';
 if not found or l.expires_at<=clock_timestamp() or l.expires_at>c.expires_at then raise exception 'Synthetic lease unavailable';end if;
 return jsonb_build_object('reference',c.credential_ref,'version',c.grant_version,'scope',l.scope,'expires_at',l.expires_at,'envelope',l.envelope);
end $$;
revoke all on function kxra.github_vault_fixture(text,jsonb) from public,anon,authenticated;
grant execute on function kxra.github_vault_fixture(text,jsonb) to authenticated;

-- Atomically mint a receipt-only permit with the already-approved one-use claim.
-- The raw 256-bit token exists only in the caller's memory, never in SQL rows.
create function kxra.github_receipted_claim(input jsonb,token_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;w kxra_private.github_writes;
begin
 if not exists(select 1 from kxra.account_identities a where a.account_id=auth.uid() and a.state='ACTIVE' and a.session_version=(auth.jwt()->>'session_version')::integer) then raise exception 'Current session required' using errcode='42501';end if;
 if coalesce(token_hash,'')!~'^[a-f0-9]{64}$' then raise exception 'Invalid receipt permit';end if;
 result=kxra.github_connector('claim',input);
 if result->>'claimed'='true' then
  select * into w from kxra_private.github_writes where id=(result->'write'->>'id')::uuid;
  insert into kxra_private.github_receipt_permits(token_sha256,write_id,attempt_id,digest) values(token_hash,w.id,w.attempt_id,w.digest);
 end if;
 return result;
end $$;
revoke all on function kxra.github_receipted_claim(jsonb,text) from public,anon,authenticated;
grant execute on function kxra.github_receipted_claim(jsonb,text) to authenticated;

create schema kxra_github_receipt;
revoke all on schema kxra_github_receipt from public,anon,authenticated;
grant usage on schema kxra_github_receipt to authenticated;
create function kxra_github_receipt.publish(token text,attempt uuid,payload_digest text,outcome text,evidence jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p kxra_private.github_receipt_permits;w kxra_private.github_writes;h text;e_hash text;known boolean;
begin
 if current_setting('request.kxra.execution_mode',true) is distinct from 'fixture' or coalesce(token,'')!~'^[A-Za-z0-9_-]{43}$' then raise exception 'Receipt unavailable' using errcode='42501';end if;
 h=encode(sha256(convert_to(token,'UTF8')),'hex');
 select * into p from kxra_private.github_receipt_permits where token_sha256=h;
 if not found or p.revoked or p.expires_at<=clock_timestamp() or p.attempt_id is distinct from attempt or p.digest is distinct from payload_digest then raise exception 'Receipt unavailable' using errcode='42501';end if;
 -- Match the ordinary connection -> write lock order; no user/profile lookup or
 -- tenant-read/dispatch authority is granted by this receipt-only function.
 perform 1 from kxra_private.github_connections where id=(select connection_id from kxra_private.github_writes where id=p.write_id) for update;
 select * into w from kxra_private.github_writes where id=p.write_id for update;
 select * into p from kxra_private.github_receipt_permits where token_sha256=h for update;
 if p.revoked or p.expires_at<=clock_timestamp() or w.attempt_id is distinct from attempt or w.digest is distinct from payload_digest or w.digest is distinct from encode(sha256(convert_to(w.payload::text,'UTF8')),'hex') then raise exception 'Receipt unavailable' using errcode='42501';end if;
 if outcome is null or outcome not in ('ACCEPTED','REJECTED','NOT_EXECUTED','UNCERTAIN') or evidence is null or jsonb_typeof(evidence)<>'object' or octet_length(evidence::text)>1000 or exists(select 1 from jsonb_object_keys(evidence) k where k not in ('status','comment_id','body_sha256','author_id','issue_url','reason')) then raise exception 'Invalid receipt evidence';end if;
 if outcome='ACCEPTED' then
  if coalesce(evidence->>'comment_id','')!~'^[1-9][0-9]{0,15}$' or (evidence->>'comment_id')::numeric>9007199254740991 or evidence->>'body_sha256' is distinct from encode(sha256(convert_to(w.payload->>'body','UTF8')),'hex') or evidence->>'author_id' is distinct from w.payload->'binding'->>'author_id' or evidence->>'issue_url' is distinct from 'https://api.github.com/repos/'||(w.payload->'binding'->>'owner')||'/'||(w.payload->'binding'->>'repo')||'/issues/'||(w.payload->'binding'->>'issue_number') then raise exception 'Receipt evidence mismatch';end if;
 end if;
 e_hash=encode(sha256(convert_to(evidence::text,'UTF8')),'hex');
 select exists(select 1 from kxra_private.github_receipts where write_id=w.id and event=outcome and evidence_hash=e_hash) into known;
 if not known then
  if p.observations>=8 then raise exception 'Receipt observation budget exhausted';end if;
  if w.state not in ('DISPATCHING','UNCERTAIN') then raise exception 'Conflicting terminal receipt';end if;
  insert into kxra_private.github_receipts(write_id,attempt_id,event,evidence,evidence_hash) values(w.id,attempt,outcome,evidence,e_hash);
  update kxra_private.github_receipt_permits set observations=observations+1 where token_sha256=h;
  if outcome='ACCEPTED' then update kxra_private.github_writes set state='ACCEPTED',reason='RECEIPT_ONLY_ACCEPTED',provider_comment_id=(evidence->>'comment_id')::bigint where id=w.id;
  elsif outcome='REJECTED' and w.state='DISPATCHING' then update kxra_private.github_writes set state='REJECTED',reason='RECEIPT_ONLY_PROVIDER_REJECTED' where id=w.id;
  elsif outcome='NOT_EXECUTED' and w.state='DISPATCHING' then update kxra_private.github_writes set state='NOT_EXECUTED',reason='RECEIPT_ONLY_DEFINITE_NON_EXECUTION' where id=w.id;
  else update kxra_private.github_writes set state='UNCERTAIN',reason='RECEIPT_ONLY_UNCERTAIN' where id=w.id;end if;
 end if;
 -- Deliberately no payload, identity, binding, credential reference or read data.
 return jsonb_build_object('recorded',true,'state',(select state from kxra_private.github_writes where id=w.id));
end $$;
revoke all on function kxra_github_receipt.publish(text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function kxra_github_receipt.publish(text,uuid,text,text,jsonb) to authenticated;
commit;
