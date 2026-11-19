begin;

create or replace function kxra_private.organisation_defaults() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.id='10000000-0000-4000-8000-000000000001'::uuid then
  new.slug='kxra-group';
  new.organisation_kind='KXRA';
  new.relationship_type='INTERNAL';
  if new.created_provenance='{}'::jsonb then
   new.created_provenance='{"source":"GENESIS_SEED"}'::jsonb;
  end if;
 elsif new.slug is null or trim(new.slug)='' then
  new.slug='organisation-'||left(replace(new.id::text,'-',''),12);
 end if;
 new.slug=lower(trim(new.slug));
 new.updated_at=now();
 return new;
end $$;

update kxra.organisations set
 slug='kxra-group',organisation_kind='KXRA',relationship_type='INTERNAL',
 created_provenance='{"source":"GENESIS_SEED"}'::jsonb
where id='10000000-0000-4000-8000-000000000001'::uuid;

commit;
