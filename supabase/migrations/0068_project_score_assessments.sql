begin;

create table kxra.project_score_assessments(
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null,
 project_id uuid not null,
 project_governance_version integer not null check(project_governance_version>0),
 formula_version text not null check(formula_version='genesis-1'),
 state text not null default 'REQUESTED' check(state in ('REQUESTED','APPLIED','SUPERSEDED')),
 venture_score numeric check(venture_score is null or venture_score between 0 and 100),
 confidence_score numeric check(confidence_score is null or confidence_score between 0 and 100),
 score_coverage numeric not null check(score_coverage between 0 and 1),
 score_lower_bound numeric not null check(score_lower_bound between 0 and 100),
 score_upper_bound numeric not null check(score_upper_bound between 0 and 100 and score_upper_bound>=score_lower_bound),
 reason text not null check(length(trim(reason)) between 1 and 2000),
 requested_by uuid not null,
 approval_id uuid unique,
 applied_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(org_id,project_id,id),
 foreign key(org_id,project_id) references kxra.projects(org_id,id),
 foreign key(org_id,requested_by) references kxra.members(org_id,id),
 foreign key(approval_id) references kxra.approvals(id),
 check((state='REQUESTED' and applied_at is null) or (state<>'REQUESTED' and applied_at is not null))
);

create table kxra.project_score_factors(
 assessment_id uuid not null references kxra.project_score_assessments(id),
 factor_key text not null check(factor_key in (
  'customer_problem','willingness_to_pay','distribution','economics','market',
  'differentiation','feasibility','risk_capital','team_partner','scale_reuse'
 )),
 org_id uuid not null,
 project_id uuid not null,
 weight integer not null check(weight in (5,7,8,10,15)),
 rating numeric not null check(rating between 0 and 5),
 rationale text not null check(length(trim(rationale)) between 1 and 2000),
 confidence_quality numeric check(confidence_quality is null or confidence_quality between 0 and 1),
 confidence_independence numeric check(confidence_independence is null or confidence_independence between 0 and 1),
 confidence_recency numeric check(confidence_recency is null or confidence_recency between 0 and 1),
 confidence_directness numeric check(confidence_directness is null or confidence_directness between 0 and 1),
 created_at timestamptz not null default now(),
 primary key(assessment_id,factor_key),
 foreign key(org_id,project_id,assessment_id)
  references kxra.project_score_assessments(org_id,project_id,id),
 check(
  (confidence_quality is null and confidence_independence is null and confidence_recency is null and confidence_directness is null)
  or
  (confidence_quality is not null and confidence_independence is not null and confidence_recency is not null and confidence_directness is not null)
 )
);

create table kxra.project_score_factor_evidence(
 assessment_id uuid not null,
 factor_key text not null,
 org_id uuid not null,
 project_id uuid not null,
 evidence_id uuid not null,
 evidence_version integer not null check(evidence_version>0),
 created_at timestamptz not null default now(),
 primary key(assessment_id,factor_key,evidence_id,evidence_version),
 foreign key(assessment_id,factor_key)
  references kxra.project_score_factors(assessment_id,factor_key),
 foreign key(org_id,project_id,assessment_id)
  references kxra.project_score_assessments(org_id,project_id,id),
 foreign key(org_id,project_id,evidence_id)
  references kxra.records(org_id,project_id,id),
 foreign key(evidence_id,evidence_version)
  references kxra.record_versions(record_id,version)
);

create index project_score_assessments_scope
 on kxra.project_score_assessments(org_id,project_id,created_at desc,id);
create index project_score_factor_evidence_record
 on kxra.project_score_factor_evidence(evidence_id,evidence_version);

alter table kxra.project_score_assessments enable row level security;
alter table kxra.project_score_factors enable row level security;
alter table kxra.project_score_factor_evidence enable row level security;

grant select on kxra.project_score_assessments,kxra.project_score_factors,
 kxra.project_score_factor_evidence to authenticated,anon;

create policy project_score_assessments_read on kxra.project_score_assessments
 for select using(
  kxra_private.is_owner(org_id) or (state in ('APPLIED','SUPERSEDED') and kxra_private.can_project(project_id))
 );
create policy project_score_factors_read on kxra.project_score_factors
 for select using(exists(
  select 1 from kxra.project_score_assessments a
  where a.id=assessment_id and (
   kxra_private.is_owner(a.org_id) or
   (a.state in ('APPLIED','SUPERSEDED') and kxra_private.can_project(a.project_id))
  )
 ));
create policy project_score_factor_evidence_read on kxra.project_score_factor_evidence
 for select using(exists(
  select 1 from kxra.project_score_assessments a
  where a.id=assessment_id and (
   kxra_private.is_owner(a.org_id) or
   (a.state in ('APPLIED','SUPERSEDED') and kxra_private.can_project(a.project_id))
  )
 ));

alter table kxra.approvals drop constraint approvals_action_check;
alter table kxra.approvals add constraint approvals_action_check check(action in (
 'record.accept','membership.change','project.gate','account.lifecycle','idea.share','project.governance',
 'project.score','publish','external.message','spend','deploy','ai.high_cost'
));

alter table kxra.approvals drop constraint approval_payload_shape;
alter table kxra.approvals add constraint approval_payload_shape check(
 (not(payload ? 'envelope_version') or (
  payload->>'envelope_version'='2' and payload ?& array[
   'action_summary','before','after','recipient','estimated_cost','cost_currency','risk_summary'
  ] and jsonb_typeof(payload->'before')='object' and jsonb_typeof(payload->'after')='object'
  and jsonb_typeof(payload->'action_summary')='string'
  and jsonb_typeof(payload->'risk_summary')='string'
  and jsonb_typeof(payload->'recipient') in ('object','null')
  and jsonb_typeof(payload->'estimated_cost') in ('string','null')
  and jsonb_typeof(payload->'cost_currency') in ('string','null')
 )) and case action
 when 'record.accept' then jsonb_typeof(payload->'record_id')='string' and payload ? 'record_id'
  and jsonb_typeof(payload->'version')='number' and (payload->>'version')::numeric>0
 when 'membership.change' then project_id is not null and payload ?& array['user_id','role','active']
  and jsonb_typeof(payload->'user_id')='string' and payload->>'role' in ('viewer','contributor')
  and jsonb_typeof(payload->'active')='boolean'
 when 'project.gate' then project_id is not null and payload ?& array['gate','evidence_id','evidence_version']
  and jsonb_typeof(payload->'gate')='string' and jsonb_typeof(payload->'evidence_id')='string'
  and jsonb_typeof(payload->'evidence_version')='number' and (payload->>'evidence_version')::numeric>0
 when 'account.lifecycle' then project_id is null and payload ?& array[
  'user_id','desired_state','expected_access_version','expected_session_version','before','reason'
 ] and jsonb_typeof(payload->'user_id')='string'
  and payload->>'desired_state' in ('ACTIVE','SUSPENDED','REVOKED')
  and jsonb_typeof(payload->'expected_access_version')='number'
  and jsonb_typeof(payload->'expected_session_version')='number'
  and jsonb_typeof(payload->'before')='object' and jsonb_typeof(payload->'reason')='string'
 when 'idea.share' then project_id is not null and payload ?& array[
  'idea_id','idea_version','user_id','expected_share_version','active','before','after'
 ] and jsonb_typeof(payload->'idea_id')='string' and jsonb_typeof(payload->'idea_version')='number'
  and jsonb_typeof(payload->'user_id')='string' and jsonb_typeof(payload->'expected_share_version')='number'
  and jsonb_typeof(payload->'active')='boolean'
 when 'project.governance' then project_id is not null and payload ?& array[
  'expected_governance_version','before','after'
 ] and jsonb_typeof(payload->'expected_governance_version')='number'
 when 'project.score' then project_id is not null and payload ?& array[
  'assessment_id','expected_governance_version','formula_version','before','after'
 ] and jsonb_typeof(payload->'assessment_id')='string'
  and jsonb_typeof(payload->'expected_governance_version')='number'
  and payload->>'formula_version'='genesis-1'
 else true end
);

create function kxra_private.project_score_weight(factor text) returns integer
language sql immutable set search_path='' as $$
 select case factor
  when 'customer_problem' then 15 when 'willingness_to_pay' then 15
  when 'distribution' then 10 when 'economics' then 15 when 'market' then 8
  when 'differentiation' then 10 when 'feasibility' then 10
  when 'risk_capital' then 7 when 'team_partner' then 5 when 'scale_reuse' then 5
  else null end
$$;

create function kxra.request_project_score_approval(
 p_project uuid,p_expected_version integer,p_factors jsonb,p_reason text
) returns kxra.approvals language plpgsql security definer set search_path='' as $$
declare
 o uuid=kxra_private.member_org();p kxra.projects;assessment kxra.project_score_assessments;
 item jsonb;evidence_item jsonb;evidence_record kxra.records;factor_key text;factor_weight integer;
 rating numeric;confidence jsonb;seen text[]='{}';rated_weight integer=0;
 lower_score numeric=0;confidence_total numeric=0;confidence_complete boolean=true;
 before_state jsonb;after_state jsonb;payload jsonb;env text;
 expiry timestamptz=now()+interval '24 hours';approval kxra.approvals;
begin
 select * into p from kxra.projects where id=p_project and org_id=o for update;
 if p.id is null or not kxra_private.is_owner(o)
  or p.governance_version is distinct from p_expected_version
  or jsonb_typeof(p_factors)<>'array' or jsonb_array_length(p_factors) not between 1 and 10
  or length(trim(p_reason)) not between 1 and 2000
 then raise exception 'Project score assessment unavailable';end if;

 insert into kxra.project_score_assessments(
  org_id,project_id,project_governance_version,formula_version,state,
  score_coverage,score_lower_bound,score_upper_bound,reason,requested_by
 ) values(o,p.id,p.governance_version,'genesis-1','REQUESTED',0,0,100,trim(p_reason),auth.uid())
 returning * into assessment;

 for item in select value from jsonb_array_elements(p_factors) loop
  if jsonb_typeof(item)<>'object'
   or not(item ?& array['factor_key','rating','rationale','confidence','evidence'])
   or item-array['factor_key','rating','rationale','confidence','evidence']<>'{}'::jsonb
   or jsonb_typeof(item->'factor_key')<>'string'
   or jsonb_typeof(item->'rating')<>'number'
   or jsonb_typeof(item->'rationale')<>'string'
   or jsonb_typeof(item->'evidence')<>'array'
   or jsonb_array_length(item->'evidence') not between 1 and 20
  then raise exception 'Project score factor unavailable';end if;
  factor_key=item->>'factor_key';
  factor_weight=kxra_private.project_score_weight(factor_key);
  rating=(item->>'rating')::numeric;
  confidence=item->'confidence';
  if factor_weight is null or factor_key=any(seen) or rating not between 0 and 5
   or length(trim(item->>'rationale')) not between 1 and 2000
   or jsonb_typeof(confidence) not in ('object','null')
  then raise exception 'Project score factor unavailable';end if;
  if jsonb_typeof(confidence)='object' and (
   not(confidence ?& array['quality','independence','recency','directness'])
   or confidence-array['quality','independence','recency','directness']<>'{}'::jsonb
   or exists(select 1 from jsonb_each(confidence) c
    where jsonb_typeof(c.value)<>'number' or (c.value#>>'{}')::numeric not between 0 and 1)
  ) then raise exception 'Project score confidence unavailable';end if;
  seen=array_append(seen,factor_key);
  rated_weight=rated_weight+factor_weight;
  lower_score=lower_score+(factor_weight*rating/5);
  confidence_complete=confidence_complete and jsonb_typeof(confidence)='object';
  if jsonb_typeof(confidence)='object' then
   confidence_total=confidence_total+factor_weight*(confidence->>'quality')::numeric*
    (confidence->>'independence')::numeric*(confidence->>'recency')::numeric*
    (confidence->>'directness')::numeric;
  end if;
  insert into kxra.project_score_factors(
   assessment_id,factor_key,org_id,project_id,weight,rating,rationale,
   confidence_quality,confidence_independence,confidence_recency,confidence_directness
  ) values(
   assessment.id,factor_key,o,p.id,factor_weight,rating,trim(item->>'rationale'),
   case when jsonb_typeof(confidence)='object' then (confidence->>'quality')::numeric end,
   case when jsonb_typeof(confidence)='object' then (confidence->>'independence')::numeric end,
   case when jsonb_typeof(confidence)='object' then (confidence->>'recency')::numeric end,
   case when jsonb_typeof(confidence)='object' then (confidence->>'directness')::numeric end
  );
  for evidence_item in select value from jsonb_array_elements(item->'evidence') loop
   if jsonb_typeof(evidence_item)<>'object'
    or not(evidence_item ?& array['record_id','version'])
    or evidence_item-array['record_id','version']<>'{}'::jsonb
   then raise exception 'Project score evidence unavailable';end if;
   select * into evidence_record from kxra.records
    where id=(evidence_item->>'record_id')::uuid and org_id=o and project_id=p.id;
   if evidence_record.id is null or evidence_record.status<>'accepted'
    or evidence_record.version is distinct from (evidence_item->>'version')::integer
   then raise exception 'Current accepted project evidence required';end if;
   insert into kxra.project_score_factor_evidence(
    assessment_id,factor_key,org_id,project_id,evidence_id,evidence_version
   ) values(
    assessment.id,factor_key,o,p.id,evidence_record.id,evidence_record.version
   );
  end loop;
 end loop;

 update kxra.project_score_assessments set
  venture_score=case when rated_weight=100 then lower_score end,
  confidence_score=case when rated_weight=100 and confidence_complete then confidence_total end,
  score_coverage=rated_weight::numeric/100,
  score_lower_bound=lower_score,
  score_upper_bound=lower_score+(100-rated_weight),updated_at=now()
 where id=assessment.id returning * into assessment;

 before_state=jsonb_build_object(
  'venture_score',p.venture_score,'confidence_score',p.confidence_score,
  'score_coverage',p.score_coverage,'score_lower_bound',p.score_lower_bound,
  'score_upper_bound',p.score_upper_bound
 );
 after_state=jsonb_build_object(
  'assessment_id',assessment.id,'formula_version',assessment.formula_version,
  'venture_score',assessment.venture_score,'confidence_score',assessment.confidence_score,
  'score_coverage',assessment.score_coverage,'score_lower_bound',assessment.score_lower_bound,
  'score_upper_bound',assessment.score_upper_bound
 );
 payload=kxra_private.approval_envelope(
  jsonb_build_object('assessment_id',assessment.id,
   'expected_governance_version',p.governance_version,'formula_version','genesis-1'),
  'Apply evidence-backed score assessment for '||p.code||' · '||p.name,
  before_state,after_state,null,
  'Scores affect portfolio prioritisation and remain null until every weighted factor is assessed.'
 );
 select environment into env from kxra_private.deployment;
 insert into kxra.approvals(org_id,project_id,action,payload,payload_hash,environment,expires_at)
 values(o,p.id,'project.score',payload,
  kxra_private.approval_digest('project.score',o,p.id,payload,env,auth.uid(),expiry),env,expiry)
 returning * into approval;
 update kxra.project_score_assessments set approval_id=approval.id,updated_at=now()
 where id=assessment.id;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(o,auth.uid(),'approval.requested',approval.id,
  jsonb_build_object('action','project.score','project_id',p.id,'assessment_id',assessment.id));
 return approval;
end $$;

create function kxra.apply_project_score(a uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v kxra.approvals;p kxra.projects;assessment kxra.project_score_assessments;
begin
 select * into v from kxra.approvals where id=a for update;
 perform kxra_private.check_approval(v,'APPROVED');
 if v.action<>'project.score' then raise exception 'Wrong action';end if;
 select * into p from kxra.projects where id=v.project_id and org_id=v.org_id for update;
 select * into assessment from kxra.project_score_assessments
  where id=(v.payload->>'assessment_id')::uuid for update;
 if p.id is null or assessment.id is null or assessment.approval_id<>v.id
  or assessment.org_id<>v.org_id or assessment.project_id<>v.project_id
  or assessment.state<>'REQUESTED'
  or p.governance_version is distinct from (v.payload->>'expected_governance_version')::integer
  or jsonb_build_object(
   'venture_score',p.venture_score,'confidence_score',p.confidence_score,
   'score_coverage',p.score_coverage,'score_lower_bound',p.score_lower_bound,
   'score_upper_bound',p.score_upper_bound
  ) is distinct from v.payload->'before'
  or exists(
   select 1 from kxra.project_score_factor_evidence e
   left join kxra.records r on r.id=e.evidence_id and r.org_id=e.org_id and r.project_id=e.project_id
   where e.assessment_id=assessment.id and (
    r.id is null or r.status<>'accepted' or r.version<>e.evidence_version
   )
  )
 then raise exception 'Stale project score approval';end if;
 update kxra.approvals set state='EXECUTING',executing_at=now() where id=a;
 update kxra.project_score_assessments set state='SUPERSEDED',updated_at=now()
  where project_id=p.id and state='APPLIED' and id<>assessment.id;
 update kxra.projects set venture_score=assessment.venture_score,
  confidence_score=assessment.confidence_score,score_coverage=assessment.score_coverage,
  score_lower_bound=assessment.score_lower_bound,score_upper_bound=assessment.score_upper_bound
 where id=p.id;
 update kxra.project_score_assessments set state='APPLIED',applied_at=now(),updated_at=now()
 where id=assessment.id;
 update kxra.approvals set state='EXECUTED',consumed_at=now(),execution_completed_at=now()
 where id=a;
 insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
 values(v.org_id,auth.uid(),'project.score.applied',assessment.id,
  jsonb_build_object('project_id',p.id,'approval_id',a,'formula_version','genesis-1',
   'coverage',assessment.score_coverage));
end $$;

revoke all on function kxra.request_project_score_approval(uuid,integer,jsonb,text),
 kxra.apply_project_score(uuid),kxra_private.project_score_weight(text)
from public,anon,authenticated;
grant execute on function kxra.request_project_score_approval(uuid,integer,jsonb,text),
 kxra.apply_project_score(uuid) to authenticated;

commit;
