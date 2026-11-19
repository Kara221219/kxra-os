// Additive 82→126 upgrade. No ledger repair, role provisioning or hosted activation.
import fs from "node:fs";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { applicationReleasePlan } from "./application-release-cohort.mjs";
import {
  applicationCatalog,
  applicationDigest,
  applicationLock,
  assertApplicationIdentity,
  validateApplicationEnvironment,
} from "./production-application-core.mjs";
import { productionProjectRef } from "./production-migrations-core.mjs";

const hash = /^[a-f0-9]{64}$/;
const check = (condition, code) => {
  if (!condition) throw Error(code);
};
const expectedLedger = JSON.parse(
  fs.readFileSync(
    new URL(
      "../packages/release/production-application-upgrade-ledger-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
assert.equal(expectedLedger.version, 1);
assert.equal(
  expectedLedger.classification,
  "REVIEWED_LEDGER_STRUCTURE_NOT_GRANT_OR_DEPLOYMENT_APPROVAL",
);
export const upgradeMinimumPrefix = 82;
export const upgradeMaximumPrefix = 126;

export function validateUpgradeEnvironment(env, command) {
  const findings = validateApplicationEnvironment(
    env,
    command === "apply" ? "plan" : command,
  ).findings;
  if (command === "apply") {
    if (!hash.test(env.KXRA_PRODUCTION_APPLICATION_UPGRADE_PLAN_SHA256 || ""))
      findings.push("upgrade requires the exact reviewed plan SHA256");
    const confirmation = `UPGRADE82_126:${productionProjectRef}:${env.KXRA_PRODUCTION_SOURCE_COMMIT}:${env.KXRA_PRODUCTION_APPLICATION_UPGRADE_PLAN_SHA256}`;
    if (env.KXRA_PRODUCTION_APPLICATION_UPGRADE_CONFIRMATION !== confirmation)
      findings.push(
        "upgrade requires the exact project/source/plan confirmation",
      );
  }
  return { ok: findings.length === 0, findings };
}

export function validateUpgradeProfiles(document) {
  assert.deepEqual(Object.keys(document).sort(), [
    "classification",
    "maximumPrefix",
    "minimumPrefix",
    "profiles",
    "projectRef",
    "version",
  ]);
  assert.equal(document.version, 1);
  assert.equal(
    document.classification,
    "SOURCE_DERIVED_PREFIX82_126_NOT_HOSTED_ACCEPTANCE",
  );
  assert.equal(document.projectRef, productionProjectRef);
  assert.equal(document.minimumPrefix, upgradeMinimumPrefix);
  assert.equal(document.maximumPrefix, upgradeMaximumPrefix);
  assert.ok(Array.isArray(document.profiles));
  const majors = new Set(),
    ids = new Set();
  for (const profile of document.profiles) {
    assert.deepEqual(Object.keys(profile).sort(), [
      "catalogs",
      "id",
      "serverMajor",
      "sourceCohortSha256",
    ]);
    assert.match(profile.id, /^application-upgrade-postgres(14|17)-source$/);
    assert.ok(!ids.has(profile.id));
    ids.add(profile.id);
    assert.match(profile.serverMajor, /^(14|17)$/);
    assert.ok(!majors.has(profile.serverMajor));
    majors.add(profile.serverMajor);
    assert.equal(
      profile.id,
      `application-upgrade-postgres${profile.serverMajor}-source`,
    );
    assert.match(profile.sourceCohortSha256, hash);
    assert.deepEqual(
      Object.keys(profile.catalogs).sort(),
      Array.from({ length: 45 }, (_, i) => String(i + 82)).sort(),
    );
    for (const value of Object.values(profile.catalogs))
      assert.match(value, hash);
  }
  return document.profiles;
}

export function ledgerMetadataFindings(metadata, serverMajor) {
  const findings = [];
  for (const section of ["table", "columns", "constraints", "indexes"]) {
    if (
      !isDeepStrictEqual(metadata.shape[section], expectedLedger.shape[section])
    )
      findings.push({ code: `LEDGER_${section.toUpperCase()}_UNSUPPORTED` });
  }
  if (metadata.droppedColumns !== 0)
    findings.push({ code: "LEDGER_DROPPED_COLUMNS_UNSUPPORTED" });
  for (const kind of ["policies", "triggers", "rules", "columnAcls"])
    if (metadata[kind].length)
      findings.push({ code: `LEDGER_${kind.toUpperCase()}_FORBIDDEN` });
  const privileges = [
    "DELETE",
    "INSERT",
    "REFERENCES",
    "SELECT",
    "TRIGGER",
    "TRUNCATE",
    "UPDATE",
    ...(Number(serverMajor) >= 17 ? ["MAINTAIN"] : []),
  ].sort();
  const ownerPrivileges = metadata.acls.filter((a) => a.grantee === "postgres");
  const expectedOwner = privileges.map((privilege) => ({
    grantee: "postgres",
    grantor: "postgres",
    privilege,
    grantable: false,
  }));
  if (!isDeepStrictEqual(ownerPrivileges, expectedOwner))
    findings.push({ code: "LEDGER_OWNER_ACL_UNSUPPORTED" });
  const residual = metadata.acls.filter((a) => a.grantee !== "postgres");
  if (residual.length)
    findings.push({
      code: "LEDGER_NON_OWNER_PRIVILEGES_FORBIDDEN",
      grants: residual,
    });
  return findings;
}

export async function readUpgradeLedger(db, cohort, serverMajor) {
  const exists = (
    await db.query(
      "select to_regclass('public.kxra_schema_migrations') is not null tracked,to_regnamespace('kxra') is not null managed",
    )
  ).rows[0];
  check(
    exists?.tracked && exists.managed,
    "APPLICATION_UPGRADE_EXISTING_BASELINE_REQUIRED",
  );
  const shape = {};
  shape.table = (
    await db.query(
      "select c.relrowsecurity rls,c.relkind kind,pg_get_userbyid(c.relowner) owner,c.reloptions options,c.relforcerowsecurity force_rls,c.relpersistence persistence,c.relreplident replica_identity from pg_class c where c.oid='public.kxra_schema_migrations'::regclass",
    )
  ).rows[0];
  shape.columns = (
    await db.query(
      "select a.attname name,format_type(a.atttypid,a.atttypmod) type,pg_get_expr(d.adbin,d.adrelid,false) as \"default\",a.attidentity identity,a.attnotnull not_null,a.attnum position,case when a.attcollation<>0 then (select format('%I.%I',n.nspname,c.collname) from pg_collation c join pg_namespace n on n.oid=c.collnamespace where c.oid=a.attcollation) end collation,a.attgenerated generated from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.kxra_schema_migrations'::regclass and a.attnum>0 and not a.attisdropped order by a.attnum",
    )
  ).rows;
  shape.constraints = (
    await db.query(
      "select contype kind,conname name,condeferred deferred,convalidated validated,condeferrable deferrable,pg_get_constraintdef(oid,false) definition from pg_constraint where conrelid='public.kxra_schema_migrations'::regclass order by conname collate \"C\"",
    )
  ).rows;
  shape.indexes = (
    await db.query(
      'select i.indislive live,c.relname name,i.indisready ready,i.indisvalid valid,i.indisunique as "unique",i.indisprimary as "primary",pg_get_indexdef(i.indexrelid,0,false) definition from pg_index i join pg_class c on c.oid=i.indexrelid where i.indrelid=\'public.kxra_schema_migrations\'::regclass order by c.relname collate "C"',
    )
  ).rows;
  const policies = (
    await db.query(
      "select polname name,polcmd command,polpermissive permissive,pg_get_expr(polqual,polrelid,false) using_expression,pg_get_expr(polwithcheck,polrelid,false) check_expression,polroles::text roles from pg_policy where polrelid='public.kxra_schema_migrations'::regclass order by polname collate \"C\"",
    )
  ).rows;
  const triggers = (
    await db.query(
      "select tgname name,tgenabled enabled,pg_get_triggerdef(oid,false) definition from pg_trigger where tgrelid='public.kxra_schema_migrations'::regclass order by tgname collate \"C\"",
    )
  ).rows;
  const rules = (
    await db.query(
      "select rulename name,ev_enabled enabled,pg_get_ruledef(oid,false) definition from pg_rewrite where ev_class='public.kxra_schema_migrations'::regclass order by rulename collate \"C\"",
    )
  ).rows;
  const acls = (
    await db.query(
      "select case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee,pg_get_userbyid(a.grantor) grantor,a.privilege_type privilege,a.is_grantable grantable from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid='public.kxra_schema_migrations'::regclass order by a.grantee,a.grantor,a.privilege_type,a.is_grantable",
    )
  ).rows;
  const columnAcls = (
    await db.query(
      "select c.attname name,case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee,pg_get_userbyid(a.grantor) grantor,a.privilege_type privilege,a.is_grantable grantable from pg_attribute c cross join lateral aclexplode(c.attacl) a where c.attrelid='public.kxra_schema_migrations'::regclass order by c.attnum,a.grantee,a.grantor,a.privilege_type",
    )
  ).rows;
  const droppedColumns = (
    await db.query(
      "select count(*)::integer n from pg_attribute where attrelid='public.kxra_schema_migrations'::regclass and attnum>0 and attisdropped",
    )
  ).rows[0].n;
  const metadata = {
    shape,
    policies,
    triggers,
    rules,
    acls,
    columnAcls,
    droppedColumns,
  };
  // Never read an unsupported column layout, view or RLS-hidden ledger as a valid prefix.
  check(
    isDeepStrictEqual(shape.columns, expectedLedger.shape.columns),
    "APPLICATION_UPGRADE_LEDGER_COLUMNS_UNSUPPORTED",
  );
  check(
    shape.table.kind === "r" &&
      shape.table.owner === "postgres" &&
      !shape.table.force_rls,
    "APPLICATION_UPGRADE_LEDGER_IDENTITY_UNSUPPORTED",
  );
  const rows = (
    await db.query(`select name,sha256,source_commit,
    to_char(applied_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') applied_at,
    isfinite(applied_at) finite, applied_at >= timestamptz '0001-01-01 00:00:00+00' and applied_at < timestamptz '10000-01-01 00:00:00+00' supported_era from public.kxra_schema_migrations order by name collate "C"`)
  ).rows;
  for (const row of rows) {
    check(
      row.finite &&
        row.supported_era &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/.test(row.applied_at),
      "APPLICATION_UPGRADE_LEDGER_TIMESTAMP_INVALID",
    );
    delete row.finite;
    delete row.supported_era;
  }
  const plan = applicationReleasePlan(cohort, rows);
  check(plan.applied >= 82, "APPLICATION_UPGRADE_PREFIX82_REQUIRED");
  return {
    rows,
    metadata,
    metadataSha256: applicationDigest(metadata),
    findings: ledgerMetadataFindings(metadata, serverMajor),
    ...plan,
  };
}

// Supplement fa49 without changing its reviewed catalog contract. These settings and
// membership options are observed and hashed, never emitted, provisioned or approved.
export async function readUpgradeRuntimeMetadata(db) {
  const roles = (
    await db.query(
      "select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,coalesce(rolconfig,'{}') configuration,extract(epoch from rolvaliduntil)::text valid_until_epoch from pg_roles where starts_with(rolname,'kxra_') or rolname in ('anon','authenticated','supabase_auth_admin','postgres','service_role') order by rolname collate \"C\"",
    )
  ).rows;
  const memberships = (
    await db.query(
      'select pg_get_userbyid(m.roleid) role,member.rolname member,pg_get_userbyid(m.grantor) grantor,m.admin_option,coalesce((to_jsonb(m)->>\'inherit_option\')::boolean,member.rolinherit) inherit_option,coalesce((to_jsonb(m)->>\'set_option\')::boolean,true) set_option from pg_auth_members m join pg_roles member on member.oid=m.member order by pg_get_userbyid(m.roleid) collate "C",member.rolname collate "C",pg_get_userbyid(m.grantor) collate "C"',
    )
  ).rows;
  const databaseSettings = (
    await db.query(
      "select case when s.setrole=0 then 'ALL_ROLES' else pg_get_userbyid(s.setrole) end role,case when s.setdatabase=0 then 'ALL_DATABASES' else d.datname end database,s.setconfig configuration from pg_db_role_setting s left join pg_database d on d.oid=s.setdatabase where (s.setdatabase=0 or d.datname=current_database()) and (s.setrole=0 or s.setrole in(select oid from pg_roles where starts_with(rolname,'kxra_') or rolname in('anon','authenticated','supabase_auth_admin','postgres','service_role'))) order by s.setrole,s.setdatabase",
    )
  ).rows;
  return { roles, memberships, databaseSettings };
}

// Provider DDL hooks execute implicitly during migration SQL. Their observations
// must be reviewed separately; neither source profiles nor hashes approve behavior.
export async function readUpgradeDdlHooks(db) {
  const rows = (
    await db.query(`select e.evtname name,e.evtevent event,e.evtenabled enabled,e.evttags tags,
      pg_get_userbyid(e.evtowner) owner,n.nspname function_schema,p.proname function_name,
      pg_get_function_identity_arguments(p.oid) function_arguments,
      pg_get_userbyid(p.proowner) function_owner,l.lanname language,
      p.prosecdef security_definer,p.proleakproof leakproof,p.provolatile volatility,
      p.proparallel parallel,p.proconfig configuration,p.proacl::text acl,
      pg_get_functiondef(p.oid) definition
      from pg_event_trigger e join pg_proc p on p.oid=e.evtfoid
      join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang
      order by e.evtname collate "C"`)
  ).rows;
  return rows.map(({ definition, configuration, acl, ...identity }) => ({
    ...identity,
    functionDefinitionSecuritySha256: applicationDigest({
      ...identity,
      definition,
      configuration,
      acl,
    }),
  }));
}

async function inspectUpgradeState(db, cohort, sourceCommit, profiles) {
  const identity = await assertApplicationIdentity(db);
  const serverMajor = String(
    Math.trunc(Number(identity.server_version) / 10000),
  );
  const ledger = await readUpgradeLedger(db, cohort, serverMajor);
  const catalog = await applicationCatalog(db, ledger.applied);
  const runtimeMetadata = await readUpgradeRuntimeMetadata(db);
  const runtimeRoleMetadataSha256 = applicationDigest(runtimeMetadata);
  const ddlHooks = await readUpgradeDdlHooks(db);
  const ddlHookMetadataSha256 = applicationDigest(ddlHooks);
  const sourceCohortSha256 = applicationDigest(
    cohort.migrations.map(({ name, sha256 }) => ({ name, sha256 })),
  );
  const supported = profiles.filter(
    (p) =>
      p.serverMajor === serverMajor &&
      p.sourceCohortSha256 === sourceCohortSha256 &&
      p.catalogs[String(ledger.applied)] === catalog.sha256,
  );
  check(supported.length <= 1, "APPLICATION_UPGRADE_PROFILE_AMBIGUOUS");
  const blockers = [
    ...ledger.findings,
    ...(supported.length
      ? []
      : [{ code: "APPLICATION_CATALOG_REVIEW_REQUIRED" }]),
  ];
  const body = {
    classification: "APPLICATION82_126_UPGRADE_PLAN_NOT_DEPLOYMENT_APPROVAL",
    projectRef: productionProjectRef,
    database: "postgres",
    user: "postgres",
    sourceCommit,
    sourceCohortSha256,
    serverVersion: identity.server_version,
    projectMarker: identity.project_ref
      ? "MATCHED"
      : "ABSENT_DIRECT_TLS_REQUIRED",
    applied: ledger.applied,
    ledgerSha256: applicationDigest(ledger.rows),
    ledgerMetadataSha256: ledger.metadataSha256,
    catalogSha256: catalog.sha256,
    targetMetadataSha256: catalog.targetSha256,
    runtimeRoleMetadataSha256,
    ddlHookMetadataSha256,
    ddlHooks: {
      classification: "OBSERVED_HOOK_HASHES_NOT_SEMANTIC_APPROVAL",
      hooks: ddlHooks,
    },
    profile: supported[0]?.id || null,
    pending: ledger.pending,
    blockers,
  };
  const report = {
    ...body,
    planSha256: applicationDigest(body),
    applyEligible: blockers.length === 0,
    authorization: false,
    fullReleaseEligible: false,
    ledger: {
      owner: ledger.metadata.shape.table.owner,
      rls: ledger.metadata.shape.table.rls,
      forceRls: ledger.metadata.shape.table.force_rls,
      policies: ledger.metadata.policies.length,
      triggers: ledger.metadata.triggers.length,
      rules: ledger.metadata.rules.length,
      residualGrants: ledger.metadata.acls.filter(
        (a) => a.grantee !== "postgres",
      ),
      columnGrants: ledger.metadata.columnAcls.length,
      timestampPrecision: "UTC_MICROSECONDS",
    },
    auth: {
      columns: catalog.authColumns,
      roles: catalog.roles,
      triggers: catalog.authTriggers,
    },
    hostedAcceptanceRequired: [
      "Reviewed ledger privilege remediation, if blocked; operator never repairs grants",
      "Separate semantic review of all observed provider DDL hooks",
      "Backup/restore, zero-overage and maintenance approval",
      "Actual Auth hook, session and complete customer acceptance",
    ],
  };
  return { report, ledger, runtimeRoleMetadataSha256, ddlHookMetadataSha256 };
}
export async function inspectApplicationUpgrade(
  db,
  cohort,
  sourceCommit,
  profiles,
) {
  return (await inspectUpgradeState(db, cohort, sourceCommit, profiles)).report;
}

export async function operateApplicationUpgrade(
  db,
  { command, cohort, sourceCommit, profiles, planSha256 },
) {
  check(
    ["plan", "apply", "verify"].includes(command),
    "APPLICATION_UPGRADE_COMMAND_INVALID",
  );
  check(
    /^[a-f0-9]{40}$/.test(sourceCommit),
    "APPLICATION_UPGRADE_SOURCE_INVALID",
  );
  if (command !== "apply") {
    await db.query("begin isolation level repeatable read read only");
    try {
      await db.query("set local search_path=pg_catalog");
      const report = await inspectApplicationUpgrade(
        db,
        cohort,
        sourceCommit,
        profiles,
      );
      if (command === "verify")
        check(
          report.applyEligible && report.applied === 126,
          "APPLICATION_UPGRADE_VERIFICATION_INCOMPLETE_OR_BLOCKED",
        );
      await db.query("commit");
      return report;
    } catch (e) {
      await db.query("rollback");
      throw e;
    }
  }
  check(
    hash.test(planSha256 || ""),
    "APPLICATION_UPGRADE_REVIEWED_PLAN_REQUIRED",
  );
  const locked = (
    await db.query("select pg_try_advisory_lock(hashtext($1)) locked", [
      applicationLock,
    ])
  ).rows[0].locked;
  check(locked, "APPLICATION_UPGRADE_OPERATOR_BUSY");
  let primaryError;
  try {
    let expectedPlan = planSha256,
      retainedProfile = null;
    while (true) {
      await db.query("begin");
      let committing = false;
      try {
        await db.query(
          "set local lock_timeout='5s';set local statement_timeout='30s';set local search_path=pg_catalog",
        );
        await db.query(
          "lock table public.kxra_schema_migrations in exclusive mode",
        );
        await db.query("lock table auth.sessions in share row exclusive mode");
        const before = await inspectUpgradeState(
          db,
          cohort,
          sourceCommit,
          profiles,
        );
        check(
          before.report.applyEligible,
          "APPLICATION_UPGRADE_BLOCKED_REVIEW_PLAN",
        );
        check(
          before.report.planSha256 === expectedPlan,
          "APPLICATION_UPGRADE_REVIEWED_PLAN_CHANGED",
        );
        if (retainedProfile)
          check(
            before.report.profile === retainedProfile,
            "APPLICATION_UPGRADE_PROFILE_CHANGED",
          );
        retainedProfile = before.report.profile;
        if (!before.report.pending.length) {
          await db.query("rollback");
          return before.report;
        }
        const item = cohort.migrations[before.report.applied];
        await db.query(item.sql);
        await db.query(
          "insert into public.kxra_schema_migrations(name,sha256,source_commit) values($1,$2,$3)",
          [item.name, item.sha256, sourceCommit],
        );
        const after = await inspectUpgradeState(
          db,
          cohort,
          sourceCommit,
          profiles,
        );
        check(
          after.report.applyEligible &&
            after.report.profile === retainedProfile &&
            after.report.applied === before.report.applied + 1,
          "APPLICATION_UPGRADE_POST_MIGRATION_REJECTED",
        );
        check(
          isDeepStrictEqual(
            after.ledger.rows.slice(0, before.ledger.rows.length),
            before.ledger.rows,
          ),
          "APPLICATION_UPGRADE_HISTORICAL_LEDGER_CHANGED",
        );
        check(
          after.ledger.metadataSha256 === before.ledger.metadataSha256,
          "APPLICATION_UPGRADE_LEDGER_METADATA_CHANGED",
        );
        check(
          after.runtimeRoleMetadataSha256 === before.runtimeRoleMetadataSha256,
          "APPLICATION_UPGRADE_RUNTIME_ROLE_METADATA_CHANGED",
        );
        check(
          after.ddlHookMetadataSha256 === before.ddlHookMetadataSha256,
          "APPLICATION_UPGRADE_DDL_HOOK_METADATA_CHANGED",
        );
        committing = true;
        await db.query("commit");
        expectedPlan = after.report.planSha256;
      } catch (e) {
        try {
          await db.query("rollback");
        } catch {}
        if (committing)
          throw Error(
            "APPLICATION_UPGRADE_COMMIT_OUTCOME_UNCERTAIN_REPLAN_REQUIRED",
          );
        throw e;
      }
    }
  } catch (e) {
    primaryError = e;
    throw e;
  } finally {
    try {
      await db.query("select pg_advisory_unlock(hashtext($1))", [
        applicationLock,
      ]);
    } catch (e) {
      if (!primaryError)
        throw Error(
          "APPLICATION_UPGRADE_LOCK_RELEASE_UNCERTAIN_RECONNECT_REQUIRED",
        );
    }
  }
}
