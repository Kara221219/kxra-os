begin;

alter table kxra.budget_policies
 add column current_reserved_input_tokens bigint not null default 0 check(current_reserved_input_tokens>=0),
 add column current_reserved_output_tokens bigint not null default 0 check(current_reserved_output_tokens>=0),
 add constraint budget_input_token_reservations_within_cap
  check(current_reserved_input_tokens+consumed_input_tokens<=max_input_tokens),
 add constraint budget_output_token_reservations_within_cap
  check(current_reserved_output_tokens+consumed_output_tokens<=max_output_tokens);

create function kxra_private.agent_run_authority_current(requested_run uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1
  from kxra.agent_runs r
  join kxra.account_identities a on a.account_id=r.initiated_by and a.state='ACTIVE'
  join kxra.organisations o on o.id=r.org_id and o.state='ACTIVE'
  join kxra.organisation_memberships m on m.id=r.membership_id and m.org_id=r.org_id
   and m.account_id=r.initiated_by and m.state='ACTIVE' and m.revoked_at is null
   and m.version=r.membership_version and m.starts_at<=now()
   and (m.expires_at is null or m.expires_at>now())
  where r.id=requested_run
   and not exists(
    select 1 from kxra.legal_document_requirements requirement
    join kxra.legal_documents document on document.org_id=requirement.org_id
     and document.id=requirement.document_id and document.version=requirement.document_version
     and document.content_sha256=requirement.document_sha256 and document.status='APPROVED'
    where requirement.org_id=r.org_id and requirement.state='ACTIVE' and requirement.mandatory
     and (requirement.membership_id is null or requirement.membership_id=m.id)
     and (requirement.relationship_type is null or requirement.relationship_type=m.relationship_type)
     and not exists(
      select 1 from kxra.legal_acceptances acceptance
      where acceptance.account_id=r.initiated_by and acceptance.membership_id=m.id
       and acceptance.requirement_id=requirement.id and acceptance.document_id=requirement.document_id
       and acceptance.document_version=requirement.document_version
       and acceptance.document_sha256=requirement.document_sha256 and acceptance.response='ACCEPTED'
     )
   )
   and (
    r.project_id is null or m.security_role in ('KXRA_OWNER','ORG_ADMIN') or exists(
     select 1 from kxra.project_memberships pm
     where pm.org_id=r.org_id and pm.project_id=r.project_id and pm.user_id=r.initiated_by
      and pm.active and (pm.expires_at is null or pm.expires_at>now())
    )
   )
 )
$$;

create function kxra.begin_agent_run(
 p_project uuid,
 p_request uuid,
 p_agent_code text,
 p_agent_version integer,
 p_skill_code text,
 p_skill_version integer,
 p_model_policy_code text,
 p_model_policy_version integer,
 p_budget_policy_code text,
 p_budget_policy_version integer,
 p_input_sha256 text,
 p_evidence_references jsonb,
 p_reserved_cost_minor bigint,
 p_reserved_input_tokens integer,
 p_reserved_output_tokens integer,
 p_origin text default 'ASK',
 p_parent_run uuid default null
) returns table(
 run_id uuid,
 reservation_id uuid,
 evidence_envelope_id uuid,
 provider text,
 model text,
 allowed_tools text[],
 evidence_items jsonb
) language plpgsql security definer set search_path='' as $$
declare
 selected_org uuid=kxra_private.member_org();
 membership kxra.organisation_memberships;
 agent kxra.agent_manifests;
 agent_version kxra.agent_manifest_versions;
 skill kxra.skill_manifests;
 skill_version kxra.skill_manifest_versions;
 model_policy kxra.model_policies;
 budget kxra.budget_policies;
 existing kxra.agent_runs;
 parent kxra.agent_runs;
 created_run uuid;
 created_reservation uuid;
 created_envelope uuid;
 tools text[];
 item jsonb;
 source_kind text;
 source_identifier uuid;
 source_version integer;
 source_hash text;
 source_record uuid;
 source_file uuid;
 source_classification kxra.classification;
 source_audience text;
 source_ordinal integer;
 envelope_hash text;
 item_json jsonb;
 depth integer=0;
begin
 if p_request is null or p_project is null or p_input_sha256!~'^[a-f0-9]{64}$'
  or jsonb_typeof(p_evidence_references)<>'array'
  or jsonb_array_length(p_evidence_references)>50
  or p_reserved_cost_minor<0 or p_reserved_input_tokens<0 or p_reserved_output_tokens<0
  or p_origin not in ('ASK','MANUAL','ROUTINE','WHATSAPP','SYSTEM')
 then raise exception 'Agent run request unavailable';end if;
 if selected_org is null or not kxra_private.can_project(p_project,false)
 then raise exception 'Agent run request unavailable';end if;
 select * into membership from kxra.organisation_memberships m
 where m.account_id=auth.uid() and m.org_id=selected_org and m.state='ACTIVE'
  and m.revoked_at is null and m.starts_at<=now()
  and (m.expires_at is null or m.expires_at>now());
 if not found then raise exception 'Agent run request unavailable';end if;

 select * into agent from kxra.agent_manifests manifest
 where manifest.org_id=selected_org and manifest.code=p_agent_code;
 select * into agent_version from kxra.agent_manifest_versions manifest_version
 where manifest_version.org_id=selected_org and manifest_version.agent_id=agent.id
  and manifest_version.version=p_agent_version
  and manifest_version.status in ('APPROVED','AUTOMATED','MONITORED');
 select * into skill from kxra.skill_manifests manifest
 where manifest.org_id=selected_org and manifest.code=p_skill_code and manifest.owner_agent_id=agent.id;
 select * into skill_version from kxra.skill_manifest_versions manifest_version
 where manifest_version.org_id=selected_org and manifest_version.skill_id=skill.id
  and manifest_version.version=p_skill_version
  and manifest_version.status in ('APPROVED','AUTOMATED','MONITORED');
 select * into model_policy from kxra.model_policies policy
 where policy.org_id=selected_org and policy.code=p_model_policy_code
  and policy.version=p_model_policy_version and policy.status='APPROVED';
 if agent.id is null or agent_version.id is null or skill.id is null or skill_version.id is null
  or model_policy.id is null
  or agent_version.model_policy_code<>model_policy.code
  or agent_version.model_policy_version<>model_policy.version
  or p_reserved_input_tokens>model_policy.max_input_tokens
  or p_reserved_output_tokens>model_policy.max_output_tokens
 then raise exception 'Agent configuration unavailable';end if;

 select coalesce(array_agg(binding.tool_code order by binding.tool_code),'{}'::text[])
 into tools from kxra.skill_tool_bindings binding
 where binding.org_id=selected_org and binding.skill_id=skill.id
  and binding.skill_version=skill_version.version and not binding.requires_approval;
 if not ('model.generate.structured'=any(tools))
 then raise exception 'Agent tool configuration unavailable';end if;
 if membership.security_role not in ('KXRA_OWNER','KXRA_STAFF','ORG_ADMIN')
  and model_policy.model<>'gpt-5.6-sol'
 then raise exception 'MODEL_ESCALATION_NOT_AUTHORIZED';end if;
 if model_policy.model='gpt-6-astra' and (
  not model_policy.escalation_required
  or not kxra_private.has_capability(selected_org,'ai.astra_escalate')
 ) then raise exception 'MODEL_ESCALATION_NOT_AUTHORIZED';end if;
 if model_policy.provider<>'FAKE' and p_reserved_cost_minor=0
 then raise exception 'PAID_BUDGET_REQUIRED';end if;

 if p_parent_run is not null then
  select * into parent from kxra.agent_runs candidate where candidate.id=p_parent_run;
  if not found or parent.org_id<>selected_org or parent.project_id is distinct from p_project
   or parent.initiated_by<>auth.uid() or parent.state not in ('RUNNING','WAITING_APPROVAL')
  then raise exception 'Delegation parent unavailable';end if;
  depth=parent.delegation_depth+1;
  if depth>agent_version.max_delegation_depth or depth>2 or exists(
   with recursive ancestry as (
    select candidate.id,candidate.parent_run_id,candidate.agent_id from kxra.agent_runs candidate where candidate.id=p_parent_run
    union all
    select ancestor.id,ancestor.parent_run_id,ancestor.agent_id
    from kxra.agent_runs ancestor join ancestry child on child.parent_run_id=ancestor.id
   ) select 1 from ancestry where agent_id=agent.id
  ) then raise exception 'Delegation boundary exceeded';end if;
 end if;

 select * into existing from kxra.agent_runs candidate
 where candidate.initiated_by=auth.uid() and candidate.request_id=p_request;
 if found then
  if existing.org_id<>selected_org or existing.project_id is distinct from p_project
   or existing.agent_id<>agent.id or existing.agent_version<>agent_version.version
   or existing.skill_id<>skill.id or existing.skill_version<>skill_version.version
   or existing.model_policy_id<>model_policy.id or existing.input_sha256<>p_input_sha256
  then raise exception 'Agent request id already used';end if;
  return query
   select existing.id,reservation.id,envelope.id,existing.provider,existing.model,
    existing.authorized_tools,
    coalesce((select jsonb_agg(jsonb_build_object(
     'id',evidence.id,'source_type',evidence.source_type,'source_id',evidence.source_id,
     'source_version',evidence.source_version,'source_sha256',evidence.source_sha256
    ) order by evidence.source_type,evidence.source_id)
    from kxra.evidence_envelope_items evidence where evidence.envelope_id=envelope.id),'[]'::jsonb)
   from kxra.budget_reservations reservation
   join kxra.evidence_envelopes envelope on envelope.run_id=existing.id
   where reservation.run_id=existing.id order by reservation.cycle desc limit 1;
  return;
 end if;

 select * into budget from kxra.budget_policies policy
 where policy.org_id=selected_org and policy.code=p_budget_policy_code
  and policy.version=p_budget_policy_version and policy.state='APPROVED'
  and policy.starts_at<=now() and (policy.ends_at is null or policy.ends_at>now())
  and (policy.project_id is null or policy.project_id=p_project)
 for update;
 if not found
  or budget.current_reserved_minor+p_reserved_cost_minor>budget.max_reserved_minor
  or budget.current_reserved_minor+budget.current_spend_minor+p_reserved_cost_minor>budget.max_spend_minor
  or budget.current_reserved_runs+budget.current_completed_runs+1>budget.max_runs
  or budget.current_reserved_input_tokens+budget.consumed_input_tokens+p_reserved_input_tokens>budget.max_input_tokens
  or budget.current_reserved_output_tokens+budget.consumed_output_tokens+p_reserved_output_tokens>budget.max_output_tokens
 then raise exception 'BUDGET_UNAVAILABLE';end if;

 insert into kxra.agent_runs(
  request_id,org_id,project_id,initiated_by,membership_id,membership_version,
  agent_id,agent_version,skill_id,skill_version,model_policy_id,model_policy_version,
  budget_policy_id,budget_policy_version,provider,model,origin,parent_run_id,
  delegation_depth,input_sha256,authorized_tools,state
 ) values(
  p_request,selected_org,p_project,auth.uid(),membership.id,membership.version,
  agent.id,agent_version.version,skill.id,skill_version.version,model_policy.id,model_policy.version,
  budget.id,budget.version,model_policy.provider,model_policy.model,p_origin,p_parent_run,
  depth,p_input_sha256,tools,'AUTHORIZED'
 ) returning id into created_run;
 insert into kxra.budget_reservations(
  org_id,project_id,run_id,policy_id,policy_version,cycle,reserved_cost_minor,
  reserved_input_tokens,reserved_output_tokens,state
 ) values(
  selected_org,p_project,created_run,budget.id,budget.version,1,p_reserved_cost_minor,
  p_reserved_input_tokens,p_reserved_output_tokens,'RESERVED'
 ) returning id into created_reservation;
 update kxra.budget_policies set
  current_reserved_minor=current_reserved_minor+p_reserved_cost_minor,
  current_reserved_runs=current_reserved_runs+1,
  current_reserved_input_tokens=current_reserved_input_tokens+p_reserved_input_tokens,
  current_reserved_output_tokens=current_reserved_output_tokens+p_reserved_output_tokens
 where id=budget.id;
 insert into kxra.evidence_envelopes(
  org_id,project_id,run_id,initiated_by,membership_id,membership_version,query_sha256
 ) values(
  selected_org,p_project,created_run,auth.uid(),membership.id,membership.version,p_input_sha256
 ) returning id into created_envelope;

 for item in select value from jsonb_array_elements(p_evidence_references) loop
  source_kind=coalesce(item->>'source_type',item->>'type');
  begin
   source_identifier=(item->>'id')::uuid;
   source_version=(item->>'version')::integer;
  exception when others then
   raise exception 'Invalid evidence reference';
  end;
  source_hash=null;source_record=null;source_file=null;source_classification=null;
  source_audience=null;source_ordinal=null;
  if source_kind='RECORD' then
   select encode(sha256(convert_to(jsonb_build_object(
     'id',record.id,'version',record.version,'title',record.title,'body',record.body,
     'classification',record.classification,'visibility',record.visibility
    )::text,'UTF8')),'hex'),record.id,null,record.classification,record.visibility,null
   into source_hash,source_record,source_file,source_classification,source_audience,source_ordinal
   from kxra.records record
   where record.id=source_identifier and record.project_id=p_project
    and record.version=source_version and kxra_private.can_record(record.id);
  elsif source_kind='CHUNK' then
   select chunk.content_sha256,chunk.record_id,chunk.file_id,chunk.classification,chunk.audience,chunk.ordinal
   into source_hash,source_record,source_file,source_classification,source_audience,source_ordinal
   from kxra.knowledge_chunks chunk
   join kxra.file_versions file_version on file_version.id=chunk.file_version_id
   join kxra.files file on file.id=chunk.file_id
   where chunk.id=source_identifier and chunk.project_id=p_project
    and chunk.source_version=source_version and file.current_version=chunk.source_version
    and file.lifecycle_state='INDEXED' and file_version.lifecycle_state='INDEXED'
    and kxra_private.can_record(chunk.record_id);
  else raise exception 'Invalid evidence reference';end if;
  if source_hash is null or not (source_classification::text=any(model_policy.allowed_classifications))
  then raise exception 'Evidence unavailable for model policy';end if;
  insert into kxra.evidence_envelope_items(
   org_id,project_id,envelope_id,source_type,source_id,source_version,source_sha256,
   record_id,file_id,classification,audience,ordinal
  ) values(
   selected_org,p_project,created_envelope,source_kind,source_identifier,source_version,source_hash,
   source_record,source_file,source_classification,source_audience,source_ordinal
  ) returning id into source_identifier;
  insert into kxra.agent_evidence_links(
   org_id,project_id,run_id,envelope_item_id,usage,claim_id
  ) values(selected_org,p_project,created_run,source_identifier,'INPUT','');
 end loop;

 select encode(sha256(convert_to(coalesce(jsonb_agg(jsonb_build_object(
   'source_type',evidence.source_type,'source_id',evidence.source_id,
   'source_version',evidence.source_version,'source_sha256',evidence.source_sha256
  ) order by evidence.source_type,evidence.source_id),'[]'::jsonb)::text,'UTF8')),'hex')
 into envelope_hash from kxra.evidence_envelope_items evidence
 where evidence.envelope_id=created_envelope;
 update kxra.evidence_envelopes set envelope_sha256=envelope_hash where id=created_envelope;
 select coalesce(jsonb_agg(jsonb_build_object(
   'id',evidence.id,'source_type',evidence.source_type,'source_id',evidence.source_id,
   'source_version',evidence.source_version,'source_sha256',evidence.source_sha256
  ) order by evidence.source_type,evidence.source_id),'[]'::jsonb)
 into item_json from kxra.evidence_envelope_items evidence where evidence.envelope_id=created_envelope;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(selected_org,auth.uid(),'agent.run.authorized',created_run,
  jsonb_build_object('project_id',p_project,'agent_code',agent.code,'agent_version',agent_version.version,
   'skill_code',skill.code,'skill_version',skill_version.version,'provider',model_policy.provider,
   'model',model_policy.model,'evidence_count',jsonb_array_length(item_json)));
 return query select created_run,created_reservation,created_envelope,
  model_policy.provider,model_policy.model,tools,item_json;
end $$;

create function kxra.attach_knowledge_agent_run(p_query_run uuid,p_agent_run uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare query_run kxra.knowledge_query_runs;agent_run kxra.agent_runs;
begin
 select * into query_run from kxra.knowledge_query_runs q where q.id=p_query_run for update;
 select * into agent_run from kxra.agent_runs r where r.id=p_agent_run;
 if query_run.id is null or agent_run.id is null or query_run.account_id<>auth.uid()
  or agent_run.initiated_by<>auth.uid() or query_run.org_id<>agent_run.org_id
  or query_run.project_id<>agent_run.project_id or query_run.state<>'RETRIEVING'
  or agent_run.state<>'AUTHORIZED' or query_run.agent_run_id is not null
 then return false;end if;
 update kxra.knowledge_query_runs set mode='MODEL',agent_run_id=agent_run.id,
  model_policy_version=agent_run.model_policy_version,response_schema_version=1
 where id=query_run.id;
 return true;
end $$;

create function kxra_private.claim_agent_run(p_run uuid,p_worker text)
returns table(
 run_id uuid,attempt_id uuid,provider text,model text,allowed_tools text[],
 input_sha256 text,evidence_envelope_id uuid
) language plpgsql security definer set search_path='' as $$
declare run kxra.agent_runs;reservation kxra.budget_reservations;attempt uuid;
 previous uuid;attempt_number integer;
begin
 if p_worker is null or length(trim(p_worker)) not between 1 and 160
 then raise exception 'Invalid AI worker reference';end if;
 select * into run from kxra.agent_runs candidate where candidate.id=p_run for update skip locked;
 if not found or run.state<>'AUTHORIZED' then return;end if;
 select * into reservation from kxra.budget_reservations candidate
 where candidate.run_id=run.id and candidate.state='RESERVED'
 order by candidate.cycle desc limit 1 for update;
 if not found then raise exception 'AI budget reservation unavailable';end if;
 if not kxra_private.agent_run_authority_current(run.id) then
  update kxra.budget_policies set
   current_reserved_minor=current_reserved_minor-reservation.reserved_cost_minor,
   current_reserved_runs=current_reserved_runs-1,
   current_reserved_input_tokens=current_reserved_input_tokens-reservation.reserved_input_tokens,
   current_reserved_output_tokens=current_reserved_output_tokens-reservation.reserved_output_tokens
  where id=reservation.policy_id;
  update kxra.budget_reservations set state='RELEASED',completed_at=clock_timestamp()
  where id=reservation.id;
  update kxra.agent_runs set state='CANCELLED',delivery_state='WITHHELD',completed_at=clock_timestamp()
  where id=run.id;
  update kxra.evidence_envelopes envelope set state='WITHHELD' where envelope.run_id=run.id;
  insert into kxra.run_failures(org_id,project_id,run_id,stage,failure_code,retryable)
  values(run.org_id,run.project_id,run.id,'AUTHORIZATION','AUTHORITY_CHANGED',false);
  return;
 end if;
 select count(*)::integer+1 into attempt_number
 from kxra.agent_run_attempts prior_attempt where prior_attempt.run_id=run.id;
 select prior.id into previous from kxra.agent_run_attempts prior
 where prior.run_id=run.id order by prior.attempt_number desc limit 1;
 insert into kxra.agent_run_attempts(
  org_id,project_id,run_id,attempt_number,replay_of_attempt_id,budget_reservation_id,state,worker_reference
 ) values(
  run.org_id,run.project_id,run.id,attempt_number,previous,reservation.id,'RUNNING',trim(p_worker)
 ) returning id into attempt;
 update kxra.agent_runs set state='RUNNING',started_at=coalesce(started_at,clock_timestamp()),completed_at=null
 where id=run.id;
 insert into kxra.agent_run_steps(
  org_id,project_id,run_id,attempt_id,sequence,step_type,outcome,summary_code,input_reference
 ) values(run.org_id,run.project_id,run.id,attempt,1,'AUTHORIZATION','PASS','SCOPE_AND_BUDGET_RECHECKED',run.input_sha256);
 return query select run.id,attempt,run.provider,run.model,run.authorized_tools,run.input_sha256,envelope.id
 from kxra.evidence_envelopes envelope where envelope.run_id=run.id;
end $$;

create function kxra_private.record_agent_tool_call(
 p_run uuid,p_attempt uuid,p_tool text,p_request_sha256 text,p_result_sha256 text,
 p_outcome text,p_reason text,p_idempotency uuid,p_duration_ms integer
) returns boolean language plpgsql security definer set search_path='' as $$
declare run kxra.agent_runs;attempt kxra.agent_run_attempts;binding kxra.skill_tool_bindings;
 existing kxra.agent_tool_calls;allowed boolean=false;
begin
 select * into run from kxra.agent_runs candidate where candidate.id=p_run;
 select * into attempt from kxra.agent_run_attempts candidate where candidate.id=p_attempt and candidate.run_id=p_run;
 if run.id is null or attempt.id is null or run.state<>'RUNNING' or attempt.state<>'RUNNING'
  or p_request_sha256!~'^[a-f0-9]{64}$' or (p_result_sha256 is not null and p_result_sha256!~'^[a-f0-9]{64}$')
  or p_idempotency is null or p_duration_ms<0 or p_outcome not in ('COMPLETED','FAILED','DENIED')
 then raise exception 'Agent tool evidence unavailable';end if;
 select * into existing from kxra.agent_tool_calls call
 where call.run_id=p_run and call.idempotency_key=p_idempotency;
 if found then
  if existing.attempt_id<>p_attempt or existing.tool_code<>p_tool
   or existing.request_sha256<>p_request_sha256 or existing.result_sha256 is distinct from p_result_sha256
   or existing.outcome<>p_outcome
  then raise exception 'Agent tool idempotency conflict';end if;
  return existing.outcome<>'DENIED';
 end if;
 select * into binding from kxra.skill_tool_bindings configured
 where configured.org_id=run.org_id and configured.skill_id=run.skill_id
  and configured.skill_version=run.skill_version and configured.tool_code=p_tool
  and not configured.requires_approval;
 allowed=binding.id is not null and p_tool=any(run.authorized_tools)
  and (select count(*) from kxra.agent_tool_calls prior
   where prior.attempt_id=attempt.id and prior.tool_code=p_tool)<coalesce(binding.max_calls,0);
 if allowed and p_outcome='DENIED' then raise exception 'Allowed tool cannot be recorded as denied';end if;
 if not allowed and p_outcome<>'DENIED' then raise exception 'Tool capability denied';end if;
 insert into kxra.agent_tool_calls(
  org_id,project_id,run_id,attempt_id,tool_code,request_sha256,result_sha256,
  outcome,reason_code,idempotency_key,duration_ms
 ) values(
  run.org_id,run.project_id,run.id,attempt.id,p_tool,p_request_sha256,p_result_sha256,
  p_outcome,p_reason,p_idempotency,p_duration_ms
 );
 if not allowed then
  insert into kxra.run_failures(org_id,project_id,run_id,attempt_id,stage,failure_code,retryable)
  values(run.org_id,run.project_id,run.id,attempt.id,'BROKER',coalesce(p_reason,'TOOL_DENIED'),false);
 end if;
 return allowed;
end $$;

create function kxra_private.finish_agent_run(
 p_run uuid,p_attempt uuid,p_provider_event_id text,p_output_sha256 text,
 p_input_tokens integer,p_output_tokens integer,p_cost_minor bigint,p_currency text,
 p_usage_sha256 text,p_citation_links jsonb,p_evaluation jsonb
) returns text language plpgsql security definer set search_path='' as $$
declare run kxra.agent_runs;attempt kxra.agent_run_attempts;reservation kxra.budget_reservations;
 budget kxra.budget_policies;item jsonb;citation uuid;pass boolean;final_state text;
 reasons text[];schema_ok boolean;citations_ok boolean;policy_ok boolean;
begin
 select * into run from kxra.agent_runs candidate where candidate.id=p_run for update;
 select * into attempt from kxra.agent_run_attempts candidate
 where candidate.id=p_attempt and candidate.run_id=p_run for update;
 select * into reservation from kxra.budget_reservations candidate
 where candidate.id=attempt.budget_reservation_id for update;
 select * into budget from kxra.budget_policies policy where policy.id=reservation.policy_id for update;
 if run.id is null or attempt.id is null or reservation.id is null or budget.id is null
  or run.state<>'RUNNING' or attempt.state<>'RUNNING' or reservation.state<>'RESERVED'
  or p_provider_event_id is null or length(trim(p_provider_event_id)) not between 1 and 240
  or p_output_sha256!~'^[a-f0-9]{64}$' or p_usage_sha256!~'^[a-f0-9]{64}$'
  or p_input_tokens<0 or p_output_tokens<0 or p_cost_minor<0 or p_currency!~'^[A-Z]{3}$'
  or jsonb_typeof(p_citation_links)<>'array' or jsonb_typeof(p_evaluation)<>'object'
 then raise exception 'Agent completion unavailable';end if;
 if exists(select 1 from kxra.provider_usage_events usage where usage.provider=run.provider and usage.provider_event_id=p_provider_event_id)
 then raise exception 'Provider usage event already recorded';end if;
 schema_ok=coalesce((p_evaluation->>'schema_valid')::boolean,false);
 citations_ok=coalesce((p_evaluation->>'citations_valid')::boolean,false);
 policy_ok=coalesce((p_evaluation->>'policy_valid')::boolean,false);
 reasons=coalesce(array(select jsonb_array_elements_text(coalesce(p_evaluation->'reason_codes','[]'::jsonb))),'{}'::text[]);
 pass=schema_ok and citations_ok and policy_ok
  and (run.origin<>'ASK' or jsonb_array_length(p_citation_links)>0);
 if p_cost_minor>reservation.reserved_cost_minor
  or p_input_tokens>reservation.reserved_input_tokens
  or p_output_tokens>reservation.reserved_output_tokens then
  update kxra.budget_reservations set state='RECONCILIATION_REQUIRED',
   actual_cost_minor=p_cost_minor,actual_input_tokens=p_input_tokens,
   actual_output_tokens=p_output_tokens,completed_at=clock_timestamp() where id=reservation.id;
  update kxra.agent_run_attempts set state='RECONCILIATION_REQUIRED',completed_at=clock_timestamp(),
   failure_code='USAGE_EXCEEDED_RESERVATION' where id=attempt.id;
  update kxra.agent_runs set state='RECONCILIATION_REQUIRED',delivery_state='WITHHELD',
   completed_at=clock_timestamp() where id=run.id;
  insert into kxra.run_reconciliations(
   org_id,project_id,run_id,attempt_id,reservation_id,expected_sha256,observed_sha256,outcome,reason_code
  ) values(run.org_id,run.project_id,run.id,attempt.id,reservation.id,
   encode(sha256(convert_to(jsonb_build_object(
    'cost_minor',reservation.reserved_cost_minor,'input_tokens',reservation.reserved_input_tokens,
    'output_tokens',reservation.reserved_output_tokens)::text,'UTF8')),'hex'),
   p_usage_sha256,'REVIEW_REQUIRED','USAGE_EXCEEDED_RESERVATION');
  return 'RECONCILIATION_REQUIRED';
 end if;
 insert into kxra.provider_usage_events(
  org_id,project_id,run_id,attempt_id,reservation_id,provider,provider_event_id,
  model,input_tokens,output_tokens,cost_minor,currency,usage_sha256,occurred_at
 ) values(
  run.org_id,run.project_id,run.id,attempt.id,reservation.id,run.provider,trim(p_provider_event_id),
  run.model,p_input_tokens,p_output_tokens,p_cost_minor,p_currency,p_usage_sha256,clock_timestamp()
 );
 for item in select value from jsonb_array_elements(p_citation_links) loop
  begin citation=(item->>'evidence_item_id')::uuid;
  exception when others then raise exception 'Invalid model citation';end;
  if not exists(
   select 1 from kxra.evidence_envelope_items evidence
   join kxra.evidence_envelopes envelope on envelope.id=evidence.envelope_id
   where evidence.id=citation and envelope.run_id=run.id
  ) then raise exception 'Invalid model citation';end if;
  insert into kxra.agent_evidence_links(
   org_id,project_id,run_id,envelope_item_id,usage,claim_id
  ) values(run.org_id,run.project_id,run.id,citation,'CITATION',coalesce(item->>'claim_id',''))
  on conflict do nothing;
 end loop;
 insert into kxra.run_evaluations(
  org_id,project_id,run_id,attempt_id,evaluator_code,evaluator_version,
  schema_valid,citations_valid,policy_valid,outcome,reason_codes,output_sha256
 ) values(
  run.org_id,run.project_id,run.id,attempt.id,'KXRA_OUTPUT_VALIDATOR',1,
  schema_ok,citations_ok,policy_ok,case when pass then 'PASS' else 'FAIL' end,reasons,p_output_sha256
 );
 update kxra.budget_policies set
  current_reserved_minor=current_reserved_minor-reservation.reserved_cost_minor,
  current_spend_minor=current_spend_minor+p_cost_minor,
  current_reserved_runs=current_reserved_runs-1,
  current_completed_runs=current_completed_runs+1,
  current_reserved_input_tokens=current_reserved_input_tokens-reservation.reserved_input_tokens,
  current_reserved_output_tokens=current_reserved_output_tokens-reservation.reserved_output_tokens,
  consumed_input_tokens=consumed_input_tokens+p_input_tokens,
  consumed_output_tokens=consumed_output_tokens+p_output_tokens
 where id=budget.id;
 update kxra.budget_reservations set state='CONSUMED',actual_cost_minor=p_cost_minor,
  actual_input_tokens=p_input_tokens,actual_output_tokens=p_output_tokens,completed_at=clock_timestamp()
 where id=reservation.id;
 final_state=case when pass then 'COMPLETED' else 'FAILED' end;
 update kxra.agent_run_attempts set state=final_state,completed_at=clock_timestamp(),
  failure_code=case when pass then null else 'OUTPUT_VALIDATION_FAILED' end where id=attempt.id;
 update kxra.agent_runs set state=final_state,output_sha256=p_output_sha256,
  completed_at=clock_timestamp(),delivery_state=case when pass then 'PENDING' else 'WITHHELD' end
 where id=run.id;
 insert into kxra.agent_run_steps(
  org_id,project_id,run_id,attempt_id,sequence,step_type,outcome,summary_code,output_reference
 ) values(run.org_id,run.project_id,run.id,attempt.id,2,'VALIDATION',
  case when pass then 'PASS' else 'FAIL' end,
  case when pass then 'SCHEMA_CITATION_POLICY_VALID' else 'OUTPUT_VALIDATION_FAILED' end,p_output_sha256);
 if not pass then
  insert into kxra.run_failures(org_id,project_id,run_id,attempt_id,stage,failure_code,retryable,detail_sha256)
  values(run.org_id,run.project_id,run.id,attempt.id,'VALIDATION','OUTPUT_VALIDATION_FAILED',true,p_output_sha256);
 end if;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(run.org_id,run.initiated_by,'agent.run.'||lower(final_state),run.id,
  jsonb_build_object('project_id',run.project_id,'attempt_id',attempt.id,'provider',run.provider,
   'model',run.model,'input_tokens',p_input_tokens,'output_tokens',p_output_tokens,'cost_minor',p_cost_minor));
 return final_state;
end $$;

create function kxra_private.fail_agent_run(
 p_run uuid,p_attempt uuid,p_stage text,p_failure_code text,p_retryable boolean,p_detail_sha256 text default null
) returns text language plpgsql security definer set search_path='' as $$
declare run kxra.agent_runs;attempt kxra.agent_run_attempts;reservation kxra.budget_reservations;
begin
 select * into run from kxra.agent_runs candidate where candidate.id=p_run for update;
 select * into attempt from kxra.agent_run_attempts candidate
 where candidate.id=p_attempt and candidate.run_id=p_run for update;
 select * into reservation from kxra.budget_reservations candidate
 where candidate.id=attempt.budget_reservation_id for update;
 if run.id is null or attempt.id is null or reservation.id is null
  or run.state<>'RUNNING' or attempt.state<>'RUNNING' or reservation.state<>'RESERVED'
  or p_stage not in ('AUTHORIZATION','BUDGET','BROKER','PROVIDER','VALIDATION','DELIVERY','RECONCILIATION')
  or p_failure_code is null or length(trim(p_failure_code)) not between 1 and 160
  or (p_detail_sha256 is not null and p_detail_sha256!~'^[a-f0-9]{64}$')
 then raise exception 'Agent failure unavailable';end if;
 update kxra.budget_policies set
  current_reserved_minor=current_reserved_minor-reservation.reserved_cost_minor,
  current_reserved_runs=current_reserved_runs-1,
  current_reserved_input_tokens=current_reserved_input_tokens-reservation.reserved_input_tokens,
  current_reserved_output_tokens=current_reserved_output_tokens-reservation.reserved_output_tokens
 where id=reservation.policy_id;
 update kxra.budget_reservations set state='RELEASED',completed_at=clock_timestamp()
 where id=reservation.id;
 update kxra.agent_run_attempts set state='FAILED',completed_at=clock_timestamp(),failure_code=p_failure_code
 where id=attempt.id;
 update kxra.agent_runs set state='FAILED',delivery_state='WITHHELD',completed_at=clock_timestamp()
 where id=run.id;
 update kxra.evidence_envelopes set state='WITHHELD' where run_id=run.id;
 insert into kxra.run_failures(org_id,project_id,run_id,attempt_id,stage,failure_code,retryable,detail_sha256)
 values(run.org_id,run.project_id,run.id,attempt.id,p_stage,trim(p_failure_code),p_retryable,p_detail_sha256);
 insert into kxra.agent_run_steps(
  org_id,project_id,run_id,attempt_id,sequence,step_type,outcome,summary_code,output_reference
 ) values(run.org_id,run.project_id,run.id,attempt.id,2,
  case when p_stage='PROVIDER' then 'MODEL_REQUEST' when p_stage='DELIVERY' then 'DELIVERY' else 'FINALIZATION' end,
  'FAIL',trim(p_failure_code),p_detail_sha256);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(run.org_id,run.initiated_by,'agent.run.failed',run.id,
  jsonb_build_object('project_id',run.project_id,'attempt_id',attempt.id,'failure_code',p_failure_code,'retryable',p_retryable));
 return 'FAILED';
end $$;

create function kxra.retry_agent_run(p_run uuid,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare run kxra.agent_runs;previous kxra.budget_reservations;budget kxra.budget_policies;
 latest_failure kxra.run_failures;next_cycle integer;reservation uuid;
begin
 if p_request is null then raise exception 'Agent retry unavailable';end if;
 select * into run from kxra.agent_runs candidate where candidate.id=p_run for update;
 if not found or run.state<>'FAILED' or not kxra_private.can_read_agent_run(run.id)
  or (run.initiated_by<>auth.uid() and not kxra_private.is_owner(run.org_id))
  or not kxra_private.agent_run_authority_current(run.id)
  or (select count(*) from kxra.agent_run_attempts attempt where attempt.run_id=run.id)>=3
 then raise exception 'Agent retry unavailable';end if;
 select * into latest_failure from kxra.run_failures failure
 where failure.run_id=run.id order by failure.created_at desc,failure.id desc limit 1;
 if not found or not latest_failure.retryable then raise exception 'Agent retry unavailable';end if;
 select * into previous from kxra.budget_reservations candidate
 where candidate.run_id=run.id order by candidate.cycle desc limit 1;
 select * into budget from kxra.budget_policies policy where policy.id=run.budget_policy_id for update;
 if budget.state<>'APPROVED' or budget.starts_at>now() or (budget.ends_at is not null and budget.ends_at<=now())
  or budget.current_reserved_minor+previous.reserved_cost_minor>budget.max_reserved_minor
  or budget.current_reserved_minor+budget.current_spend_minor+previous.reserved_cost_minor>budget.max_spend_minor
  or budget.current_reserved_runs+budget.current_completed_runs+1>budget.max_runs
  or budget.current_reserved_input_tokens+budget.consumed_input_tokens+previous.reserved_input_tokens>budget.max_input_tokens
  or budget.current_reserved_output_tokens+budget.consumed_output_tokens+previous.reserved_output_tokens>budget.max_output_tokens
 then raise exception 'BUDGET_UNAVAILABLE';end if;
 next_cycle=previous.cycle+1;
 insert into kxra.budget_reservations(
  org_id,project_id,run_id,policy_id,policy_version,cycle,reserved_cost_minor,
  reserved_input_tokens,reserved_output_tokens,state
 ) values(
  run.org_id,run.project_id,run.id,budget.id,budget.version,next_cycle,previous.reserved_cost_minor,
  previous.reserved_input_tokens,previous.reserved_output_tokens,'RESERVED'
 ) returning id into reservation;
 update kxra.budget_policies set
  current_reserved_minor=current_reserved_minor+previous.reserved_cost_minor,
  current_reserved_runs=current_reserved_runs+1,
  current_reserved_input_tokens=current_reserved_input_tokens+previous.reserved_input_tokens,
  current_reserved_output_tokens=current_reserved_output_tokens+previous.reserved_output_tokens
 where id=budget.id;
 update kxra.agent_runs set state='AUTHORIZED',delivery_state='PENDING',output_sha256=null,completed_at=null
 where id=run.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(run.org_id,auth.uid(),'agent.run.retry_authorized',run.id,
  jsonb_build_object('request_id',p_request,'cycle',next_cycle));
 return reservation;
end $$;

create function kxra.authorize_agent_delivery(p_run uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare run kxra.agent_runs;link record;allowed boolean=true;citations integer=0;
begin
 select * into run from kxra.agent_runs candidate where candidate.id=p_run for update;
 if not found or run.state<>'COMPLETED' or run.delivery_state<>'PENDING'
  or (run.initiated_by<>auth.uid() and not kxra_private.is_owner(run.org_id))
 then return false;end if;
 allowed=kxra_private.agent_run_authority_current(run.id);
 for link in
  select evidence.* from kxra.agent_evidence_links citation
  join kxra.evidence_envelope_items evidence on evidence.id=citation.envelope_item_id
  where citation.run_id=run.id and citation.usage='CITATION'
 loop
  citations=citations+1;
  if link.source_type='RECORD' then
   allowed=allowed and exists(
    select 1 from kxra.records record where record.id=link.source_id
     and record.project_id=run.project_id and record.version=link.source_version
     and kxra_private.can_record(record.id)
   );
  else
   allowed=allowed and exists(
    select 1 from kxra.knowledge_chunks chunk
    join kxra.file_versions file_version on file_version.id=chunk.file_version_id
    join kxra.files file on file.id=chunk.file_id
    where chunk.id=link.source_id and chunk.project_id=run.project_id
     and chunk.source_version=link.source_version and chunk.content_sha256=link.source_sha256
     and file.current_version=chunk.source_version and file.lifecycle_state='INDEXED'
     and file_version.lifecycle_state='INDEXED' and kxra_private.can_record(chunk.record_id)
   );
  end if;
  exit when not allowed;
 end loop;
 if run.origin='ASK' and citations=0 then allowed=false;end if;
 update kxra.agent_runs set delivery_state=case when allowed then 'DELIVERED' else 'WITHHELD' end
 where id=run.id;
 if not allowed then update kxra.evidence_envelopes set state='WITHHELD' where run_id=run.id;end if;
 insert into kxra.agent_run_steps(
  org_id,project_id,run_id,attempt_id,sequence,step_type,outcome,summary_code,output_reference
 ) select run.org_id,run.project_id,run.id,attempt.id,3,'DELIVERY',
  case when allowed then 'PASS' else 'DENY' end,
  case when allowed then 'AUTHORITY_AND_CITATIONS_CURRENT' else 'AUTHORITY_OR_CITATION_CHANGED' end,
  run.output_sha256
 from kxra.agent_run_attempts attempt where attempt.run_id=run.id
 order by attempt.attempt_number desc limit 1;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(run.org_id,auth.uid(),case when allowed then 'agent.run.delivered' else 'agent.run.withheld' end,
  run.id,jsonb_build_object('project_id',run.project_id,'citation_count',citations));
 return allowed;
end $$;

create function kxra.cancel_agent_run(p_run uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare run kxra.agent_runs;reservation kxra.budget_reservations;
begin
 select * into run from kxra.agent_runs candidate where candidate.id=p_run for update;
 if not found or run.initiated_by<>auth.uid() or run.state<>'AUTHORIZED'
  or not kxra_private.can_read_agent_run(run.id)
 then return false;end if;
 select * into reservation from kxra.budget_reservations candidate
 where candidate.run_id=run.id and candidate.state='RESERVED'
 order by candidate.cycle desc limit 1 for update;
 if not found then return false;end if;
 update kxra.budget_policies set
  current_reserved_minor=current_reserved_minor-reservation.reserved_cost_minor,
  current_reserved_runs=current_reserved_runs-1,
  current_reserved_input_tokens=current_reserved_input_tokens-reservation.reserved_input_tokens,
  current_reserved_output_tokens=current_reserved_output_tokens-reservation.reserved_output_tokens
 where id=reservation.policy_id;
 update kxra.budget_reservations set state='RELEASED',completed_at=clock_timestamp()
 where id=reservation.id;
 update kxra.agent_runs set state='CANCELLED',delivery_state='WITHHELD',completed_at=clock_timestamp()
 where id=run.id;
 update kxra.evidence_envelopes set state='WITHHELD' where run_id=run.id;
 insert into kxra.run_failures(org_id,project_id,run_id,stage,failure_code,retryable)
 values(run.org_id,run.project_id,run.id,'AUTHORIZATION','REQUEST_ABORTED',false);
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(run.org_id,auth.uid(),'agent.run.cancelled',run.id,
  jsonb_build_object('project_id',run.project_id,'reason_code','REQUEST_ABORTED'));
 return true;
end $$;

create function kxra.finalize_ask_delivery(
 p_query_run uuid,p_agent_run uuid,p_evidence_references jsonb
) returns boolean language plpgsql security definer set search_path='' as $$
declare
 query_run kxra.knowledge_query_runs;
 run kxra.agent_runs;
 attempt kxra.agent_run_attempts;
 item jsonb;
 evidence kxra.evidence_envelope_items;
 valid boolean=true;
 citation_count integer=0;
 reference_keys text[]='{}';
 reference_key text;
begin
 select * into query_run from kxra.knowledge_query_runs candidate
 where candidate.id=p_query_run for update;
 select * into run from kxra.agent_runs candidate where candidate.id=p_agent_run for update;
 if query_run.id is null or run.id is null or query_run.account_id<>auth.uid()
  or run.initiated_by<>auth.uid() or query_run.org_id<>run.org_id
  or query_run.project_id<>run.project_id or query_run.agent_run_id<>run.id
  or query_run.mode<>'MODEL' or query_run.state<>'RETRIEVING'
  or run.origin<>'ASK' or run.state<>'COMPLETED' or run.delivery_state<>'PENDING'
  or jsonb_typeof(p_evidence_references)<>'array'
  or jsonb_array_length(p_evidence_references) not between 1 and 50
 then return false;end if;
 valid=kxra_private.agent_run_authority_current(run.id)
  and query_run.membership_id=run.membership_id
  and query_run.membership_version=run.membership_version;
 select count(distinct link.envelope_item_id)::integer into citation_count
 from kxra.agent_evidence_links link
 where link.run_id=run.id and link.usage='CITATION';
 if citation_count=0 or citation_count<>jsonb_array_length(p_evidence_references)
 then valid=false;end if;
 if valid then
  for item in select value from jsonb_array_elements(p_evidence_references) loop
   if jsonb_typeof(item)<>'object' or item->>'type' not in ('RECORD','CHUNK')
    or coalesce(item->>'id','')!~'^[0-9a-fA-F-]{36}$'
    or coalesce(item->>'version','')!~'^[1-9][0-9]*$'
   then valid=false;exit;end if;
   reference_key=(item->>'type')||':'||(item->>'id')||':'||(item->>'version');
   if reference_key=any(reference_keys) then valid=false;exit;end if;
   reference_keys=array_append(reference_keys,reference_key);
   select envelope_item.* into evidence
   from kxra.agent_evidence_links link
   join kxra.evidence_envelope_items envelope_item on envelope_item.id=link.envelope_item_id
   where link.run_id=run.id and link.usage='CITATION'
    and envelope_item.source_type=item->>'type'
    and envelope_item.source_id=(item->>'id')::uuid
    and envelope_item.source_version=(item->>'version')::integer
   limit 1;
   if not found then valid=false;exit;end if;
   if evidence.source_type='RECORD' then
    valid=exists(
     select 1 from kxra.records record where record.id=evidence.source_id
      and record.project_id=run.project_id and record.version=evidence.source_version
      and kxra_private.can_record(record.id)
    );
   else
    valid=exists(
     select 1 from kxra.knowledge_chunks chunk
     join kxra.file_versions file_version on file_version.id=chunk.file_version_id
     join kxra.files file on file.id=chunk.file_id
     where chunk.id=evidence.source_id and chunk.project_id=run.project_id
      and chunk.source_version=evidence.source_version
      and chunk.content_sha256=evidence.source_sha256
      and file.current_version=chunk.source_version and file.lifecycle_state='INDEXED'
      and file_version.lifecycle_state='INDEXED' and kxra_private.can_record(chunk.record_id)
    );
   end if;
   if not valid then exit;end if;
  end loop;
 end if;
 select * into attempt from kxra.agent_run_attempts candidate
 where candidate.run_id=run.id order by candidate.attempt_number desc limit 1;
 update kxra.agent_runs set delivery_state=case when valid then 'DELIVERED' else 'WITHHELD' end
 where id=run.id;
 update kxra.evidence_envelopes set state=case when valid then 'ACTIVE' else 'WITHHELD' end
 where run_id=run.id;
 update kxra.knowledge_query_runs set
  state=case when valid then 'DELIVERED' else 'WITHHELD' end,
  evidence_refs=case when valid then p_evidence_references else '[]'::jsonb end,
  failure_code=case when valid then null else 'AUTHORITY_OR_EVIDENCE_CHANGED' end,
  completed_at=clock_timestamp()
 where id=query_run.id;
 insert into kxra.agent_run_steps(
  org_id,project_id,run_id,attempt_id,sequence,step_type,outcome,summary_code,output_reference
 ) values(
  run.org_id,run.project_id,run.id,attempt.id,3,'DELIVERY',
  case when valid then 'PASS' else 'DENY' end,
  case when valid then 'AUTHORITY_AND_CITATIONS_CURRENT' else 'AUTHORITY_OR_CITATION_CHANGED' end,
  run.output_sha256
 );
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(run.org_id,auth.uid(),case when valid then 'agent.run.delivered' else 'agent.run.withheld' end,
  run.id,jsonb_build_object('project_id',run.project_id,'citation_count',citation_count,'knowledge_query_id',query_run.id));
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(query_run.org_id,auth.uid(),case when valid then 'knowledge.query.delivered' else 'knowledge.query.withheld' end,
  query_run.id,jsonb_build_object('project_id',query_run.project_id,
   'evidence_count',case when valid then jsonb_array_length(p_evidence_references) else 0 end,
   'agent_run_id',run.id));
 return valid;
end $$;

revoke all on function kxra_private.agent_run_authority_current(uuid),
 kxra_private.claim_agent_run(uuid,text),
 kxra_private.record_agent_tool_call(uuid,uuid,text,text,text,text,text,uuid,integer),
 kxra_private.finish_agent_run(uuid,uuid,text,text,integer,integer,bigint,text,text,jsonb,jsonb),
 kxra_private.fail_agent_run(uuid,uuid,text,text,boolean,text)
from public,authenticated,anon;
grant execute on function kxra_private.claim_agent_run(uuid,text),
 kxra_private.record_agent_tool_call(uuid,uuid,text,text,text,text,text,uuid,integer),
 kxra_private.finish_agent_run(uuid,uuid,text,text,integer,integer,bigint,text,text,jsonb,jsonb),
 kxra_private.fail_agent_run(uuid,uuid,text,text,boolean,text)
to kxra_ai_worker;

revoke all on function kxra.begin_agent_run(
 uuid,uuid,text,integer,text,integer,text,integer,text,integer,text,jsonb,bigint,integer,integer,text,uuid
),kxra.attach_knowledge_agent_run(uuid,uuid),kxra.retry_agent_run(uuid,uuid),
 kxra.authorize_agent_delivery(uuid),kxra.cancel_agent_run(uuid),
 kxra.finalize_ask_delivery(uuid,uuid,jsonb)
from public;
grant execute on function kxra.begin_agent_run(
 uuid,uuid,text,integer,text,integer,text,integer,text,integer,text,jsonb,bigint,integer,integer,text,uuid
),kxra.attach_knowledge_agent_run(uuid,uuid),kxra.retry_agent_run(uuid,uuid),
 kxra.authorize_agent_delivery(uuid),kxra.cancel_agent_run(uuid),
 kxra.finalize_ask_delivery(uuid,uuid,jsonb)
to authenticated;

revoke all on function kxra_private.agent_run_authority_current(uuid)
from kxra_ai_worker;

commit;
