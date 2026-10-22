import Link from "next/link";
import { notFound } from "next/navigation";
import { productPages } from "../../../lib/reference-content";
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(productPages).map((feature) => ({ feature }));
}
export default async function Feature({
  params,
}: {
  params: Promise<{ feature: string }>;
}) {
  const { feature } = await params;
  const p = productPages[feature as keyof typeof productPages];
  if (!p) notFound();
  return (
    <section className="ref-section ref-wrap ref-inner">
      <Link href="/product">Product / {feature}</Link>
      <h1>{p.title}</h1>
      <p className="ref-lead">{p.summary}</p>
      <div className="ref-three">
        {p.steps.map((s, i) => (
          <article key={s}>
            <span>0{i + 1}</span>
            <h2>{s}</h2>
          </article>
        ))}
      </div>
      <div className="ref-readiness">
        <h2>Availability follows acceptance.</h2>
        <p>
          This is a public product explanation. Hosted rollout, provider
          connections and external execution require their own verified setup.
          Browsing this page does not activate a connection or grant access.
        </p>
        <Link className="ref-button" href="/#request-access">
          Discuss your workflow ↗
        </Link>
      </div>
    </section>
  );
}
