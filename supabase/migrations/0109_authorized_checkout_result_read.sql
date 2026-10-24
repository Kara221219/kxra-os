begin;
-- GET-only completed CHECKOUT recovery. No provider URL/secret storage, new role,
-- provider dispatch or entitlement writes. 0107 supplies immutable scoped engine.
create function kxra_private.checkout_result_context(i uuid,expected_mode text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 o uuid=kxra_private.requested_org();tag jsonb;attestation jsonb;sid uuid;
 r kxra_private.live_billing_intents;b kxra_private.live_billing_bindings;
 c kxra_private.live_billing_mappings;q kxra_private.live_paid_policies;
 payload jsonb;auth_at timestamptz;actor_generation jsonb;
begin
 if session_user<>'kxra_app' or o is null or auth.uid() is null then raise insufficient_privilege;end if;
 if expected_mode not in ('LIVE','STAGING_SANDBOX') then raise insufficient_privilege;end if;
 perform kxra_private.modern_billing_require_scope(expected_mode);
 tag=kxra_private.modern_billing_scope_tag();sid=(tag->>'scope_id')::uuid;
 attestation=kxra_private.modern_billing_scope_attestation();
 if not exists(select 1 from kxra.organisations organisation where organisation.id=o and organisation.state='ACTIVE' and organisation.organisation_kind='CUSTOMER') then raise insufficient_privilege;end if;
 if not coalesce(kxra_private.mfa_owner(o),false) then raise insufficient_privilege;end if;
 auth_at=to_timestamp((auth.jwt()->>'auth_time')::double precision);
 perform kxra_private.assert_live_customer_authority(o,auth.uid(),auth_at);
 select jsonb_build_object('membership_version',m.version,'membership_state',m.state,'account_session_version',a.session_version,'account_state',a.state,'email_verified_at',a.email_verified_at)
 into actor_generation from kxra.organisation_memberships m join kxra.account_identities a on a.account_id=m.account_id
 where m.org_id=o and m.account_id=auth.uid();
 -- The lock window ends with each query() transaction, before any provider GET.
 select * into b from kxra_private.live_billing_bindings where org_id=o and scope_id=sid for share;
 if not found or b.quarantined or b.subscription_id is not null then raise exception 'Checkout recovery unavailable';end if;
 select * into r from kxra_private.live_billing_intents where id=i and org_id=o and scope_id=sid for share;
 if not found or r.actor_id<>auth.uid() or r.kind<>'CHECKOUT' or r.state<>'CONSUMED'
 or r.provider_session_id is null or r.result_sha256 is null or r.result_sha256!~'^[a-f0-9]{64}$'
 or r.provider_session_id !~ (case when expected_mode='LIVE' then '^cs_live_[A-Za-z0-9_]{6,}$' else '^cs_test_[A-Za-z0-9_]{6,}$' end)
 or r.expires_at<=now() or r.created_at>now() or r.observed_version<>b.version
 or b.checkout_intent_id is distinct from r.id
 or (r.customer_id,r.offer_key,r.mapping_revision) is distinct from (b.customer_id,b.offer_key,b.mapping_revision)
 then raise exception 'Completed current checkout required';end if;
 select * into c from kxra_private.live_billing_mappings where scope_id=sid and offer_key=b.offer_key and revision=b.mapping_revision and enabled for share;
 if not found or c.account_id is distinct from tag->>'account_id' or c.terms_review_sha256<>r.terms_review_sha256
 or c.tax_review_sha256 is null then raise exception 'Reviewed checkout mapping required';end if;
 select * into q from kxra_private.live_paid_policies where scope_id=sid and offer_key=b.offer_key and mapping_revision=b.mapping_revision and enabled for share;
 if not found or q.terms_review_sha256<>c.terms_review_sha256 or q.tax_review_sha256<>c.tax_review_sha256
 or q.activation_review_sha256<>c.activation_review_sha256
 or not exists(select 1 from kxra.legal_documents d where d.id=q.terms_document_id and d.version=q.terms_document_version
  and d.content_sha256=q.terms_review_sha256 and d.status='APPROVED' and d.effective_at<=now()
  and d.owner_approval_reference is not null and d.owner_approved_at is not null)
 then raise exception 'Current approved checkout terms required';end if;
 if not exists(select 1 from kxra_private.live_billing_activation a where a.singleton and a.scope_id=sid and a.enabled and a.review_sha256=c.activation_review_sha256)
 then raise exception 'Checkout recovery disabled';end if;
 payload=jsonb_build_object('execution_scope',tag,'attestation',attestation,
  'intent',jsonb_build_object('id',r.id,'actor_id',r.actor_id,'org_id',r.org_id,'kind',r.kind,'state',r.state,
   'customer_id',r.customer_id,'provider_session_id',r.provider_session_id,'offer_key',r.offer_key,
   'mapping_revision',r.mapping_revision,'terms_review_sha256',r.terms_review_sha256,'observed_version',r.observed_version,
   'created_at',floor(extract(epoch from r.created_at))::bigint,'expires_at',floor(extract(epoch from r.expires_at))::bigint),
  'binding_version',b.version,'mapping',to_jsonb(c),
  'presentation',jsonb_build_object('terms_review_sha256',q.terms_review_sha256,'presentation_sha256',q.presentation_sha256,'terms_url',q.terms_url,'message',q.message));
 return payload||jsonb_build_object('generation_sha256',encode(sha256(convert_to(
  jsonb_build_object('scope',tag,'actor_generation',actor_generation,'intent',to_jsonb(r),'binding',to_jsonb(b),'mapping',to_jsonb(c),'policy',to_jsonb(q))::text,'UTF8')),'hex'));
end $$;
revoke all on function kxra_private.checkout_result_context(uuid,text) from public,anon,authenticated,kxra_billing_worker;

create function kxra_private.live_checkout_result_context(i uuid) returns jsonb
language sql security definer set search_path='' as $$ select kxra_private.checkout_result_context(i,'LIVE') $$;
create function kxra_private.staging_sandbox_checkout_result_context(i uuid) returns jsonb
language sql security definer set search_path='' as $$ select kxra_private.checkout_result_context(i,'STAGING_SANDBOX') $$;
create function kxra_private.checkout_result_current(i uuid,generation text,expected_mode text) returns boolean
language plpgsql security definer set search_path='' as $$
declare current_snapshot jsonb;
begin
 if generation is null or generation!~'^[a-f0-9]{64}$' then return false;end if;
 current_snapshot=kxra_private.checkout_result_context(i,expected_mode);
 return current_snapshot->>'generation_sha256'=generation;
end $$;
revoke all on function kxra_private.checkout_result_current(uuid,text,text) from public,anon,authenticated,kxra_billing_worker;
create function kxra_private.live_checkout_result_current(i uuid,generation text) returns boolean
language sql security definer set search_path='' as $$ select kxra_private.checkout_result_current(i,generation,'LIVE') $$;
create function kxra_private.staging_sandbox_checkout_result_current(i uuid,generation text) returns boolean
language sql security definer set search_path='' as $$ select kxra_private.checkout_result_current(i,generation,'STAGING_SANDBOX') $$;
revoke all on function kxra_private.live_checkout_result_context(uuid),kxra_private.staging_sandbox_checkout_result_context(uuid),
 kxra_private.live_checkout_result_current(uuid,text),kxra_private.staging_sandbox_checkout_result_current(uuid,text) from public,anon,kxra_billing_worker;
grant execute on function kxra_private.live_checkout_result_context(uuid),kxra_private.staging_sandbox_checkout_result_context(uuid),
 kxra_private.live_checkout_result_current(uuid,text),kxra_private.staging_sandbox_checkout_result_current(uuid,text) to authenticated;
commit;
