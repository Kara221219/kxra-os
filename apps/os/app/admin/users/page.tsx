import Link from "next/link";
import { actor } from "../../../lib/auth";
import { searchAdminUsers } from "../../../lib/platform-admin";
import styles from "../admin.module.css";

export const metadata = { title: "Admin users · KXRA" };

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string }>;
}) {
  const { q = "", state = "" } = await searchParams;
  const rows = (await searchAdminUsers(await actor(), q)).filter((row) =>
    state ? row.account_state === state : true,
  );
  return (
    <>
      <h1>Users and organisations</h1>
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
    </>
  );
}
