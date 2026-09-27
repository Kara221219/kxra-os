import crypto from "node:crypto";
import { validateStagingTarget } from "./staging-migrations-core.mjs";

export const ownerBootstrapProfile = "KXRA-STAGING-OWNER-V1";
export const kxraOrganisationId = "10000000-0000-4000-8000-000000000001";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeOwnerInput(environment) {
  return {
    userId: (environment.KXRA_STAGING_OWNER_USER_ID || "").toLowerCase(),
    email: (environment.KXRA_STAGING_OWNER_EMAIL || "").trim().toLowerCase(),
    displayName: (environment.KXRA_STAGING_OWNER_DISPLAY_NAME || "").trim(),
  };
}

export function validateOwnerOperator(environment, command) {
  const findings = validateStagingTarget(environment);
  if (!["plan", "apply", "verify"].includes(command))
    findings.push("command must be plan, apply or verify");
  const input = normalizeOwnerInput(environment);
  if (!uuid.test(input.userId))
    findings.push("KXRA_STAGING_OWNER_USER_ID must be a UUID");
  if (!emailPattern.test(input.email) || input.email.length > 320)
    findings.push("KXRA_STAGING_OWNER_EMAIL must be a normalized email");
  if (input.displayName.length < 1 || input.displayName.length > 120)
    findings.push("KXRA_STAGING_OWNER_DISPLAY_NAME must be 1-120 characters");
  if (command === "apply") {
    const expected = `OWNER:${environment.KXRA_STAGING_PROJECT_REF}:${input.userId}:codex/phase-2-completion`;
    if (environment.KXRA_STAGING_OWNER_CONFIRMATION !== expected)
      findings.push(`KXRA_STAGING_OWNER_CONFIRMATION must equal ${expected}`);
  }
  return { ok: findings.length === 0, findings, input };
}

export function emailDigest(email) {
  return crypto.createHash("sha256").update(email).digest("hex");
}

export async function inspectAuthOwner(database, input) {
  const tables = (
    await database.query(
      `select to_regclass('auth.users') is not null users,
        to_regclass('auth.mfa_factors') is not null factors`,
    )
  ).rows[0];
  if (!tables.users || !tables.factors)
    return { ready: false, reason: "AUTH_SCHEMA_INCOMPLETE" };
  const user = (
    await database.query(
      `select id,email,email_confirmed_at,deleted_at,banned_until
       from auth.users where id=$1`,
      [input.userId],
    )
  ).rows[0];
  if (!user) return { ready: false, reason: "AUTH_USER_MISSING" };
  if (
    String(user.email || "")
      .trim()
      .toLowerCase() !== input.email
  )
    return { ready: false, reason: "AUTH_EMAIL_MISMATCH" };
  if (!user.email_confirmed_at)
    return { ready: false, reason: "AUTH_EMAIL_UNCONFIRMED" };
  if (user.deleted_at) return { ready: false, reason: "AUTH_USER_DELETED" };
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now())
    return { ready: false, reason: "AUTH_USER_BANNED" };
  const factor = (
    await database.query(
      `select id::text id from auth.mfa_factors
       where user_id=$1 and status='verified' order by created_at,id limit 1`,
      [input.userId],
    )
  ).rows[0];
  return {
    ready: true,
    confirmedAt: user.email_confirmed_at,
    mfaVerified: Boolean(factor),
    factorId: factor?.id || null,
  };
}

export async function inspectOwnerState(database, input) {
  const owners = await database.query(
    `select account_id,state from kxra.organisation_memberships
     where security_role='KXRA_OWNER'`,
  );
  const legacyOwners = await database.query(
    "select id,active from kxra.members where role='owner'",
  );
  const account = await database.query(
    `select account_id,auth_provider,auth_subject,email_digest,display_email,state,
      email_verified_at,session_version
     from kxra.account_identities where account_id=$1`,
    [input.userId],
  );
  const member = await database.query(
    `select id,org_id,display_name,role,active,access_version
     from kxra.members where id=$1`,
    [input.userId],
  );
  const profile = await database.query(
    `select user_id,org_id,email_digest,first_name,account_state,email_verified_at,
      onboarding_completed_at,mfa_state,provider_factor_ref,session_version
     from kxra.profiles where user_id=$1`,
    [input.userId],
  );
  const membership = await database.query(
    `select org_id,account_id,security_role,relationship_type,state,display_name,
      grant_source,revoked_at,version
     from kxra.organisation_memberships where account_id=$1`,
    [input.userId],
  );
  const preference = await database.query(
    "select user_id,org_id,timezone,security_alerts from kxra.user_preferences where user_id=$1",
    [input.userId],
  );
  const onboarding = await database.query(
    `select user_id,org_id,current_step,completed_steps,whatsapp_choice,completed_at
     from kxra.onboarding_progress where user_id=$1`,
    [input.userId],
  );
  return {
    owners: owners.rows,
    legacyOwners: legacyOwners.rows,
    account: account.rows[0],
    member: member.rows[0],
    profile: profile.rows[0],
    membership: membership.rows[0],
    preference: preference.rows[0],
    onboarding: onboarding.rows[0],
  };
}

export function ownerStateFindings(
  state,
  input,
  auth,
  { requireMfa = true } = {},
) {
  const findings = [];
  const digest = emailDigest(input.email);
  if (!auth.ready) findings.push(`auth: ${auth.reason}`);
  else if (requireMfa && !auth.mfaVerified)
    findings.push("auth: AUTH_MFA_NOT_VERIFIED");
  if (
    state.owners.length !== 1 ||
    state.owners[0]?.account_id !== input.userId ||
    state.owners[0]?.state !== "ACTIVE" ||
    state.legacyOwners.length !== 1 ||
    state.legacyOwners[0]?.id !== input.userId ||
    !state.legacyOwners[0]?.active
  )
    findings.push("owner: exact singleton missing");
  const account = state.account;
  if (
    !account ||
    account.auth_provider !== "SUPABASE" ||
    account.auth_subject !== input.userId ||
    account.email_digest !== digest ||
    account.display_email !== input.email ||
    account.state !== "ACTIVE" ||
    !account.email_verified_at ||
    account.session_version !== 1
  )
    findings.push("account: mismatch");
  const member = state.member;
  if (
    !member ||
    member.org_id !== kxraOrganisationId ||
    member.display_name !== input.displayName ||
    member.role !== "owner" ||
    !member.active ||
    member.access_version !== 1
  )
    findings.push("legacy member: mismatch");
  const profile = state.profile;
  if (
    !profile ||
    profile.org_id !== kxraOrganisationId ||
    profile.email_digest !== digest ||
    profile.first_name !== input.displayName.slice(0, 100) ||
    profile.account_state !== "ACTIVE" ||
    !profile.email_verified_at ||
    !profile.onboarding_completed_at ||
    profile.mfa_state !== (auth.mfaVerified ? "ENROLLED" : "NOT_ENROLLED") ||
    profile.provider_factor_ref !== (auth.mfaVerified ? auth.factorId : null) ||
    profile.session_version !== 1
  )
    findings.push("profile: mismatch");
  const membership = state.membership;
  if (
    !membership ||
    membership.org_id !== kxraOrganisationId ||
    membership.security_role !== "KXRA_OWNER" ||
    membership.relationship_type !== "INTERNAL" ||
    membership.state !== "ACTIVE" ||
    membership.display_name !== input.displayName ||
    membership.grant_source !== "STAGING_OWNER_BOOTSTRAP" ||
    membership.revoked_at ||
    membership.version !== 1
  )
    findings.push("membership: mismatch");
  if (
    !state.preference ||
    state.preference.org_id !== kxraOrganisationId ||
    state.preference.timezone !== "Europe/London" ||
    !state.preference.security_alerts
  )
    findings.push("preferences: mismatch");
  if (
    !state.onboarding ||
    state.onboarding.org_id !== kxraOrganisationId ||
    state.onboarding.current_step !== 9 ||
    JSON.stringify(state.onboarding.completed_steps) !==
      JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9]) ||
    state.onboarding.whatsapp_choice !== "CONNECT_LATER" ||
    !state.onboarding.completed_at
  )
    findings.push("onboarding: mismatch");
  return findings;
}

export function ownerTakeoverFindings(state, input, exactFindings = []) {
  const findings = [];
  if (
    state.owners.some((owner) => owner.account_id !== input.userId) ||
    state.owners.length > 1 ||
    state.legacyOwners.some((owner) => owner.id !== input.userId) ||
    state.legacyOwners.length > 1
  )
    findings.push("another active KXRA owner exists");
  const present = [
    state.account,
    state.member,
    state.profile,
    state.membership,
    state.preference,
    state.onboarding,
  ].filter(Boolean).length;
  if (present > 0 && present < 6)
    findings.push("target has partial KXRA identity state");
  if (present === 6 && exactFindings.length)
    findings.push("target has conflicting KXRA identity state");
  return findings;
}

export async function applyOwnerBootstrap(database, input, auth) {
  if (!auth.ready) throw Error(`OWNER_AUTH_NOT_READY:${auth.reason}`);
  const digest = emailDigest(input.email);
  await database.query(
    `insert into kxra.members(id,org_id,display_name,role,active,access_version)
     values($1,$2,$3,'owner',true,1)`,
    [input.userId, kxraOrganisationId, input.displayName],
  );
  await database.query(
    `insert into kxra.profiles(
      user_id,org_id,email_digest,first_name,account_state,email_verified_at,
      onboarding_completed_at,mfa_state,provider_factor_ref,session_version
     ) values($1,$2,$3,$4,'ACTIVE',$5,now(),$6,$7,1)`,
    [
      input.userId,
      kxraOrganisationId,
      digest,
      input.displayName.slice(0, 100),
      auth.confirmedAt,
      auth.mfaVerified ? "ENROLLED" : "NOT_ENROLLED",
      auth.mfaVerified ? auth.factorId : null,
    ],
  );
  await database.query(
    `update kxra.account_identities set auth_provider='SUPABASE',auth_subject=$2,
      email_digest=$3,display_email=$4,state='ACTIVE',email_verified_at=$5,
      session_version=1,updated_at=now() where account_id=$1`,
    [input.userId, input.userId, digest, input.email, auth.confirmedAt],
  );
  await database.query(
    `update kxra.organisation_memberships set security_role='KXRA_OWNER',
      relationship_type='INTERNAL',state='ACTIVE',display_name=$3,
      grant_source='STAGING_OWNER_BOOTSTRAP',starts_at=now(),expires_at=null,
      revoked_at=null,version=1,updated_at=now() where org_id=$1 and account_id=$2`,
    [kxraOrganisationId, input.userId, input.displayName],
  );
  await database.query(
    `insert into kxra.user_preferences(user_id,org_id,timezone)
     values($1,$2,'Europe/London')`,
    [input.userId, kxraOrganisationId],
  );
  await database.query(
    `insert into kxra.onboarding_progress(
      user_id,org_id,current_step,completed_steps,whatsapp_choice,completed_at
     ) values($1,$2,9,array[1,2,3,4,5,6,7,8,9],'CONNECT_LATER',now())`,
    [input.userId, kxraOrganisationId],
  );
  await database.query(
    `insert into kxra.account_security_events(org_id,user_id,actor_id,event_type,metadata)
     values($1,$2,$2,'ONBOARDING_COMPLETED','{"source":"STAGING_OWNER_BOOTSTRAP"}'::jsonb)`,
    [kxraOrganisationId, input.userId],
  );
  await database.query(
    `insert into kxra.audit_events(org_id,actor_id,action,resource_id,metadata)
     values($1,$2,'owner.bootstrap',$2,
      jsonb_build_object('profile',$3::text,'mfa_verified',$4::boolean))`,
    [kxraOrganisationId, input.userId, ownerBootstrapProfile, auth.mfaVerified],
  );
}
