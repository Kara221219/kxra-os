// Incremental application117→126 only. No provisioning, credentials, flags or external fences.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { applicationReleasePlan } from "./application-release-cohort.mjs";
import {
  assertNoHostedFixtureObjects,
  hostedFixtureObjects,
} from "./hosted-release-guard.mjs";
import { pairedCompositionCatalog } from "./paired-composition-catalog.mjs";
import {
  productionProjectRef,
  validateProductionTarget,
} from "./production-migrations-core.mjs";

export const applicationLock = "kxra-production-migrations";
export const applicationDigest = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hash = /^[a-f0-9]{64}$/;
const appSchemas = [
  "kxra",
  "kxra_private",
  "kxra_room_worker",
  "kxra_github_receipt",
  "kxra_paired_admission",
];
const roles = [
  "anon",
  "authenticated",
  "kxra_app",
  "kxra_ai_worker",
  "kxra_billing_worker",
  "supabase_auth_admin",
];
const check = (ok, code) => {
  if (!ok) throw Error(code);
};

export function validateApplicationEnvironment(env, command) {
  const findings = validateProductionTarget(env);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  try {
    const url = new URL(env.KXRA_PRODUCTION_MIGRATOR_DATABASE_URL);
    if (
      url.hostname !== `db.${productionProjectRef}.supabase.co` ||
      decodeURIComponent(url.username) !== "postgres"
    )
      findings.push(
        "application operator requires the fixed direct production host and postgres user",
      );
  } catch {
    /* Reported by the shared validator. */
  }
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === "0")
    findings.push("TLS verification cannot be disabled");
  if (
    command === "apply" &&
    !hash.test(env.KXRA_PRODUCTION_APPLICATION_PLAN_SHA256 || "")
  )
    findings.push("apply requires the exact reviewed plan SHA256");
  const confirmation = `APPLICATION126:${productionProjectRef}:${env.KXRA_PRODUCTION_SOURCE_COMMIT}:${env.KXRA_PRODUCTION_APPLICATION_PLAN_SHA256}`;
  if (
    command === "apply" &&
    env.KXRA_PRODUCTION_APPLICATION_CONFIRMATION !== confirmation
  )
    findings.push(
      "apply requires the exact APPLICATION126 project/source/plan confirmation",
    );
  return { ok: findings.length === 0, findings };
}

// Source-derived managed catalogues. Actual Auth metadata is bound to the reviewed plan,
// not mistaken for a verified hosted Auth service or hook configuration.
export function validateApplicationProfiles(document) {
  assert.deepEqual(Object.keys(document).sort(), [
    "classification",
    "profiles",
    "projectRef",
    "version",
  ]);
  assert.equal(document.version, 1);
  assert.equal(document.projectRef, productionProjectRef);
  assert.equal(
    document.classification,
    "SOURCE_DERIVED_APPLICATION_CATALOGS_NOT_HOSTED_ACCEPTANCE",
  );
  assert.ok(Array.isArray(document.profiles));
  const ids = new Set();
  for (const p of document.profiles) {
    assert.deepEqual(Object.keys(p).sort(), [
      "catalogs",
      "id",
      "serverMajor",
      "sourceCohortSha256",
    ]);
    assert.match(p.id, /^[a-z0-9][a-z0-9-]{0,63}$/);
    assert.ok(!ids.has(p.id));
    ids.add(p.id);
    assert.match(p.serverMajor, /^[1-9][0-9]$/);
    assert.match(p.sourceCohortSha256, hash);
    assert.deepEqual(
      Object.keys(p.catalogs).sort(),
      Array.from({ length: 10 }, (_, i) => String(i + 117)),
    );
    for (const value of Object.values(p.catalogs)) assert.match(value, hash);
  }
  return document.profiles;
}

export async function assertApplicationIdentity(db) {
  const t = (
    await db.query(
      "select current_database() database,current_user username,session_user session_username,current_setting('app.settings.project_ref',true) project_ref,current_setting('server_version_num') server_version,pg_is_in_recovery() recovery",
    )
  ).rows[0];
  check(
    t.database === "postgres" &&
      t.username === "postgres" &&
      t.session_username === "postgres" &&
      !t.recovery,
    "APPLICATION_TARGET_IDENTITY_INVALID",
  );
  check(
    !t.project_ref || t.project_ref === productionProjectRef,
    "APPLICATION_PROJECT_MARKER_MISMATCH",
  );
  return t;
}

export async function applicationTracking(db, cohort) {
  const t = (
    await db.query(
      "select to_regclass('public.kxra_schema_migrations') is not null tracked,to_regnamespace('kxra') is not null managed",
    )
  ).rows[0];
  check(
    t.tracked && t.managed,
    "APPLICATION_REQUIRES_TRACKED_EXISTING_BASELINE",
  );
  const table = (
    await db.query(
      "select c.relkind,c.relrowsecurity,pg_get_userbyid(c.relowner) owner from pg_class c where c.oid='public.kxra_schema_migrations'::regclass",
    )
  ).rows[0];
  check(
    table.relkind === "r" &&
      !table.relrowsecurity &&
      table.owner === "postgres",
    "APPLICATION_LEDGER_SHAPE_INVALID",
  );
  const columns = (
    await db.query(
      "select attname,format_type(atttypid,atttypmod) type,attnotnull from pg_attribute where attrelid='public.kxra_schema_migrations'::regclass and attnum>0 and not attisdropped order by attnum",
    )
  ).rows;
  for (const name of ["name", "sha256", "source_commit"])
    check(
      columns.some(
        (c) => c.attname === name && c.type === "text" && c.attnotnull,
      ),
      "APPLICATION_LEDGER_COLUMNS_INVALID",
    );
  check(
    (
      await db.query(
        "select exists(select 1 from pg_constraint where conrelid='public.kxra_schema_migrations'::regclass and contype='p' and pg_get_constraintdef(oid)='PRIMARY KEY (name)') ok",
      )
    ).rows[0].ok,
    "APPLICATION_LEDGER_PRIMARY_KEY_INVALID",
  );
  check(
    (
      await db.query(
        "select count(*)::int n from pg_trigger where tgrelid='public.kxra_schema_migrations'::regclass and not tgisinternal",
      )
    ).rows[0].n === 0,
    "APPLICATION_LEDGER_TRIGGER_FORBIDDEN",
  );
  check(
    (
      await db.query(
        "select count(*)::int n from pg_rewrite where ev_class='public.kxra_schema_migrations'::regclass",
      )
    ).rows[0].n === 0,
    "APPLICATION_LEDGER_RULE_FORBIDDEN",
  );
  check(
    (
      await db.query(
        "select count(*)::int n from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where c.oid='public.kxra_schema_migrations'::regclass and a.grantee<>c.relowner",
      )
    ).rows[0].n === 0,
    "APPLICATION_LEDGER_ACL_FORBIDDEN",
  );
  check(
    (
      await db.query(
        "select count(*)::int n from pg_attribute c cross join lateral aclexplode(c.attacl) a join pg_class t on t.oid=c.attrelid where t.oid='public.kxra_schema_migrations'::regclass and a.grantee<>t.relowner",
      )
    ).rows[0].n === 0,
    "APPLICATION_LEDGER_COLUMN_ACL_FORBIDDEN",
  );
  const rows = (
    await db.query(
      'select name,sha256,source_commit from public.kxra_schema_migrations order by name collate "C"',
    )
  ).rows;
  const plan = applicationReleasePlan(cohort, rows);
  check(rows.length >= 117, "APPLICATION_REQUIRES_PREFIX117_OR_LATER");
  return { rows, ...plan };
}

// Genuine124 intentionally reuses these local prototype names. Names alone stop being
// sufficient at that prefix: exact source catalogue equality is mandatory for apply/verify.
const genuine124Collisions = {
  relations: [
    "kxra.custom_app_record_versions",
    "kxra.custom_app_records",
    "kxra.custom_app_releases",
    "kxra.custom_app_versions",
    "kxra.custom_apps",
  ],
  functions: [
    "kxra.custom_app_record_save",
    "kxra.custom_app_register",
    "kxra.custom_app_release",
    "kxra_private.custom_app_immutable",
    "kxra_private.custom_app_schema_valid",
    "kxra_private.custom_app_values_valid",
    "kxra_private.custom_apps_local",
  ],
};
export async function assertNoApplicationFixtureObjects(db, prefix) {
  if (prefix < 124) return assertNoHostedFixtureObjects(db);
  const result = await db.query(
    `select 'schema' kind,n.nspname qualified_name from pg_namespace n where n.nspname=any($1::text[])
    union all select 'relation',n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname||'.'||c.relname=any($2::text[])
    union all select 'function',n.nspname||'.'||p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname=any($3::text[]) order by 1,2`,
    [
      hostedFixtureObjects.schemas,
      hostedFixtureObjects.relations.filter(
        (n) => !genuine124Collisions.relations.includes(n),
      ),
      hostedFixtureObjects.functions.filter(
        (n) => !genuine124Collisions.functions.includes(n),
      ),
    ],
  );
  check(
    Array.isArray(result.rows) && result.rows.length === 0,
    "APPLICATION_FIXTURE_OBJECT_FORBIDDEN",
  );
}

// Catalog only: never reads Auth users/sessions or application row payloads.
export async function applicationCatalog(db, prefix) {
  await assertNoApplicationFixtureObjects(db, prefix);
  const forbidden = (
    await db.query(
      "select nspname from pg_namespace where nspname like 'kxra%' and not(nspname=any($1::text[])) order by nspname",
      [appSchemas],
    )
  ).rows;
  check(forbidden.length === 0, "APPLICATION_UNREVIEWED_SCHEMA");
  const roleRows = (
    await db.query(
      "select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls from pg_roles where rolname=any($1::text[]) or starts_with(rolname,'kxra_') order by rolname",
      [roles],
    )
  ).rows;
  check(
    roles.every((name) => roleRows.some((r) => r.rolname === name)),
    "APPLICATION_REQUIRED_ROLE_MISSING",
  );
  for (const r of roleRows.filter((r) => r.rolname !== "supabase_auth_admin"))
    check(
      !r.rolsuper &&
        !r.rolcreaterole &&
        !r.rolcreatedb &&
        !r.rolreplication &&
        !r.rolbypassrls,
      "APPLICATION_ROLE_AUTHORITY_UNSUPPORTED",
    );
  const sessions = (
    await db.query(
      "select c.relkind,pg_get_userbyid(c.relowner) owner from pg_class c where c.oid=to_regclass('auth.sessions')",
    )
  ).rows[0];
  check(
    sessions?.relkind === "r" && sessions.owner === "supabase_auth_admin",
    "APPLICATION_AUTH_SESSIONS_UNSUPPORTED",
  );
  const authColumns = (
    await db.query(
      "select attname,format_type(atttypid,atttypmod) type,attnotnull from pg_attribute where attrelid='auth.sessions'::regclass and attnum>0 and not attisdropped order by attnum",
    )
  ).rows;
  for (const [name, type, notnull] of [
    ["id", "uuid", true],
    ["user_id", "uuid", true],
    ["created_at", "timestamp with time zone", false],
    ["not_after", "timestamp with time zone", false],
  ])
    check(
      authColumns.some(
        (c) =>
          c.attname === name && c.type === type && (!notnull || c.attnotnull),
      ),
      "APPLICATION_AUTH_COLUMNS_UNSUPPORTED",
    );
  check(
    (
      await db.query(
        "select exists(select 1 from pg_constraint where conrelid='auth.sessions'::regclass and contype='p' and pg_get_constraintdef(oid)='PRIMARY KEY (id)') ok",
      )
    ).rows[0].ok,
    "APPLICATION_AUTH_PRIMARY_KEY_UNSUPPORTED",
  );
  const grants = (
    await db.query(
      "select r.role,p.privilege from unnest($1::text[]) r(role) cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege) where (has_table_privilege(r.role,'auth.sessions',p.privilege) or (p.privilege in ('SELECT','INSERT','UPDATE','REFERENCES') and has_any_column_privilege(r.role,'auth.sessions',p.privilege)))",
      [
        roleRows
          .filter((r) => r.rolname !== "supabase_auth_admin")
          .map((r) => r.rolname),
      ],
    )
  ).rows;
  check(grants.length === 0, "APPLICATION_AUTH_APP_PRIVILEGES_FORBIDDEN");
  const triggerNames = (
    await db.query(
      "select tgname from pg_trigger where tgrelid='auth.sessions'::regclass and not tgisinternal order by tgname",
    )
  ).rows.map((r) => r.tgname);
  const expected =
    prefix < 125
      ? []
      : [
          "a00_custom_app_session_authority",
          ...(prefix === 126 ? ["b00_paired_setup_session_authority"] : []),
          "z90_custom_app_provider_session_identity",
          "z90_custom_app_session_capture",
        ];
  check(
    JSON.stringify(triggerNames) === JSON.stringify(expected),
    "APPLICATION_AUTH_TRIGGER_SET_UNSUPPORTED",
  );
  const catalog = await pairedCompositionCatalog(db);
  const memberships = (
    await db.query(
      "select pg_get_userbyid(roleid) role,pg_get_userbyid(member) member,pg_get_userbyid(grantor) grantor,admin_option from pg_auth_members order by 1,2,3",
    )
  ).rows;
  const types = (
    await db.query(
      "select n.nspname schema,t.typname name,t.typtype kind,e.enumlabel label,e.enumsortorder ordering from pg_type t join pg_namespace n on n.oid=t.typnamespace left join pg_enum e on e.enumtypid=t.oid where n.nspname=any($1::text[]) order by 1,2,5",
      [appSchemas],
    )
  ).rows;
  const authInterfaces = (
    await db.query(
      "select p.proname,p.prorettype::regtype::text returns,p.pronargs,p.prosecdef,pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.proname in ('uid','jwt') order by p.proname,p.pronargs",
    )
  ).rows;
  for (const [name, type] of [
    ["uid", "uuid"],
    ["jwt", "jsonb"],
  ])
    check(
      authInterfaces.some(
        (f) => f.proname === name && f.pronargs === 0 && f.returns === type,
      ),
      "APPLICATION_AUTH_INTERFACE_UNSUPPORTED",
    );
  check(
    (
      await db.query(
        "select has_schema_privilege('postgres','auth','USAGE') and has_table_privilege('postgres','auth.sessions','SELECT') and has_table_privilege('postgres','auth.sessions','TRIGGER') and has_function_privilege('postgres','auth.uid()','EXECUTE') and has_function_privilege('postgres','auth.jwt()','EXECUTE') ok",
      )
    ).rows[0].ok,
    "APPLICATION_AUTH_OPERATOR_PRIVILEGES_MISSING",
  );
  const dangerousMembership = (
    await db.query(
      "select r.role from unnest($1::text[]) r(role) where pg_has_role(r.role,'supabase_auth_admin','MEMBER') or exists(select 1 from pg_roles p where (p.rolsuper or p.rolcreaterole or p.rolcreatedb or p.rolbypassrls or p.rolreplication) and pg_has_role(r.role,p.oid,'MEMBER')) or exists(select 1 from pg_auth_members m where m.member=(select oid from pg_roles where rolname=r.role) and m.admin_option)",
      [
        roleRows
          .filter((r) => r.rolname !== "supabase_auth_admin")
          .map((r) => r.rolname),
      ],
    )
  ).rows;
  check(
    dangerousMembership.length === 0,
    "APPLICATION_PRIVILEGED_ROLE_MEMBERSHIP",
  );
  // Source expectation excludes provider-owned Auth objects, but includes exact custom
  // trigger definitions/enabled state. Environment-specific ACL order is normalized, not ACLs.
  const selected = Object.fromEntries(
    Object.entries(catalog).map(([key, values]) => [
      key,
      values.filter(
        (v) =>
          appSchemas.includes(v.schema) ||
          (key === "schemas" && appSchemas.includes(v.name)) ||
          appSchemas.includes(v.table_schema) ||
          appSchemas.includes(v.schemaname),
      ),
    ]),
  );
  selected.schemas = (
    await db.query(
      "select n.nspname name,pg_get_userbyid(n.nspowner) owner,(select jsonb_agg(jsonb_build_object('grantee',case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)) from aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a) acl from pg_namespace n where n.nspname=any($1::text[]) order by 1",
      [appSchemas],
    )
  ).rows;
  selected.columnAcls = (
    await db.query(
      "select n.nspname schema,c.relname name,a.attname column,(select jsonb_agg(jsonb_build_object('grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,'grantor',pg_get_userbyid(x.grantor),'privilege',x.privilege_type,'grantable',x.is_grantable)) from aclexplode(a.attacl) x) acl from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1::text[]) and a.attnum>0 and not a.attisdropped order by 1,2,3",
      [appSchemas],
    )
  ).rows;
  selected.triggers = (
    await db.query(
      "select n.nspname schema,c.relname name,t.tgname,pg_get_triggerdef(t.oid) definition,t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and (n.nspname=any($1::text[]) or (n.nspname='auth' and c.relname='sessions')) order by 1,2,3",
      [appSchemas],
    )
  ).rows;
  selected.rules = (
    await db.query(
      "select n.nspname schema,c.relname name,r.rulename,pg_get_ruledef(r.oid,true) definition,r.ev_enabled from pg_rewrite r join pg_class c on c.oid=r.ev_class join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1::text[]) order by 1,2,3",
      [appSchemas],
    )
  ).rows;
  selected.relationOptions = (
    await db.query(
      "select n.nspname schema,c.relname name,c.relkind,c.reloptions,c.relpersistence from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1::text[]) order by 1,2",
      [appSchemas],
    )
  ).rows;
  selected.indexState = (
    await db.query(
      "select n.nspname schema,c.relname name,i.indisunique,i.indisprimary,i.indisexclusion,i.indimmediate,i.indisclustered,i.indisvalid,i.indcheckxmin,i.indisready,i.indislive,i.indisreplident,to_jsonb(i)->'indnullsnotdistinct' nulls_not_distinct from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname=any($1::text[]) order by 1,2",
      [appSchemas],
    )
  ).rows;
  // Definition strings are retained verbatim; only object/ACL array ordering is canonicalized.
  const canonical = (value) =>
    Array.isArray(value)
      ? value.map(canonical).sort((a, b) => {
          const left = JSON.stringify(a),
            right = JSON.stringify(b);
          return left < right ? -1 : left > right ? 1 : 0;
        })
      : value && typeof value === "object"
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, canonical(value[k])]),
          )
        : value;
  const targetMetadata = {
    roleRows,
    memberships,
    authInterfaces,
    auth: Object.fromEntries(
      Object.entries(catalog).map(([key, values]) => [
        key,
        values.filter(
          (v) =>
            v.schema === "auth" ||
            v.table_schema === "auth" ||
            v.schemaname === "auth" ||
            (key === "schemas" && v.name === "auth"),
        ),
      ]),
    ),
  };
  return {
    sha256: applicationDigest(canonical({ selected, types })),
    targetSha256: applicationDigest(canonical(targetMetadata)),
    authColumns,
    roles: roleRows.map((r) => ({ name: r.rolname, login: r.rolcanlogin })),
    authTriggers: triggerNames,
  };
}

export async function inspectApplication(db, cohort, sourceCommit, profiles) {
  const identity = await assertApplicationIdentity(db);
  const state = await applicationTracking(db, cohort);
  const catalog = await applicationCatalog(db, state.applied);
  const sourceCohortSha256 = applicationDigest(
    cohort.migrations.map(({ name, sha256 }) => ({ name, sha256 })),
  );
  const supported = profiles.filter(
    (p) =>
      p.serverMajor ===
        String(Math.trunc(Number(identity.server_version) / 10000)) &&
      p.sourceCohortSha256 === sourceCohortSha256 &&
      p.catalogs[String(state.applied)] === catalog.sha256,
  );
  check(supported.length <= 1, "APPLICATION_PROFILE_AMBIGUOUS");
  const body = {
    projectRef: productionProjectRef,
    database: "postgres",
    user: "postgres",
    sourceCommit,
    sourceCohortSha256,
    serverVersion: identity.server_version,
    projectMarker: identity.project_ref
      ? "MATCHED"
      : "ABSENT_DIRECT_TLS_REQUIRED",
    applied: state.applied,
    ledgerSha256: applicationDigest(state.rows),
    catalogSha256: catalog.sha256,
    targetMetadataSha256: catalog.targetSha256,
    profile: supported[0]?.id || null,
    pending: state.pending,
  };
  return {
    ...body,
    planSha256: applicationDigest(body),
    compatibility: supported.length
      ? "SOURCE_CATALOG_AND_AUTH_PRECONDITIONS_MATCH"
      : "TARGET_CATALOG_REVIEW_REQUIRED",
    authorization: false,
    fullReleaseEligible: false,
    hostedAcceptanceRequired: [
      "Real Auth insertion/refresh and original-session hook ordering",
      "Approved backup/restore and maintenance window",
      "External fence isolation and complete hosted customer acceptance",
    ],
    auth: {
      columns: catalog.authColumns,
      roles: catalog.roles,
      triggers: catalog.authTriggers,
    },
  };
}

export async function operateApplication(
  db,
  { command, cohort, sourceCommit, profiles, planSha256 },
) {
  check(
    ["plan", "verify", "apply"].includes(command),
    "APPLICATION_COMMAND_INVALID",
  );
  check(
    /^[a-f0-9]{40}$/.test(sourceCommit),
    "APPLICATION_SOURCE_COMMIT_INVALID",
  );
  if (command !== "apply") {
    await db.query("begin isolation level repeatable read read only");
    try {
      await db.query("set local search_path=pg_catalog");
      const report = await inspectApplication(
        db,
        cohort,
        sourceCommit,
        profiles,
      );
      if (command === "verify")
        check(
          report.profile && report.applied === 126,
          "APPLICATION_VERIFICATION_INCOMPLETE_OR_UNREVIEWED",
        );
      await db.query("commit");
      return report;
    } catch (e) {
      await db.query("rollback");
      throw e;
    }
  }
  check(hash.test(planSha256 || ""), "APPLICATION_REVIEWED_PLAN_REQUIRED");
  // Shares the existing production117 lock. Try-lock fails promptly, never queues a stale plan.
  const locked = (
    await db.query("select pg_try_advisory_lock(hashtext($1)) locked", [
      applicationLock,
    ])
  ).rows[0].locked;
  check(locked, "APPLICATION_OPERATOR_BUSY");
  let primaryError;
  try {
    let expectedPlan = planSha256;
    let retainedProfile = null;
    while (true) {
      await db.query("begin");
      let committing = false;
      try {
        await db.query(
          "set local lock_timeout='5s'; set local statement_timeout='30s'; set local search_path=pg_catalog",
        );
        await db.query(
          "lock table public.kxra_schema_migrations in exclusive mode",
        );
        // Freeze provider session writes during each precondition + DDL + ledger unit.
        // Cooperating schema operators are serialized by the historical advisory lock.
        await db.query("lock table auth.sessions in share row exclusive mode");
        const before = await inspectApplication(
          db,
          cohort,
          sourceCommit,
          profiles,
        );
        check(before.profile, "APPLICATION_TARGET_PROFILE_REQUIRED");
        if (retainedProfile)
          check(
            before.profile === retainedProfile,
            "APPLICATION_PROFILE_CHANGED",
          );
        retainedProfile = before.profile;
        if (expectedPlan)
          check(
            before.planSha256 === expectedPlan,
            "APPLICATION_REVIEWED_PLAN_CHANGED",
          );
        else check(expectedPlan === null, "APPLICATION_REVIEWED_PLAN_REQUIRED");
        if (!before.pending.length) {
          await db.query("rollback");
          return before;
        }
        const item = cohort.migrations[before.applied];
        await db.query(item.sql);
        await db.query(
          "insert into public.kxra_schema_migrations(name,sha256,source_commit) values($1,$2,$3)",
          [item.name, item.sha256, sourceCommit],
        );
        const after = await inspectApplication(
          db,
          cohort,
          sourceCommit,
          profiles,
        );
        check(
          after.profile === before.profile &&
            after.applied === before.applied + 1,
          "APPLICATION_POST_MIGRATION_CATALOG_MISMATCH",
        );
        committing = true;
        await db.query("commit");
        expectedPlan = after.planSha256;
      } catch (e) {
        try {
          await db.query("rollback");
        } catch {
          /* Connection loss: no replay in this invocation. */
        }
        if (committing)
          throw Error("APPLICATION_COMMIT_OUTCOME_UNCERTAIN_REPLAN_REQUIRED");
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
        throw Error("APPLICATION_LOCK_RELEASE_UNCERTAIN_RECONNECT_REQUIRED");
    }
  }
}
