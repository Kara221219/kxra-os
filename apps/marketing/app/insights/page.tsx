import type { Metadata } from "next";
import Link from "next/link";
import { insights } from "../../lib/insights";

export const metadata: Metadata = {
  title: "Insights",
  alternates: { canonical: "/insights" },
};

export default function Insights() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">INSIGHTS</p>
      <h1>Notes on what the product actually does</h1>
      <p className="ref-lead">
        These are explanations of the current workspace. They are not customer
        stories and they do not report results we have not measured.
      </p>
      <div className="ref-three">
        {insights.map((article) => (
          <article key={article.slug}>
            <h2>
              <Link href={`/insights/${article.slug}`}>{article.title}</Link>
            </h2>
            <p>{article.summary}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
