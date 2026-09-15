begin;

-- RLS policy expressions must be callable by the querying role. The helper is
-- security-definer and returns only a boolean scoped to auth.uid().
grant execute on function kxra_private.can_view_idea(uuid) to authenticated,anon;

-- Registration and invitation events can be emitted before an identity is a
-- KXRA member. Preserve the actor UUID as provenance without requiring a
-- membership row to exist at event time.
alter table kxra.work_log_entries
 drop constraint work_log_entries_org_id_actor_id_fkey;

-- Parenthesise JSON extraction before text concatenation. PostgreSQL otherwise
-- associates the JSON operator with the concatenated text expression.
create or replace function kxra.request_project_gate_approval(project uuid,contents jsonb)
returns kxra.approvals language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();v kxra.approvals;e kxra.records;env text;
 expiry timestamptz=now()+interval '24 hours';payload jsonb;policy_version integer;
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
 payload=kxra_private.approval_envelope(
  contents||jsonb_build_object('evidence_title',e.title,'policy_version',policy_version,'scope','local_only'),
  'Authorize local project gate '||(contents->>'gate'),
  jsonb_build_object('authorized',false,'gate',contents->>'gate','policy_version',policy_version),
  jsonb_build_object('authorized',true,'gate',contents->>'gate','policy_version',policy_version,
   'evidence_id',e.id,'evidence_version',e.version),null,
  'A gate authorization may advance local work, but does not deploy, publish, spend, trade or message externally.'
 );
 select environment into env from kxra_private.deployment;
 insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,environment,expires_at)
 values(o,project,'project.gate',payload,
  kxra_private.approval_digest('project.gate',o,project,payload,env,auth.uid(),expiry),env,expiry)
 returning * into v;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'approval.requested',v.id,jsonb_build_object('action','project.gate','project_id',project));
 return v;
end $$;

commit;
