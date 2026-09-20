begin;

-- Genesis ventures keep their explicit stable identifiers. Customer projects
-- created after an accepted proposal receive a server-generated opaque UUID.
alter table kxra.projects alter column id set default gen_random_uuid();

commit;
