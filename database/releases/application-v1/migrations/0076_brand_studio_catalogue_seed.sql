begin;

insert into kxra.tool_catalogue(
  id,tool_key,name,description,state
) values(
  '9c531a0d-396d-5161-adf0-844c72f0d754',
  'brand-studio',
  'KXRA Brand Studio',
  'Create a source-linked brand profile, campaign brief and reviewed channel variants with controlled export.',
  'ACTIVE'
)
on conflict(tool_key) do nothing;

insert into kxra.tool_versions(
  id,tool_id,version,state,activation_event,usage_unit,configuration,effective_at
) values(
  '12a0de8d-aceb-5e17-a139-9de1f7fa7912',
  '9c531a0d-396d-5161-adf0-844c72f0d754',
  1,
  'ACTIVE',
  'First approved Brand Studio export delivered',
  'creative_variant',
  jsonb_build_object(
    'required_features',jsonb_build_array(
      'brand-studio.access','brand.generate','brand.export'
    ),
    'source_intake',jsonb_build_object(
      'website_url',true,
      'website_fetch',false,
      'supplied_snapshot_required',true
    ),
    'generation_adapter','LOCAL_DETERMINISTIC',
    'external_generation_enabled',false,
    'publication_enabled',false,
    'classification','DECISION',
    'authority','approved_phase_2_local_product_contract'
  ),
  now()
)
on conflict(tool_id,version) do nothing;

do $$
declare
  expected_configuration jsonb:=jsonb_build_object(
    'required_features',jsonb_build_array(
      'brand-studio.access','brand.generate','brand.export'
    ),
    'source_intake',jsonb_build_object(
      'website_url',true,
      'website_fetch',false,
      'supplied_snapshot_required',true
    ),
    'generation_adapter','LOCAL_DETERMINISTIC',
    'external_generation_enabled',false,
    'publication_enabled',false,
    'classification','DECISION',
    'authority','approved_phase_2_local_product_contract'
  );
begin
  if not exists(
    select 1
    from kxra.tool_catalogue tool
    join kxra.tool_versions version on version.tool_id=tool.id
    where tool.id='9c531a0d-396d-5161-adf0-844c72f0d754'
      and tool.tool_key='brand-studio'
      and tool.name='KXRA Brand Studio'
      and tool.description='Create a source-linked brand profile, campaign brief and reviewed channel variants with controlled export.'
      and tool.state='ACTIVE'
      and version.id='12a0de8d-aceb-5e17-a139-9de1f7fa7912'
      and version.version=1
      and version.state='ACTIVE'
      and version.activation_event='First approved Brand Studio export delivered'
      and version.usage_unit='creative_variant'
      and version.configuration=expected_configuration
      and version.effective_at is not null
  ) then
    raise exception 'Brand Studio catalogue seed mismatch; review required';
  end if;
end
$$;

commit;
