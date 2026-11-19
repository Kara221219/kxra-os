begin;

create function kxra_private.safe_brand_locator(value text) returns boolean
language sql immutable set search_path='' as $$
 select value is not null
  and length(value) between 12 and 2000
  and value~'^https://[A-Za-z0-9.-]+(?::443)?(?:/|$)'
  and value!~'@'
  and lower(value)!~'^https://(localhost|[^/]+\.(local|internal))(?::443)?(?:/|$)'
  and lower(value)!~'^https://(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)'
  and lower(value)!~'^https://\['
$$;

create function kxra_private.valid_brand_profile(value jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(value)='object'
  and value?&array[
   'business_name','summary','tone','audiences','offers','prohibited_claims',
   'required_disclaimers','palette','typography'
  ]
  and jsonb_typeof(value->'business_name')='string'
  and length(trim(value->>'business_name')) between 1 and 160
  and jsonb_typeof(value->'summary')='string'
  and length(trim(value->>'summary')) between 1 and 5000
  and jsonb_typeof(value->'tone')='array' and jsonb_array_length(value->'tone') between 1 and 12
  and jsonb_typeof(value->'audiences')='array' and jsonb_array_length(value->'audiences') between 1 and 20
  and jsonb_typeof(value->'offers')='array' and jsonb_array_length(value->'offers') between 1 and 20
  and jsonb_typeof(value->'prohibited_claims')='array' and jsonb_array_length(value->'prohibited_claims')<=30
  and jsonb_typeof(value->'required_disclaimers')='array' and jsonb_array_length(value->'required_disclaimers')<=30
  and jsonb_typeof(value->'palette')='array' and jsonb_array_length(value->'palette')<=12
  and jsonb_typeof(value->'typography')='array' and jsonb_array_length(value->'typography')<=12
  and not exists(
   select 1 from jsonb_array_elements(value->'tone') item
   where jsonb_typeof(item)<>'string' or length(trim(item#>>'{}')) not between 1 and 120
  )
  and not exists(
   select 1 from jsonb_array_elements(value->'audiences') item
   where jsonb_typeof(item)<>'string' or length(trim(item#>>'{}')) not between 1 and 500
  )
  and not exists(
   select 1 from jsonb_array_elements(value->'offers') item
   where jsonb_typeof(item)<>'string' or length(trim(item#>>'{}')) not between 1 and 500
  )
  and not exists(
   select 1 from jsonb_array_elements(value->'palette') item
   where jsonb_typeof(item)<>'string' or (item#>>'{}')!~'^#[A-Fa-f0-9]{6}$'
  )
$$;

create function kxra_private.valid_brand_claims(value jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(value)='array' and jsonb_array_length(value)<=20
  and not exists(
   select 1 from jsonb_array_elements(value) item
   where jsonb_typeof(item)<>'object'
    or not item?&array['text','evidence_note']
    or jsonb_typeof(item->'text')<>'string'
    or jsonb_typeof(item->'evidence_note')<>'string'
    or length(trim(item->>'text')) not between 1 and 1000
    or length(trim(item->>'evidence_note')) not between 1 and 2000
  )
$$;

create function kxra_private.valid_creative_content(value jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(value)='object'
  and value?&array['headline','body','call_to_action','alt_text','warnings']
  and jsonb_typeof(value->'headline')='string'
  and length(trim(value->>'headline')) between 1 and 240
  and jsonb_typeof(value->'body')='string'
  and length(trim(value->>'body')) between 1 and 10000
  and jsonb_typeof(value->'call_to_action')='string'
  and length(trim(value->>'call_to_action')) between 1 and 240
  and jsonb_typeof(value->'alt_text')='string'
  and length(trim(value->>'alt_text')) between 1 and 1000
  and jsonb_typeof(value->'warnings')='array'
  and jsonb_array_length(value->'warnings')<=20
$$;

create function kxra_private.valid_creative_review(value jsonb) returns boolean
language sql immutable set search_path='' as $$
 select jsonb_typeof(value)='object'
  and value?&array['brand','claims','rights','accessibility','compliance']
  and (select count(*) from jsonb_object_keys(value))=5
  and not exists(
   select 1 from jsonb_each(value) item
   where item.key not in ('brand','claims','rights','accessibility','compliance')
    or jsonb_typeof(item.value)<>'boolean'
  )
$$;

create function kxra_private.brand_entitled(feature_name text,requested_units bigint default 1)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare decision record;
begin
 if requested_units<1 then return false;end if;
 select * into decision from kxra.entitlement_decision(feature_name,requested_units);
 return coalesce(decision.allowed,false);
exception when others then
 return false;
end $$;

create function kxra_private.brand_reservation_current(reservation uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.usage_reservations r
  where r.id=reservation and r.org_id=kxra_private.member_org()
   and r.account_id=auth.uid() and r.state='RESERVED' and r.expires_at>now()
   and (
    r.entitlement_source_type='OWNER_GRANT' and exists(
     select 1 from kxra.entitlement_grants g
     where g.id=r.entitlement_source_id and g.org_id=r.org_id
      and g.feature_key=r.feature_key and g.state='ACTIVE' and g.starts_at<=now()
      and (g.expires_at is null or g.expires_at>now()) and g.revoked_at is null
    ) or r.entitlement_source_type='SUBSCRIPTION' and exists(
     select 1 from kxra.billing_subscriptions s
     where s.id=r.entitlement_source_id and s.org_id=r.org_id and (
      s.state in ('ACTIVE','TRIALING') and (s.current_period_end is null or s.current_period_end>now())
      or s.state='PAST_DUE' and s.grace_until is not null and s.grace_until>now()
     )
    )
   )
 )
$$;

create function kxra_private.brand_feature_current(feature_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.entitlement_grants g
  where g.org_id=kxra_private.member_org() and g.feature_key=feature_name
   and g.state='ACTIVE' and g.starts_at<=now()
   and (g.expires_at is null or g.expires_at>now()) and g.revoked_at is null
 ) or exists(
  select 1 from kxra.billing_subscriptions s
  join kxra.plan_versions pv on pv.id=s.plan_version_id and pv.state='ACTIVE'
  join kxra.plan_features pf on pf.plan_version_id=pv.id and pf.feature_key=feature_name
  where s.org_id=kxra_private.member_org() and (
   s.state in ('ACTIVE','TRIALING') and (s.current_period_end is null or s.current_period_end>now())
   or s.state='PAST_DUE' and s.grace_until is not null and s.grace_until>now()
  )
 )
$$;

create function kxra_private.guard_brand_append_only() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'Brand evidence is append only';
end $$;

create function kxra_private.guard_brand_version() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Brand version is immutable';end if;
 if old.status<>'DRAFT' and not (old.status='APPROVED' and new.status='SUPERSEDED')
 then raise exception 'Reviewed brand version is immutable';end if;
 if (
  new.id,new.org_id,new.project_id,new.version,new.created_by,new.created_at,
  new.client_request_id
 ) is distinct from (
  old.id,old.org_id,old.project_id,old.version,old.created_by,old.created_at,
  old.client_request_id
 ) then raise exception 'Brand version identity is immutable';end if;
 if tg_table_name='brand_profile_versions' then
  if (
   new.profile_id,new.profile_data,new.profile_sha256,new.classification
  ) is distinct from (
   old.profile_id,old.profile_data,old.profile_sha256,old.classification
  ) then raise exception 'Brand profile version is immutable';end if;
 elsif tg_table_name='campaign_brief_versions' then
  if (
   new.brief_id,new.profile_version_id,new.objective,new.audience,new.offer,
   new.channels,new.constraints,new.claims,new.success_measure,new.brief_sha256
  ) is distinct from (
   old.brief_id,old.profile_version_id,old.objective,old.audience,old.offer,
   old.channels,old.constraints,old.claims,old.success_measure,old.brief_sha256
  ) then raise exception 'Campaign brief version is immutable';end if;
 end if;
 return new;
end $$;

create function kxra_private.guard_creative_variant() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Creative variant is immutable';end if;
 if (
  new.id,new.org_id,new.project_id,new.request_id,new.generation_ordinal,
  new.channel,new.content,new.content_sha256,new.generation_input_sha256,
  new.adapter,new.adapter_version,new.agent_run_id,new.parent_variant_id,
  new.client_request_id,new.edited_by,new.created_at
 ) is distinct from (
  old.id,old.org_id,old.project_id,old.request_id,old.generation_ordinal,
  old.channel,old.content,old.content_sha256,old.generation_input_sha256,
  old.adapter,old.adapter_version,old.agent_run_id,old.parent_variant_id,
  old.client_request_id,old.edited_by,old.created_at
 ) then raise exception 'Creative content is immutable';end if;
 return new;
end $$;

create trigger brand_source_versions_append_only before update or delete on kxra.brand_source_versions
 for each row execute function kxra_private.guard_brand_append_only();
create trigger brand_profile_evidence_append_only before update or delete on kxra.brand_profile_evidence
 for each row execute function kxra_private.guard_brand_append_only();
create trigger creative_reviews_append_only before update or delete on kxra.creative_reviews
 for each row execute function kxra_private.guard_brand_append_only();
create trigger brand_export_deliveries_append_only before update or delete on kxra.brand_export_deliveries
 for each row execute function kxra_private.guard_brand_append_only();
create trigger brand_product_events_append_only before update or delete on kxra.brand_product_events
 for each row execute function kxra_private.guard_brand_append_only();
create trigger brand_profile_versions_immutable before update or delete on kxra.brand_profile_versions
 for each row execute function kxra_private.guard_brand_version();
create trigger campaign_brief_versions_immutable before update or delete on kxra.campaign_brief_versions
 for each row execute function kxra_private.guard_brand_version();
create trigger creative_variants_immutable before update or delete on kxra.creative_variants
 for each row execute function kxra_private.guard_creative_variant();

create function kxra_private.add_brand_profile_evidence(
 p_org uuid,p_project uuid,p_profile_version uuid,p_evidence jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb;source_row kxra.brand_source_versions;source_version_key uuid;
begin
 if jsonb_typeof(p_evidence)<>'array' or jsonb_array_length(p_evidence) not between 1 and 50
 then raise exception 'Brand profile evidence unavailable';end if;
 for item in select value from jsonb_array_elements(p_evidence) loop
  if jsonb_typeof(item)<>'object' or not item?&array[
   'source_version_id','field_path','classification','evidence_note'
  ] then raise exception 'Brand profile evidence unavailable';end if;
  begin source_version_key=(item->>'source_version_id')::uuid;
  exception when others then raise exception 'Brand profile evidence unavailable';end;
  select * into source_row from kxra.brand_source_versions value
  where value.id=source_version_key and value.org_id=p_org and value.project_id=p_project;
  if source_row.id is null
   or item->>'field_path'!~'^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)*$'
   or item->>'classification' not in (
    'AI INFERENCE','USER-SUPPLIED INFORMATION','EXTERNAL RESEARCH'
   )
   or length(trim(item->>'evidence_note')) not between 1 and 2000
  then raise exception 'Brand profile evidence unavailable';end if;
  insert into kxra.brand_profile_evidence(
   org_id,project_id,profile_version_id,source_version_id,field_path,
   classification,evidence_note
  ) values(
   p_org,p_project,p_profile_version,source_row.id,item->>'field_path',
   item->>'classification',trim(item->>'evidence_note')
  );
 end loop;
end $$;

create function kxra.create_brand_source(
 p_project uuid,p_source_type text,p_locator text,p_content text,
 p_rights_basis text,p_consent boolean,p_request uuid
) returns table(source_id uuid,source_version_id uuid,version integer)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();existing kxra.brand_sources;
 existing_version kxra.brand_source_versions;created kxra.brand_sources;
 created_version kxra.brand_source_versions;content_hash text;
begin
 if o is null or not kxra_private.can_project(p_project,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or p_source_type not in ('WEBSITE','MANUAL','FILE') or p_request is null
  or p_consent is distinct from true
  or length(trim(coalesce(p_rights_basis,''))) not between 3 and 2000
  or length(trim(coalesce(p_content,''))) not between 1 and 50000
  or p_source_type='WEBSITE' and not kxra_private.safe_brand_locator(p_locator)
  or p_source_type<>'WEBSITE' and p_locator is not null
 then raise exception 'Brand source unavailable';end if;
 content_hash=encode(sha256(convert_to(trim(p_content),'UTF8')),'hex');
 select * into existing from kxra.brand_sources value
 where value.org_id=o and value.client_request_id=p_request;
 if found then
  select * into existing_version from kxra.brand_source_versions value
  where value.source_id=existing.id and value.version=existing.current_version;
  if existing.project_id<>p_project or existing.source_type<>p_source_type
   or existing.locator is distinct from p_locator
   or existing.rights_basis<>trim(p_rights_basis)
   or existing_version.content_sha256<>content_hash
  then raise exception 'Brand source request conflict';end if;
  return query select existing.id,existing_version.id,existing_version.version;return;
 end if;
 insert into kxra.brand_sources(
  org_id,project_id,source_type,locator,rights_basis,consented_by,client_request_id
 ) values(
  o,p_project,p_source_type,p_locator,trim(p_rights_basis),auth.uid(),p_request
 ) returning * into created;
 insert into kxra.brand_source_versions(
  org_id,project_id,source_id,version,supplied_content,content_sha256,
  fetch_state,security_result,source_classification,created_by
 ) values(
  o,p_project,created.id,1,trim(p_content),content_hash,
  'PROVIDER_DISABLED','NOT_FETCHED',
  case when p_source_type='WEBSITE' then 'EXTERNAL RESEARCH' else 'USER-SUPPLIED INFORMATION' end,
  auth.uid()
 ) returning * into created_version;
 insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
 values(o,p_project,auth.uid(),'SOURCE_ADDED',created.id,
  jsonb_build_object('source_type',p_source_type,'fetch_state','PROVIDER_DISABLED'));
 return query select created.id,created_version.id,1;
end $$;

create function kxra.create_brand_profile(
 p_project uuid,p_name text,p_profile_data jsonb,p_evidence jsonb,p_request uuid
) returns table(profile_id uuid,profile_version_id uuid,version integer)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();existing kxra.brand_profiles;
 existing_version kxra.brand_profile_versions;created kxra.brand_profiles;
 created_version kxra.brand_profile_versions;profile_hash text;
begin
 if o is null or not kxra_private.can_project(p_project,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or p_request is null or length(trim(coalesce(p_name,''))) not between 1 and 160
  or not kxra_private.valid_brand_profile(p_profile_data)
 then raise exception 'Brand profile unavailable';end if;
 profile_hash=encode(sha256(convert_to(p_profile_data::text,'UTF8')),'hex');
 select * into existing from kxra.brand_profiles value
 where value.org_id=o and value.client_request_id=p_request;
 if found then
  select * into existing_version from kxra.brand_profile_versions value
  where value.profile_id=existing.id and value.version=1;
  if existing.project_id<>p_project or existing.name<>trim(p_name)
   or existing_version.profile_sha256<>profile_hash
  then raise exception 'Brand profile request conflict';end if;
  return query select existing.id,existing_version.id,1;return;
 end if;
 insert into kxra.brand_profiles(
  org_id,project_id,name,current_version,state,client_request_id,created_by
 ) values(o,p_project,trim(p_name),1,'DRAFT',p_request,auth.uid())
 returning * into created;
 insert into kxra.brand_profile_versions(
  org_id,project_id,profile_id,version,profile_data,profile_sha256,
  status,classification,client_request_id,created_by
 ) values(
  o,p_project,created.id,1,p_profile_data,profile_hash,'DRAFT','AI INFERENCE',p_request,auth.uid()
 ) returning * into created_version;
 perform kxra_private.add_brand_profile_evidence(
  o,p_project,created_version.id,p_evidence
 );
 insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id)
 values(o,p_project,auth.uid(),'PROFILE_CREATED',created.id);
 return query select created.id,created_version.id,1;
end $$;

create function kxra.revise_brand_profile(
 p_profile uuid,p_expected_version integer,p_profile_data jsonb,p_evidence jsonb,p_request uuid
) returns table(profile_version_id uuid,version integer)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();profile kxra.brand_profiles;
 existing kxra.brand_profile_versions;current_row kxra.brand_profile_versions;
 created kxra.brand_profile_versions;next_version integer;profile_hash text;
begin
 select * into profile from kxra.brand_profiles value where value.id=p_profile for update;
 if profile.id is null or profile.org_id<>o or not kxra_private.can_project(profile.project_id,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or p_expected_version<>profile.current_version or p_request is null
  or not kxra_private.valid_brand_profile(p_profile_data)
 then raise exception 'Brand profile revision unavailable';end if;
 select * into existing from kxra.brand_profile_versions value
 where value.profile_id=profile.id and value.client_request_id=p_request;
 if found then return query select existing.id,existing.version;return;end if;
 select * into current_row from kxra.brand_profile_versions value
 where value.profile_id=profile.id and value.version=profile.current_version;
 if current_row.status='DRAFT' then
  update kxra.brand_profile_versions set status='SUPERSEDED'
  where id=current_row.id;
 end if;
 next_version=profile.current_version+1;
 profile_hash=encode(sha256(convert_to(p_profile_data::text,'UTF8')),'hex');
 insert into kxra.brand_profile_versions(
  org_id,project_id,profile_id,version,profile_data,profile_sha256,
  status,classification,client_request_id,created_by
 ) values(
  o,profile.project_id,profile.id,next_version,p_profile_data,profile_hash,
  'DRAFT','USER-SUPPLIED INFORMATION',p_request,auth.uid()
 ) returning * into created;
 perform kxra_private.add_brand_profile_evidence(
  o,profile.project_id,created.id,p_evidence
 );
 update kxra.brand_profiles set current_version=next_version,updated_at=now()
 where id=profile.id;
 return query select created.id,created.version;
end $$;

create function kxra.decide_brand_profile(
 p_profile uuid,p_version integer,p_decision text,p_note text
) returns kxra.brand_profile_versions
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();profile kxra.brand_profiles;
 value kxra.brand_profile_versions;
begin
 select * into profile from kxra.brand_profiles item where item.id=p_profile for update;
 select * into value from kxra.brand_profile_versions item
 where item.profile_id=p_profile and item.version=p_version for update;
 if profile.id is null or profile.org_id<>o or value.id is null
  or profile.current_version<>p_version or value.status<>'DRAFT'
  or not kxra_private.can_project(profile.project_id,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or p_decision not in ('APPROVE','REJECT')
  or length(trim(coalesce(p_note,''))) not between 1 and 5000
 then raise exception 'Brand profile decision unavailable';end if;
 if p_decision='APPROVE' then
  update kxra.brand_profile_versions set status='SUPERSEDED'
  where profile_id=profile.id and version=profile.approved_version and status='APPROVED';
 end if;
 update kxra.brand_profile_versions set
  status=case when p_decision='APPROVE' then 'APPROVED' else 'REJECTED' end,
  reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_note)
 where id=value.id returning * into value;
 update kxra.brand_profiles set
  approved_version=case when p_decision='APPROVE' then p_version else approved_version end,
  state=case when p_decision='APPROVE' or approved_version is not null then 'ACTIVE' else 'DRAFT' end,
  updated_at=now()
 where id=profile.id;
 if p_decision='APPROVE' then
  insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
  values(o,profile.project_id,auth.uid(),'PROFILE_APPROVED',profile.id,
   jsonb_build_object('version',p_version,'profile_sha256',value.profile_sha256));
 end if;
 return value;
end $$;

create function kxra.register_brand_asset(
 p_profile uuid,p_file_version uuid,p_asset_role text,p_rights_basis text
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();profile kxra.brand_profiles;
 file_version kxra.file_versions;created uuid;
begin
 select * into profile from kxra.brand_profiles value where value.id=p_profile;
 select * into file_version from kxra.file_versions value where value.id=p_file_version;
 if profile.id is null or profile.org_id<>o or file_version.id is null
  or file_version.org_id<>o or file_version.project_id<>profile.project_id
  or file_version.lifecycle_state not in ('CLEAN','EXTRACTED','INDEXED')
  or not kxra_private.can_project(profile.project_id,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or p_asset_role not in (
   'LOGO','IMAGE','DOCUMENT','PALETTE_REFERENCE','TYPOGRAPHY_REFERENCE','OTHER'
  )
  or length(trim(coalesce(p_rights_basis,''))) not between 3 and 2000
 then raise exception 'Brand asset unavailable';end if;
 insert into kxra.brand_assets(
  org_id,project_id,profile_id,file_id,file_version_id,asset_role,
  rights_basis,rights_confirmed_by
 ) values(
  o,profile.project_id,profile.id,file_version.file_id,file_version.id,p_asset_role,
  trim(p_rights_basis),auth.uid()
 ) on conflict(profile_id,file_version_id,asset_role) do update set
  rights_basis=excluded.rights_basis,rights_confirmed_by=auth.uid(),
  rights_confirmed_at=now(),state='ACTIVE'
 returning id into created;
 return created;
end $$;

create function kxra.create_campaign_brief(
 p_project uuid,p_profile uuid,p_profile_version integer,p_name text,
 p_objective text,p_audience text,p_offer text,p_channels text[],
 p_constraints text,p_claims jsonb,p_success_measure text,p_request uuid
) returns table(brief_id uuid,brief_version_id uuid,version integer)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();profile kxra.brand_profiles;
 profile_version kxra.brand_profile_versions;existing kxra.campaign_briefs;
 existing_version kxra.campaign_brief_versions;created kxra.campaign_briefs;
 created_version kxra.campaign_brief_versions;brief_hash text;distinct_channels integer;
begin
 select * into profile from kxra.brand_profiles value where value.id=p_profile;
 select * into profile_version from kxra.brand_profile_versions value
 where value.profile_id=p_profile and value.version=p_profile_version;
 select count(distinct value) into distinct_channels from unnest(p_channels) value;
 if o is null or profile.id is null or profile.org_id<>o or profile.project_id<>p_project
  or profile.approved_version<>p_profile_version or profile_version.status<>'APPROVED'
  or not kxra_private.can_project(p_project,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or p_request is null or length(trim(coalesce(p_name,''))) not between 1 and 160
  or length(trim(coalesce(p_objective,''))) not between 1 and 2000
  or length(trim(coalesce(p_audience,''))) not between 1 and 2000
  or length(trim(coalesce(p_offer,''))) not between 1 and 2000
  or cardinality(p_channels) not between 1 and 6 or distinct_channels<>cardinality(p_channels)
  or not p_channels<@array['LINKEDIN','INSTAGRAM','FACEBOOK','EMAIL','WEB','YOUTUBE']::text[]
  or length(coalesce(p_constraints,''))>5000
  or not kxra_private.valid_brand_claims(p_claims)
  or length(trim(coalesce(p_success_measure,''))) not between 1 and 2000
 then raise exception 'Campaign brief unavailable';end if;
 brief_hash=encode(sha256(convert_to(jsonb_build_object(
  'profile_version_id',profile_version.id,'objective',trim(p_objective),
  'audience',trim(p_audience),'offer',trim(p_offer),'channels',p_channels,
  'constraints',coalesce(p_constraints,''),'claims',p_claims,
  'success_measure',trim(p_success_measure)
 )::text,'UTF8')),'hex');
 select * into existing from kxra.campaign_briefs value
 where value.org_id=o and value.client_request_id=p_request;
 if found then
  select * into existing_version from kxra.campaign_brief_versions value
  where value.brief_id=existing.id and value.version=1;
  if existing.project_id<>p_project or existing.profile_id<>p_profile
   or existing.name<>trim(p_name) or existing_version.brief_sha256<>brief_hash
  then raise exception 'Campaign brief request conflict';end if;
  return query select existing.id,existing_version.id,1;return;
 end if;
 insert into kxra.campaign_briefs(
  org_id,project_id,profile_id,name,current_version,state,client_request_id,created_by
 ) values(o,p_project,p_profile,trim(p_name),1,'DRAFT',p_request,auth.uid())
 returning * into created;
 insert into kxra.campaign_brief_versions(
  org_id,project_id,brief_id,version,profile_version_id,objective,audience,
  offer,channels,constraints,claims,success_measure,brief_sha256,status,
  client_request_id,created_by
 ) values(
  o,p_project,created.id,1,profile_version.id,trim(p_objective),trim(p_audience),
  trim(p_offer),p_channels,coalesce(p_constraints,''),p_claims,
  trim(p_success_measure),brief_hash,'DRAFT',p_request,auth.uid()
 ) returning * into created_version;
 return query select created.id,created_version.id,1;
end $$;

create function kxra.revise_campaign_brief(
 p_brief uuid,p_expected_version integer,p_profile_version integer,
 p_objective text,p_audience text,p_offer text,p_channels text[],
 p_constraints text,p_claims jsonb,p_success_measure text,p_request uuid
) returns table(brief_version_id uuid,version integer)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();brief kxra.campaign_briefs;
 profile kxra.brand_profiles;profile_version kxra.brand_profile_versions;
 existing kxra.campaign_brief_versions;current_row kxra.campaign_brief_versions;
 created kxra.campaign_brief_versions;next_version integer;brief_hash text;
 distinct_channels integer;
begin
 select * into brief from kxra.campaign_briefs value where value.id=p_brief for update;
 select * into profile from kxra.brand_profiles value where value.id=brief.profile_id;
 select * into profile_version from kxra.brand_profile_versions value
 where value.profile_id=profile.id and value.version=p_profile_version;
 select count(distinct value) into distinct_channels from unnest(p_channels) value;
 if brief.id is null or brief.org_id<>o or p_expected_version<>brief.current_version
  or profile.approved_version<>p_profile_version or profile_version.status<>'APPROVED'
  or not kxra_private.can_project(brief.project_id,true)
  or not kxra_private.brand_entitled('brand-studio.access',1) or p_request is null
  or length(trim(coalesce(p_objective,''))) not between 1 and 2000
  or length(trim(coalesce(p_audience,''))) not between 1 and 2000
  or length(trim(coalesce(p_offer,''))) not between 1 and 2000
  or cardinality(p_channels) not between 1 and 6 or distinct_channels<>cardinality(p_channels)
  or not p_channels<@array['LINKEDIN','INSTAGRAM','FACEBOOK','EMAIL','WEB','YOUTUBE']::text[]
  or length(coalesce(p_constraints,''))>5000
  or not kxra_private.valid_brand_claims(p_claims)
  or length(trim(coalesce(p_success_measure,''))) not between 1 and 2000
 then raise exception 'Campaign brief revision unavailable';end if;
 select * into existing from kxra.campaign_brief_versions value
 where value.brief_id=brief.id and value.client_request_id=p_request;
 if found then return query select existing.id,existing.version;return;end if;
 select * into current_row from kxra.campaign_brief_versions value
 where value.brief_id=brief.id and value.version=brief.current_version;
 if current_row.status='DRAFT' then
  update kxra.campaign_brief_versions set status='SUPERSEDED'
  where id=current_row.id;
 end if;
 next_version=brief.current_version+1;
 brief_hash=encode(sha256(convert_to(jsonb_build_object(
  'profile_version_id',profile_version.id,'objective',trim(p_objective),
  'audience',trim(p_audience),'offer',trim(p_offer),'channels',p_channels,
  'constraints',coalesce(p_constraints,''),'claims',p_claims,
  'success_measure',trim(p_success_measure)
 )::text,'UTF8')),'hex');
 insert into kxra.campaign_brief_versions(
  org_id,project_id,brief_id,version,profile_version_id,objective,audience,
  offer,channels,constraints,claims,success_measure,brief_sha256,status,
  client_request_id,created_by
 ) values(
  o,brief.project_id,brief.id,next_version,profile_version.id,trim(p_objective),
  trim(p_audience),trim(p_offer),p_channels,coalesce(p_constraints,''),p_claims,
  trim(p_success_measure),brief_hash,'DRAFT',p_request,auth.uid()
 ) returning * into created;
 update kxra.campaign_briefs set current_version=next_version,updated_at=now()
 where id=brief.id;
 return query select created.id,created.version;
end $$;

create function kxra.decide_campaign_brief(
 p_brief uuid,p_version integer,p_decision text,p_note text
) returns kxra.campaign_brief_versions
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();brief kxra.campaign_briefs;
 value kxra.campaign_brief_versions;profile kxra.brand_profiles;
begin
 select * into brief from kxra.campaign_briefs item where item.id=p_brief for update;
 select * into value from kxra.campaign_brief_versions item
 where item.brief_id=p_brief and item.version=p_version for update;
 select * into profile from kxra.brand_profiles item where item.id=brief.profile_id;
 if brief.id is null or brief.org_id<>o or value.id is null
  or brief.current_version<>p_version or value.status<>'DRAFT'
  or profile.approved_version is null
  or value.profile_version_id<>(
   select id from kxra.brand_profile_versions
   where profile_id=profile.id and version=profile.approved_version
  )
  or not kxra_private.can_project(brief.project_id,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or p_decision not in ('APPROVE','REJECT')
  or length(trim(coalesce(p_note,''))) not between 1 and 5000
 then raise exception 'Campaign brief decision unavailable';end if;
 if p_decision='APPROVE' then
  update kxra.campaign_brief_versions set status='SUPERSEDED'
  where brief_id=brief.id and version=brief.approved_version and status='APPROVED';
 end if;
 update kxra.campaign_brief_versions set
  status=case when p_decision='APPROVE' then 'APPROVED' else 'REJECTED' end,
  reviewed_by=auth.uid(),reviewed_at=now(),review_note=trim(p_note)
 where id=value.id returning * into value;
 update kxra.campaign_briefs set
  approved_version=case when p_decision='APPROVE' then p_version else approved_version end,
  state=case when p_decision='APPROVE' or approved_version is not null then 'ACTIVE' else 'DRAFT' end,
  updated_at=now()
 where id=brief.id;
 if p_decision='APPROVE' then
  insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
  values(o,brief.project_id,auth.uid(),'CAMPAIGN_APPROVED',brief.id,
   jsonb_build_object('version',p_version,'brief_sha256',value.brief_sha256));
 end if;
 return value;
end $$;

create function kxra.begin_brand_generation(
 p_project uuid,p_profile uuid,p_profile_version integer,p_brief uuid,
 p_brief_version integer,p_channels text[],p_variant_count integer,p_request uuid
) returns table(
 generation_request_id uuid,request_state text,input_sha256 text,
 profile_data jsonb,objective text,audience text,offer text,channels text[],
 constraints text,claims jsonb,success_measure text,adapter_version text
) language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();profile kxra.brand_profiles;
 profile_version kxra.brand_profile_versions;brief kxra.campaign_briefs;
 brief_version kxra.campaign_brief_versions;existing kxra.creative_requests;
 created kxra.creative_requests;reservation kxra.usage_reservations;
 input_hash text;distinct_channels integer;adapter_ver text='local-brand-v1';
begin
 select * into profile from kxra.brand_profiles value where value.id=p_profile;
 select * into profile_version from kxra.brand_profile_versions value
 where value.profile_id=p_profile and value.version=p_profile_version;
 select * into brief from kxra.campaign_briefs value where value.id=p_brief;
 select * into brief_version from kxra.campaign_brief_versions value
 where value.brief_id=p_brief and value.version=p_brief_version;
 select count(distinct value) into distinct_channels from unnest(p_channels) value;
 if o is null or profile.id is null or profile.org_id<>o or profile.project_id<>p_project
  or profile.approved_version<>p_profile_version or profile_version.status<>'APPROVED'
  or brief.id is null or brief.org_id<>o or brief.project_id<>p_project
  or brief.profile_id<>profile.id or brief.approved_version<>p_brief_version
  or brief_version.status<>'APPROVED' or brief_version.profile_version_id<>profile_version.id
  or not kxra_private.can_project(p_project,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or p_request is null or p_variant_count not between 1 and 6
  or cardinality(p_channels) not between 1 and 6 or distinct_channels<>cardinality(p_channels)
  or not p_channels<@brief_version.channels
 then raise exception 'Brand generation unavailable';end if;
 input_hash=encode(sha256(convert_to(jsonb_build_object(
  'profile_version_id',profile_version.id,'profile_sha256',profile_version.profile_sha256,
  'brief_version_id',brief_version.id,'brief_sha256',brief_version.brief_sha256,
  'channels',p_channels,'variant_count',p_variant_count,'adapter_version',adapter_ver
 )::text,'UTF8')),'hex');
 select * into existing from kxra.creative_requests value
 where value.org_id=o and value.client_request_id=p_request;
 if found then
  if existing.project_id<>p_project or existing.profile_version_id<>profile_version.id
   or existing.brief_version_id<>brief_version.id or existing.input_sha256<>input_hash
  then raise exception 'Brand generation request conflict';end if;
  return query select existing.id,existing.state,existing.input_sha256,
   profile_version.profile_data,brief_version.objective,brief_version.audience,
   brief_version.offer,existing.requested_channels,brief_version.constraints,
   brief_version.claims,brief_version.success_measure,existing.adapter_version;
  return;
 end if;
 select * into reservation from kxra.reserve_usage(
  'brand.generate',p_variant_count::bigint,'brand-generate:'||p_request::text
 );
 insert into kxra.creative_requests(
  org_id,project_id,profile_id,profile_version_id,brief_id,brief_version_id,
  initiated_by,client_request_id,usage_reservation_id,requested_channels,
  variant_count,input_sha256,adapter,adapter_version,state
 ) values(
  o,p_project,profile.id,profile_version.id,brief.id,brief_version.id,
  auth.uid(),p_request,reservation.id,p_channels,p_variant_count,input_hash,
  'LOCAL_DETERMINISTIC',adapter_ver,'RUNNING'
 ) returning * into created;
 insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
 values(o,p_project,auth.uid(),'GENERATION_STARTED',created.id,
  jsonb_build_object('variant_count',p_variant_count,'channels',p_channels));
 return query select created.id,created.state,created.input_sha256,
  profile_version.profile_data,brief_version.objective,brief_version.audience,
  brief_version.offer,created.requested_channels,brief_version.constraints,
  brief_version.claims,brief_version.success_measure,created.adapter_version;
end $$;

create function kxra.complete_brand_generation(
 p_request uuid,p_expected_input_sha256 text,p_outputs jsonb
) returns table(result_state text,variant_ids uuid[])
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();request_row kxra.creative_requests;
 item jsonb;content jsonb;item_channel text;position integer=0;created_id uuid;
 ids uuid[]='{}'::uuid[];output_hash text;
begin
 select * into request_row from kxra.creative_requests value
 where value.id=p_request for update;
 if request_row.id is null or request_row.org_id<>o or request_row.initiated_by<>auth.uid()
  or request_row.input_sha256<>p_expected_input_sha256
  or not kxra_private.can_project(request_row.project_id,true)
 then raise exception 'Brand generation completion unavailable';end if;
 if request_row.state='SUCCEEDED' then
  select coalesce(array_agg(id order by generation_ordinal),'{}'::uuid[]) into ids
  from kxra.creative_variants where request_id=request_row.id and generation_ordinal is not null;
  return query select request_row.state,ids;return;
 end if;
 if request_row.state<>'RUNNING' then
  raise exception 'Brand generation completion unavailable';
 end if;
 if not kxra_private.brand_reservation_current(request_row.usage_reservation_id) then
  perform kxra.complete_usage_reservation(
   request_row.usage_reservation_id,'FAILURE',0,0,'GBP'
  );
  update kxra.creative_requests set state='WITHHELD',failure_code='AUTHORITY_CHANGED',
   completed_at=now() where id=request_row.id;
  insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
  values(o,request_row.project_id,auth.uid(),'GENERATION_FAILED',request_row.id,
   jsonb_build_object('reason_code','AUTHORITY_CHANGED'));
  return query select 'WITHHELD','{}'::uuid[];return;
 end if;
 if jsonb_typeof(p_outputs)<>'array'
  or jsonb_array_length(p_outputs)<>request_row.variant_count
 then raise exception 'Brand generation output unavailable';end if;
 for item in select value from jsonb_array_elements(p_outputs) loop
  position=position+1;
  item_channel=item->>'channel';content=item->'content';
  if jsonb_typeof(item)<>'object' or item_channel is null
   or not item_channel=any(request_row.requested_channels)
   or not kxra_private.valid_creative_content(content)
  then raise exception 'Brand generation output unavailable';end if;
  insert into kxra.creative_variants(
   org_id,project_id,request_id,generation_ordinal,channel,content,content_sha256,
   generation_input_sha256,adapter,adapter_version,state
  ) values(
   o,request_row.project_id,request_row.id,position,item_channel,content,
   encode(sha256(convert_to(content::text,'UTF8')),'hex'),request_row.input_sha256,
   request_row.adapter,request_row.adapter_version,'REVIEW_REQUIRED'
  ) returning id into created_id;
  ids=array_append(ids,created_id);
 end loop;
 output_hash=encode(sha256(convert_to(p_outputs::text,'UTF8')),'hex');
 perform kxra.complete_usage_reservation(
  request_row.usage_reservation_id,'SUCCESS',request_row.variant_count,0,'GBP'
 );
 update kxra.creative_requests set state='SUCCEEDED',output_sha256=output_hash,
  completed_at=now() where id=request_row.id;
 insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
 values(o,request_row.project_id,auth.uid(),'GENERATION_COMPLETED',request_row.id,
  jsonb_build_object('variant_count',request_row.variant_count,'output_sha256',output_hash));
 return query select 'SUCCEEDED',ids;
end $$;

create function kxra.fail_brand_generation(p_request uuid,p_reason_code text)
returns void language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();request_row kxra.creative_requests;
begin
 select * into request_row from kxra.creative_requests value
 where value.id=p_request for update;
 if request_row.id is null or request_row.org_id<>o or request_row.initiated_by<>auth.uid()
  or not kxra_private.can_project(request_row.project_id,true)
  or p_reason_code!~'^[A-Z][A-Z0-9_]{2,79}$'
 then raise exception 'Brand generation failure unavailable';end if;
 if request_row.state<>'RUNNING' then return;end if;
 perform kxra.complete_usage_reservation(
  request_row.usage_reservation_id,'FAILURE',0,0,'GBP'
 );
 update kxra.creative_requests set state='FAILED',failure_code=p_reason_code,
  completed_at=now() where id=request_row.id;
 insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
 values(o,request_row.project_id,auth.uid(),'GENERATION_FAILED',request_row.id,
  jsonb_build_object('reason_code',p_reason_code));
end $$;

create function kxra.revise_creative_variant(
 p_variant uuid,p_expected_sha256 text,p_content jsonb,p_request uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();parent kxra.creative_variants;
 existing kxra.creative_variants;created uuid;content_hash text;
begin
 select * into parent from kxra.creative_variants value where value.id=p_variant for update;
 if parent.id is null or parent.org_id<>o or parent.content_sha256<>p_expected_sha256
  or parent.state='SUPERSEDED' or p_request is null
  or not kxra_private.can_project(parent.project_id,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or not kxra_private.valid_creative_content(p_content)
 then raise exception 'Creative revision unavailable';end if;
 content_hash=encode(sha256(convert_to(p_content::text,'UTF8')),'hex');
 select * into existing from kxra.creative_variants value
 where value.org_id=o and value.client_request_id=p_request;
 if found then
  if existing.parent_variant_id<>parent.id or existing.content_sha256<>content_hash
  then raise exception 'Creative revision request conflict';end if;
  return existing.id;
 end if;
 insert into kxra.creative_variants(
  org_id,project_id,request_id,generation_ordinal,channel,content,content_sha256,
  generation_input_sha256,adapter,adapter_version,parent_variant_id,
  client_request_id,state,edited_by
 ) values(
  o,parent.project_id,parent.request_id,null,parent.channel,p_content,content_hash,
  parent.generation_input_sha256,'USER_EDIT','manual-v1',parent.id,p_request,
  'REVIEW_REQUIRED',auth.uid()
 ) returning id into created;
 update kxra.creative_variants set state='SUPERSEDED' where id=parent.id;
 insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
 values(o,parent.project_id,auth.uid(),'VARIANT_EDITED',created,
  jsonb_build_object('parent_variant_id',parent.id,'content_sha256',content_hash));
 return created;
end $$;

create function kxra.review_creative_variant(
 p_variant uuid,p_expected_sha256 text,p_checks jsonb,p_decision text,
 p_note text,p_request uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();variant kxra.creative_variants;
 existing kxra.creative_reviews;created uuid;all_pass boolean;
begin
 select * into variant from kxra.creative_variants value where value.id=p_variant for update;
 all_pass=kxra_private.valid_creative_review(p_checks)
  and (p_checks->>'brand')::boolean and (p_checks->>'claims')::boolean
  and (p_checks->>'rights')::boolean and (p_checks->>'accessibility')::boolean
  and (p_checks->>'compliance')::boolean;
 if variant.id is null or variant.org_id<>o or variant.content_sha256<>p_expected_sha256
  or variant.state in ('SUPERSEDED','EXPORTED') or p_request is null
  or not kxra_private.can_project(variant.project_id,true)
  or not kxra_private.brand_entitled('brand-studio.access',1)
  or p_decision not in ('APPROVE_EXPORT','REQUEST_CHANGES','REJECT')
  or length(trim(coalesce(p_note,''))) not between 1 and 5000
  or not kxra_private.valid_creative_review(p_checks)
  or p_decision='APPROVE_EXPORT' and all_pass is not true
 then raise exception 'Creative review unavailable';end if;
 select * into existing from kxra.creative_reviews value
 where value.org_id=o and value.client_request_id=p_request;
 if found then
  if existing.variant_id<>variant.id or existing.variant_sha256<>variant.content_sha256
   or existing.decision<>p_decision
  then raise exception 'Creative review request conflict';end if;
  return existing.id;
 end if;
 insert into kxra.creative_reviews(
  org_id,project_id,variant_id,variant_sha256,checks,decision,note,
  client_request_id,reviewed_by
 ) values(
  o,variant.project_id,variant.id,variant.content_sha256,p_checks,p_decision,
  trim(p_note),p_request,auth.uid()
 ) returning id into created;
 update kxra.creative_variants set state=case p_decision
  when 'APPROVE_EXPORT' then 'APPROVED'
  when 'REJECT' then 'REJECTED'
  else 'REVIEW_REQUIRED' end
 where id=variant.id;
 insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
 values(o,variant.project_id,auth.uid(),'VARIANT_REVIEWED',variant.id,
  jsonb_build_object('review_id',created,'decision',p_decision));
 return created;
end $$;

create function kxra.create_brand_export(
 p_variant uuid,p_expected_sha256 text,p_review uuid,p_format text,p_request uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();variant kxra.creative_variants;
 review kxra.creative_reviews;latest_review uuid;existing kxra.brand_exports;
 reservation kxra.usage_reservations;created uuid;
begin
 select * into variant from kxra.creative_variants value where value.id=p_variant for update;
 select * into review from kxra.creative_reviews value where value.id=p_review;
 select id into latest_review from kxra.creative_reviews value
 where value.variant_id=p_variant order by value.created_at desc,value.id desc limit 1;
 if variant.id is null or variant.org_id<>o or variant.content_sha256<>p_expected_sha256
  or variant.state<>'APPROVED' or review.id is null or review.id<>latest_review
  or review.variant_id<>variant.id or review.variant_sha256<>variant.content_sha256
  or review.decision<>'APPROVE_EXPORT' or p_format not in ('TEXT','MARKDOWN','JSON')
  or p_request is null or not kxra_private.can_project(variant.project_id,true)
  or not kxra_private.brand_entitled('brand.export',1)
 then raise exception 'Brand export unavailable';end if;
 select * into existing from kxra.brand_exports value
 where value.org_id=o and value.client_request_id=p_request;
 if found then
  if existing.variant_id<>variant.id or existing.review_id<>review.id
   or existing.export_format<>p_format or existing.content_sha256<>variant.content_sha256
  then raise exception 'Brand export request conflict';end if;
  return existing.id;
 end if;
 select * into reservation from kxra.reserve_usage(
  'brand.export',1,'brand-export:'||p_request::text
 );
 insert into kxra.brand_exports(
  org_id,project_id,variant_id,review_id,usage_reservation_id,requested_by,
  client_request_id,export_format,content_sha256,metadata,state
 ) values(
  o,variant.project_id,variant.id,review.id,reservation.id,auth.uid(),p_request,
  p_format,variant.content_sha256,jsonb_build_object(
   'channel',variant.channel,'adapter',variant.adapter,
   'adapter_version',variant.adapter_version,'publication_authorized',false
  ),'READY'
 ) returning id into created;
 perform kxra.complete_usage_reservation(reservation.id,'SUCCESS',1,0,'GBP');
 update kxra.creative_variants set state='EXPORTED' where id=variant.id;
 insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
 values(o,variant.project_id,auth.uid(),'EXPORT_CREATED',created,
  jsonb_build_object('variant_id',variant.id,'format',p_format));
 return created;
end $$;

create function kxra.authorize_brand_export(p_export uuid)
returns table(
 allowed boolean,reason_code text,export_format text,filename text,
 content jsonb,content_sha256 text
) language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();export_row kxra.brand_exports;
 variant kxra.creative_variants;review kxra.creative_reviews;
 membership kxra.organisation_memberships;reason text='EXPORT_UNAVAILABLE';
begin
 select * into export_row from kxra.brand_exports value where value.id=p_export;
 if export_row.id is null or export_row.org_id<>o
  or not kxra_private.can_project(export_row.project_id,false)
 then return query select false,reason,null::text,null::text,null::jsonb,null::text;return;end if;
 select * into variant from kxra.creative_variants value where value.id=export_row.variant_id;
 select * into review from kxra.creative_reviews value where value.id=export_row.review_id;
 select * into membership from kxra.organisation_memberships value
 where value.account_id=auth.uid() and value.org_id=o and value.state='ACTIVE'
  and (value.expires_at is null or value.expires_at>now());
 if export_row.state<>'READY' then reason='EXPORT_NOT_READY';
 elsif membership.id is null then reason='AUTHORITY_CHANGED';
 elsif variant.id is null or variant.content_sha256<>export_row.content_sha256
  or review.id is null or review.variant_id<>variant.id
  or review.variant_sha256<>variant.content_sha256 or review.decision<>'APPROVE_EXPORT'
 then reason='EXPORT_EVIDENCE_CHANGED';
 elsif not kxra_private.brand_feature_current('brand.export')
 then reason='ENTITLEMENT_CHANGED';
 else reason='AUTHORIZED';end if;
 if reason<>'AUTHORIZED' then
  insert into kxra.brand_export_deliveries(
   org_id,project_id,export_id,account_id,membership_id,membership_version,
   outcome,reason_code
  ) values(
   o,export_row.project_id,export_row.id,auth.uid(),membership.id,membership.version,
   'WITHHELD',reason
  );
  return query select false,reason,null::text,null::text,null::jsonb,null::text;return;
 end if;
 insert into kxra.brand_export_deliveries(
  org_id,project_id,export_id,account_id,membership_id,membership_version,
  outcome,reason_code
 ) values(
  o,export_row.project_id,export_row.id,auth.uid(),membership.id,membership.version,
  'DELIVERED','AUTHORIZED'
 );
 update kxra.brand_exports set delivered_at=coalesce(delivered_at,now())
 where id=export_row.id;
 insert into kxra.brand_product_events(org_id,project_id,account_id,event_type,resource_id,metadata)
 values(o,export_row.project_id,auth.uid(),'EXPORT_DELIVERED',export_row.id,
  jsonb_build_object('format',export_row.export_format));
 return query select true,'AUTHORIZED',export_row.export_format,
  'kxra-brand-'||left(export_row.id::text,8)||case export_row.export_format
   when 'JSON' then '.json' when 'MARKDOWN' then '.md' else '.txt' end,
  variant.content,variant.content_sha256;
end $$;

revoke all on function kxra_private.safe_brand_locator(text),
 kxra_private.valid_brand_profile(jsonb),
 kxra_private.valid_brand_claims(jsonb),
 kxra_private.valid_creative_content(jsonb),
 kxra_private.valid_creative_review(jsonb),
 kxra_private.brand_entitled(text,bigint),
 kxra_private.brand_reservation_current(uuid),
 kxra_private.brand_feature_current(text),
 kxra_private.guard_brand_append_only(),
 kxra_private.guard_brand_version(),
 kxra_private.guard_creative_variant(),
 kxra_private.add_brand_profile_evidence(uuid,uuid,uuid,jsonb)
from public,authenticated,anon;

revoke all on function kxra.create_brand_source(uuid,text,text,text,text,boolean,uuid),
 kxra.create_brand_profile(uuid,text,jsonb,jsonb,uuid),
 kxra.revise_brand_profile(uuid,integer,jsonb,jsonb,uuid),
 kxra.decide_brand_profile(uuid,integer,text,text),
 kxra.register_brand_asset(uuid,uuid,text,text),
 kxra.create_campaign_brief(uuid,uuid,integer,text,text,text,text,text[],text,jsonb,text,uuid),
 kxra.revise_campaign_brief(uuid,integer,integer,text,text,text,text[],text,jsonb,text,uuid),
 kxra.decide_campaign_brief(uuid,integer,text,text),
 kxra.begin_brand_generation(uuid,uuid,integer,uuid,integer,text[],integer,uuid),
 kxra.complete_brand_generation(uuid,text,jsonb),
 kxra.fail_brand_generation(uuid,text),
 kxra.revise_creative_variant(uuid,text,jsonb,uuid),
 kxra.review_creative_variant(uuid,text,jsonb,text,text,uuid),
 kxra.create_brand_export(uuid,text,uuid,text,uuid),
 kxra.authorize_brand_export(uuid)
from public;

grant execute on function kxra.create_brand_source(uuid,text,text,text,text,boolean,uuid),
 kxra.create_brand_profile(uuid,text,jsonb,jsonb,uuid),
 kxra.revise_brand_profile(uuid,integer,jsonb,jsonb,uuid),
 kxra.decide_brand_profile(uuid,integer,text,text),
 kxra.register_brand_asset(uuid,uuid,text,text),
 kxra.create_campaign_brief(uuid,uuid,integer,text,text,text,text,text[],text,jsonb,text,uuid),
 kxra.revise_campaign_brief(uuid,integer,integer,text,text,text,text[],text,jsonb,text,uuid),
 kxra.decide_campaign_brief(uuid,integer,text,text),
 kxra.begin_brand_generation(uuid,uuid,integer,uuid,integer,text[],integer,uuid),
 kxra.complete_brand_generation(uuid,text,jsonb),
 kxra.fail_brand_generation(uuid,text),
 kxra.revise_creative_variant(uuid,text,jsonb,uuid),
 kxra.review_creative_variant(uuid,text,jsonb,text,text,uuid),
 kxra.create_brand_export(uuid,text,uuid,text,uuid),
 kxra.authorize_brand_export(uuid)
to authenticated;

commit;
