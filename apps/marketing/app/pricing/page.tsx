import Link from "next/link";
import { PageHero } from "../../components/PageHero";
import { publication } from "../../lib/publication";

export default function Pricing() {
  const commercial = publication.commercialModel;
  return (
    <>
      <PageHero
        eyebrow={`Commercial model · ${commercial.status}`}
        title="Simple access for repeatable tools. Separate scope for custom work."
      >
        KXRA is validating a straightforward subscription model while the
        platform remains in private preview.
      </PageHero>
      <section className="section split">
        <article className="card commercial-card">
          <p className="number">PLATFORM ACCESS</p>
          <h2>Founding subscription</h2>
          <p className="commercial-price">
            Around £30 <span>/ month</span>
          </p>
          <p>{commercial.subscription}</p>
          <p>{commercial.subscriptionBoundary}</p>
          <Link className="button" href="/partner">
            Join pricing discovery
          </Link>
        </article>
        <article className="card commercial-card">
          <p className="number">SEPARATE ENGAGEMENT</p>
          <h2>Custom projects</h2>
          <p>{commercial.customProjects}</p>
          <p>
            Any proposal must define scope, exclusions, assumptions, milestones,
            payment gates and an exact price before work begins.
          </p>
          <Link className="button" href="/submit-opportunity">
            Submit a business need
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
          Pricing, taxes, usage limits, cancellation terms and exact customer
          documents require owner approval before public sales are activated.
        </p>
      </section>
    </>
  );
}
