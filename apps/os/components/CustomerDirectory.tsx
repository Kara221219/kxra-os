import React from "react";
import type { CustomerDirectoryPage } from "../../../packages/workspace/customer-admin-contract";

export function CustomerDirectoryUnavailable({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  return (
    <section className="panel" aria-labelledby="directory-status">
      <h2 id="directory-status">
        {disabled ? "Directory not enabled" : "Directory unavailable"}
      </h2>
      <p>
        {disabled
          ? "This read-only metadata directory is off. No customer records have been loaded."
          : "Customer metadata could not be verified for this request. No customer records are shown."}
      </p>
      <p>
        This does not enable customer management or access to private
        workspaces.
      </p>
      <a href="/os/customer-directory">Try the first page again</a>
    </section>
  );
}

export default function CustomerDirectory({
  page,
  state,
  continued,
}: {
  page: CustomerDirectoryPage;
  state?: string;
  continued: boolean;
}) {
  const next = new URLSearchParams();
  if (state) next.set("organisation_state", state);
  if (page.next_cursor) next.set("cursor", page.next_cursor);
  return (
    <section className="panel" aria-labelledby="directory-records">
      <h2 id="directory-records">Customer organisation metadata</h2>
      <p>
        {page.items.length} records on this page. Sampled at{" "}
        <time dateTime={page.sampled_at}>{page.sampled_at}</time>.
      </p>
      <p>
        Live pages, not a snapshot. Refresh from the first page to see earlier
        additions or changed states. No overall customer count is calculated.
      </p>
      <p>
        Organisation state is a stored label, not proof of payment, entitlement
        or current account access.
      </p>
      <form action="/os/customer-directory" method="get">
        <label htmlFor="directory-state">Organisation state</label>{" "}
        <select
          id="directory-state"
          name="organisation_state"
          defaultValue={state ?? ""}
        >
          <option value="">All states</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="CLOSED">Closed</option>
        </select>{" "}
        <button type="submit">Apply filter</button>
      </form>
      {page.items.length ? (
        <div
          className="table-wrap"
          role="region"
          aria-label="Customer organisation metadata"
          tabIndex={0}
        >
          <table>
            <caption>
              Read-only organisation metadata. No accounts, contacts, billing or
              room contents.
            </caption>
            <thead>
              <tr>
                <th scope="col">Organisation</th>
                <th scope="col">Relationship</th>
                <th scope="col">State</th>
                <th scope="col">Updated (UTC)</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((item) => (
                <tr key={item.organisation_id}>
                  <th scope="row" className="project-name">
                    <strong>{item.name}</strong>
                    <br />
                    {item.slug}
                    <br />
                    <small>{item.organisation_id}</small>
                  </th>
                  <td data-label="Relationship">{item.relationship_type}</td>
                  <td data-label="State">{item.organisation_state}</td>
                  <td>
                    <time dateTime={item.updated_at}>{item.updated_at}</time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          {continued
            ? "No further records on this live page. Refresh to check for changes."
            : "No matching organisation metadata was returned."}
        </p>
      )}
      <nav aria-label="Customer directory pages">
        <a href="/os/customer-directory">Refresh from first page</a>{" "}
        {page.has_more && (
          <a href={"/os/customer-directory?" + next.toString()}>Next page</a>
        )}
      </nav>
    </section>
  );
}
