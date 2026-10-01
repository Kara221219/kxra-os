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
        KXRA has set its founding launch price while the platform remains in
        private preview and checkout stays disabled.
      </PageHero>
      <section className="section split">
        <article className="card commercial-card">
          <p className="number">PLATFORM ACCESS</p>
          <h2>Founding subscription</h2>
          <p className="commercial-price">
            £29 <span>/ organisation / month</span>
          </p>
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
      <section className="section">
        <p className="eyebrow">Founding plan limits</p>
        <h2>A bounded starting offer.</h2>
        <div className="card-grid">
          <article className="card">
            <p className="number">01</p>
            <h3>Brand Studio</h3>
            <p>Access for one customer organisation.</p>
          </article>
          <article className="card">
            <p className="number">120</p>
            <h3>Creative variants</h3>
            <p>Generated variants each month.</p>
          </article>
          <article className="card">
            <p className="number">120</p>
            <h3>Reviewed exports</h3>
            <p>Controlled exports each month.</p>
          </article>
        </div>
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
          The owner approved the tax treatment, cancellation terms and exact
          customer-document pack. Stripe test billing and the production release
          gate must pass before public sales are activated.
        </p>
      </section>
    </>
  );
}
