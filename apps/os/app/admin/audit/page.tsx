import { actor } from "../../../lib/auth";
import { loadAuditLog } from "../../../lib/platform-admin";

export const metadata = { title: "Admin audit log · KXRA" };

export default async function AdminAudit() {
  const rows = (await loadAuditLog(await actor())) as {
    id: string;
    action: string;
    created_at: string;
    metadata: string;
  }[];
  return (
    <>
      <h1>Audit log</h1>
      <p>
        Every consequential admin change that the database functions record
        lands here. This page does not edit the log.
      </p>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Action</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{new Date(row.created_at).toLocaleString("en-GB")}</td>
              <td>{row.action}</td>
              <td>{row.metadata}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p>No audit events are visible to this owner.</p>}
    </>
  );
}
