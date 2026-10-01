import { validateStagingTarget } from "./staging-migrations-core.mjs";

export const billingWorkerRoleProfile = "KXRA-BILLING-WORKER-ROLE-V1";
export const billingWorkerLoginRole = "kxra_billing_runner";
export const billingWorkerCapabilityRole = "kxra_billing_worker";

function validPassword(value) {
  return /^[A-Za-z0-9_-]{48,128}$/.test(value || "");
}

export function validateBillingWorkerRoleOperator(environment, command) {
  const findings = validateStagingTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  if (command === "apply") {
    if (!validPassword(environment.KXRA_STAGING_BILLING_WORKER_PASSWORD))
      findings.push(
        "KXRA_STAGING_BILLING_WORKER_PASSWORD must be 48-128 base64url characters",
      );
    const expected = `BILLING-ROLE:${environment.KXRA_STAGING_PROJECT_REF || ""}:codex/phase-2-completion`;
    if (environment.KXRA_STAGING_BILLING_WORKER_ROLE_CONFIRMATION !== expected)
      findings.push(
        `KXRA_STAGING_BILLING_WORKER_ROLE_CONFIRMATION must equal ${expected}`,
      );
  }
  return { ok: findings.length === 0, findings };
}

export async function inspectBillingWorkerRole(database) {
  const roles = (
    await database.query(
      `select rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,
        rolreplication,rolbypassrls,rolconnlimit,coalesce(rolconfig,'{}') rolconfig,
        rolpassword is not null password_set
       from pg_roles where rolname=any($1::text[]) order by rolname`,
      [[billingWorkerLoginRole, billingWorkerCapabilityRole]],
    )
  ).rows;
  const memberships = (
    await database.query(
      `select member.rolname member,granted.rolname granted,membership.admin_option
       from pg_auth_members membership
       join pg_roles member on member.oid=membership.member
       join pg_roles granted on granted.oid=membership.roleid
       where member.rolname=$1 order by granted.rolname`,
      [billingWorkerLoginRole],
    )
  ).rows;
  const ownership = (
    await database.query(
      `select count(dependency.*)::int owned
       from pg_roles role
       left join pg_shdepend dependency on dependency.refclassid='pg_authid'::regclass
        and dependency.refobjid=role.oid and dependency.deptype='o'
        and (dependency.dbid=0 or dependency.dbid=(select oid from pg_database where datname=current_database()))
       where role.rolname=$1`,
      [billingWorkerLoginRole],
    )
  ).rows[0] || { owned: 0 };
  const directGrants = (
    await database.query(
      `select count(dependency.*)::int grants
       from pg_roles role
       left join pg_shdepend dependency on dependency.refclassid='pg_authid'::regclass
        and dependency.refobjid=role.oid and dependency.deptype='a'
        and dependency.classid<>'pg_auth_members'::regclass
        and (dependency.dbid=0 or dependency.dbid=(select oid from pg_database where datname=current_database()))
       where role.rolname=$1`,
      [billingWorkerLoginRole],
    )
  ).rows[0] || { grants: 0 };
  return { roles, memberships, ownership, directGrants };
}

export function billingWorkerRoleFindings(state) {
  const findings = [];
  const capability = state.roles.find(
    (role) => role.rolname === billingWorkerCapabilityRole,
  );
  if (
    !capability ||
    capability.rolsuper ||
    capability.rolinherit ||
    capability.rolcreaterole ||
    capability.rolcreatedb ||
    capability.rolcanlogin ||
    capability.rolreplication ||
    capability.rolbypassrls
  )
    findings.push(`${billingWorkerCapabilityRole}: unsafe or missing`);
  const login = state.roles.find(
    (role) => role.rolname === billingWorkerLoginRole,
  );
  if (
    !login ||
    login.rolsuper ||
    login.rolinherit ||
    login.rolcreaterole ||
    login.rolcreatedb ||
    !login.rolcanlogin ||
    login.rolreplication ||
    login.rolbypassrls ||
    login.rolconnlimit !== 3 ||
    login.rolconfig.length !== 0 ||
    login.password_set !== true
  )
    findings.push(`${billingWorkerLoginRole}: unsafe or missing`);
  const memberships = state.memberships
    .map((row) => `${row.granted}:${row.admin_option}`)
    .sort();
  if (
    JSON.stringify(memberships) !==
    JSON.stringify([`${billingWorkerCapabilityRole}:false`])
  )
    findings.push(`${billingWorkerLoginRole}: unexpected role memberships`);
  if (state.ownership.owned !== 0)
    findings.push(`${billingWorkerLoginRole}: owns database objects`);
  if (state.directGrants.grants !== 0)
    findings.push(`${billingWorkerLoginRole}: has direct object grants`);
  return findings;
}

export function unsafeBillingWorkerRoleState(state) {
  const findings = [];
  for (const row of state.memberships)
    if (row.granted !== billingWorkerCapabilityRole || row.admin_option)
      findings.push(`unknown membership ${row.granted}`);
  if (state.ownership.owned !== 0) findings.push("owns database objects");
  if (state.directGrants.grants !== 0)
    findings.push("has direct object grants");
  return findings;
}

export async function applyBillingWorkerRole(database, password) {
  if (!validPassword(password)) throw Error("BILLING_WORKER_PASSWORD_INVALID");
  const capability = (
    await database.query(
      "select rolname from pg_roles where rolname=$1 and not rolcanlogin and not rolsuper and not rolbypassrls",
      [billingWorkerCapabilityRole],
    )
  ).rows[0];
  if (!capability) throw Error("BILLING_WORKER_CAPABILITY_ROLE_INVALID");
  await database.query(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='kxra_billing_runner') then
      create role kxra_billing_runner login noinherit nosuperuser nocreatedb nocreaterole
        noreplication nobypassrls connection limit 3;
    end if;
  end $$`);
  const privileged = (
    await database.query(
      `select rolname from pg_roles where rolname=$1
       and (rolsuper or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)`,
      [billingWorkerLoginRole],
    )
  ).rows;
  if (privileged.length) throw Error("BILLING_WORKER_ROLE_PRIVILEGED_REJECTED");
  await database.query(
    "alter role kxra_billing_runner with login noinherit connection limit 3",
  );
  await database.query("alter role kxra_billing_runner reset all");
  await database.query("grant kxra_billing_worker to kxra_billing_runner");
  await database.query("set local password_encryption='scram-sha-256'");
  await database.query(
    "select set_config('kxra.operator.billing_worker_password',$1,true)",
    [password],
  );
  await database.query(`do $$ begin
    execute format('alter role kxra_billing_runner password %L',current_setting('kxra.operator.billing_worker_password'));
  end $$`);
}
