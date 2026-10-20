import Link from "next/link";
import { PageHero } from "../../components/PageHero";
import { publication } from "../../lib/publication";

export default function Pricing() {
  const commercial = publication.commercialModel;
  return (
    <>
      <PageHero
        eyebrow={`Commercial model · ${commercial.status}`}
        title="A workspace for your team. A clear scope for your business."
      >
        Start with a defined business need. We agree the scope and price before
        work begins.
      </PageHero>
      <section className="section split">
        <article className="card commercial-card">
          <p className="number">PLATFORM ACCESS</p>
          <h2>Platform subscription under review</h2>
          <p>{commercial.subscription}</p>
          <p>{commercial.subscriptionBoundary}</p>
          <p>{commercial.usageBoundary}</p>
          <p>{commercial.taxBoundary}</p>
          <Link className="button" href="/partner">
            Join pricing discovery
          </Link>
        </article>
        <article className="card commercial-card">
          <p className="number">SEPARATE ENGAGEMENT</p>
          <h2>Workspace setup and implementation</h2>
          <p>
            Bring one team and one workflow. We agree the required connections,
            access boundaries and implementation scope before quoting.
          </p>
          <p>{commercial.customProjects}</p>
          <p>
            Any proposal must define scope, exclusions, assumptions, milestones,
            payment gates and an exact price before work begins.
          </p>
          <Link className="button" href="/#contact">
            Discuss your workspace
          </Link>
        </article>
      </section>
      <section className="section pricing-boundaries">
        <p className="eyebrow">Clear commercial boundaries</p>
        <h2>Access is explicit and auditable.</h2>
        <div className="card-grid">
          <article className="card">
            <h3>No hidden custom-work entitlement</h3>
            <p>Tool access does not create a right to bespoke delivery.</p>
          </article>
          <article className="card">
            <h3>No access inferred from payment return pages</h3>
            <p>Provider-confirmed subscription state controls paid access.</p>
          </article>
          <article className="card">
            <h3>Free partner access stays separate</h3>
            <p>{commercial.partnerAccess}</p>
          </article>
        </div>
        <p className="notice">
          Previous customer terms are preserved as historical documents. A
          revised subscription scope and customer terms must be agreed before
          new subscription sales.
        </p>
      </section>
    </>
  );
}
