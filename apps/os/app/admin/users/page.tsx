import Link from "next/link";
import { actor } from "../../../lib/auth";
import {
  loadOpenInvitations,
  searchAdminUsers,
} from "../../../lib/platform-admin";
import { resendInvite } from "../actions";
import styles from "../admin.module.css";

export const metadata = { title: "Admin users · KXRA" };

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string }>;
}) {
  const { q = "", state = "" } = await searchParams;
  const current = await actor();
  const rows = await searchAdminUsers(current, q, state);
  const invitations = (await loadOpenInvitations(current)) as {
    id: string;
    recipient_email: string;
    state: string;
  }[];
  return (
    <>
      <h1>Users and organisations</h1>
      <p className={styles.note}>
        Rows are the accounts the selected organisation is allowed to read.
        Customer accounts in other organisations stay hidden until a reviewed
        database policy grants the KXRA owner that cross-tenant read. The locked
        migration list cannot take that policy in this change. Account state is
        applied in the query before the 50-row limit.
      </p>
      <form method="get">
        <label>
          Search name or organisation
          <input name="q" defaultValue={q} />
        </label>
        <label>
          Account state
          <select name="state" defaultValue={state}>
            <option value="">Any</option>
            {[
              "INVITED",
              "REGISTERED",
              "EMAIL_VERIFIED",
              "ONBOARDING",
              "ACTIVE",
              "SUSPENDED",
              "REVOKED",
            ].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button type="submit">Search</button>
      </form>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Organisation</th>
            <th>State</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.user_id}>
              <td>
                <Link href={`/admin/users/${row.user_id}`}>
                  {[row.first_name, row.last_name].filter(Boolean).join(" ") ||
                    "Unnamed account"}
                </Link>
              </td>
              <td>{row.organisation}</td>
              <td>{row.account_state}</td>
              <td>{new Date(row.created_at).toLocaleDateString("en-GB")}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p>No accounts match that search.</p>}
      <h2>Open invitations</h2>
      <p className={styles.note}>
        Resend replaces the invitation link and queues the email. It is
        delivered only when email is switched on. Verification for someone who
        already has an account is the password-reset email they request
        themselves.
      </p>
      <ul>
        {invitations.map((invite) => (
          <li key={invite.id}>
            {invite.recipient_email} · {invite.state}
            <form action={resendInvite}>
              <input type="hidden" name="invitation_id" value={invite.id} />
              <label>
                <input
                  type="checkbox"
                  name="confirm"
                  value="CONFIRM"
                  required
                />{" "}
                Resend this invitation
              </label>
              <button type="submit">Resend invite</button>
            </form>
          </li>
        ))}
      </ul>
      {invitations.length === 0 && <p>No open invitations.</p>}
    </>
  );
}
