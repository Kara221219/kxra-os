begin;

-- Discovery never reserves, consumes, resets or retries an intent. Existing100/102
-- once-only claims remain authoritative after discovery, including overlapping workers.
create index live_customer_dispatch_candidates on kxra_private.live_customer_intents(auth_time,created_at,id)
 where state='REQUESTED' and consumed_at is null;
create index live_checkout_dispatch_candidates on kxra_private.live_billing_intents(auth_time,created_at,id)
 where kind='CHECKOUT' and state='REQUESTED' and consumed_at is null;

create function kxra_private.modern_core_billing_dispatch_eligible(i uuid,action text,origin text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r kxra_private.live_customer_intents;s kxra_private.live_billing_intents;c kxra_private.live_billing_mappings;
 presentation jsonb;terms text;message text;digest text;canonical text;capacity integer;
begin
 begin
  if action='CUSTOMER' then
   select * into r from kxra_private.live_customer_intents where id=i;
   if not found or r.state<>'REQUESTED' or r.version<>1 or r.consumed_at is not null or r.expires_at<=now() or r.created_at>now()
   then return false;end if;
   perform kxra_private.assert_live_customer_authority(r.org_id,r.actor_id,r.auth_time);
   perform kxra_private.assert_fresh_live_customer_org(r.org_id);
   select * into c from kxra_private.live_billing_mappings where offer_key=r.offer_key and revision=r.mapping_revision and enabled;
   if not found or r.terms_review_sha256 is distinct from c.terms_review_sha256
   or (r.scope_id,r.execution_mode,r.scope_sha256) is distinct from (c.scope_id,c.execution_mode,c.scope_sha256)
   or not exists(select 1 from kxra_private.live_billing_activation where singleton and enabled and review_sha256=c.activation_review_sha256)
   or not exists(select 1 from kxra.organisations where id=r.org_id and organisation_kind='CUSTOMER' and state='ACTIVE')
   then return false;end if;
   select (value->>'people')::integer into capacity from jsonb_array_elements(kxra_private.approved_workspace_catalogue_v1()) value where value->>'offer_key'=c.offer_key;
   return coalesce(kxra_private.pilot_seats(r.org_id)<=capacity,false);
  elsif action='CHECKOUT' then
   select * into s from kxra_private.live_billing_intents where id=i;
   if not found or s.kind<>'CHECKOUT' or s.state<>'REQUESTED' or s.consumed_at is not null or s.expires_at<=now() or s.created_at>now()
   then return false;end if;
   --0111 applies original actor/current legal/MFA/mapping/binding/policy/document
   -- gates before LIMIT. It has no reservation/write side effects.
   presentation=kxra_private.modern_core_checkout_dispatch_presentation(i)->'presentation';
   terms=presentation->>'terms_url';message=presentation->>'message';digest=presentation->>'terms_review_sha256';
   if left(terms,length(origin)+1) is distinct from origin||'/' or terms~'[\r\n#<>]'
    or substring(terms from '[?&]sha256=([^&#]*)') is distinct from digest
    or strpos(message,']('||terms||')')=0 or message~'[<>\r]'
   then return false;end if;
   -- Match the JS reviewed presentation digest's field order/JSON escaping;
   -- malformed approved-policy data must not monopolize a dispatch batch.
   canonical='{"terms_review_sha256":'||to_json(digest)::text||',"terms_url":'||to_json(terms)::text||',"message":'||to_json(message)::text||'}';
   return coalesce(encode(sha256(convert_to(canonical,'UTF8')),'hex')=presentation->>'presentation_sha256',false);
  end if;
  return false;
 exception when insufficient_privilege or raise_exception then return false;
 end;
end $$;

create function kxra_private.modern_core_discover_billing_dispatch(n integer,origin text) returns setof jsonb
language plpgsql security definer set search_path='' as $$
declare tag jsonb=kxra_private.modern_billing_scope_tag();
begin
 if n is null or n not between 1 and 20 or origin is null then raise exception 'Invalid bounded dispatch request';end if;
 if (tag->>'execution_mode'='LIVE' and origin<>'https://app.kxra-group.com')
 or (tag->>'execution_mode'='STAGING_SANDBOX' and origin!~'^https://kxra-os-staging(-[a-z0-9-]+)?\.vercel\.app$')
 then raise exception 'Dispatch origin is not bound to its deployment';end if;
 perform kxra_private.live_billing_gate();
 return query select jsonb_build_object('request_id',c.id,'action',c.action) from(
  select r.id,'CUSTOMER'::text action,r.created_at from kxra_private.live_customer_intents r
   where r.state='REQUESTED' and r.consumed_at is null and r.expires_at>now() and r.auth_time>=now()-interval '15 minutes' and r.auth_time<=now()+interval '1 minute'
    and kxra_private.modern_core_billing_dispatch_eligible(r.id,'CUSTOMER',origin)
  union all
  select r.id,'CHECKOUT'::text action,r.created_at from kxra_private.live_billing_intents r
   where r.kind='CHECKOUT' and r.state='REQUESTED' and r.consumed_at is null and r.expires_at>now() and r.auth_time>=now()-interval '15 minutes' and r.auth_time<=now()+interval '1 minute'
    and kxra_private.modern_core_billing_dispatch_eligible(r.id,'CHECKOUT',origin)
 ) c order by c.created_at,c.action,c.id limit n;
end $$;
revoke all on function kxra_private.modern_core_billing_dispatch_eligible(uuid,text,text),kxra_private.modern_core_discover_billing_dispatch(integer,text)
 from public,anon,authenticated,kxra_billing_worker;

create function kxra_private.discover_billing_dispatch(n integer,origin text) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('LIVE');
 return query select value||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag())
  from kxra_private.modern_core_discover_billing_dispatch(n,origin) rows(value);
end $$;
create function kxra_private.staging_sandbox_discover_billing_dispatch(n integer,origin text) returns setof jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform kxra_private.modern_billing_require_scope('STAGING_SANDBOX');
 return query select value||jsonb_build_object('execution_scope',kxra_private.modern_billing_scope_tag())
  from kxra_private.modern_core_discover_billing_dispatch(n,origin) rows(value);
end $$;
revoke all on function kxra_private.discover_billing_dispatch(integer,text),kxra_private.staging_sandbox_discover_billing_dispatch(integer,text)
 from public,anon,authenticated,kxra_billing_worker;
grant execute on function kxra_private.discover_billing_dispatch(integer,text),kxra_private.staging_sandbox_discover_billing_dispatch(integer,text) to kxra_billing_worker;
commit;
