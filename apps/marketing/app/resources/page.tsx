import Link from "next/link";
import { resourceGuides } from "../../lib/resource-guides";
export default function Resources() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">EXPLORE & LEARN</p>
      <h1>
        A clearer way
        <br />
        to understand the work.
      </h1>
      <p className="ref-lead">
        Product explanations, practical guides and specific help. Start with the
        question you need to answer.
      </p>
      <div className="ref-catalog-grid">
        {Object.entries(resourceGuides).map(([key, g]) => (
          <Link
            className="ref-catalog-card"
            href={"/resources/" + key}
            key={key}
          >
            <span>GUIDE</span>
            <h2>{g.title}</h2>
            <p>{g.intro}</p>
            <strong>Read the guide ↗</strong>
          </Link>
        ))}
      </div>
      <div className="ref-catalog-grid">
        {[
          [
            "KXRA notes",
            "Original product and working-practice articles.",
            "/blog",
          ],
          ["Help center", "Find a question, category or next step.", "/help"],
          [
            "Compare approaches",
            "Review context, ownership and implementation boundaries.",
            "/alternatives",
          ],
        ].map(([title, copy, href]) => (
          <Link className="ref-catalog-card" key={href} href={href}>
            <h2>{title}</h2>
            <p>{copy}</p>
            <strong>Explore ↗</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
