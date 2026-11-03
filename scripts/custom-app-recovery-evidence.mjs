import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
const sha = (v) => crypto.createHash("sha256").update(v).digest("hex");
export function loadCustomAppExtension(root) {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(root, "packages/custom-apps/local-extension-manifest.json"),
      "utf8",
    ),
  );
  assert.equal(manifest.schema, "KXRA_CUSTOM_APP_LOCAL_EXTENSION_V1");
  for (const source of manifest.sources) {
    assert.ok(
      [
        "packages/custom-apps/local-schema.sql",
        "packages/custom-apps/local-records-schema.sql",
      ].includes(source.file),
      "Unreviewed extension source",
    );
    assert.equal(
      sha(fs.readFileSync(path.join(root, source.file))),
      source.sha256,
      "Extension source changed without manifest review",
    );
  }
  assert.equal(manifest.sources.length, 2);
  assert.equal(new Set(manifest.sources.map((s) => s.file)).size, 2);
  assert.equal(manifest.tables.length, 5);
  assert.equal(new Set(manifest.tables).size, 5);
  assert.equal(manifest.functions.length, 7);
  assert.equal(new Set(manifest.functions.map((f) => f.identity)).size, 7);
  return manifest;
}
export function assertRecoveryConfiguration(root, runtime, config) {
  assert.ok(path.isAbsolute(root) && path.isAbsolute(runtime));
  assert.equal(path.resolve(root), root);
  assert.equal(path.resolve(runtime), runtime);
  assert.equal(path.dirname(runtime), path.join(root, ".runtime"));
  assert.ok(
    runtime.startsWith(path.join(root, ".runtime") + path.sep),
    "Recovery runtime outside checkout",
  );
  assert.match(
    path.basename(runtime),
    /^cr-[a-f0-9]{6}$/,
    "Recovery requires a newly owned runtime",
  );
  assert.deepEqual(Object.keys(config).sort(), [
    "database",
    "host",
    "port",
    "user",
  ]);
  assert.equal(config.host, path.join(runtime, "socket"));
  assert.equal(config.database, "postgres");
  assert.equal(config.user, "kxra_app");
  assert.ok(
    Number.isInteger(config.port) &&
      config.port >= 1024 &&
      config.port <= 65535,
  );
}
export async function recoveryCatalog(client) {
  const tables = (
    await client.query(`select n.nspname||'.'||c.relname identity,c.relowner::regrole::text owner,c.relrowsecurity rls,
    (select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,'grantor',a.grantor::regrole::text,'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee::regrole::text,a.privilege_type) from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a) acl,
    (select count(*)::integer from pg_policies p where p.schemaname=n.nspname and p.tablename=c.relname) policies,
    has_table_privilege('authenticated',c.oid,'SELECT') authenticated_select,
    has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE') authenticated_write,
    has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') anon_access,
    encode(sha256(convert_to(jsonb_build_object('rls',c.relrowsecurity,'force',c.relforcerowsecurity,
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid,true)) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
      'constraints',(select jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid,true)) order by conname) from pg_constraint where conrelid=c.oid),
      'indexes',(select jsonb_agg(pg_get_indexdef(indexrelid,0,true) order by indexrelid::regclass::text) from pg_index where indrelid=c.oid),
      'policies',(select jsonb_agg((to_jsonb(p)-array['qual','with_check'])||jsonb_build_object('qual',pg_get_expr(q.polqual,q.polrelid,true),'with_check',pg_get_expr(q.polwithcheck,q.polrelid,true)) order by policyname) from pg_policies p join pg_policy q on q.polname=p.policyname and q.polrelid=c.oid where schemaname=n.nspname and tablename=c.relname),
      'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid,true) order by t.tgname) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal))::text,'UTF8')),'hex') sha256
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p') and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by identity`)
  ).rows;
  const functions = (
    await client.query(`select n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ', ',')||')' identity,p.proowner::regrole::text owner,p.prosecdef security_definer,
    (select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,'grantor',a.grantor::regrole::text,'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee::regrole::text,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) acl,
    has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
    has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') public_execute,
    encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') sha256
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind in ('f','p') and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by identity`)
  ).rows;
  const relations = (
    await client.query(`select n.nspname||'.'||c.relname identity,c.relkind kind,c.relowner::regrole::text owner,
    encode(sha256(convert_to(jsonb_build_object('acl',(select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,'grantor',a.grantor::regrole::text,'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee::regrole::text,a.privilege_type) from aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 's'::\"char\" else 'r'::\"char\" end,c.relowner))) a),'options',c.reloptions,
    'definition',case when c.relkind in ('v','m') then pg_get_viewdef(c.oid,true) else null end,
    'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod)) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),
    'sequence',(select to_jsonb(q)-'seqrelid' from pg_sequence q where q.seqrelid=c.oid),
    'foreign',(select jsonb_build_object('server',s.srvname,'options',f.ftoptions) from pg_foreign_table f join pg_foreign_server s on s.oid=f.ftserver where f.ftrelid=c.oid))::text,'UTF8')),'hex') sha256
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind not in ('r','p','i','I','t') and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by identity`)
  ).rows;
  const routines = (
    await client.query(`select n.nspname||'.'||p.proname||'('||replace(oidvectortypes(p.proargtypes),', ', ',')||')' identity,p.prokind kind,p.proowner::regrole::text owner,
    encode(sha256(convert_to(jsonb_build_object('acl',(select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else a.grantee::regrole::text end,'grantor',a.grantor::regrole::text,'privilege',a.privilege_type,'grantable',a.is_grantable) order by a.grantee::regrole::text,a.privilege_type) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),'definition',case when p.prokind='w' then pg_get_functiondef(p.oid) else null end,
    'aggregate',(select (to_jsonb(a)-array['aggfnoid','aggtransfn','aggfinalfn','aggcombinefn','aggserialfn','aggdeserialfn','aggmtransfn','aggminvtransfn','aggmfinalfn','aggsortop','aggtranstype','aggmtranstype']) || jsonb_build_object('transition',a.aggtransfn::regprocedure::text,'final',a.aggfinalfn::regprocedure::text,'combine',a.aggcombinefn::regprocedure::text,'serial',a.aggserialfn::regprocedure::text,'deserial',a.aggdeserialfn::regprocedure::text,'mtrans',a.aggmtransfn::regprocedure::text,'minverse',a.aggminvtransfn::regprocedure::text,'mfinal',a.aggmfinalfn::regprocedure::text,'sort',a.aggsortop::regoperator::text,'type',a.aggtranstype::regtype::text,'mtype',a.aggmtranstype::regtype::text) from pg_aggregate a where a.aggfnoid=p.oid))::text,'UTF8')),'hex') sha256
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind not in ('f','p') and n.nspname not like 'pg_%' and n.nspname<>'information_schema' order by identity`)
  ).rows;
  return { tables, functions, relations, routines };
}
export function assertExtensionCatalog(baseline, current, manifest, installed) {
  if (installed)
    assert.deepEqual(
      current,
      installed,
      "Installed extension/catalog definition or permissions changed",
    );
  const exact = (base, actual, extra) =>
    assert.deepEqual(
      actual.map((x) => x.identity).sort(),
      [...base.map((x) => x.identity), ...extra].sort(),
      "Unknown/missing table or function in extension fixture",
    );
  assert.equal(
    baseline.tables.filter((t) => t.identity.startsWith("kxra.")).length,
    manifest.canonical_kxra_tables,
  );
  assert.equal(
    baseline.functions.filter((f) => f.identity.startsWith("kxra.")).length,
    manifest.canonical_kxra_functions,
  );
  exact(baseline.tables, current.tables, manifest.tables);
  exact(
    baseline.functions,
    current.functions,
    manifest.functions.map((f) => f.identity),
  );
  exact(baseline.relations, current.relations, []);
  exact(baseline.routines, current.routines, []);
  for (const kind of ["tables", "functions", "relations", "routines"])
    for (const original of baseline[kind])
      assert.deepEqual(
        current[kind].find((x) => x.identity === original.identity),
        original,
        "Canonical catalog definition or permissions changed",
      );
  for (const name of manifest.tables) {
    const t = current.tables.find((x) => x.identity === name);
    assert.equal(t.owner, os.userInfo().username, "Unexpected extension owner");
    for (const a of t.acl)
      assert.ok(
        a.grantee === t.owner ||
          (a.grantee === "authenticated" &&
            a.privilege === "SELECT" &&
            !a.grantable),
        "Unreviewed table ACL grant",
      );
    assert.ok(
      t.rls &&
        t.policies > 0 &&
        t.authenticated_select &&
        !t.authenticated_write &&
        !t.anon_access,
      "Unsafe extension table permissions",
    );
  }
  for (const expected of manifest.functions) {
    const f = current.functions.find((x) => x.identity === expected.identity);
    assert.equal(f.owner, os.userInfo().username, "Unexpected extension owner");
    for (const a of f.acl)
      assert.ok(
        a.grantee === f.owner ||
          (a.grantee === "authenticated" &&
            expected.authenticated_execute &&
            a.privilege === "EXECUTE" &&
            !a.grantable),
        "Unreviewed function ACL grant",
      );
    assert.equal(f.security_definer, expected.security_definer);
    assert.equal(f.authenticated_execute, expected.authenticated_execute);
    assert.equal(f.anon_execute, false);
    assert.equal(f.public_execute, false);
  }
}
export async function customAppRecoveryEvidence(client, manifest) {
  await client.query("begin isolation level repeatable read read only");
  try {
    const result = {};
    for (const table of manifest.tables) {
      assert.ok(/^kxra\.custom_app(?:s|_[a-z_]+)$/.test(table));
      const v = (
        await client.query(
          `with proof as (select to_jsonb(t) row from ${table} t) select count(*)::integer count,encode(sha256(convert_to(coalesce(jsonb_agg(row order by row::text)::text,'[]'),'UTF8')),'hex') sha256 from proof`,
        )
      ).rows[0];
      assert.ok(v.count > 0, `Missing recovery data in ${table}`);
      assert.match(v.sha256, /^[a-f0-9]{64}$/);
      result[table] = v;
    }
    const invalid = (
      await client.query(
        "select count(*)::integer n from kxra.custom_app_versions where sha256<>encode(sha256(convert_to(artifact::text,'UTF8')),'hex')",
      )
    ).rows[0].n;
    assert.equal(invalid, 0, "Schema artifact digest mismatch");
    const orphan = (
      await client.query(
        "select count(*)::integer n from kxra.custom_app_records r where not exists(select 1 from kxra.custom_app_record_versions v where v.record_id=r.id)",
      )
    ).rows[0].n;
    assert.equal(orphan, 0, "Record without immutable history");
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}
export function assertFreshRestoreTarget(name, knownDatabases) {
  assert.match(name, /^kxra_app_restore_[a-f0-9]{12}$/);
  assert.ok(
    !knownDatabases.includes(name),
    "Restore target already exists; refusing restore",
  );
}

export function recoveryNativeOptions(environment, stdio = "inherit") {
  assert.ok(environment && typeof environment === "object");
  assert.ok(
    !Object.keys(environment).some(
      (k) => k.startsWith("PG") && k !== "PGPASSFILE",
    ),
    "Ambient libpq variables forbidden",
  );
  if (environment.PGPASSFILE !== undefined) {
    assert.ok(
      typeof environment.KXRA_RUNTIME === "string" &&
        path.isAbsolute(environment.KXRA_RUNTIME),
      "Owned passfile runtime required",
    );
    const file = path.join(environment.KXRA_RUNTIME, "empty.pgpass");
    assert.equal(
      environment.PGPASSFILE,
      file,
      "Ambient libpq passfile forbidden",
    );
    const stat = fs.lstatSync(file);
    assert.ok(
      stat.isFile() &&
        !stat.isSymbolicLink() &&
        stat.size === 0 &&
        (stat.mode & 0o077) === 0,
      "Private empty fixture passfile required",
    );
    assert.equal(fs.realpathSync(file), file);
  }
  return { env: { ...environment }, stdio };
}
export function cleanupRecoveryCluster(startAttempted, status, stop) {
  if (!startAttempted) return;
  const before = status();
  if (before === 3) return;
  assert.equal(
    before,
    0,
    "Owned cluster state uncertain; lease must remain held",
  );
  const stopped = stop(),
    after = status();
  assert.equal(
    after,
    3,
    "Owned cluster still active or uncertain; lease must remain held",
  );
  assert.equal(stopped, 0, "Owned cluster stop failed; lease must remain held");
}

export async function waitForRecoveryLease(
  acquire,
  isHeld,
  {
    timeoutMs = 60000,
    now = Date.now,
    wait = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {},
) {
  const deadline = now() + timeoutMs;
  while (isHeld()) {
    assert.ok(
      now() < deadline,
      "Shared fixture lease remained held; no fixture started",
    );
    await wait(250);
  }
  return acquire();
}
