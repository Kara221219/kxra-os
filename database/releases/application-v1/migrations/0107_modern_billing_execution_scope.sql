begin;
-- Strict mode entrypoints wrap ONE shared modern engine per database. No legacy0098
-- algorithm is reused for modern sandbox acceptance; no false -> true provider rewriting.
-- New catalogue/scope remain disabled/unbound until separately approved operator setup.
alter table kxra_private.live_billing_mappings add unique(scope_id,offer_key,revision);
alter table kxra_private.live_billing_bindings add unique(scope_id,org_id);
alter table kxra_private.live_billing_intents add unique(scope_id,id);
alter table kxra_private.live_billing_event_receipts add unique(scope_id,event_id);
alter table kxra_private.live_customer_intents add unique(scope_id,id);
alter table kxra_private.live_paid_policies add unique(scope_id,id,revision);
alter table kxra_private.live_paid_read_jobs add unique(scope_id,id);
alter table kxra_private.live_paid_receipts add unique(scope_id,job_id);
alter table kxra_private.live_webhook_receipts add unique(scope_id,event_id);
alter table kxra_private.live_billing_bindings add constraint modern_lineage_1 foreign key(scope_id,offer_key,mapping_revision) references kxra_private.live_billing_mappings(scope_id,offer_key,revision);
alter table kxra_private.live_billing_bindings add constraint modern_lineage_2 foreign key(scope_id,checkout_intent_id) references kxra_private.live_billing_intents(scope_id,id);
alter table kxra_private.live_billing_intents add constraint modern_lineage_3 foreign key(scope_id,org_id) references kxra_private.live_billing_bindings(scope_id,org_id);
alter table kxra_private.live_billing_intents add constraint modern_lineage_4 foreign key(scope_id,offer_key,mapping_revision) references kxra_private.live_billing_mappings(scope_id,offer_key,revision);
alter table kxra_private.live_billing_event_receipts add constraint modern_lineage_5 foreign key(scope_id,org_id) references kxra_private.live_billing_bindings(scope_id,org_id);
alter table kxra_private.live_billing_event_conflicts add constraint modern_lineage_6 foreign key(scope_id,event_id) references kxra_private.live_billing_event_receipts(scope_id,event_id);
alter table kxra_private.live_billing_event_conflicts add constraint modern_lineage_7 foreign key(scope_id,org_id) references kxra_private.live_billing_bindings(scope_id,org_id);
alter table kxra_private.live_customer_intents add constraint modern_lineage_8 foreign key(scope_id,offer_key,mapping_revision) references kxra_private.live_billing_mappings(scope_id,offer_key,revision);
alter table kxra_private.live_customer_receipts add constraint modern_lineage_9 foreign key(scope_id,intent_id) references kxra_private.live_customer_intents(scope_id,id);
alter table kxra_private.live_customer_conflicts add constraint modern_lineage_10 foreign key(scope_id,intent_id) references kxra_private.live_customer_intents(scope_id,id);
alter table kxra_private.live_paid_policies add constraint modern_lineage_11 foreign key(scope_id,offer_key,mapping_revision) references kxra_private.live_billing_mappings(scope_id,offer_key,revision);
alter table kxra_private.live_paid_read_jobs add constraint modern_lineage_12 foreign key(scope_id,org_id) references kxra_private.live_billing_bindings(scope_id,org_id);
alter table kxra_private.live_paid_read_jobs add constraint modern_lineage_13 foreign key(scope_id,checkout_intent_id) references kxra_private.live_billing_intents(scope_id,id);
alter table kxra_private.live_paid_read_jobs add constraint modern_lineage_14 foreign key(scope_id,policy_id,policy_revision) references kxra_private.live_paid_policies(scope_id,id,revision);
alter table kxra_private.live_paid_receipts add constraint modern_lineage_15 foreign key(scope_id,job_id) references kxra_private.live_paid_read_jobs(scope_id,id);
alter table kxra_private.live_paid_conflicts add constraint modern_lineage_16 foreign key(scope_id,job_id) references kxra_private.live_paid_read_jobs(scope_id,id);
alter table kxra_private.live_paid_access add constraint modern_lineage_17 foreign key(scope_id,org_id) references kxra_private.live_billing_bindings(scope_id,org_id);
alter table kxra_private.live_paid_access add constraint modern_lineage_18 foreign key(scope_id,job_id) references kxra_private.live_paid_receipts(scope_id,job_id);
alter table kxra_private.live_paid_access add constraint modern_lineage_19 foreign key(scope_id,policy_id,policy_revision) references kxra_private.live_paid_policies(scope_id,id,revision);
alter table kxra_private.live_webhook_conflicts add constraint modern_lineage_20 foreign key(scope_id,event_id) references kxra_private.live_webhook_receipts(scope_id,event_id);
alter table kxra_private.live_webhook_queue add constraint modern_lineage_21 foreign key(scope_id,event_id) references kxra_private.live_webhook_receipts(scope_id,event_id);
alter table kxra_private.live_webhook_queue add constraint modern_lineage_22 foreign key(scope_id,org_id) references kxra_private.live_billing_bindings(scope_id,org_id);
alter table kxra_private.live_webhook_queue add constraint modern_lineage_23 foreign key(scope_id,acknowledged_job_id) references kxra_private.live_paid_read_jobs(scope_id,id);

-- Existing capability names are permanently LIVE; staging siblings are permanently sandbox.
revoke all on function kxra_private.modern_core_request_live_billing_intent(uuid,text,text) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.request_live_billing_intent(i uuid,k text,offer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 result=kxra_private.modern_core_request_live_billing_intent(i,k,offer);
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.request_live_billing_intent(uuid,text,text) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.request_live_billing_intent(uuid,text,text) to authenticated;
create function kxra_private.staging_sandbox_request_live_billing_intent(i uuid,k text,offer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 result=kxra_private.modern_core_request_live_billing_intent(i,k,offer);
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.staging_sandbox_request_live_billing_intent(uuid,text,text) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_request_live_billing_intent(uuid,text,text) to authenticated;

revoke all on function kxra_private.modern_core_current_live_billing_intent(uuid) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.current_live_billing_intent(i uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('LIVE');
 return kxra_private.modern_core_current_live_billing_intent(i);
end $$;
revoke all on function kxra_private.current_live_billing_intent(uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.current_live_billing_intent(uuid) to kxra_billing_worker;
create function kxra_private.staging_sandbox_current_live_billing_intent(i uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('STAGING_SANDBOX');
 return kxra_private.modern_core_current_live_billing_intent(i);
end $$;
revoke all on function kxra_private.staging_sandbox_current_live_billing_intent(uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_current_live_billing_intent(uuid) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_claim_live_billing_intent(uuid) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.claim_live_billing_intent(i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 result=kxra_private.modern_core_claim_live_billing_intent(i);
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.claim_live_billing_intent(uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.claim_live_billing_intent(uuid) to kxra_billing_worker;
create function kxra_private.staging_sandbox_claim_live_billing_intent(i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 result=kxra_private.modern_core_claim_live_billing_intent(i);
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.staging_sandbox_claim_live_billing_intent(uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_claim_live_billing_intent(uuid) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_finish_live_billing_intent(uuid,text,text,text) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.finish_live_billing_intent(i uuid,outcome text,sid text,result_hash text) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('LIVE');
 return kxra_private.modern_core_finish_live_billing_intent(i,outcome,sid,result_hash);
end $$;
revoke all on function kxra_private.finish_live_billing_intent(uuid,text,text,text) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.finish_live_billing_intent(uuid,text,text,text) to kxra_billing_worker;
create function kxra_private.staging_sandbox_finish_live_billing_intent(i uuid,outcome text,sid text,result_hash text) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('STAGING_SANDBOX');
 return kxra_private.modern_core_finish_live_billing_intent(i,outcome,sid,result_hash);
end $$;
revoke all on function kxra_private.staging_sandbox_finish_live_billing_intent(uuid,text,text,text) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_finish_live_billing_intent(uuid,text,text,text) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_record_live_billing_event(jsonb) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.record_live_billing_event(e jsonb) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 return kxra_private.modern_core_record_live_billing_event(e);
end $$;
revoke all on function kxra_private.record_live_billing_event(jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.record_live_billing_event(jsonb) to kxra_billing_worker;
create function kxra_private.staging_sandbox_record_live_billing_event(e jsonb) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 return kxra_private.modern_core_record_live_billing_event(e);
end $$;
revoke all on function kxra_private.staging_sandbox_record_live_billing_event(jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_record_live_billing_event(jsonb) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_request_live_customer_intent(uuid,text) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.request_live_customer_intent(i uuid,offer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 result=kxra_private.modern_core_request_live_customer_intent(i,offer);
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.request_live_customer_intent(uuid,text) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.request_live_customer_intent(uuid,text) to authenticated;
create function kxra_private.staging_sandbox_request_live_customer_intent(i uuid,offer text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 result=kxra_private.modern_core_request_live_customer_intent(i,offer);
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.staging_sandbox_request_live_customer_intent(uuid,text) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_request_live_customer_intent(uuid,text) to authenticated;

revoke all on function kxra_private.modern_core_claim_live_customer_intent(uuid) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.claim_live_customer_intent(i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 result=kxra_private.modern_core_claim_live_customer_intent(i);
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.claim_live_customer_intent(uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.claim_live_customer_intent(uuid) to kxra_billing_worker;
create function kxra_private.staging_sandbox_claim_live_customer_intent(i uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 result=kxra_private.modern_core_claim_live_customer_intent(i);
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.staging_sandbox_claim_live_customer_intent(uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_claim_live_customer_intent(uuid) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_live_customer_intent_current(uuid,integer) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.live_customer_intent_current(i uuid,expected integer) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('LIVE');
 return kxra_private.modern_core_live_customer_intent_current(i,expected);
end $$;
revoke all on function kxra_private.live_customer_intent_current(uuid,integer) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.live_customer_intent_current(uuid,integer) to kxra_billing_worker;
create function kxra_private.staging_sandbox_live_customer_intent_current(i uuid,expected integer) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('STAGING_SANDBOX');
 return kxra_private.modern_core_live_customer_intent_current(i,expected);
end $$;
revoke all on function kxra_private.staging_sandbox_live_customer_intent_current(uuid,integer) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_live_customer_intent_current(uuid,integer) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_finish_live_customer_intent(uuid,jsonb) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.finish_live_customer_intent(i uuid,e jsonb) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('LIVE');
 return kxra_private.modern_core_finish_live_customer_intent(i,e);
end $$;
revoke all on function kxra_private.finish_live_customer_intent(uuid,jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.finish_live_customer_intent(uuid,jsonb) to kxra_billing_worker;
create function kxra_private.staging_sandbox_finish_live_customer_intent(i uuid,e jsonb) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('STAGING_SANDBOX');
 return kxra_private.modern_core_finish_live_customer_intent(i,e);
end $$;
revoke all on function kxra_private.staging_sandbox_finish_live_customer_intent(uuid,jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_finish_live_customer_intent(uuid,jsonb) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_reserve_live_paid_read(uuid,uuid,integer,text,text,bigint,bigint) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.reserve_live_paid_read(i uuid,o uuid,gross integer,invoice text,item text,start_at bigint,end_at bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 result=kxra_private.modern_core_reserve_live_paid_read(i,o,gross,invoice,item,start_at,end_at);
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.reserve_live_paid_read(uuid,uuid,integer,text,text,bigint,bigint) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.reserve_live_paid_read(uuid,uuid,integer,text,text,bigint,bigint) to kxra_billing_worker;
create function kxra_private.staging_sandbox_reserve_live_paid_read(i uuid,o uuid,gross integer,invoice text,item text,start_at bigint,end_at bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 result=kxra_private.modern_core_reserve_live_paid_read(i,o,gross,invoice,item,start_at,end_at);
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.staging_sandbox_reserve_live_paid_read(uuid,uuid,integer,text,text,bigint,bigint) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_reserve_live_paid_read(uuid,uuid,integer,text,text,bigint,bigint) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_live_paid_read_current(uuid) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.live_paid_read_current(i uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('LIVE');
 return kxra_private.modern_core_live_paid_read_current(i);
end $$;
revoke all on function kxra_private.live_paid_read_current(uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.live_paid_read_current(uuid) to kxra_billing_worker;
create function kxra_private.staging_sandbox_live_paid_read_current(i uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('STAGING_SANDBOX');
 return kxra_private.modern_core_live_paid_read_current(i);
end $$;
revoke all on function kxra_private.staging_sandbox_live_paid_read_current(uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_live_paid_read_current(uuid) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_commit_live_paid_proof(uuid,jsonb) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.commit_live_paid_proof(i uuid,e jsonb) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('LIVE');
 return kxra_private.modern_core_commit_live_paid_proof(i,e);
end $$;
revoke all on function kxra_private.commit_live_paid_proof(uuid,jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.commit_live_paid_proof(uuid,jsonb) to kxra_billing_worker;
create function kxra_private.staging_sandbox_commit_live_paid_proof(i uuid,e jsonb) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_bound_scope('STAGING_SANDBOX');
 return kxra_private.modern_core_commit_live_paid_proof(i,e);
end $$;
revoke all on function kxra_private.staging_sandbox_commit_live_paid_proof(uuid,jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_commit_live_paid_proof(uuid,jsonb) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_live_paid_access_status() from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.live_paid_access_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_view_scope('LIVE');
 result=kxra_private.modern_core_live_paid_access_status();
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.live_paid_access_status() from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.live_paid_access_status() to authenticated;
create function kxra_private.staging_sandbox_live_paid_access_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_view_scope('STAGING_SANDBOX');
 result=kxra_private.modern_core_live_paid_access_status();
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.staging_sandbox_live_paid_access_status() from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_live_paid_access_status() to authenticated;

revoke all on function kxra_private.modern_core_own_live_billing_status() from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.own_live_billing_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_view_scope('LIVE');
 result=kxra_private.modern_core_own_live_billing_status();
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.own_live_billing_status() from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.own_live_billing_status() to authenticated;
create function kxra_private.staging_sandbox_own_live_billing_status() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform kxra_private.modern_billing_require_view_scope('STAGING_SANDBOX');
 result=kxra_private.modern_core_own_live_billing_status();
 return result||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag());
end $$;
revoke all on function kxra_private.staging_sandbox_own_live_billing_status() from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_own_live_billing_status() to authenticated;

revoke all on function kxra_private.modern_core_record_live_billing_wakeup(jsonb) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.record_live_billing_wakeup(e jsonb) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 return kxra_private.modern_core_record_live_billing_wakeup(e);
end $$;
revoke all on function kxra_private.record_live_billing_wakeup(jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.record_live_billing_wakeup(jsonb) to kxra_billing_worker;
create function kxra_private.staging_sandbox_record_live_billing_wakeup(e jsonb) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 return kxra_private.modern_core_record_live_billing_wakeup(e);
end $$;
revoke all on function kxra_private.staging_sandbox_record_live_billing_wakeup(jsonb) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_record_live_billing_wakeup(jsonb) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_list_unmatched_live_wakeups(integer) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.list_unmatched_live_wakeups(n integer) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 return query select value||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag()) from kxra_private.modern_core_list_unmatched_live_wakeups(n) as rows(value);
end $$;
revoke all on function kxra_private.list_unmatched_live_wakeups(integer) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.list_unmatched_live_wakeups(integer) to kxra_billing_worker;
create function kxra_private.staging_sandbox_list_unmatched_live_wakeups(n integer) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 return query select value||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag()) from kxra_private.modern_core_list_unmatched_live_wakeups(n) as rows(value);
end $$;
revoke all on function kxra_private.staging_sandbox_list_unmatched_live_wakeups(integer) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_list_unmatched_live_wakeups(integer) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_resolve_unmatched_live_wakeup(text,text) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.resolve_unmatched_live_wakeup(i text,verified_customer text) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 return kxra_private.modern_core_resolve_unmatched_live_wakeup(i,verified_customer);
end $$;
revoke all on function kxra_private.resolve_unmatched_live_wakeup(text,text) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.resolve_unmatched_live_wakeup(text,text) to kxra_billing_worker;
create function kxra_private.staging_sandbox_resolve_unmatched_live_wakeup(i text,verified_customer text) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 return kxra_private.modern_core_resolve_unmatched_live_wakeup(i,verified_customer);
end $$;
revoke all on function kxra_private.staging_sandbox_resolve_unmatched_live_wakeup(text,text) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_resolve_unmatched_live_wakeup(text,text) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_claim_live_billing_wakeups(integer) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.claim_live_billing_wakeups(n integer) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 return query select value||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag()) from kxra_private.modern_core_claim_live_billing_wakeups(n) as rows(value);
end $$;
revoke all on function kxra_private.claim_live_billing_wakeups(integer) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.claim_live_billing_wakeups(integer) to kxra_billing_worker;
create function kxra_private.staging_sandbox_claim_live_billing_wakeups(n integer) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 return query select value||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag()) from kxra_private.modern_core_claim_live_billing_wakeups(n) as rows(value);
end $$;
revoke all on function kxra_private.staging_sandbox_claim_live_billing_wakeups(integer) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_claim_live_billing_wakeups(integer) to kxra_billing_worker;

revoke all on function kxra_private.modern_core_ack_live_billing_wakeup(text,uuid,uuid) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.ack_live_billing_wakeup(i text,token uuid,job uuid) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 return kxra_private.modern_core_ack_live_billing_wakeup(i,token,job);
end $$;
revoke all on function kxra_private.ack_live_billing_wakeup(text,uuid,uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.ack_live_billing_wakeup(text,uuid,uuid) to kxra_billing_worker;
create function kxra_private.staging_sandbox_ack_live_billing_wakeup(i text,token uuid,job uuid) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 return kxra_private.modern_core_ack_live_billing_wakeup(i,token,job);
end $$;
revoke all on function kxra_private.staging_sandbox_ack_live_billing_wakeup(text,uuid,uuid) from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.staging_sandbox_ack_live_billing_wakeup(text,uuid,uuid) to kxra_billing_worker;

commit;
