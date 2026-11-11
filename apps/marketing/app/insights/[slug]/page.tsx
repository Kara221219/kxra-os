import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { insight, insights } from "../../../lib/insights";

export function generateStaticParams() {
  return insights.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const article = insight((await params).slug);
  if (!article) return { title: "Insights" };
  return {
    title: article.title,
    description: article.summary,
    alternates: { canonical: `/insights/${article.slug}` },
  };
}

export default async function InsightArticle({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const article = insight((await params).slug);
  if (!article) notFound();
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">INSIGHTS</p>
      <h1>{article.title}</h1>
      <p className="ref-lead">{article.summary}</p>
      {article.sections.map((section) => (
        <article key={section.heading}>
          <h2>{section.heading}</h2>
          <p>{section.body}</p>
        </article>
      ))}
      <p>
        <Link href="/insights">All insights</Link>
      </p>
    </section>
  );
}
