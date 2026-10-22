import Link from "next/link";
import { notFound } from "next/navigation";
import { helpArticles, helpBySlug } from "../../../lib/help-content";
export const dynamicParams = false;
export function generateStaticParams() {
  return helpArticles.map((a) => ({ article: a.slug }));
}
export default async function Article({
  params,
}: {
  params: Promise<{ article: string }>;
}) {
  const { article } = await params;
  const a = helpBySlug(article);
  if (!a) notFound();
  return (
    <section className="ref-section ref-wrap ref-inner help-article">
      <nav aria-label="Breadcrumb">
        <Link href="/help">Help center</Link>
        <span> / {a.category}</span>
      </nav>
      <p className="ref-kicker">{a.category.toUpperCase()} · KXRA GUIDANCE</p>
      <h1>{a.title}</h1>
      <p className="ref-lead">{a.summary}</p>
      <div className="help-article-layout">
        <article>
          {a.sections.map(([title, copy], i) => (
            <section id={"step-" + (i + 1)} key={title}>
              <h2>{title}</h2>
              <p>{copy}</p>
            </section>
          ))}
          <p className="ref-caption">
            Guidance reviewed22October2026. Interface and operational
            availability follow the accepted environment; a public article does
            not activate a capability.
          </p>
        </article>
        <aside>
          <h2>In this article</h2>
          {a.sections.map(([title], i) => (
            <a key={title} href={"#step-" + (i + 1)}>
              {title}
            </a>
          ))}
          <Link href="/contact">Ask a question ↗</Link>
        </aside>
      </div>
      <section className="help-related">
        <h2>Keep going.</h2>
        {a.related.map((s) => {
          const related = helpBySlug(s);
          return related ? (
            <Link key={s} href={"/help/" + s}>
              {related.title} ↗
            </Link>
          ) : null;
        })}
      </section>
    </section>
  );
}
