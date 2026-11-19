begin;

alter table kxra.approvals drop constraint approvals_action_check;
alter table kxra.approvals add constraint approvals_action_check check(
 action in (
  'record.accept','membership.change','project.gate','account.lifecycle',
  'publish','external.message','spend','deploy','ai.high_cost'
 )
);
alter table kxra.approvals drop constraint approval_payload_shape;
alter table kxra.approvals add constraint approval_payload_shape check(
 case action
 when 'record.accept' then jsonb_typeof(payload->'record_id')='string' and payload ? 'record_id'
  and jsonb_typeof(payload->'version')='number' and payload ? 'version' and (payload->>'version')::numeric>0
 when 'membership.change' then project_id is not null and payload ?& array['user_id','role','active']
  and jsonb_typeof(payload->'user_id')='string' and payload->>'role' in ('viewer','contributor')
  and jsonb_typeof(payload->'active')='boolean'
 when 'project.gate' then project_id is not null and payload ?& array['gate','evidence_id','evidence_version']
  and jsonb_typeof(payload->'gate')='string' and jsonb_typeof(payload->'evidence_id')='string'
  and jsonb_typeof(payload->'evidence_version')='number' and (payload->>'evidence_version')::numeric>0
 when 'account.lifecycle' then project_id is null
  and payload ?& array['user_id','desired_state','expected_access_version','expected_session_version','before','reason']
  and jsonb_typeof(payload->'user_id')='string'
  and payload->>'desired_state' in ('ACTIVE','SUSPENDED','REVOKED')
  and jsonb_typeof(payload->'expected_access_version')='number'
  and jsonb_typeof(payload->'expected_session_version')='number'
  and jsonb_typeof(payload->'before')='object' and jsonb_typeof(payload->'reason')='string'
 else true end
);

create function kxra.request_account_lifecycle_approval(
 target uuid,desired_state text,reason text
) returns kxra.approvals
language plpgsql security definer set search_path='' as $$
declare
 o uuid=kxra_private.member_org();m kxra.members;p kxra.profiles;v kxra.approvals;
 env text;expiry timestamptz=now()+interval '24 hours';payload jsonb;
begin
 if not kxra_private.is_owner(o) or desired_state not in ('ACTIVE','SUSPENDED','REVOKED')
  or length(trim(reason)) not between 1 and 1000
 then raise exception 'Account action unavailable';end if;
 select * into m from kxra.members where id=target and org_id=o and role='partner' for update;
 select * into p from kxra.profiles where user_id=target and org_id=o for update;
 if m.id is null or p.user_id is null or p.account_state='REVOKED'
  or (desired_state='ACTIVE' and p.account_state<>'SUSPENDED')
  or (desired_state in ('SUSPENDED','REVOKED') and p.account_state not in ('ACTIVE','ONBOARDING'))
 then raise exception 'Account action unavailable';end if;
 payload=jsonb_build_object(
  'user_id',target,'desired_state',desired_state,'reason',trim(reason),
  'expected_access_version',m.access_version,'expected_session_version',p.session_version,
  'before',jsonb_build_object('account_state',p.account_state,'active',m.active,
   'onboarding_completed_at',p.onboarding_completed_at),
  'after',jsonb_build_object('account_state',case
    when desired_state='ACTIVE' and p.onboarding_completed_at is null then 'ONBOARDING'
    else desired_state end,'active',desired_state='ACTIVE')
 );
 select environment into env from kxra_private.deployment;
 insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,environment,expires_at)
 values(o,null,'account.lifecycle',payload,
  kxra_private.approval_digest('account.lifecycle',o,null,payload,env,auth.uid(),expiry),env,expiry)
 returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'approval.requested',v.id,jsonb_build_object('account_id',target,'desired_state',desired_state));
 return v;
end $$;

create function kxra.change_account_lifecycle(approval_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare
 v kxra.approvals;m kxra.members;p kxra.profiles;desired text;actual_state text;
 recipient text;queued uuid;event_name text;
begin
 select * into v from kxra.approvals where id=approval_id for update;
 perform kxra_private.check_approval(v,'approved');
 if v.action<>'account.lifecycle' then raise exception 'Wrong action';end if;
 select * into m from kxra.members where id=(v.payload->>'user_id')::uuid
  and org_id=v.org_id and role='partner' for update;
 select * into p from kxra.profiles where user_id=(v.payload->>'user_id')::uuid
  and org_id=v.org_id for update;
 if m.id is null or p.user_id is null
  or m.access_version is distinct from (v.payload->>'expected_access_version')::integer
  or p.session_version is distinct from (v.payload->>'expected_session_version')::integer
  or jsonb_build_object('account_state',p.account_state,'active',m.active,
   'onboarding_completed_at',p.onboarding_completed_at) is distinct from v.payload->'before'
 then raise exception 'Stale account approval';end if;
 desired=v.payload->>'desired_state';
 if desired='ACTIVE' and p.account_state<>'SUSPENDED' then raise exception 'Stale account approval';end if;
 if desired in ('SUSPENDED','REVOKED') and p.account_state not in ('ACTIVE','ONBOARDING')
 then raise exception 'Stale account approval';end if;
 actual_state=case when desired='ACTIVE' and p.onboarding_completed_at is null then 'ONBOARDING' else desired end;
 update kxra.profiles set account_state=actual_state,status_reason=case when desired='ACTIVE' then null else v.payload->>'reason' end,
  session_version=session_version+1,updated_at=now() where user_id=p.user_id;
 update kxra.members set active=desired='ACTIVE',access_version=access_version+1 where id=m.id;
 if desired in ('SUSPENDED','REVOKED') then
  update kxra.whatsapp_pairings set revoked_at=coalesce(revoked_at,now()) where user_id=m.id and revoked_at is null;
  update kxra.transactional_email_outbox set state='CANCELLED',updated_at=now()
  where user_id=m.id and state in ('PENDING','DELIVERY_FAILED');
 end if;
 insert into kxra.session_revocations(
  org_id,user_id,requested_by,reason,provider_state,completed_at
 ) values(v.org_id,m.id,auth.uid(),v.payload->>'reason','PROVIDER_PENDING',null);
 event_name=case desired when 'ACTIVE' then 'ACCOUNT_REACTIVATED'
  when 'SUSPENDED' then 'ACCOUNT_SUSPENDED' else 'ACCOUNT_REVOKED' end;
 insert into kxra.account_security_events(org_id,user_id,actor_id,event_type,metadata)
 values(v.org_id,m.id,auth.uid(),event_name,jsonb_build_object('approval_id',v.id,'account_state',actual_state));
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'account.lifecycle.changed',m.id,
  jsonb_build_object('approval_id',v.id,'account_state',actual_state));
 update kxra.approvals set state='executed',consumed_at=now() where id=v.id;

 select i.recipient_email into recipient from kxra.invitations i
 where i.redeemed_by=m.id and i.recipient_email is not null order by i.redeemed_at desc limit 1;
 if recipient is not null and desired in ('SUSPENDED','REVOKED') then
  queued=kxra_private.queue_email(v.org_id,null,m.id,'ACCESS_REMOVED',recipient,
   jsonb_build_object('user_id',m.id,'account_state',actual_state),
   'access-removed:'||v.id);
 end if;
end $$;

create function kxra.force_account_session_revoke(
 target uuid,reason text,provider_state text
) returns integer
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();p kxra.profiles;m kxra.members;new_version integer;
begin
 if not kxra_private.mfa_owner(o) or length(trim(reason)) not between 1 and 1000
  or provider_state not in ('LOCAL_APPLIED','PROVIDER_PENDING','PROVIDER_CONFIRMED','FAILED')
 then raise exception 'Session revocation unavailable';end if;
 select * into m from kxra.members where id=target and org_id=o and role='partner' for update;
 select * into p from kxra.profiles where user_id=target and org_id=o for update;
 if m.id is null or p.user_id is null or p.account_state='REVOKED'
 then raise exception 'Session revocation unavailable';end if;
 update kxra.profiles set session_version=session_version+1,updated_at=now()
 where user_id=p.user_id returning session_version into new_version;
 update kxra.members set access_version=access_version+1 where id=m.id;
 insert into kxra.session_revocations(org_id,user_id,requested_by,reason,provider_state,completed_at)
 values(o,m.id,auth.uid(),trim(reason),provider_state,
  case when provider_state in ('LOCAL_APPLIED','PROVIDER_CONFIRMED') then now() else null end);
 insert into kxra.account_security_events(org_id,user_id,actor_id,event_type,metadata)
 values(o,m.id,auth.uid(),'SESSIONS_REVOKED',jsonb_build_object('session_version',new_version));
 return new_version;
end $$;

create function kxra.owner_unpair_whatsapp(target uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();m kxra.members;
begin
 if not kxra_private.mfa_owner(o) then raise exception 'Pairing action unavailable';end if;
 select * into m from kxra.members where id=target and org_id=o and role='partner';
 if not found then raise exception 'Pairing action unavailable';end if;
 update kxra.whatsapp_pairings set revoked_at=coalesce(revoked_at,now())
 where user_id=target and org_id=o and revoked_at is null;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id)
 values(o,auth.uid(),'whatsapp.unpaired',target);
end $$;

revoke all on function
 kxra.request_account_lifecycle_approval(uuid,text,text),
 kxra.change_account_lifecycle(uuid),
 kxra.force_account_session_revoke(uuid,text,text),
 kxra.owner_unpair_whatsapp(uuid)
from public;
grant execute on function
 kxra.request_account_lifecycle_approval(uuid,text,text),
 kxra.change_account_lifecycle(uuid),
 kxra.force_account_session_revoke(uuid,text,text),
 kxra.owner_unpair_whatsapp(uuid)
to authenticated;

commit;
