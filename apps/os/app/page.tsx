import Link from "next/link";
export default function Marketing() {
  return (
    <main className="marketing">
      <header>
        <Link className="wordmark" href="/">
          KXRA<span>GROUP</span>
        </Link>
        <nav>
          <a href="#approach">Our approach</a>
          <a href="#partner">Partner with us</a>
          <Link href="/os">KXRA OS ↗</Link>
        </nav>
      </header>
      <section className="hero">
        <p className="eyebrow">Independent thinking. Practical ventures.</p>
        <h1>
          Useful ideas.
          <br />
          Lasting businesses.
        </h1>
        <div className="hero-bottom">
          <p>
            We identify real problems, test the commercial case and build
            practical solutions across sectors.
          </p>
          <a className="button" href="mailto:info@kxra-group.com">
            Bring us a problem ↗
          </a>
        </div>
      </section>
      <section id="approach" className="method">
        <div>
          <p className="eyebrow">The KXRA approach</p>
          <h2>
            Evidence before
            <br />
            investment.
          </h2>
        </div>
        <div>
          {[
            [
              "01",
              "Understand the problem",
              "Learn from the people experiencing it. Establish what existing alternatives leave unresolved.",
            ],
            [
              "02",
              "Test the case",
              "Examine demand, delivery, economics and risk before committing to a substantial build.",
            ],
            [
              "03",
              "Build and improve",
              "Develop the smallest useful solution. Invest further when the evidence supports it.",
            ],
          ].map(([n, t, b]) => (
            <article key={n}>
              <span>{n}</span>
              <div>
                <h3>{t}</h3>
                <p>{b}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section id="partner" className="partner-block">
        <p className="eyebrow">Build with KXRA</p>
        <h2>
          Different experience.
          <br />
          Shared standards.
        </h2>
        <p>
          We welcome conversations with people who understand a market, have
          access to a persistent problem or bring practical delivery capability.
        </p>
        <a href="mailto:info@kxra-group.com">info@kxra-group.com ↗</a>
      </section>
      <footer>
        <span>KXRA Group</span>
        <span>Local preview · publication not approved</span>
        <Link href="/login">Partner sign in</Link>
      </footer>
    </main>
  );
}
