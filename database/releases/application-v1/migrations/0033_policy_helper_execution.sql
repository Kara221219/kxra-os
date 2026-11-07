begin;

-- PostgreSQL evaluates policy helper calls with the querying role's EXECUTE
-- privilege before entering the SECURITY DEFINER body. These helpers expose
-- only booleans or the server-set tenant selector and are required by RLS.
grant execute on function kxra_private.requested_org(),
 kxra_private.has_active_membership(uuid),
 kxra_private.legal_requirements_satisfied(uuid),
 kxra_private.private_access_allowed(uuid),
 kxra_private.is_platform_owner()
to authenticated,anon;

commit;
