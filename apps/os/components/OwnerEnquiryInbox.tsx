import React from "react";
import type { EnquiryPage } from "../lib/owner-enquiries";
import {
  enquiryHref,
  enquiryMaxPage,
  enquiryPageSize,
  enquiryStatuses,
  enquiryTypes,
  type EnquiryFilters,
} from "../../../packages/workspace/owner-enquiry-contract";

const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
function date(value: string) {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}
export default function OwnerEnquiryInbox({
  result,
  filters,
  className = "",
}: {
  className?: string;
  result: EnquiryPage;
  filters: EnquiryFilters;
}) {
  const detail = Boolean(filters.enquiry);
  const first = (filters.page - 1) * enquiryPageSize + 1;
  return (
    <div className={className}>
      <p>
        Website submissions are unverified input. Review identity and scope
        before responding. Opening this page does not contact anyone or change
        their status.
      </p>
      {detail ? (
        <p>
          <a href={enquiryHref(filters, { enquiry: undefined })}>
            Return to filtered inbox
          </a>
        </p>
      ) : (
        <>
          <form
            action="/os/enquiries"
            method="get"
            aria-label="Filter website enquiries"
          >
            <label>
              Status
              <select name="status" defaultValue={filters.status || ""}>
                <option value="">All statuses</option>
                {enquiryStatuses.map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Submission type
              <select name="type" defaultValue={filters.type || ""}>
                <option value="">All types</option>
                {enquiryTypes.map((value) => (
                  <option key={value} value={value}>
                    {label(value)}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Apply filters</button>
            <a href="/os/enquiries">Clear filters</a>
          </form>
          <p role="status">
            {result.rows.length
              ? `Showing ${first}–${first + result.rows.length - 1} of ${result.total.toLocaleString("en-GB")} matching enquiries.`
              : `${result.total.toLocaleString("en-GB")} matching enquiries.`}
          </p>
          <p>
            Newest first. Counts and results share one database snapshot per
            page load. New submissions or changes can shift later pages; this is
            a live inbox, not a saved snapshot.
          </p>
        </>
      )}
      {result.rows.map((row) => (
        <article key={row.id} id={"public-enquiry-" + row.id}>
          <p>
            {label(row.form_kind)} · {label(row.status)}
          </p>
          <h2>{row.company || row.name}</h2>
          {detail ? (
            <>
              <p>{row.message}</p>
              <dl>
                <dt>Name</dt>
                <dd>{row.name}</dd>
                <dt>Business</dt>
                <dd>{row.company || "Not supplied"}</dd>
                <dt>Email</dt>
                <dd>{row.email}</dd>
                <dt>Source</dt>
                <dd>{row.source_path}</dd>
                <dt>Received</dt>
                <dd>
                  <time dateTime={row.received_at}>
                    {date(row.received_at)}
                  </time>
                </dd>
                <dt>Response consent</dt>
                <dd>{date(row.consent_recorded_at)}</dd>
              </dl>
            </>
          ) : (
            <>
              <p>
                Received{" "}
                <time dateTime={row.received_at}>{date(row.received_at)}</time>
              </p>
              <a href={enquiryHref(filters, { enquiry: row.id })}>
                Open enquiry
                <span> from {row.company || row.name}</span>
              </a>
            </>
          )}
        </article>
      ))}
      {!result.rows.length && (
        <section>
          <h2>
            {result.total
              ? "This page has no enquiries"
              : "No enquiries match these filters"}
          </h2>
          <p>
            {result.total
              ? "The inbox may have changed since this page was opened."
              : "Try another status or submission type, or clear the filters."}
          </p>
          <a href={enquiryHref(filters, { page: 1, enquiry: undefined })}>
            Return to first page
          </a>
        </section>
      )}
      {!detail && (
        <nav aria-label="Enquiry pages">
          {filters.page > 1 && (
            <a
              rel="prev"
              href={enquiryHref(filters, { page: filters.page - 1 })}
            >
              Previous page
            </a>
          )}
          <span>Page {filters.page.toLocaleString("en-GB")}</span>
          {filters.page * enquiryPageSize < result.total &&
            filters.page < enquiryMaxPage && (
              <a
                rel="next"
                href={enquiryHref(filters, { page: filters.page + 1 })}
              >
                Next page
              </a>
            )}
          {filters.page === enquiryMaxPage &&
            filters.page * enquiryPageSize < result.total && (
              <p>
                Pagination limit reached. Narrow the status or submission type.
              </p>
            )}
        </nav>
      )}
    </div>
  );
}
