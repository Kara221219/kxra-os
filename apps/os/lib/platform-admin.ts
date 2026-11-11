import crypto from "node:crypto";
import { localMode, scoped } from "../../../packages/db";
import { sealEmailDeliverySecret } from "../../../packages/integrations/email";
import { HttpError, recentOwnerMfa, type Actor } from "./auth";

/** Platform admin is the KXRA owner, with a fresh MFA challenge. */
export function assertPlatformAdmin(actor: Actor, now = Date.now()) {
  if (
    actor.organisation_kind !== "KXRA" ||
    actor.security_role !== "KXRA_OWNER"
  )
    throw new HttpError(404, "Not found", "NOT_FOUND");
  recentOwnerMfa(actor, now);
}

type Count = { d7: number; d30: number; d90: number };

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function loadPlatformAdmin(actor: Actor) {
  assertPlatformAdmin(actor);
  return scoped(actor, async (db) => {
    const signups = (
      await db.query<Count>(
        `select
           count(*) filter (where created_at > now() - interval '7 days')::int as d7,
           count(*) filter (where created_at > now() - interval '30 days')::int as d30,
           count(*) filter (where created_at > now() - interval '90 days')::int as d90
         from kxra.profiles`,
      )
    ).rows[0];
    const accounts = (
      await db.query<{ state: string; count: number }>(
        `select account_state as state, count(*)::int as count
         from kxra.profiles group by account_state order by account_state`,
      )
    ).rows;
    const organisations = num(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from kxra.organisations",
        )
      ).rows[0]?.count,
    );
    const activity = (
      await db.query<Count>(
        `select
           count(distinct user_id) filter (where created_at > now() - interval '1 day')::int as d7,
           count(distinct user_id) filter (where created_at > now() - interval '7 days')::int as d30,
           count(distinct user_id) filter (where created_at > now() - interval '30 days')::int as d90
         from kxra.account_security_events
         where user_id is not null`,
      )
    ).rows[0];
    const billing = (
      await db.query<{
        active: number;
        trialing: number;
        past_due: number;
        cancelled: number;
        mrr_minor: number;
      }>(
        `select
           count(*) filter (where s.state = 'ACTIVE')::int as active,
           count(*) filter (where s.state = 'TRIALING')::int as trialing,
           count(*) filter (where s.state = 'PAST_DUE')::int as past_due,
           count(*) filter (where s.state = 'CANCELLED')::int as cancelled,
           coalesce(sum(v.amount_minor) filter (
             where s.state = 'ACTIVE' and v.billing_interval = 'MONTH' and v.currency = 'GBP'
           ), 0)::bigint as mrr_minor
         from kxra.billing_subscriptions s
         join kxra.plan_versions v on v.id = s.plan_version_id`,
      )
    ).rows[0];
    const reviews = num(
      (
        await db.query<{ count: number }>(
          `select count(*)::int as count from kxra.public_enquiry_submissions
           where message like 'KXRA sprint request: Decision Review%'`,
        )
      ).rows[0]?.count,
    );
    const email = (
      await db.query<{ state: string; count: number }>(
        `select state, count(*)::int as count
         from kxra.transactional_email_outbox group by state order by state`,
      )
    ).rows;
    const webhooks = (
      await db.query<{ state: string; count: number }>(
        `select processing_state as state, count(*)::int as count
         from kxra.billing_events group by processing_state order by processing_state`,
      )
    ).rows;
    const activeAccounts = accounts
      .filter((row) => row.state === "ACTIVE")
      .reduce((sum, row) => sum + num(row.count), 0);
    const paid = num(billing?.active);
    const trialing = num(billing?.trialing);
    const cancelled = num(billing?.cancelled);
    const mrr = num(billing?.mrr_minor);
    return {
      signups: {
        d7: num(signups?.d7),
        d30: num(signups?.d30),
        d90: num(signups?.d90),
      },
      accounts: accounts.map((row) => ({
        state: row.state,
        count: num(row.count),
      })),
      organisations,
      activeAccounts,
      securityEvents: {
        day: num(activity?.d7),
        week: num(activity?.d30),
        month: num(activity?.d90),
      },
      billing: {
        active: paid,
        trialing,
        pastDue: num(billing?.past_due),
        cancelled,
        mrrMinor: mrr,
        arrMinor: mrr * 12,
        trialToPaid: paid + trialing > 0 ? paid / (paid + trialing) : null,
        churn: paid + cancelled > 0 ? cancelled / (paid + cancelled) : null,
      },
      decisionReviews: reviews,
      email,
      webhooks,
    };
  });
}

export async function searchAdminUsers(actor: Actor, term: string) {
  assertPlatformAdmin(actor);
  const query = term.trim().slice(0, 80);
  return scoped(actor, async (db) => {
    const rows = (
      await db.query<{
        user_id: string;
        account_state: string;
        first_name: string | null;
        last_name: string | null;
        organisation: string;
        created_at: string;
      }>(
        `select p.user_id, p.account_state, p.first_name, p.last_name,
                o.name as organisation, p.created_at
         from kxra.profiles p
         join kxra.organisations o on o.id = p.org_id
         where $1 = ''
            or coalesce(p.first_name, '') ilike '%' || $1 || '%'
            or coalesce(p.last_name, '') ilike '%' || $1 || '%'
            or o.name ilike '%' || $1 || '%'
         order by p.created_at desc
         limit 50`,
        [query],
      )
    ).rows;
    return rows;
  });
}

export async function loadAdminUser(actor: Actor, userId: string) {
  assertPlatformAdmin(actor);
  return scoped(actor, async (db) => {
    const profile = (
      await db.query(
        `select p.user_id, p.account_state, p.first_name, p.last_name,
                p.job_title, p.company, p.mfa_state, p.created_at, p.updated_at,
                o.name as organisation
         from kxra.profiles p
         join kxra.organisations o on o.id = p.org_id
         where p.user_id = $1`,
        [userId],
      )
    ).rows[0];
    if (!profile) return null;
    const events = (
      await db.query(
        `select event_type, created_at from kxra.account_security_events
         where user_id = $1 order by created_at desc limit 20`,
        [userId],
      )
    ).rows;
    const subscription = (
      await db.query(
        `select s.state, s.provider_subscription_id, v.currency, v.amount_minor, v.billing_interval
         from kxra.billing_subscriptions s
         join kxra.plan_versions v on v.id = s.plan_version_id
         join kxra.profiles p on p.org_id = s.org_id
         where p.user_id = $1
         order by s.updated_at desc limit 1`,
        [userId],
      )
    ).rows[0];
    const tickets = (
      await db.query(
        `select id, subject, state, request_type, submitted_at
         from kxra.customer_service_requests
         where submitted_by = $1
         order by submitted_at desc limit 10`,
        [userId],
      )
    ).rows;
    return { profile, events, subscription: subscription || null, tickets };
  });
}

export async function loadBillingMirror(actor: Actor) {
  assertPlatformAdmin(actor);
  return scoped(
    actor,
    async (db) =>
      (
        await db.query(
          `select s.provider_subscription_id, s.state, s.updated_at,
                o.name as organisation, v.currency, v.amount_minor, v.billing_interval
         from kxra.billing_subscriptions s
         join kxra.organisations o on o.id = s.org_id
         join kxra.plan_versions v on v.id = s.plan_version_id
         order by s.updated_at desc
         limit 100`,
        )
      ).rows,
  );
}

export async function loadAuditLog(actor: Actor) {
  assertPlatformAdmin(actor);
  return scoped(
    actor,
    async (db) =>
      (
        await db.query(
          `select id::text, action, created_at, metadata::text as metadata
         from kxra.audit_events
         order by created_at desc, id desc
         limit 80`,
        )
      ).rows,
  );
}

export async function addSupportNote(
  actor: Actor,
  requestId: string,
  note: string,
) {
  assertPlatformAdmin(actor);
  if (note.trim().length < 3)
    throw new HttpError(
      400,
      "Write a note of at least 3 characters",
      "NOTE_REQUIRED",
    );
  await scoped(actor, async (db) => {
    await db.query("select kxra.add_customer_service_internal_note($1,$2,$3)", [
      requestId,
      crypto.randomUUID(),
      note.trim(),
    ]);
  });
}

export async function loadSupportQueues(actor: Actor) {
  assertPlatformAdmin(actor);
  return scoped(actor, async (db) => {
    const enquiries = (
      await db.query(
        `select id, form_kind, status, name, company, left(message, 180) as message, received_at
         from kxra.public_enquiry_submissions
         order by received_at desc limit 50`,
      )
    ).rows;
    const tickets = (
      await db.query(
        `select id, subject, state, request_type, submitted_at, request_hash, version
         from kxra.customer_service_requests
         order by submitted_at desc limit 50`,
      )
    ).rows;
    return { enquiries, tickets };
  });
}

export async function loadDecisionReviews(actor: Actor) {
  assertPlatformAdmin(actor);
  return scoped(actor, async (db) => {
    const website = (
      await db.query(
        `select id, name, company, status, received_at, left(message, 240) as message
         from kxra.public_enquiry_submissions
         where message like 'KXRA sprint request: Decision Review%'
         order by received_at desc limit 50`,
      )
    ).rows;
    const projects = (
      await db.query(
        `select id, state, created_at, left(problem, 180) as problem
         from kxra.custom_project_requests
         order by created_at desc limit 50`,
      )
    ).rows;
    return { website, projects };
  });
}

export async function loadOpenInvitations(actor: Actor) {
  assertPlatformAdmin(actor);
  return scoped(
    actor,
    async (db) =>
      (
        await db.query(
          `select id, recipient_email, state, expires_at
         from kxra.invitations
         where state in ('PENDING','SENT','DELIVERY_FAILED')
           and expires_at > now()
         order by created_at desc
         limit 30`,
        )
      ).rows,
  );
}

export async function resendInvitation(actor: Actor, invitationId: string) {
  assertPlatformAdmin(actor);
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const sealed =
    !localMode() && process.env.KXRA_EMAIL_ENABLED === "true"
      ? sealEmailDeliverySecret(token, tokenHash)
      : null;
  await scoped(actor, async (db) => {
    const rows = (
      await db.query<{ outbox_id: string }>(
        "select * from kxra.resend_invitation($1,$2)",
        [invitationId, tokenHash],
      )
    ).rows;
    if (sealed && rows[0])
      await db.query(
        "select kxra.attach_transactional_email_secret($1,$2,$3,$4,$5)",
        [
          rows[0].outbox_id,
          sealed.ciphertext,
          sealed.nonce,
          sealed.authTag,
          sealed.secretSha256,
        ],
      );
  });
}

export async function requestAccountState(
  actor: Actor,
  userId: string,
  desired: "ACTIVE" | "SUSPENDED",
  reason: string,
) {
  assertPlatformAdmin(actor);
  if (reason.trim().length < 8)
    throw new HttpError(400, "A reason is required", "REASON_REQUIRED");
  await scoped(actor, async (db) => {
    await db.query("select kxra.request_account_lifecycle_approval($1,$2,$3)", [
      userId,
      desired,
      reason.trim(),
    ]);
  });
}
