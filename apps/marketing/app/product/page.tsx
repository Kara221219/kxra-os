import Link from "next/link";
import { productPages } from "../../lib/reference-content";
export default function Product() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">KXRA PRODUCT</p>
      <h1>
        One place for people,
        <br />
        context and work.
      </h1>
      <p className="ref-lead">
        Explore the building blocks of a shared workspace. Public explanations
        remain separate from hosted rollout and provider acceptance.
      </p>
      <div className="ref-catalog-grid">
        {Object.entries(productPages).map(([slug, p]) => (
          <Link
            className="ref-catalog-card"
            href={"/product/" + slug}
            key={slug}
          >
            <span>{slug}</span>
            <h2>{p.title}</h2>
            <p>{p.summary}</p>
            <strong>Explore ↗</strong>
          </Link>
        ))}
      </div>
    </section>
  );
}
