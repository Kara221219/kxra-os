import { PageHero } from "../../components/PageHero";
import { publication } from "../../lib/publication";

export default function Industries() {
  return (
    <>
      <PageHero
        eyebrow="Cross-industry operating capability"
        title="Different contexts. The same need for control."
      >
        KXRA is designed around reusable operating capabilities. These are
        applicability examples, not claims of customer work or proven outcomes.
      </PageHero>
      <section className="section">
        <div className="card-grid">
          {publication.industries.map((industry, index) => (
            <article className="card" key={industry}>
              <p className="number">CONTEXT 0{index + 1}</p>
              <h2>{industry}</h2>
              <p>
                Apply structured research, evidence, controlled content and
                project delivery to a clearly defined need in this context.
              </p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
