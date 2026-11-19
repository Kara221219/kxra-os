// Effective privileges for every non-superuser fixture application/Auth role.
// Complements the unchanged historical catalogue's raw ACL/owner inventory.
export async function sessionRoleCatalogue(db) {
  const roles = `(select rolname role,rolcanlogin,rolinherit,rolbypassrls from pg_roles where not rolsuper and (rolname like 'kxra_%' or rolname in('anon','authenticated','supabase_auth_admin')))`;
  const schemas = `n.nspname not like 'pg_%' and n.nspname<>'information_schema'`;
  return {
    roles: (await db.query(`select * from ${roles} r order by role`)).rows,
    memberships: (
      await db.query(
        `select parent.rolname parent,child.rolname child,m.admin_option from pg_auth_members m join pg_roles parent on parent.oid=m.roleid join pg_roles child on child.oid=m.member where child.rolname in(select role from ${roles} r) order by 1,2`,
      )
    ).rows,
    tables: (
      await db.query(
        `select n.nspname schema,c.relname name,c.relkind kind,r.role,p.privilege,has_schema_privilege(r.role,n.oid,'USAGE') and has_table_privilege(r.role,c.oid,p.privilege) reachable from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join ${roles} r cross join(values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER'))p(privilege) where ${schemas} and c.relkind in('r','v') order by 1,2,4,5`,
      )
    ).rows,
    functions: (
      await db.query(
        `select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,r.role,has_schema_privilege(r.role,n.oid,'USAGE') and has_function_privilege(r.role,p.oid,'EXECUTE') reachable from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join ${roles} r where ${schemas} order by 1,2,3,4`,
      )
    ).rows,
  };
}
