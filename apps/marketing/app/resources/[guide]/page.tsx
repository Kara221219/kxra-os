import Link from "next/link";
import { notFound } from "next/navigation";
import { resourceGuides, type ResourceKey } from "../../../lib/resource-guides";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ guide: string }>;
}) {
  const { guide } = await params;
  const p = Object.hasOwn(resourceGuides, guide)
    ? resourceGuides[guide as ResourceKey]
    : undefined;
  return p
    ? {
        title: p.title,
        description: p.intro,
        alternates: { canonical: "/resources/" + guide },
      }
    : {};
}
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(resourceGuides).map((guide) => ({ guide }));
}
export default async function Guide({
  params,
}: {
  params: Promise<{ guide: string }>;
}) {
  const { guide } = await params;
  const g = Object.hasOwn(resourceGuides, guide)
    ? resourceGuides[guide as ResourceKey]
    : undefined;
  if (!g) notFound();
  return (
    <section className="ref-section ref-wrap ref-inner">
      <Link href="/resources">Resources / Guide</Link>
      <h1>{g.title}</h1>
      <p className="ref-lead">{g.intro}</p>
      <div className="partner-guide-sections">
        {g.sections.map(([title, copy], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="ref-filter-row">
        {g.links.map(([label, href]) => (
          <Link
            className="ref-button ref-button-outline"
            key={href}
            href={href}
          >
            {label} ↗
          </Link>
        ))}
      </div>
    </section>
  );
}
