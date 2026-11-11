import Link from "next/link";
import { actor } from "../../../lib/auth";
import { loadSupportQueues } from "../../../lib/platform-admin";

export const metadata = { title: "Admin support · KXRA" };

export default async function AdminSupport() {
  const { enquiries, tickets } = await loadSupportQueues(await actor());
  return (
    <>
      <h1>Support</h1>
      <p>
        Website enquiries and private support requests. Assigning a ticket and
        writing the customer-visible reply stays in the existing support
        workspace, which already records the actor.
      </p>
      <p>
        <Link href="/os/support">Open the support workspace</Link>
      </p>
      <h2>Website enquiries</h2>
      <table>
        <thead>
          <tr>
            <th>From</th>
            <th>Kind</th>
            <th>Status</th>
            <th>Message</th>
          </tr>
        </thead>
        <tbody>
          {(
            enquiries as {
              id: string;
              name: string;
              company: string;
              form_kind: string;
              status: string;
              message: string;
            }[]
          ).map((row) => (
            <tr key={row.id}>
              <td>
                {row.name}
                {row.company ? ` · ${row.company}` : ""}
              </td>
              <td>{row.form_kind}</td>
              <td>{row.status}</td>
              <td>{row.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Support requests</h2>
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Type</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(
            tickets as {
              id: string;
              subject: string;
              request_type: string;
              state: string;
            }[]
          ).map((row) => (
            <tr key={row.id}>
              <td>{row.subject}</td>
              <td>{row.request_type}</td>
              <td>{row.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
