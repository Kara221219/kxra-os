import { validateStagingTarget } from "./staging-migrations-core.mjs";

export const runtimeRoleProfile = "KXRA-RUNTIME-ROLES-V1";
export const runtimeRoleNames = ["kxra_app", "kxra_public_ingress"];

function validPassword(value) {
  return /^[A-Za-z0-9_-]{48,128}$/.test(value || "");
}

export function validateRuntimeRoleOperator(environment, command) {
  const findings = validateStagingTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  const projectRef = environment.KXRA_STAGING_PROJECT_REF || "";
  if (command === "apply") {
    const app = environment.KXRA_STAGING_APP_PASSWORD || "";
    const ingress = environment.KXRA_STAGING_PUBLIC_INGRESS_PASSWORD || "";
    if (!validPassword(app))
      findings.push(
        "KXRA_STAGING_APP_PASSWORD must be 48-128 base64url characters",
      );
    if (!validPassword(ingress))
      findings.push(
        "KXRA_STAGING_PUBLIC_INGRESS_PASSWORD must be 48-128 base64url characters",
      );
    if (app && app === ingress)
      findings.push("runtime role passwords must be different");
    const expected = `ROLES:${projectRef}:codex/phase-2-completion`;
    if (environment.KXRA_STAGING_ROLE_CONFIRMATION !== expected)
      findings.push(`KXRA_STAGING_ROLE_CONFIRMATION must equal ${expected}`);
  }
  return { ok: findings.length === 0, findings };
}

export async function inspectRuntimeRoles(database) {
  const roles = (
    await database.query(
      `select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
        rolreplication,rolbypassrls,rolconnlimit,coalesce(rolconfig,'{}') rolconfig,
        rolpassword is not null password_set
       from pg_roles where rolname=any($1::text[]) order by rolname`,
      [runtimeRoleNames],
    )
  ).rows;
  const memberships = (
    await database.query(
      `select member.rolname member,granted.rolname granted,membership.admin_option
       from pg_auth_members membership
       join pg_roles member on member.oid=membership.member
       join pg_roles granted on granted.oid=membership.roleid
       where member.rolname=any($1::text[]) order by member.rolname,granted.rolname`,
      [runtimeRoleNames],
    )
  ).rows;
  const ownership = (
    await database.query(
      `select role.rolname,count(dependency.*)::int owned
       from pg_roles role
       left join pg_shdepend dependency on dependency.refclassid='pg_authid'::regclass
        and dependency.refobjid=role.oid and dependency.deptype='o'
        and (dependency.dbid=0 or dependency.dbid=(select oid from pg_database where datname=current_database()))
       where role.rolname=any($1::text[])
       group by role.rolname order by role.rolname`,
      [runtimeRoleNames],
    )
  ).rows;
  const directGrants = (
    await database.query(
      `select role.rolname grantee,count(dependency.*)::int grants
       from pg_roles role
       join pg_shdepend dependency on dependency.refclassid='pg_authid'::regclass
        and dependency.refobjid=role.oid and dependency.deptype='a'
        and dependency.classid<>'pg_auth_members'::regclass
        and (dependency.dbid=0 or dependency.dbid=(select oid from pg_database where datname=current_database()))
       where role.rolname=any($1::text[])
       group by role.rolname order by role.rolname`,
      [runtimeRoleNames],
    )
  ).rows;
  return { roles, memberships, ownership, directGrants };
}

export function runtimeRoleFindings(state) {
  const findings = [];
  const expectedMemberships = {
    kxra_app: ["anon", "authenticated"],
    kxra_public_ingress: ["anon"],
  };
  for (const name of runtimeRoleNames) {
    const role = state.roles.find((item) => item.rolname === name);
    if (!role) {
      findings.push(`${name}: missing`);
      continue;
    }
    if (
      role.rolsuper ||
      role.rolinherit ||
      role.rolcreaterole ||
      role.rolcreatedb ||
      !role.rolcanlogin ||
      role.rolreplication ||
      role.rolbypassrls ||
      role.rolconnlimit !== (name === "kxra_app" ? 20 : 5) ||
      role.rolconfig.length !== 0 ||
      role.password_set !== true
    )
      findings.push(`${name}: unsafe role attributes`);
    const actual = state.memberships
      .filter((item) => item.member === name)
      .map((item) => `${item.granted}:${item.admin_option}`)
      .sort();
    const expected = expectedMemberships[name].map((role) => `${role}:false`);
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      findings.push(`${name}: unexpected role memberships`);
    if (state.ownership.find((item) => item.rolname === name)?.owned !== 0)
      findings.push(`${name}: runtime role owns database objects`);
    if (
      (state.directGrants.find((item) => item.grantee === name)?.grants || 0) >
      0
    )
      findings.push(`${name}: runtime role has direct object grants`);
  }
  return findings;
}

export async function applyRuntimeRoles(
  database,
  appPassword,
  ingressPassword,
) {
  if (!validPassword(appPassword) || !validPassword(ingressPassword))
    throw Error("RUNTIME_ROLE_PASSWORD_INVALID");
  if (appPassword === ingressPassword)
    throw Error("RUNTIME_ROLE_PASSWORD_REUSE");
  await database.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='kxra_app') then
      create role kxra_app login noinherit nosuperuser nocreatedb nocreaterole
        noreplication nobypassrls connection limit 20;
    end if;
    if not exists(select 1 from pg_roles where rolname='kxra_public_ingress') then
      create role kxra_public_ingress login noinherit nosuperuser nocreatedb nocreaterole
        noreplication nobypassrls connection limit 5;
    end if;
  end $$`);
  const privileged = (
    await database.query(
      `select rolname from pg_roles
      where rolname=any($1::text[])
        and (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)
      order by rolname`,
      [runtimeRoleNames],
    )
  ).rows;
  if (privileged.length)
    throw Error(
      `RUNTIME_ROLE_PRIVILEGED_ATTRIBUTE_REJECTED:${privileged[0].rolname}`,
    );
  await database.query(
    `alter role kxra_app with login noinherit connection limit 20`,
  );
  await database.query(
    `alter role kxra_public_ingress with login noinherit connection limit 5`,
  );
  await database.query("alter role kxra_app reset all");
  await database.query("alter role kxra_public_ingress reset all");
  await database.query("revoke anon,authenticated from kxra_app");
  await database.query("revoke anon,authenticated from kxra_public_ingress");
  await database.query("grant anon,authenticated to kxra_app");
  await database.query("grant anon to kxra_public_ingress");
  await database.query("set local password_encryption='scram-sha-256'");
  await database.query(
    "select set_config('kxra.operator.app_password',$1,true),set_config('kxra.operator.ingress_password',$2,true)",
    [appPassword, ingressPassword],
  );
  await database.query(`do $$ begin
    execute format('alter role kxra_app password %L',current_setting('kxra.operator.app_password'));
    execute format('alter role kxra_public_ingress password %L',current_setting('kxra.operator.ingress_password'));
  end $$`);
}
