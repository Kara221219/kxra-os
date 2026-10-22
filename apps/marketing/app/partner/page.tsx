import Link from "next/link";
const path = [
  [
    "01",
    "Join",
    "Agree your role and the client problem you can responsibly help solve.",
    "/partner/apply",
  ],
  [
    "02",
    "Learn",
    "Practise the workflow and the boundaries before client delivery.",
    "/partner/learn",
  ],
  [
    "03",
    "Prepare",
    "Make the discovery, scope and acceptance evidence concrete.",
    "/partner/toolkit",
  ],
  [
    "04",
    "Deliver",
    "Work with the client through an explicit review and release.",
    "/partner/fde",
  ],
];
export default function Partner() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">KXRA PARTNERS</p>
      <h1>
        Good work.
        <br />
        Delivered together.
      </h1>
      <p className="ref-lead">
        Help a team turn one recurring problem into a useful, reviewed workflow.
        Start with your experience, a clear scope and a responsible next step.
      </p>
      <div className="ref-filter-row">
        <Link className="ref-button" href="/partner/apply">
          Discuss a partnership ↗
        </Link>
        <Link
          className="ref-button ref-button-outline"
          href="/partner/business"
        >
          Explore the business approach ↗
        </Link>
      </div>
      <div className="partner-path">
        {path.map(([n, title, copy, href]) => (
          <Link href={href} key={n}>
            <span>{n}</span>
            <h2>{title}</h2>
            <p>{copy}</p>
            <strong>Explore ↗</strong>
          </Link>
        ))}
      </div>
      <div className="ref-split ref-section">
        <div>
          <p className="ref-kicker">A REAL DELIVERY BOUNDARY</p>
          <h2>
            Start with competence.
            <br />
            Keep the evidence.
          </h2>
        </div>
        <div>
          <p className="ref-lead">
            A partner conversation is not an automatic appointment,
            certification or revenue promise. Client access, commercial terms
            and release authority must be agreed explicitly.
          </p>
          <Link href="/partner/workshop">Plan a client workshop ↗</Link>
        </div>
      </div>
      <div className="ref-catalog-grid">
        {[
          [
            "Business",
            "Define a service around an outcome you can deliver.",
            "business",
          ],
          [
            "Materials",
            "Keep demonstrations, proposals and handovers truthful.",
            "materials",
          ],
          [
            "Client workshop",
            "Help a team make one useful decision.",
            "workshop",
          ],
        ].map(([title, copy, slug]) => (
          <Link
            className="ref-catalog-card"
            key={slug}
            href={"/partner/" + slug}
          >
            <h2>{title}</h2>
            <p>{copy}</p>
            <strong>Read the guide ↗</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
