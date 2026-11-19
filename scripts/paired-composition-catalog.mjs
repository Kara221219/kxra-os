// Strict combined catalogue including the new paired schema and auth/public.
// Existing integration catalogue and historical hash identities remain unchanged.
export async function pairedCompositionCatalog(db) {
  const tables = (
    await db.query(
      `select n.nspname schema,c.relname name,c.relkind kind,c.relrowsecurity rls,c.relforcerowsecurity force_rls,case when c.relkind='v' then pg_get_viewdef(c.oid,true) else null end view_definition,
        (select jsonb_agg(jsonb_build_object('role',r.role,'privilege',p.privilege,'reachable',has_schema_privilege(r.role,n.oid,'USAGE') and has_table_privilege(r.role,c.oid,p.privilege)) order by r.role,p.privilege) from (values ('kxra_app'),('authenticated'),('anon')) r(role) cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege) where c.relkind<>'S') effective_table_privileges,(select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee,a.grantor,a.privilege_type,a.is_grantable) from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 's'::"char" else 'r'::"char" end,c.relowner))) a) acl,pg_get_userbyid(c.relowner) owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('auth','public','kxra','kxra_private','kxra_pairing','kxra_github_receipt','kxra_paired_admission','kxra_room_worker') and c.relkind in ('r','S','v') order by 1,2`,
    )
  ).rows;
  const functions = (
    await db.query(
      `select n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,pg_get_functiondef(p.oid) definition,(select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee,a.grantor,a.privilege_type,a.is_grantable) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) acl,pg_get_userbyid(p.proowner) owner,has_schema_privilege('kxra_app',n.oid,'USAGE') and has_function_privilege('kxra_app',p.oid,'EXECUTE') app_reachable,has_schema_privilege('authenticated',n.oid,'USAGE') and has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_reachable,has_schema_privilege('anon',n.oid,'USAGE') and has_function_privilege('anon',p.oid,'EXECUTE') anon_reachable from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('auth','public','kxra','kxra_private','kxra_pairing','kxra_github_receipt','kxra_paired_admission','kxra_room_worker') order by 1,2,3`,
    )
  ).rows;
  const columns = (
    await db.query(
      `select table_schema,table_name,column_name,ordinal_position,data_type,udt_schema,udt_name,is_nullable,column_default,is_identity,identity_generation,identity_start,identity_increment,identity_maximum,identity_minimum,identity_cycle,is_generated,case when is_generated='ALWAYS' then (select pg_get_expr(gd.adbin,gd.adrelid,true) from pg_attrdef gd join pg_class gc on gc.oid=gd.adrelid join pg_namespace gn on gn.oid=gc.relnamespace join pg_attribute ga on ga.attrelid=gc.oid and ga.attnum=gd.adnum where gn.nspname=col.table_schema and gc.relname=col.table_name and ga.attname=col.column_name) else generation_expression end generation_expression,collation_schema,collation_name from information_schema.columns col where table_schema in ('auth','public','kxra','kxra_private','kxra_pairing','kxra_github_receipt','kxra_paired_admission','kxra_room_worker') order by 1,2,4`,
    )
  ).rows;
  const policies = (
    await db.query(
      `select * from pg_policies where schemaname in ('auth','public','kxra','kxra_private','kxra_pairing','kxra_github_receipt','kxra_paired_admission','kxra_room_worker') order by schemaname,tablename,policyname`,
    )
  ).rows;
  const constraints = (
    await db.query(
      `select n.nspname schema,c.relname name,x.conname,pg_get_constraintdef(x.oid,true) definition from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('auth','public','kxra','kxra_private','kxra_pairing','kxra_github_receipt','kxra_paired_admission','kxra_room_worker') order by 1,2,3`,
    )
  ).rows;
  const indexes = (
    await db.query(
      `select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ('auth','public','kxra','kxra_private','kxra_pairing','kxra_github_receipt','kxra_paired_admission','kxra_room_worker') order by 1,2,3`,
    )
  ).rows;
  const triggers = (
    await db.query(
      `select n.nspname schema,c.relname name,t.tgname,pg_get_triggerdef(t.oid) definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in ('auth','public','kxra','kxra_private','kxra_pairing','kxra_github_receipt','kxra_paired_admission','kxra_room_worker') order by 1,2,3`,
    )
  ).rows;
  const schemas = (
    await db.query(
      `select nspname name,pg_get_userbyid(nspowner) owner,nspacl::text acl,has_schema_privilege('kxra_app',oid,'USAGE') app_usage,has_schema_privilege('authenticated',oid,'USAGE') authenticated_usage,has_schema_privilege('anon',oid,'USAGE') anon_usage from pg_namespace where nspname in ('auth','public','kxra','kxra_private','kxra_pairing','kxra_github_receipt','kxra_paired_admission','kxra_room_worker') order by 1`,
    )
  ).rows;
  const sequences = (
    await db.query(
      `select n.nspname schema,c.relname name,format_type(s.seqtypid,null) type,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle,(select jsonb_agg(jsonb_build_object('schema',rn.nspname,'table',rc.relname,'column',a.attname,'dependency',d.deptype) order by rn.nspname,rc.relname,a.attname) from pg_depend d join pg_class rc on rc.oid=d.refobjid join pg_namespace rn on rn.oid=rc.relnamespace join pg_attribute a on a.attrelid=rc.oid and a.attnum=d.refobjsubid where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype in ('a','i')) ownership from pg_sequence s join pg_class c on c.oid=s.seqrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('auth','public','kxra','kxra_private','kxra_pairing','kxra_github_receipt','kxra_paired_admission','kxra_room_worker') order by 1,2`,
    )
  ).rows;
  const columnAcls = (
    await db.query(
      `select n.nspname schema,c.relname name,a.attname column,a.attacl::text acl from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('auth','public','kxra','kxra_private','kxra_pairing','kxra_github_receipt','kxra_paired_admission','kxra_room_worker') and a.attnum>0 and not a.attisdropped order by 1,2,3`,
    )
  ).rows;
  return {
    tables,
    functions,
    columns,
    policies,
    constraints,
    indexes,
    triggers,
    schemas,
    sequences,
    columnAcls,
  };
}
export async function pairedCompositionData(db, catalog) {
  const data = [];
  for (const t of catalog.tables.filter((t) => t.kind === "r")) {
    const q = '"' + t.schema + '"."' + t.name + '"';
    const summary = (
      await db.query(
        `select count(*)::int rows,encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''),'UTF8')),'hex') sha256 from ${q} t`,
      )
    ).rows[0];
    data.push({ schema: t.schema, table: t.name, ...summary });
  }
  for (const t of catalog.tables.filter((t) => t.kind === "S")) {
    const row = (
      await db.query(
        `select last_value,is_called from "${t.schema}"."${t.name}"`,
      )
    ).rows[0];
    data.push({ schema: t.schema, sequence: t.name, ...row });
  }
  return data;
}
