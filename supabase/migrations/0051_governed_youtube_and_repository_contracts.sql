begin;

create function kxra_private.phase2_project_is(project_key uuid,expected_code text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from kxra.projects p
  where p.id=project_key and p.org_id=kxra_private.member_org() and p.code=expected_code
 )
$$;

create function kxra_private.valid_youtube_source_pack(value jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(value)='array' and jsonb_array_length(value) between 1 and 50
  and not exists(
   select 1 from jsonb_array_elements(value) item
   where jsonb_typeof(item)<>'object'
    or not item?&array['source_url','title','published_at','accessed_at','source_type']
    or item-array['source_url','title','published_at','accessed_at','source_type']<>'{}'::jsonb
    or jsonb_typeof(item->'source_url')<>'string'
    or item->>'source_url'!~'^https://[^[:space:]]+$'
    or length(item->>'source_url') not between 12 and 2000
    or jsonb_typeof(item->'title')<>'string'
    or length(trim(item->>'title')) not between 3 and 500
    or item->>'published_at'!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
    or item->>'accessed_at'!~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
    or item->>'source_type' not in ('PRIMARY','OFFICIAL','SECONDARY')
  )
$$;

create function kxra_private.valid_youtube_claim_ledger(value jsonb,sources jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(value)='array' and jsonb_array_length(value) between 1 and 100
  and (select count(*) from jsonb_array_elements(value))=
      (select count(distinct item->>'claim_id') from jsonb_array_elements(value) item)
  and not exists(
   select 1 from jsonb_array_elements(value) item
   where jsonb_typeof(item)<>'object'
    or not item?&array['claim_id','text','source_url','classification','script_usage','review_state']
    or item-array['claim_id','text','source_url','classification','script_usage','review_state']<>'{}'::jsonb
    or item->>'claim_id'!~'^[A-Z0-9][A-Z0-9_-]{0,39}$'
    or length(trim(item->>'text')) not between 3 and 2000
    or length(trim(item->>'script_usage')) not between 3 and 2000
    or item->>'classification' not in (
     'FACT','USER-SUPPLIED INFORMATION','EXTERNAL RESEARCH','ASSUMPTION',
     'HYPOTHESIS','ESTIMATE','AI INFERENCE','UNRESOLVED QUESTION'
    )
    or item->>'review_state' not in ('SUPPORTED','UNSUPPORTED','NEEDS_REVIEW')
    or not exists(
     select 1 from jsonb_array_elements(sources) source
     where source->>'source_url'=item->>'source_url'
    )
  )
$$;

create function kxra_private.valid_youtube_package(
 sources jsonb,claims jsonb,red_team jsonb,storyboard jsonb,rights_review jsonb,
 voice_provenance jsonb,render_manifest jsonb,qa_review jsonb,publication_metadata jsonb
) returns boolean language sql immutable set search_path='' as $$
 select kxra_private.valid_youtube_source_pack(sources)
  and kxra_private.valid_youtube_claim_ledger(claims,sources)
  and red_team?&array['financial_promotions_clear','misinformation_clear','originality_clear','advice_language_clear']
  and red_team-array['financial_promotions_clear','misinformation_clear','originality_clear','advice_language_clear']='{}'::jsonb
  and not exists(select 1 from jsonb_each(red_team) x where jsonb_typeof(x.value)<>'boolean')
  and storyboard?&array['scenes'] and storyboard-array['scenes']='{}'::jsonb
  and jsonb_typeof(storyboard->'scenes')='array'
  and jsonb_array_length(storyboard->'scenes') between 1 and 100
  and rights_review?&array['assets_cleared','music_cleared','voice_rights_cleared']
  and rights_review-array['assets_cleared','music_cleared','voice_rights_cleared']='{}'::jsonb
  and not exists(select 1 from jsonb_each(rights_review) x where jsonb_typeof(x.value)<>'boolean')
  and voice_provenance?&array['voice_type','provider','rights_basis','disclosure_required','disclosure_present']
  and voice_provenance-array['voice_type','provider','rights_basis','disclosure_required','disclosure_present']='{}'::jsonb
  and voice_provenance->>'voice_type' in ('HUMAN','SYNTHETIC','NONE')
  and length(trim(voice_provenance->>'provider')) between 1 and 240
  and length(trim(voice_provenance->>'rights_basis')) between 3 and 2000
  and jsonb_typeof(voice_provenance->'disclosure_required')='boolean'
  and jsonb_typeof(voice_provenance->'disclosure_present')='boolean'
  and render_manifest?&array['render_sha256','captions_sha256','duration_seconds','format','local_only']
  and render_manifest-array['render_sha256','captions_sha256','duration_seconds','format','local_only']='{}'::jsonb
  and render_manifest->>'render_sha256'~'^[a-f0-9]{64}$'
  and render_manifest->>'captions_sha256'~'^[a-f0-9]{64}$'
  and jsonb_typeof(render_manifest->'duration_seconds')='number'
  and (render_manifest->>'duration_seconds')::numeric between 1 and 43200
  and render_manifest->>'format' in ('MP4','WEBM')
  and jsonb_typeof(render_manifest->'local_only')='boolean'
  and qa_review?&array['technical','captions','editorial','accessibility']
  and qa_review-array['technical','captions','editorial','accessibility']='{}'::jsonb
  and not exists(select 1 from jsonb_each(qa_review) x where jsonb_typeof(x.value)<>'boolean')
  and publication_metadata?&array['title','description','thumbnail_sha256','disclosure_text','visibility','deceptive_metadata_clear']
  and publication_metadata-array['title','description','thumbnail_sha256','disclosure_text','visibility','deceptive_metadata_clear']='{}'::jsonb
  and length(trim(publication_metadata->>'title')) between 3 and 100
  and length(trim(publication_metadata->>'description')) between 3 and 5000
  and publication_metadata->>'thumbnail_sha256'~'^[a-f0-9]{64}$'
  and length(publication_metadata->>'disclosure_text')<=2000
  and publication_metadata->>'visibility' in ('PRIVATE','UNLISTED')
  and jsonb_typeof(publication_metadata->'deceptive_metadata_clear')='boolean'
$$;

create function kxra_private.youtube_package_ready(
 claims jsonb,red_team jsonb,rights_review jsonb,voice_provenance jsonb,
 render_manifest jsonb,qa_review jsonb,publication_metadata jsonb
) returns boolean language sql immutable set search_path='' as $$
 select not exists(
   select 1 from jsonb_array_elements(claims) item where item->>'review_state'<>'SUPPORTED'
  )
  and not exists(select 1 from jsonb_each(red_team) x where x.value<>'true'::jsonb)
  and not exists(select 1 from jsonb_each(rights_review) x where x.value<>'true'::jsonb)
  and render_manifest->'local_only'='true'::jsonb
  and not exists(select 1 from jsonb_each(qa_review) x where x.value<>'true'::jsonb)
  and publication_metadata->'deceptive_metadata_clear'='true'::jsonb
  and publication_metadata->>'visibility' in ('PRIVATE','UNLISTED')
  and (
   voice_provenance->'disclosure_required'='false'::jsonb
   or voice_provenance->'disclosure_present'='true'::jsonb
  )
$$;

create function kxra_private.valid_youtube_review_checks(value jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(value)='object'
  and value?&array['sources','claims','originality','rights','disclosure','compliance','technical_qa','captions','metadata']
  and value-array['sources','claims','originality','rights','disclosure','compliance','technical_qa','captions','metadata']='{}'::jsonb
  and not exists(select 1 from jsonb_each(value) item where jsonb_typeof(item.value)<>'boolean')
$$;

create function kxra_private.guard_phase2_append_only() returns trigger
language plpgsql set search_path='' as $$
begin
 raise exception 'Governed evidence is append only';
end $$;

create function kxra_private.guard_youtube_package_version() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'YouTube package version is immutable';end if;
 if (
  new.id,new.org_id,new.project_id,new.package_id,new.version,new.source_pack,
  new.claim_ledger,new.script,new.red_team,new.storyboard,new.rights_review,
  new.voice_provenance,new.render_manifest,new.qa_review,new.publication_metadata,
  new.content_sha256,new.client_request_id,new.created_by,new.created_at
 ) is distinct from (
  old.id,old.org_id,old.project_id,old.package_id,old.version,old.source_pack,
  old.claim_ledger,old.script,old.red_team,old.storyboard,old.rights_review,
  old.voice_provenance,old.render_manifest,old.qa_review,old.publication_metadata,
  old.content_sha256,old.client_request_id,old.created_by,old.created_at
 ) then raise exception 'YouTube package content is immutable';end if;
 if not (
  new.status=old.status
  or old.status='DRAFT' and new.status in ('APPROVED','REJECTED','SUPERSEDED')
  or old.status='APPROVED' and new.status='SUPERSEDED'
 ) then raise exception 'YouTube package status transition unavailable';end if;
 return new;
end $$;

create function kxra_private.guard_youtube_upload_intent() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'YouTube upload intent is immutable';end if;
 if (
  new.id,new.org_id,new.project_id,new.channel_binding_id,new.channel_binding_version,
  new.package_id,new.package_version_id,new.package_version,new.review_id,
  new.content_sha256,new.intent_sha256,new.idempotency_key,new.requested_by,
  new.adapter,new.delivery_state,new.created_at
 ) is distinct from (
  old.id,old.org_id,old.project_id,old.channel_binding_id,old.channel_binding_version,
  old.package_id,old.package_version_id,old.package_version,old.review_id,
  old.content_sha256,old.intent_sha256,old.idempotency_key,old.requested_by,
  old.adapter,old.delivery_state,old.created_at
 ) then raise exception 'YouTube upload intent envelope is immutable';end if;
 if not (new.state=old.state or old.state='READY' and new.state='WITHDRAWN')
 then raise exception 'YouTube upload intent transition unavailable';end if;
 return new;
end $$;

create function kxra_private.guard_youtube_channel_binding() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'YouTube channel binding cannot be deleted';end if;
 if (new.id,new.org_id,new.project_id,new.expected_channel_url,new.expected_handle,new.created_at)
  is distinct from
  (old.id,old.org_id,old.project_id,old.expected_channel_url,old.expected_handle,old.created_at)
 then raise exception 'YouTube channel identity is immutable';end if;
 if new.version<>old.version+1 or new.updated_at<=old.updated_at
 then raise exception 'YouTube channel binding version unavailable';end if;
 if not (
  old.state='UNVERIFIED' and new.state='VERIFIED'
  or old.state='VERIFIED' and new.state='DISCONNECTED'
  or old.state='DISCONNECTED' and new.state='VERIFIED'
 ) then raise exception 'YouTube channel binding transition unavailable';end if;
 return new;
end $$;

create trigger youtube_channel_bindings_guard before update or delete on kxra.youtube_channel_bindings
 for each row execute function kxra_private.guard_youtube_channel_binding();
create trigger youtube_content_package_versions_guard before update or delete on kxra.youtube_content_package_versions
 for each row execute function kxra_private.guard_youtube_package_version();
create trigger youtube_content_reviews_append_only before update or delete on kxra.youtube_content_reviews
 for each row execute function kxra_private.guard_phase2_append_only();
create trigger youtube_upload_intents_guard before update or delete on kxra.youtube_upload_intents
 for each row execute function kxra_private.guard_youtube_upload_intent();

create function kxra.create_youtube_content_package(
 p_project uuid,p_topic text,p_source_pack jsonb,p_claim_ledger jsonb,p_script text,
 p_red_team jsonb,p_storyboard jsonb,p_rights_review jsonb,p_voice_provenance jsonb,
 p_render_manifest jsonb,p_qa_review jsonb,p_publication_metadata jsonb,p_request uuid
) returns table(package_id uuid,package_version_id uuid,version integer,content_sha256 text)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();existing kxra.youtube_content_packages;
 existing_version kxra.youtube_content_package_versions;created kxra.youtube_content_packages;
 created_version kxra.youtube_content_package_versions;content_hash text;
begin
 if o is null or not kxra_private.can_project(p_project,true)
  or not kxra_private.phase2_project_is(p_project,'PROJECT-006')
  or p_request is null or length(trim(coalesce(p_topic,''))) not between 3 and 500
  or length(trim(coalesce(p_script,''))) not between 100 and 50000
  or not kxra_private.valid_youtube_package(
   p_source_pack,p_claim_ledger,p_red_team,p_storyboard,p_rights_review,
   p_voice_provenance,p_render_manifest,p_qa_review,p_publication_metadata
  )
 then raise exception 'YouTube content package unavailable';end if;
 content_hash=encode(sha256(convert_to(jsonb_build_object(
  'topic',trim(p_topic),'source_pack',p_source_pack,'claim_ledger',p_claim_ledger,
  'script',trim(p_script),'red_team',p_red_team,'storyboard',p_storyboard,
  'rights_review',p_rights_review,'voice_provenance',p_voice_provenance,
  'render_manifest',p_render_manifest,'qa_review',p_qa_review,
  'publication_metadata',p_publication_metadata
 )::text,'UTF8')),'hex');
 select * into existing from kxra.youtube_content_packages value
 where value.org_id=o and value.project_id=p_project and value.client_request_id=p_request;
 if found then
  select * into existing_version from kxra.youtube_content_package_versions value
  where value.package_id=existing.id and value.version=1;
  if existing.topic<>trim(p_topic) or existing_version.content_sha256<>content_hash
  then raise exception 'YouTube content package request conflict';end if;
  return query select existing.id,existing_version.id,existing_version.version,existing_version.content_sha256;
  return;
 end if;
 insert into kxra.youtube_content_packages(
  org_id,project_id,topic,client_request_id,created_by
 ) values(o,p_project,trim(p_topic),p_request,auth.uid()) returning * into created;
 insert into kxra.youtube_content_package_versions(
  org_id,project_id,package_id,version,source_pack,claim_ledger,script,red_team,
  storyboard,rights_review,voice_provenance,render_manifest,qa_review,
  publication_metadata,content_sha256,client_request_id,created_by
 ) values(
  o,p_project,created.id,1,p_source_pack,p_claim_ledger,trim(p_script),p_red_team,
  p_storyboard,p_rights_review,p_voice_provenance,p_render_manifest,p_qa_review,
  p_publication_metadata,content_hash,p_request,auth.uid()
 ) returning * into created_version;
 return query select created.id,created_version.id,1,content_hash;
end $$;

create function kxra.revise_youtube_content_package(
 p_package uuid,p_expected_version integer,p_source_pack jsonb,p_claim_ledger jsonb,
 p_script text,p_red_team jsonb,p_storyboard jsonb,p_rights_review jsonb,
 p_voice_provenance jsonb,p_render_manifest jsonb,p_qa_review jsonb,
 p_publication_metadata jsonb,p_request uuid
) returns table(package_id uuid,package_version_id uuid,version integer,content_sha256 text)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();package_row kxra.youtube_content_packages;
 prior kxra.youtube_content_package_versions;existing kxra.youtube_content_package_versions;
 created kxra.youtube_content_package_versions;content_hash text;next_version integer;
begin
 select * into package_row from kxra.youtube_content_packages value where value.id=p_package for update;
 if not found or o is null or package_row.org_id<>o
  or not kxra_private.can_project(package_row.project_id,true)
  or not kxra_private.phase2_project_is(package_row.project_id,'PROJECT-006')
  or p_expected_version is null or p_expected_version<>package_row.current_version
  or p_request is null or length(trim(coalesce(p_script,''))) not between 100 and 50000
  or not kxra_private.valid_youtube_package(
   p_source_pack,p_claim_ledger,p_red_team,p_storyboard,p_rights_review,
   p_voice_provenance,p_render_manifest,p_qa_review,p_publication_metadata
  )
 then raise exception 'YouTube content package revision unavailable';end if;
 content_hash=encode(sha256(convert_to(jsonb_build_object(
  'topic',package_row.topic,'source_pack',p_source_pack,'claim_ledger',p_claim_ledger,
  'script',trim(p_script),'red_team',p_red_team,'storyboard',p_storyboard,
  'rights_review',p_rights_review,'voice_provenance',p_voice_provenance,
  'render_manifest',p_render_manifest,'qa_review',p_qa_review,
  'publication_metadata',p_publication_metadata
 )::text,'UTF8')),'hex');
 select * into existing from kxra.youtube_content_package_versions value
 where value.package_id=p_package and value.client_request_id=p_request;
 if found then
  if existing.content_sha256<>content_hash then raise exception 'YouTube revision request conflict';end if;
  return query select p_package,existing.id,existing.version,existing.content_sha256;return;
 end if;
 select * into prior from kxra.youtube_content_package_versions value
 where value.package_id=p_package and value.version=package_row.current_version;
 if not found then raise exception 'YouTube content package revision unavailable';end if;
 next_version=package_row.current_version+1;
 if prior.status in ('DRAFT','APPROVED') then
  update kxra.youtube_content_package_versions set status='SUPERSEDED' where id=prior.id;
 end if;
 update kxra.youtube_upload_intents set state='WITHDRAWN',withdrawn_at=now()
 where package_id=p_package and state='READY';
 insert into kxra.youtube_content_package_versions(
  org_id,project_id,package_id,version,source_pack,claim_ledger,script,red_team,
  storyboard,rights_review,voice_provenance,render_manifest,qa_review,
  publication_metadata,content_sha256,client_request_id,created_by
 ) values(
  o,package_row.project_id,p_package,next_version,p_source_pack,p_claim_ledger,
  trim(p_script),p_red_team,p_storyboard,p_rights_review,p_voice_provenance,
  p_render_manifest,p_qa_review,p_publication_metadata,content_hash,p_request,auth.uid()
 ) returning * into created;
 update kxra.youtube_content_packages set current_version=next_version,
  approved_version=null,state='DRAFT',updated_at=now() where id=p_package;
 return query select p_package,created.id,next_version,content_hash;
end $$;

create function kxra.review_youtube_content_package(
 p_package_version uuid,p_expected_version integer,p_content_sha256 text,
 p_checks jsonb,p_decision text,p_note text,p_request uuid
) returns kxra.youtube_content_reviews
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();version_row kxra.youtube_content_package_versions;
 package_row kxra.youtube_content_packages;existing kxra.youtube_content_reviews;
 created kxra.youtube_content_reviews;
begin
 select * into version_row from kxra.youtube_content_package_versions value
 where value.id=p_package_version;
 if not found then raise exception 'YouTube content review unavailable';end if;
 select * into package_row from kxra.youtube_content_packages value
 where value.id=version_row.package_id for update;
 select * into existing from kxra.youtube_content_reviews value
 where value.org_id=o and value.project_id=version_row.project_id and value.client_request_id=p_request;
 if found then
  if existing.package_version_id<>p_package_version or existing.package_version<>p_expected_version
   or existing.content_sha256<>p_content_sha256 or existing.checks<>p_checks
   or existing.decision<>p_decision or existing.note<>trim(p_note)
  then raise exception 'YouTube review request conflict';end if;
  return existing;
 end if;
 if o is null or version_row.org_id<>o or not kxra_private.is_owner(o)
  or not kxra_private.can_project(version_row.project_id,false)
  or not kxra_private.phase2_project_is(version_row.project_id,'PROJECT-006')
  or p_request is null or version_row.version<>p_expected_version
  or package_row.current_version<>version_row.version or version_row.status<>'DRAFT'
  or version_row.content_sha256<>p_content_sha256
  or version_row.created_by=auth.uid()
  or not kxra_private.valid_youtube_review_checks(p_checks)
  or p_decision not in ('APPROVE_UPLOAD_INTENT','REQUEST_CHANGES','REJECT')
  or length(trim(coalesce(p_note,''))) not between 3 and 5000
  or p_decision='APPROVE_UPLOAD_INTENT' and (
   exists(select 1 from jsonb_each(p_checks) item where item.value<>'true'::jsonb)
   or not kxra_private.youtube_package_ready(
    version_row.claim_ledger,version_row.red_team,version_row.rights_review,
    version_row.voice_provenance,version_row.render_manifest,version_row.qa_review,
    version_row.publication_metadata
   )
  )
 then raise exception 'YouTube content review unavailable';end if;
 insert into kxra.youtube_content_reviews(
  org_id,project_id,package_id,package_version_id,package_version,content_sha256,
  checks,decision,note,client_request_id,reviewed_by
 ) values(
  o,version_row.project_id,version_row.package_id,version_row.id,version_row.version,
  version_row.content_sha256,p_checks,p_decision,trim(p_note),p_request,auth.uid()
 ) returning * into created;
 if p_decision='APPROVE_UPLOAD_INTENT' then
  update kxra.youtube_content_package_versions set status='APPROVED' where id=version_row.id;
  update kxra.youtube_content_packages set approved_version=version_row.version,
   state='APPROVED',updated_at=now() where id=version_row.package_id;
 else
  update kxra.youtube_content_package_versions set status='REJECTED' where id=version_row.id;
  update kxra.youtube_content_packages set approved_version=null,
   state='CHANGES_REQUIRED',updated_at=now() where id=version_row.package_id;
 end if;
 return created;
end $$;

create function kxra.create_youtube_upload_intent(
 p_project uuid,p_package_version uuid,p_review uuid,p_content_sha256 text,p_idempotency_key uuid
) returns kxra.youtube_upload_intents
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();version_row kxra.youtube_content_package_versions;
 package_row kxra.youtube_content_packages;review_row kxra.youtube_content_reviews;
 binding_row kxra.youtube_channel_bindings;existing kxra.youtube_upload_intents;
 created kxra.youtube_upload_intents;intent_hash text;
begin
 select * into version_row from kxra.youtube_content_package_versions value
 where value.id=p_package_version;
 select * into package_row from kxra.youtube_content_packages value
 where value.id=version_row.package_id for update;
 select * into review_row from kxra.youtube_content_reviews value where value.id=p_review;
 select * into binding_row from kxra.youtube_channel_bindings value
 where value.project_id=p_project for update;
 intent_hash=encode(sha256(convert_to(jsonb_build_object(
  'project_id',p_project,'binding_id',binding_row.id,'binding_version',binding_row.version,
  'package_id',package_row.id,'package_version_id',version_row.id,
  'package_version',version_row.version,'review_id',review_row.id,
  'content_sha256',p_content_sha256,'visibility',version_row.publication_metadata->>'visibility',
  'delivery_state','NOT_SENT'
 )::text,'UTF8')),'hex');
 select * into existing from kxra.youtube_upload_intents value
 where value.org_id=o and value.project_id=p_project and value.idempotency_key=p_idempotency_key;
 if found then
  if existing.intent_sha256<>intent_hash then raise exception 'YouTube upload intent request conflict';end if;
  return existing;
 end if;
 if o is null or not kxra_private.is_owner(o) or not kxra_private.can_project(p_project,false)
  or not kxra_private.phase2_project_is(p_project,'PROJECT-006') or p_idempotency_key is null
  or version_row.id is null or version_row.org_id<>o or version_row.project_id<>p_project
  or package_row.id is null or package_row.state<>'APPROVED'
  or package_row.current_version<>version_row.version or package_row.approved_version<>version_row.version
  or version_row.status<>'APPROVED' or version_row.content_sha256<>p_content_sha256
  or review_row.id is null or review_row.package_version_id<>version_row.id
  or review_row.content_sha256<>version_row.content_sha256
  or review_row.decision<>'APPROVE_UPLOAD_INTENT'
  or exists(select 1 from jsonb_each(review_row.checks) item where item.value<>'true'::jsonb)
  or binding_row.id is null or binding_row.state<>'VERIFIED'
 then raise exception 'YouTube upload intent unavailable';end if;
 insert into kxra.youtube_upload_intents(
  org_id,project_id,channel_binding_id,channel_binding_version,package_id,
  package_version_id,package_version,review_id,content_sha256,intent_sha256,
  idempotency_key,requested_by
 ) values(
  o,p_project,binding_row.id,binding_row.version,package_row.id,version_row.id,
  version_row.version,review_row.id,version_row.content_sha256,intent_hash,
  p_idempotency_key,auth.uid()
 ) returning * into created;
 return created;
end $$;

-- This function is deliberately private. A future OAuth adapter may call it
-- only after validating state, callback, scope and the exact channel account.
create function kxra_private.record_youtube_channel_verification(
 p_project uuid,p_expected_handle text,p_provider_channel_id text,
 p_provider_grant_reference text,p_scope_sha256 text,p_proof_sha256 text,p_account uuid
) returns kxra.youtube_channel_bindings
language plpgsql security definer set search_path='' as $$
declare value kxra.youtube_channel_bindings;project_org uuid;
begin
 select p.org_id into project_org from kxra.projects p
 where p.id=p_project and p.code='PROJECT-006';
 select * into value from kxra.youtube_channel_bindings row
 where row.project_id=p_project for update;
 if project_org is null or value.id is null or value.expected_handle<>p_expected_handle
  or p_provider_channel_id!~'^UC[A-Za-z0-9_-]{20,40}$'
  or length(coalesce(p_provider_grant_reference,'')) not between 8 and 240
  or p_scope_sha256!~'^[a-f0-9]{64}$' or p_proof_sha256!~'^[a-f0-9]{64}$'
  or not exists(select 1 from kxra.account_identities a where a.account_id=p_account and a.state='ACTIVE')
 then raise exception 'YouTube channel verification unavailable';end if;
 update kxra.youtube_channel_bindings set
  provider_channel_id=p_provider_channel_id,
  provider_grant_reference=p_provider_grant_reference,
  scope_sha256=p_scope_sha256,proof_sha256=p_proof_sha256,
  state='VERIFIED',verified_account_id=p_account,verified_at=now(),disconnected_at=null,
  version=version+1,updated_at=clock_timestamp()
 where id=value.id returning * into value;
 return value;
end $$;

create function kxra_private.disconnect_youtube_channel(p_project uuid)
returns kxra.youtube_channel_bindings
language plpgsql security definer set search_path='' as $$
declare value kxra.youtube_channel_bindings;
begin
 select * into value from kxra.youtube_channel_bindings row
 where row.project_id=p_project and row.state='VERIFIED' for update;
 if not found then raise exception 'YouTube disconnect unavailable';end if;
 update kxra.youtube_channel_bindings set state='DISCONNECTED',disconnected_at=now(),
  version=version+1,updated_at=clock_timestamp()
 where id=value.id returning * into value;
 update kxra.youtube_upload_intents set state='WITHDRAWN',withdrawn_at=now()
 where project_id=p_project and state='READY';
 return value;
end $$;

create function kxra_private.valid_repository_controls(value jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(value)='object'
  and value?&array[
   'hooks_disabled','submodules_disabled','lifecycle_scripts_disabled','actions_disabled',
   'network_disabled','secrets_absent','path_traversal_rejected','symlink_escape_rejected',
   'archive_bomb_rejected','binary_policy_passed'
  ]
  and value-array[
   'hooks_disabled','submodules_disabled','lifecycle_scripts_disabled','actions_disabled',
   'network_disabled','secrets_absent','path_traversal_rejected','symlink_escape_rejected',
   'archive_bomb_rejected','binary_policy_passed'
  ]='{}'::jsonb
  and not exists(select 1 from jsonb_each(value) item where jsonb_typeof(item.value)<>'boolean')
$$;

create function kxra_private.repository_controls_pass(value jsonb)
returns boolean language sql immutable set search_path='' as $$
 select kxra_private.valid_repository_controls(value)
  and not exists(select 1 from jsonb_each(value) item where item.value<>'true'::jsonb)
$$;

create function kxra_private.valid_repository_toolchain(value jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(value)='object'
  and value?&array['secret_scanner','malware_scanner','dependency_scanner','sbom_tool','sast_tool','workflow_inspector','signatures_as_of']
  and value-array['secret_scanner','malware_scanner','dependency_scanner','sbom_tool','sast_tool','workflow_inspector','signatures_as_of']='{}'::jsonb
  and not exists(
   select 1 from jsonb_each(value) item
   where jsonb_typeof(item.value)<>'string' or length(trim(item.value#>>'{}')) not between 1 and 240
  )
$$;

create function kxra_private.valid_adoption_scope(value jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(value)='array' and jsonb_array_length(value) between 1 and 100
  and not exists(
   select 1 from jsonb_array_elements(value) item
   where jsonb_typeof(item)<>'string' or length(trim(item#>>'{}')) not between 3 and 500
  )
$$;

create function kxra_private.valid_adoption_review_checks(value jsonb)
returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(value)='object'
  and value?&array['licence','provenance','security','scope','architecture','threat_model','tests','rollback']
  and value-array['licence','provenance','security','scope','architecture','threat_model','tests','rollback']='{}'::jsonb
  and not exists(select 1 from jsonb_each(value) item where jsonb_typeof(item.value)<>'boolean')
$$;

create function kxra_private.guard_repository_proposal_version() returns trigger
language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Repository adoption proposal version is immutable';end if;
 if (
  new.id,new.org_id,new.project_id,new.proposal_id,new.version,new.candidate_id,
  new.assessment_id,new.need_statement,new.exact_scope,new.licence_obligations,
  new.architecture_changes,new.threat_model,new.test_plan,new.rollback_plan,
  new.proposal_sha256,new.client_request_id,new.created_by,new.created_at
 ) is distinct from (
  old.id,old.org_id,old.project_id,old.proposal_id,old.version,old.candidate_id,
  old.assessment_id,old.need_statement,old.exact_scope,old.licence_obligations,
  old.architecture_changes,old.threat_model,old.test_plan,old.rollback_plan,
  old.proposal_sha256,old.client_request_id,old.created_by,old.created_at
 ) then raise exception 'Repository adoption proposal content is immutable';end if;
 if not (
  new.status=old.status
  or old.status='DRAFT' and new.status in ('APPROVED','REJECTED','SUPERSEDED')
  or old.status='APPROVED' and new.status='SUPERSEDED'
 ) then raise exception 'Repository proposal status transition unavailable';end if;
 return new;
end $$;

create trigger repository_candidates_append_only before update or delete on kxra.repository_candidates
 for each row execute function kxra_private.guard_phase2_append_only();
create trigger repository_quarantine_append_only before update or delete on kxra.repository_quarantine_records
 for each row execute function kxra_private.guard_phase2_append_only();
create trigger repository_assessments_append_only before update or delete on kxra.repository_assessments
 for each row execute function kxra_private.guard_phase2_append_only();
create trigger repository_proposal_versions_guard before update or delete on kxra.repository_adoption_proposal_versions
 for each row execute function kxra_private.guard_repository_proposal_version();
create trigger repository_adoption_reviews_append_only before update or delete on kxra.repository_adoption_reviews
 for each row execute function kxra_private.guard_phase2_append_only();
create trigger repository_implementation_intents_append_only before update or delete on kxra.repository_implementation_intents
 for each row execute function kxra_private.guard_phase2_append_only();

create function kxra.create_repository_candidate(
 p_project uuid,p_repository_owner text,p_repository_name text,p_source_url text,
 p_default_branch text,p_commit_sha text,p_tree_sha text,p_fetched_at timestamptz,
 p_licence_observation text,p_adoption_recommendation text,p_request uuid
) returns kxra.repository_candidates
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();existing kxra.repository_candidates;
 created kxra.repository_candidates;
begin
 select * into existing from kxra.repository_candidates value
 where value.org_id=o and value.project_id=p_project and value.client_request_id=p_request;
 if found then
  if existing.repository_owner<>p_repository_owner or existing.repository_name<>p_repository_name
   or existing.source_url<>p_source_url or existing.default_branch is distinct from p_default_branch
   or existing.commit_sha<>p_commit_sha or existing.tree_sha is distinct from p_tree_sha
   or existing.fetched_at<>p_fetched_at
   or existing.licence_observation<>trim(p_licence_observation)
   or existing.adoption_recommendation<>trim(p_adoption_recommendation)
  then raise exception 'Repository candidate request conflict';end if;
  return existing;
 end if;
 if o is null or not kxra_private.can_project(p_project,true)
  or not kxra_private.phase2_project_is(p_project,'PROJECT-007') or p_request is null
  or p_repository_owner!~'^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?$'
  or p_repository_name!~'^[A-Za-z0-9._-]{1,100}$'
  or p_source_url<>format('https://github.com/%s/%s',p_repository_owner,p_repository_name)
  or p_default_branch!~'^[A-Za-z0-9._/-]{1,240}$'
  or p_commit_sha!~'^[a-f0-9]{40}$' or p_tree_sha!~'^[a-f0-9]{40}$'
  or p_fetched_at is null or p_fetched_at>now()+interval '5 minutes'
  or length(trim(coalesce(p_licence_observation,''))) not between 3 and 3000
  or length(trim(coalesce(p_adoption_recommendation,''))) not between 3 and 3000
 then raise exception 'Repository candidate unavailable';end if;
 insert into kxra.repository_candidates(
  org_id,project_id,repository_owner,repository_name,source_url,default_branch,
  commit_sha,tree_sha,fetched_at,source_classification,intake_source,state,
  licence_observation,adoption_recommendation,client_request_id,created_by
 ) values(
  o,p_project,p_repository_owner,p_repository_name,p_source_url,p_default_branch,
  p_commit_sha,p_tree_sha,p_fetched_at,'EXTERNAL RESEARCH','CONTROLLED_METADATA',
  'METADATA_ONLY',trim(p_licence_observation),trim(p_adoption_recommendation),
  p_request,auth.uid()
 ) returning * into created;
 return created;
end $$;

create function kxra.record_repository_quarantine(
 p_candidate uuid,p_commit_sha text,p_tree_sha text,p_archive_sha256 text,
 p_manifest_sha256 text,p_archive_size_bytes bigint,p_controls jsonb,
 p_policy_version text,p_reason text,p_request uuid
) returns kxra.repository_quarantine_records
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();candidate_row kxra.repository_candidates;
 existing kxra.repository_quarantine_records;created kxra.repository_quarantine_records;
 result_state text;object_key text;
begin
 select * into candidate_row from kxra.repository_candidates value where value.id=p_candidate;
 select * into existing from kxra.repository_quarantine_records value
 where value.org_id=o and value.project_id=candidate_row.project_id and value.client_request_id=p_request;
 result_state=case when kxra_private.repository_controls_pass(p_controls) then 'ACCEPTED' else 'REJECTED' end;
 if found then
  if existing.candidate_id<>p_candidate or existing.commit_sha<>p_commit_sha
   or existing.tree_sha<>p_tree_sha or existing.archive_sha256<>p_archive_sha256
   or existing.manifest_sha256<>p_manifest_sha256
   or existing.archive_size_bytes<>p_archive_size_bytes or existing.controls<>p_controls
   or existing.policy_version<>p_policy_version or existing.reason<>trim(p_reason)
  then raise exception 'Repository quarantine request conflict';end if;
  return existing;
 end if;
 if candidate_row.id is null or o is null or candidate_row.org_id<>o
  or not kxra_private.is_owner(o) or not kxra_private.can_project(candidate_row.project_id,false)
  or not kxra_private.phase2_project_is(candidate_row.project_id,'PROJECT-007')
  or candidate_row.state<>'METADATA_ONLY' or candidate_row.commit_sha<>p_commit_sha
  or candidate_row.tree_sha is null or candidate_row.tree_sha<>p_tree_sha
  or p_archive_sha256!~'^[a-f0-9]{64}$' or p_manifest_sha256!~'^[a-f0-9]{64}$'
  or p_archive_size_bytes not between 1 and 104857600
  or not kxra_private.valid_repository_controls(p_controls)
  or length(coalesce(p_policy_version,'')) not between 1 and 80
  or length(trim(coalesce(p_reason,''))) not between 3 and 3000 or p_request is null
 then raise exception 'Repository quarantine evidence unavailable';end if;
 object_key='private://repository-quarantine/'||gen_random_uuid()::text;
 insert into kxra.repository_quarantine_records(
  org_id,project_id,candidate_id,commit_sha,tree_sha,object_reference,
  archive_sha256,manifest_sha256,archive_size_bytes,controls,policy_version,
  result,reason,client_request_id,recorded_by
 ) values(
  o,candidate_row.project_id,candidate_row.id,p_commit_sha,p_tree_sha,object_key,
  p_archive_sha256,p_manifest_sha256,p_archive_size_bytes,p_controls,p_policy_version,
  result_state,trim(p_reason),p_request,auth.uid()
 ) returning * into created;
 return created;
end $$;

create function kxra.record_repository_assessment(
 p_candidate uuid,p_quarantine uuid,p_toolchain jsonb,p_findings jsonb,
 p_licence_state text,p_provenance_state text,p_secret_state text,p_malware_state text,
 p_dependency_state text,p_sast_state text,p_workflow_state text,p_binary_state text,
 p_critical_count integer,p_high_count integer,p_bounded_conclusion text,
 p_residual_risk text,p_request uuid
) returns kxra.repository_assessments
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();candidate_row kxra.repository_candidates;
 quarantine_row kxra.repository_quarantine_records;existing kxra.repository_assessments;
 created kxra.repository_assessments;result_state text;
begin
 select * into candidate_row from kxra.repository_candidates value where value.id=p_candidate;
 select * into quarantine_row from kxra.repository_quarantine_records value where value.id=p_quarantine;
 result_state=case when quarantine_row.result='ACCEPTED'
  and p_licence_state='CLEAR' and p_provenance_state='CLEAR'
  and p_secret_state='NO_FINDING' and p_malware_state='NO_FINDING'
  and p_dependency_state='PASS' and p_sast_state='PASS'
  and p_workflow_state='PASS' and p_binary_state='PASS'
  and p_critical_count=0 and p_high_count=0 then 'PASS' else 'BLOCKED' end;
 select * into existing from kxra.repository_assessments value
 where value.org_id=o and value.project_id=candidate_row.project_id and value.client_request_id=p_request;
 if found then
  if existing.candidate_id<>p_candidate or existing.quarantine_id<>p_quarantine
   or existing.toolchain<>p_toolchain or existing.findings<>p_findings
   or existing.licence_state<>p_licence_state or existing.provenance_state<>p_provenance_state
   or existing.secret_state<>p_secret_state or existing.malware_state<>p_malware_state
   or existing.dependency_state<>p_dependency_state or existing.sast_state<>p_sast_state
   or existing.workflow_state<>p_workflow_state or existing.binary_state<>p_binary_state
   or existing.critical_count<>p_critical_count or existing.high_count<>p_high_count
   or existing.bounded_conclusion<>trim(p_bounded_conclusion)
   or existing.residual_risk<>trim(p_residual_risk)
  then raise exception 'Repository assessment request conflict';end if;
  return existing;
 end if;
 if candidate_row.id is null or quarantine_row.id is null or o is null
  or candidate_row.org_id<>o or quarantine_row.org_id<>o
  or quarantine_row.candidate_id<>candidate_row.id
  or not kxra_private.is_owner(o) or not kxra_private.can_project(candidate_row.project_id,false)
  or not kxra_private.phase2_project_is(candidate_row.project_id,'PROJECT-007')
  or not kxra_private.valid_repository_toolchain(p_toolchain)
  or jsonb_typeof(p_findings)<>'array' or jsonb_array_length(p_findings)>1000
  or p_licence_state not in ('CLEAR','AMBIGUOUS','BLOCKED')
  or p_provenance_state not in ('CLEAR','UNRESOLVED','BLOCKED')
  or p_secret_state not in ('NO_FINDING','FINDING')
  or p_malware_state not in ('NO_FINDING','FINDING')
  or p_dependency_state not in ('PASS','BLOCKED') or p_sast_state not in ('PASS','BLOCKED')
  or p_workflow_state not in ('PASS','BLOCKED') or p_binary_state not in ('PASS','BLOCKED')
  or p_critical_count not between 0 and 100000 or p_high_count not between 0 and 100000
  or length(trim(coalesce(p_bounded_conclusion,''))) not between 20 and 3000
  or lower(p_bounded_conclusion) similar to '%(virus-free|malware-free|safe repository|clean repository)%'
  or result_state='PASS' and p_bounded_conclusion not like 'No findings were detected in the tested scope%'
  or length(trim(coalesce(p_residual_risk,''))) not between 3 and 5000 or p_request is null
 then raise exception 'Repository assessment unavailable';end if;
 insert into kxra.repository_assessments(
  org_id,project_id,candidate_id,quarantine_id,commit_sha,tree_sha,archive_sha256,
  toolchain,findings,licence_state,provenance_state,secret_state,malware_state,
  dependency_state,sast_state,workflow_state,binary_state,critical_count,high_count,
  bounded_conclusion,residual_risk,disposition,client_request_id,reviewed_by
 ) values(
  o,candidate_row.project_id,candidate_row.id,quarantine_row.id,candidate_row.commit_sha,
  quarantine_row.tree_sha,quarantine_row.archive_sha256,p_toolchain,p_findings,
  p_licence_state,p_provenance_state,p_secret_state,p_malware_state,p_dependency_state,
  p_sast_state,p_workflow_state,p_binary_state,p_critical_count,p_high_count,
  trim(p_bounded_conclusion),trim(p_residual_risk),result_state,p_request,auth.uid()
 ) returning * into created;
 return created;
end $$;

create function kxra.create_repository_adoption_proposal(
 p_candidate uuid,p_assessment uuid,p_need_statement text,p_exact_scope jsonb,
 p_licence_obligations text,p_architecture_changes text,p_threat_model text,
 p_test_plan text,p_rollback_plan text,p_request uuid
) returns table(proposal_id uuid,proposal_version_id uuid,version integer,proposal_sha256 text)
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();candidate_row kxra.repository_candidates;
 assessment_row kxra.repository_assessments;existing kxra.repository_adoption_proposals;
 existing_version kxra.repository_adoption_proposal_versions;
 created kxra.repository_adoption_proposals;created_version kxra.repository_adoption_proposal_versions;
 proposal_hash text;
begin
 select * into candidate_row from kxra.repository_candidates value where value.id=p_candidate;
 select * into assessment_row from kxra.repository_assessments value where value.id=p_assessment;
 proposal_hash=encode(sha256(convert_to(jsonb_build_object(
  'candidate_id',p_candidate,'assessment_id',p_assessment,'need_statement',trim(p_need_statement),
  'exact_scope',p_exact_scope,'licence_obligations',trim(p_licence_obligations),
  'architecture_changes',trim(p_architecture_changes),'threat_model',trim(p_threat_model),
  'test_plan',trim(p_test_plan),'rollback_plan',trim(p_rollback_plan)
 )::text,'UTF8')),'hex');
 select * into existing from kxra.repository_adoption_proposals value
 where value.org_id=o and value.project_id=candidate_row.project_id and value.client_request_id=p_request;
 if found then
  select * into existing_version from kxra.repository_adoption_proposal_versions value
  where value.proposal_id=existing.id and value.version=1;
  if existing.candidate_id<>p_candidate or existing_version.proposal_sha256<>proposal_hash
  then raise exception 'Repository adoption proposal request conflict';end if;
  return query select existing.id,existing_version.id,existing_version.version,existing_version.proposal_sha256;
  return;
 end if;
 if candidate_row.id is null or assessment_row.id is null or o is null
  or candidate_row.org_id<>o or assessment_row.org_id<>o
  or assessment_row.candidate_id<>candidate_row.id or assessment_row.disposition<>'PASS'
  or not kxra_private.can_project(candidate_row.project_id,true)
  or not kxra_private.phase2_project_is(candidate_row.project_id,'PROJECT-007')
  or not kxra_private.valid_adoption_scope(p_exact_scope)
  or length(trim(coalesce(p_need_statement,''))) not between 3 and 5000
  or length(trim(coalesce(p_licence_obligations,''))) not between 3 and 5000
  or length(trim(coalesce(p_architecture_changes,''))) not between 3 and 10000
  or length(trim(coalesce(p_threat_model,''))) not between 3 and 10000
  or length(trim(coalesce(p_test_plan,''))) not between 3 and 10000
  or length(trim(coalesce(p_rollback_plan,''))) not between 3 and 10000
  or p_request is null
 then raise exception 'Repository adoption proposal unavailable';end if;
 insert into kxra.repository_adoption_proposals(
  org_id,project_id,candidate_id,client_request_id,created_by
 ) values(o,candidate_row.project_id,candidate_row.id,p_request,auth.uid()) returning * into created;
 insert into kxra.repository_adoption_proposal_versions(
  org_id,project_id,proposal_id,version,candidate_id,assessment_id,need_statement,
  exact_scope,licence_obligations,architecture_changes,threat_model,test_plan,
  rollback_plan,proposal_sha256,client_request_id,created_by
 ) values(
  o,candidate_row.project_id,created.id,1,candidate_row.id,assessment_row.id,
  trim(p_need_statement),p_exact_scope,trim(p_licence_obligations),
  trim(p_architecture_changes),trim(p_threat_model),trim(p_test_plan),
  trim(p_rollback_plan),proposal_hash,p_request,auth.uid()
 ) returning * into created_version;
 return query select created.id,created_version.id,1,proposal_hash;
end $$;

create function kxra.review_repository_adoption_proposal(
 p_proposal_version uuid,p_expected_version integer,p_proposal_sha256 text,
 p_checks jsonb,p_decision text,p_note text,p_request uuid
) returns kxra.repository_adoption_reviews
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();version_row kxra.repository_adoption_proposal_versions;
 proposal_row kxra.repository_adoption_proposals;assessment_row kxra.repository_assessments;
 existing kxra.repository_adoption_reviews;created kxra.repository_adoption_reviews;
begin
 select * into version_row from kxra.repository_adoption_proposal_versions value
 where value.id=p_proposal_version;
 if not found then raise exception 'Repository adoption review unavailable';end if;
 select * into proposal_row from kxra.repository_adoption_proposals value
 where value.id=version_row.proposal_id for update;
 select * into assessment_row from kxra.repository_assessments value
 where value.id=version_row.assessment_id;
 select * into existing from kxra.repository_adoption_reviews value
 where value.org_id=o and value.project_id=version_row.project_id and value.client_request_id=p_request;
 if found then
  if existing.proposal_version_id<>p_proposal_version
   or existing.proposal_version<>p_expected_version
   or existing.proposal_sha256<>p_proposal_sha256 or existing.checks<>p_checks
   or existing.decision<>p_decision or existing.note<>trim(p_note)
  then raise exception 'Repository adoption review request conflict';end if;
  return existing;
 end if;
 if o is null or version_row.org_id<>o or not kxra_private.is_owner(o)
  or not kxra_private.can_project(version_row.project_id,false)
  or not kxra_private.phase2_project_is(version_row.project_id,'PROJECT-007')
  or version_row.version<>p_expected_version or version_row.status<>'DRAFT'
  or proposal_row.current_version<>version_row.version
  or version_row.proposal_sha256<>p_proposal_sha256
  or version_row.created_by=auth.uid() or assessment_row.disposition<>'PASS'
  or not kxra_private.valid_adoption_review_checks(p_checks)
  or p_decision not in ('APPROVE_IMPLEMENTATION_INTENT','REQUEST_CHANGES','REJECT')
  or length(trim(coalesce(p_note,''))) not between 3 and 5000 or p_request is null
  or p_decision='APPROVE_IMPLEMENTATION_INTENT'
   and exists(select 1 from jsonb_each(p_checks) item where item.value<>'true'::jsonb)
 then raise exception 'Repository adoption review unavailable';end if;
 insert into kxra.repository_adoption_reviews(
  org_id,project_id,proposal_id,proposal_version_id,proposal_version,
  proposal_sha256,checks,decision,note,client_request_id,reviewed_by
 ) values(
  o,version_row.project_id,version_row.proposal_id,version_row.id,version_row.version,
  version_row.proposal_sha256,p_checks,p_decision,trim(p_note),p_request,auth.uid()
 ) returning * into created;
 if p_decision='APPROVE_IMPLEMENTATION_INTENT' then
  update kxra.repository_adoption_proposal_versions set status='APPROVED' where id=version_row.id;
  update kxra.repository_adoption_proposals set approved_version=version_row.version,
   state='APPROVED',updated_at=now() where id=version_row.proposal_id;
 else
  update kxra.repository_adoption_proposal_versions set status='REJECTED' where id=version_row.id;
  update kxra.repository_adoption_proposals set approved_version=null,
   state='CHANGES_REQUIRED',updated_at=now() where id=version_row.proposal_id;
 end if;
 return created;
end $$;

create function kxra.create_repository_implementation_intent(
 p_project uuid,p_proposal_version uuid,p_review uuid,p_proposal_sha256 text,
 p_branch_name text,p_idempotency_key uuid
) returns kxra.repository_implementation_intents
language plpgsql security definer set search_path='' as $$
declare o uuid=kxra_private.member_org();version_row kxra.repository_adoption_proposal_versions;
 proposal_row kxra.repository_adoption_proposals;review_row kxra.repository_adoption_reviews;
 candidate_row kxra.repository_candidates;assessment_row kxra.repository_assessments;
 existing kxra.repository_implementation_intents;created kxra.repository_implementation_intents;
 intent_hash text;
begin
 select * into version_row from kxra.repository_adoption_proposal_versions value
 where value.id=p_proposal_version;
 select * into proposal_row from kxra.repository_adoption_proposals value
 where value.id=version_row.proposal_id for update;
 select * into review_row from kxra.repository_adoption_reviews value where value.id=p_review;
 select * into candidate_row from kxra.repository_candidates value where value.id=version_row.candidate_id;
 select * into assessment_row from kxra.repository_assessments value where value.id=version_row.assessment_id;
 intent_hash=encode(sha256(convert_to(jsonb_build_object(
  'project_id',p_project,'candidate_id',candidate_row.id,'commit_sha',candidate_row.commit_sha,
  'assessment_id',assessment_row.id,'proposal_id',proposal_row.id,
  'proposal_version_id',version_row.id,'review_id',review_row.id,
  'proposal_sha256',p_proposal_sha256,'branch_name',p_branch_name,
  'git_execution_state','NOT_STARTED','merge_enabled',false,'release_enabled',false,'deploy_enabled',false
 )::text,'UTF8')),'hex');
 select * into existing from kxra.repository_implementation_intents value
 where value.org_id=o and value.project_id=p_project and value.idempotency_key=p_idempotency_key;
 if found then
  if existing.intent_sha256<>intent_hash then raise exception 'Repository implementation intent request conflict';end if;
  return existing;
 end if;
 if o is null or not kxra_private.is_owner(o) or not kxra_private.can_project(p_project,false)
  or not kxra_private.phase2_project_is(p_project,'PROJECT-007') or p_idempotency_key is null
  or version_row.id is null or version_row.org_id<>o or version_row.project_id<>p_project
  or version_row.status<>'APPROVED' or version_row.proposal_sha256<>p_proposal_sha256
  or proposal_row.state<>'APPROVED' or proposal_row.current_version<>version_row.version
  or proposal_row.approved_version<>version_row.version
  or review_row.id is null or review_row.proposal_version_id<>version_row.id
  or review_row.proposal_sha256<>version_row.proposal_sha256
  or review_row.decision<>'APPROVE_IMPLEMENTATION_INTENT'
  or exists(select 1 from jsonb_each(review_row.checks) item where item.value<>'true'::jsonb)
  or assessment_row.disposition<>'PASS' or assessment_row.candidate_id<>candidate_row.id
  or p_branch_name!~'^codex/[a-z0-9]+(?:-[a-z0-9]+)*$' or length(p_branch_name)>120
 then raise exception 'Repository implementation intent unavailable';end if;
 insert into kxra.repository_implementation_intents(
  org_id,project_id,candidate_id,assessment_id,proposal_id,proposal_version_id,
  review_id,commit_sha,proposal_sha256,branch_name,intent_sha256,idempotency_key,requested_by
 ) values(
  o,p_project,candidate_row.id,assessment_row.id,proposal_row.id,version_row.id,
  review_row.id,candidate_row.commit_sha,version_row.proposal_sha256,p_branch_name,
  intent_hash,p_idempotency_key,auth.uid()
 ) returning * into created;
 return created;
end $$;

revoke all on all functions in schema kxra_private from public;
revoke all on function
 kxra.create_youtube_content_package(uuid,text,jsonb,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid),
 kxra.revise_youtube_content_package(uuid,integer,jsonb,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid),
 kxra.review_youtube_content_package(uuid,integer,text,jsonb,text,text,uuid),
 kxra.create_youtube_upload_intent(uuid,uuid,uuid,text,uuid),
 kxra.create_repository_candidate(uuid,text,text,text,text,text,text,timestamptz,text,text,uuid),
 kxra.record_repository_quarantine(uuid,text,text,text,text,bigint,jsonb,text,text,uuid),
 kxra.record_repository_assessment(uuid,uuid,jsonb,jsonb,text,text,text,text,text,text,text,text,integer,integer,text,text,uuid),
 kxra.create_repository_adoption_proposal(uuid,uuid,text,jsonb,text,text,text,text,text,uuid),
 kxra.review_repository_adoption_proposal(uuid,integer,text,jsonb,text,text,uuid),
 kxra.create_repository_implementation_intent(uuid,uuid,uuid,text,text,uuid)
from public,anon,authenticated;
grant execute on function
 kxra.create_youtube_content_package(uuid,text,jsonb,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid),
 kxra.revise_youtube_content_package(uuid,integer,jsonb,jsonb,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid),
 kxra.review_youtube_content_package(uuid,integer,text,jsonb,text,text,uuid),
 kxra.create_youtube_upload_intent(uuid,uuid,uuid,text,uuid),
 kxra.create_repository_candidate(uuid,text,text,text,text,text,text,timestamptz,text,text,uuid),
 kxra.record_repository_quarantine(uuid,text,text,text,text,bigint,jsonb,text,text,uuid),
 kxra.record_repository_assessment(uuid,uuid,jsonb,jsonb,text,text,text,text,text,text,text,text,integer,integer,text,text,uuid),
 kxra.create_repository_adoption_proposal(uuid,uuid,text,jsonb,text,text,text,text,text,uuid),
 kxra.review_repository_adoption_proposal(uuid,integer,text,jsonb,text,text,uuid),
 kxra.create_repository_implementation_intent(uuid,uuid,uuid,text,text,uuid)
to authenticated;

commit;
