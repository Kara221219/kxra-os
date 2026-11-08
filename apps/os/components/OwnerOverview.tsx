import React from "react";
import Link from "next/link";
import type {
  OwnerOverview as Snapshot,
  OwnerOverviewItem,
} from "../../../packages/workspace/owner-overview-contract";

function date(value: string) {
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(value)) + " UTC"
  );
}
function Items({ rows, empty }: { rows: OwnerOverviewItem[]; empty: string }) {
  return rows.length ? (
    <ul className="owner-item-list">
      {rows.map((item) => (
        <li key={item.href}>
          <Link href={item.href}>
            <span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </span>
            <span className="owner-item-date">
              <time dateTime={item.occurred_at}>{date(item.occurred_at)}</time>
              <span aria-hidden="true">↗</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  ) : (
    <p className="owner-empty">{empty}</p>
  );
}
export default function OwnerOverview({
  snapshot,
  className = "",
}: {
  snapshot: Snapshot;
  className?: string;
}) {
  const metrics = [
    {
      label: "Enquiries to review",
      value: snapshot.counts.enquiries,
      note: "Unverified or reviewing",
      href: "/os/enquiries",
    },
    {
      label: "Approval requests",
      value: snapshot.counts.approvals,
      note: "Unexpired requests",
      href: "/os/approvals",
    },
    {
      label: "Assigned tasks",
      value: snapshot.counts.assigned_tasks,
      note: "Recorded project work",
      href: "/os/tasks",
    },
    {
      label: "Recent events",
      value: snapshot.counts.activity_seven_days,
      note: "Recorded in the last 7 days",
      href: "/os/work-log",
    },
  ];
  return (
    <div className={`owner-overview ${className}`}>
      <header className="owner-overview-heading">
        <div>
          <p className="eyebrow">KXRA OWNER · OPERATIONS</p>
          <h1>Your operating overview</h1>
          <p>Your website inbox, work and decisions, in one place.</p>
        </div>
        <Link className="button" href="/os/workspace">
          Open workspace <span aria-hidden="true">↗</span>
        </Link>
      </header>
      <p className="owner-provenance">
        <span>
          {snapshot.local
            ? "Synthetic local records"
            : "Recorded application data"}
        </span>
        <span>Organisation: {snapshot.organisation}</span>
        <span>
          As of{" "}
          <time dateTime={snapshot.captured_at}>
            {date(snapshot.captured_at)}
          </time>
        </span>
      </p>
      <section
        className="owner-metrics"
        aria-label="Selected organisation activity"
      >
        {metrics.map((metric) => (
          <Link key={metric.label} className="owner-metric" href={metric.href}>
            <span>
              {metric.label}
              <span aria-hidden="true">↗</span>
            </span>
            <strong>{metric.value.toLocaleString("en-GB")}</strong>
            <small>{metric.note}</small>
          </Link>
        ))}
      </section>
      <div className="owner-overview-grid">
        <section
          className="owner-card owner-enquiries"
          aria-labelledby="owner-enquiries-title"
        >
          <header>
            <div>
              <p className="eyebrow">WEBSITE INBOX</p>
              <h2 id="owner-enquiries-title">Start the next conversation.</h2>
            </div>
            <Link href="/os/enquiries">Open inbox ↗</Link>
          </header>
          <p>
            Latest five enquiries awaiting review. Check the sender and scope in
            the inbox before responding.
          </p>
          <Items
            rows={snapshot.enquiries}
            empty="No enquiries are awaiting review in this organisation."
          />
        </section>
        <section className="owner-card" aria-labelledby="owner-review-title">
          <header>
            <div>
              <p className="eyebrow">YOUR REVIEW</p>
              <h2 id="owner-review-title">Decisions to move forward.</h2>
            </div>
            <Link href="/os/approvals">Approvals ↗</Link>
          </header>
          <p>
            Up to four unexpired approval requests and four draft or submitted
            decisions. Review the exact record before acting.
          </p>
          <Items
            rows={[...snapshot.approvals, ...snapshot.decisions]}
            empty="No pending approval requests or decision drafts are recorded."
          />
        </section>
        <section className="owner-card" aria-labelledby="owner-work-title">
          <header>
            <div>
              <p className="eyebrow">WORK IN HAND</p>
              <h2 id="owner-work-title">Keep the next step clear.</h2>
            </div>
            <Link href="/os/tasks">All tasks ↗</Link>
          </header>
          <p>The five oldest assigned tasks in this organisation.</p>
          <Items
            rows={snapshot.tasks}
            empty="No assigned project tasks are recorded."
          />
        </section>
        <section className="owner-card" aria-labelledby="owner-activity-title">
          <header>
            <div>
              <p className="eyebrow">RECENT ACTIVITY</p>
              <h2 id="owner-activity-title">Follow the recorded work.</h2>
            </div>
            <Link href="/os/work-log">Work log ↗</Link>
          </header>
          <p>
            Latest six events from the last seven days. Recorded outcomes are
            not a live service-health check.
          </p>
          <Items
            rows={snapshot.activity}
            empty="No activity is recorded in the last seven days."
          />
        </section>
      </div>
      <section
        className="owner-destinations"
        aria-labelledby="owner-destinations-title"
      >
        <h2 id="owner-destinations-title">Manage the details</h2>
        <div>
          <Link href="/os/support">
            <strong>Support & privacy ↗</strong>
            <span>Open recorded requests and their history.</span>
          </Link>
          <Link href="/os/admin#release-gate">
            <strong>Website & release checks ↗</strong>
            <span>Review release evidence and recorded blockers.</span>
          </Link>
          <Link href="/os/admin">
            <strong>Administration ↗</strong>
            <span>Account security and configuration status.</span>
          </Link>
          <Link href="/os/venture-overview">
            <strong>Venture overview ↗</strong>
            <span>Project gates, risks and the existing operating view.</span>
          </Link>
        </div>
      </section>
      <p className="owner-scope-note">
        This overview is limited to your selected organisation. Cross-customer
        billing and live website publication status are not available here.
      </p>
    </div>
  );
}

export function OwnerOverviewUnavailable({
  className = "",
}: { className?: string } = {}) {
  return (
    <div className={`owner-overview ${className}`}>
      <header className="owner-overview-heading">
        <div>
          <p className="eyebrow">KXRA OWNER · OPERATIONS</p>
          <h1>Your operating overview</h1>
        </div>
      </header>
      <section className="owner-card" role="status">
        <h2>Overview temporarily unavailable</h2>
        <p>
          The recorded snapshot could not be loaded. No activity counts are
          shown.
        </p>
        <a className="button" href="/os">
          Try again
        </a>
      </section>
      <nav
        className="owner-destinations"
        aria-label="Available operating pages"
      >
        <div>
          <Link href="/os/enquiries">Website enquiries ↗</Link>
          <Link href="/os/tasks">Tasks ↗</Link>
          <Link href="/os/approvals">Approvals ↗</Link>
          <Link href="/os/workspace">Workspace ↗</Link>
        </div>
      </nav>
    </div>
  );
}
