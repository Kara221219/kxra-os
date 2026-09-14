begin;

create table kxra.project_gate_policies(
 org_id uuid not null,
 project_id uuid not null,
 gate_code text not null check(gate_code in ('P002_LISTING','P003_FAITHFUL_DELIVERY','P005_LOCAL_PROTOTYPE')),
 policy_version integer not null default 1 check(policy_version>0),
 requirements jsonb not null check(jsonb_typeof(requirements)='array'),
 threshold_state text not null default 'proposed_unset' check(threshold_state='proposed_unset'),
 created_at timestamptz not null default now(),
 primary key(project_id,gate_code),
 foreign key(org_id,project_id) references kxra.projects(org_id,id)
);
insert into kxra.project_gate_policies(org_id,project_id,gate_code,requirements)
select org_id,id,
 case code
  when 'PROJECT-002' then 'P002_LISTING'
  when 'PROJECT-003' then 'P003_FAITHFUL_DELIVERY'
  when 'PROJECT-005' then 'P005_LOCAL_PROTOTYPE'
 end,
 case code
  when 'PROJECT-002' then '["exact SKU","fitment evidence","safety evidence"]'::jsonb
  when 'PROJECT-003' then '["rights confirmation","geometry QA"]'::jsonb
  when 'PROJECT-005' then '["specific buyer problem","reviewed demand evidence"]'::jsonb
 end
from kxra.projects where code in ('PROJECT-002','PROJECT-003','PROJECT-005');

create table kxra.project_gate_authorizations(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 gate_code text not null,
 evidence_id uuid not null,
 evidence_version integer not null,
 approval_id uuid not null unique references kxra.approvals,
 scope text not null default 'local_only' check(scope='local_only'),
 authorized_by uuid not null default auth.uid(),
 created_at timestamptz not null default now(),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(project_id,gate_code) references kxra.project_gate_policies(project_id,gate_code),
 foreign key(org_id,project_id,evidence_id) references kxra.records(org_id,project_id,id),
 foreign key(evidence_id,evidence_version) references kxra.record_versions(record_id,version),
 unique(project_id,gate_code,evidence_id,evidence_version)
);

alter table kxra.project_gate_policies enable row level security;
alter table kxra.project_gate_authorizations enable row level security;
grant select on kxra.project_gate_policies,kxra.project_gate_authorizations to authenticated,anon;
create policy gate_policy_read on kxra.project_gate_policies for select using(
 kxra_private.can_project(project_id)
);
create policy gate_authorization_read on kxra.project_gate_authorizations for select using(
 kxra_private.can_project(project_id)
);

create function kxra_private.gate_matches_project(project uuid,gate_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.projects p where p.id=project and (
   (p.code='PROJECT-002' and gate_name='P002_LISTING') or
   (p.code='PROJECT-003' and gate_name='P003_FAITHFUL_DELIVERY') or
   (p.code='PROJECT-005' and gate_name='P005_LOCAL_PROTOTYPE')
  )
 )
$$;
create function kxra_private.gate_claims_valid(gate_name text,claims jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(claims)='object' and case gate_name
  when 'P002_LISTING' then
   claims-array['exact_sku','fitment_verified','safety_evidence_verified']='{}'::jsonb and
   jsonb_typeof(claims->'exact_sku')='string' and length(trim(claims->>'exact_sku'))>0 and
   claims->'fitment_verified'='true'::jsonb and claims->'safety_evidence_verified'='true'::jsonb
  when 'P003_FAITHFUL_DELIVERY' then
   claims-array['rights_confirmed','geometry_qa_passed']='{}'::jsonb and
   claims->'rights_confirmed'='true'::jsonb and claims->'geometry_qa_passed'='true'::jsonb
  when 'P005_LOCAL_PROTOTYPE' then
   claims-array['buyer_problem','demand_reviewed']='{}'::jsonb and
   jsonb_typeof(claims->'buyer_problem')='string' and length(trim(claims->>'buyer_problem'))>0 and
   claims->'demand_reviewed'='true'::jsonb
  else false end
$$;

create function kxra.create_gate_evidence_packet(
 project uuid,gate_name text,title text,summary text,claims jsonb,evidence jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();new_id uuid;
 begin
 if not kxra_private.is_owner(o) or not kxra_private.can_project(project)
  or not kxra_private.gate_matches_project(project,gate_name)
  or not kxra_private.gate_claims_valid(gate_name,claims)
  or length(trim(title)) not between 1 and 240 or length(trim(summary))<1
 then raise exception 'Gate evidence unavailable';end if;
 perform kxra_private.require_evidence(o,project,evidence);
 insert into kxra.records(org_id,project_id,kind,title,body,data,classification,visibility,created_by)
 values(o,project,'note',title,summary,claims||jsonb_build_object('gate',gate_name),'USER-SUPPLIED INFORMATION','project_shared',auth.uid())
 returning id into new_id;
 perform kxra_private.add_evidence_links(o,project,new_id,1,'uses_evidence',evidence);
 return new_id;
 end $$;

alter table kxra.approvals drop constraint approvals_action_check;
alter table kxra.approvals add constraint approvals_action_check check(
 action in ('record.accept','membership.change','project.gate','publish','spend','deploy')
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
 else true end
);

create function kxra.request_project_gate_approval(project uuid,contents jsonb) returns kxra.approvals
language plpgsql security definer set search_path='' as $$
 declare o uuid=kxra_private.member_org();v kxra.approvals;e kxra.records;env text;
  expiry timestamptz=now()+interval '24 hours';payload jsonb=contents;policy_version integer;
 begin
 if not kxra_private.is_owner(o) or not kxra_private.can_project(project)
  or jsonb_typeof(contents)<>'object' or not(contents ?& array['gate','evidence_id','evidence_version'])
  or contents-array['gate','evidence_id','evidence_version']<>'{}'::jsonb
  or not kxra_private.gate_matches_project(project,contents->>'gate')
 then raise exception 'Gate approval unavailable';end if;
 select * into e from kxra.records where id=(contents->>'evidence_id')::uuid;
 if not found or e.org_id<>o or e.project_id<>project or e.status<>'accepted'
  or e.visibility<>'project_shared' or e.version is distinct from (contents->>'evidence_version')::integer
  or e.data->>'gate'<>contents->>'gate'
  or not kxra_private.gate_claims_valid(contents->>'gate',e.data-'gate')
 then raise exception 'Current accepted gate evidence required';end if;
 select gp.policy_version into policy_version from kxra.project_gate_policies gp
 where gp.project_id=project and gp.gate_code=contents->>'gate';
 payload=contents||jsonb_build_object('evidence_title',e.title,'policy_version',policy_version,'scope','local_only');
 select environment into env from kxra_private.deployment;
 insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,environment,expires_at)
 values(o,project,'project.gate',payload,kxra_private.approval_digest('project.gate',o,project,payload,env,auth.uid(),expiry),env,expiry)
 returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id)
 values(o,auth.uid(),'approval.requested',v.id);
 return v;
 end $$;

create function kxra.authorize_project_gate(a uuid) returns uuid
language plpgsql security definer set search_path='' as $$
 declare v kxra.approvals;e kxra.records;authorization_id uuid;policy_version integer;
 begin
 select * into v from kxra.approvals where id=a for update;
 perform kxra_private.check_approval(v,'approved');
 if v.action<>'project.gate' or not kxra_private.gate_matches_project(v.project_id,v.payload->>'gate')
 then raise exception 'Gate approval unavailable';end if;
 select * into e from kxra.records where id=(v.payload->>'evidence_id')::uuid for update;
 select gp.policy_version into policy_version from kxra.project_gate_policies gp
 where gp.project_id=v.project_id and gp.gate_code=v.payload->>'gate';
 if e.id is null or e.org_id<>v.org_id or e.project_id<>v.project_id or e.status<>'accepted'
  or e.visibility<>'project_shared' or e.version is distinct from (v.payload->>'evidence_version')::integer
  or e.data->>'gate'<>v.payload->>'gate' or policy_version is distinct from (v.payload->>'policy_version')::integer
  or not kxra_private.gate_claims_valid(v.payload->>'gate',e.data-'gate')
 then raise exception 'Gate evidence changed';end if;
 insert into kxra.project_gate_authorizations(org_id,project_id,gate_code,evidence_id,evidence_version,approval_id,authorized_by)
 values(v.org_id,v.project_id,v.payload->>'gate',e.id,e.version,v.id,auth.uid()) returning id into authorization_id;
 update kxra.approvals set state='executed',consumed_at=now() where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'project.gate.authorized',authorization_id,jsonb_build_object('gate',v.payload->>'gate','scope','local_only'));
 return authorization_id;
 end $$;

revoke all on all functions in schema kxra_private from public;
revoke all on function kxra.create_gate_evidence_packet(uuid,text,text,text,jsonb,jsonb),kxra.request_project_gate_approval(uuid,jsonb),kxra.authorize_project_gate(uuid) from public;
grant execute on function kxra.create_gate_evidence_packet(uuid,text,text,text,jsonb,jsonb),kxra.request_project_gate_approval(uuid,jsonb),kxra.authorize_project_gate(uuid) to authenticated;

commit;
