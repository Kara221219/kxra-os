import Link from "next/link";
import { actor } from "../../../lib/auth";
import { loadSupportQueues } from "../../../lib/platform-admin";
import { saveSupportNote } from "../actions";

export const metadata = { title: "Admin support · KXRA" };

export default async function AdminSupport({
  searchParams,
}: {
  searchParams: Promise<{ noted?: string; error?: string }>;
}) {
  const notice = await searchParams;
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
      {notice.noted && <p role="status">The internal note was saved.</p>}
      {notice.error && <p role="alert">{notice.error}</p>}
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
              <td>
                {row.subject}
                <form action={saveSupportNote}>
                  <input type="hidden" name="request_id" value={row.id} />
                  <label>
                    Internal note
                    <textarea name="note" required minLength={3} />
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      name="confirm"
                      value="CONFIRM"
                      required
                    />{" "}
                    Save this note
                  </label>
                  <button type="submit">Add note</button>
                </form>
              </td>
              <td>{row.request_type}</td>
              <td>{row.state}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
