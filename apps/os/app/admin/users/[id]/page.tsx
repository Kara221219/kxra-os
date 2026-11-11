import Link from "next/link";
import { notFound } from "next/navigation";
import { actor } from "../../../../lib/auth";
import { loadAdminUser } from "../../../../lib/platform-admin";
import { requestAccountChange } from "../../actions";
import styles from "../../admin.module.css";

export const metadata = { title: "Admin account · KXRA" };

export default async function AdminUser({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ requested?: string; error?: string }>;
}) {
  const { id } = await params;
  const notice = await searchParams;
  const record = await loadAdminUser(await actor(), id);
  if (!record) notFound();
  const profile = record.profile as {
    user_id: string;
    first_name: string | null;
    last_name: string | null;
    organisation: string;
    account_state: string;
    job_title: string | null;
    company: string | null;
    mfa_state: string;
    created_at: string;
    updated_at: string;
  };
  const subscription = record.subscription as {
    state: string;
    provider_subscription_id: string;
    currency: string;
    amount_minor: number;
    billing_interval: string;
  } | null;
  return (
    <>
      <p>
        <Link href="/admin/users">Back to users</Link>
      </p>
      <h1>
        {[profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
          "Unnamed account"}
      </h1>
      {notice.requested && (
        <p role="status">
          The change was submitted for owner approval. It is not applied until
          that approval is executed.
        </p>
      )}
      {notice.error && <p role="alert">{notice.error}</p>}
      <dl>
        <dt>Organisation</dt>
        <dd>{profile.organisation}</dd>
        <dt>Account</dt>
        <dd>{profile.account_state}</dd>
        <dt>Plan</dt>
        <dd>
          {subscription
            ? `${subscription.state} · ${subscription.currency} ${Number(subscription.amount_minor) / 100} / ${subscription.billing_interval}`
            : "No subscription recorded"}
        </dd>
        <dt>MFA</dt>
        <dd>{profile.mfa_state}</dd>
        <dt>Last profile update</dt>
        <dd>{new Date(profile.updated_at).toLocaleString("en-GB")}</dd>
      </dl>
      <h2>Security history</h2>
      <ul>
        {(record.events as { event_type: string; created_at: string }[]).map(
          (event) => (
            <li key={event.created_at + event.event_type}>
              {event.event_type} ·{" "}
              {new Date(event.created_at).toLocaleString("en-GB")}
            </li>
          ),
        )}
      </ul>
      <h2>Support tickets</h2>
      <ul>
        {(
          record.tickets as {
            id: string;
            subject: string;
            state: string;
          }[]
        ).map((ticket) => (
          <li key={ticket.id}>
            {ticket.subject} · {ticket.state}
          </li>
        ))}
      </ul>
      {record.tickets.length === 0 && (
        <p>No support tickets for this account.</p>
      )}
      <h2>Request a state change</h2>
      <p className={styles.note}>
        Suspending or reactivating creates an approval. It does not change the
        account until that approval is executed. Password reset and invitation
        email are sent only when Resend is connected; otherwise use the existing
        account tools after email delivery is on.
      </p>
      <form action={requestAccountChange}>
        <input type="hidden" name="user_id" value={profile.user_id} />
        <label>
          Change
          <select name="desired_state" defaultValue="SUSPENDED">
            <option value="SUSPENDED">Suspend</option>
            <option value="ACTIVE">Reactivate</option>
          </select>
        </label>
        <label>
          Reason
          <textarea name="reason" required minLength={8} />
        </label>
        <label>
          <input type="checkbox" name="confirm" value="CONFIRM" required /> I
          confirm this account change
        </label>
        <button type="submit">Submit for approval</button>
      </form>
      <p>
        <Link href="/reset-password">Open the password reset page</Link>
      </p>
    </>
  );
}
