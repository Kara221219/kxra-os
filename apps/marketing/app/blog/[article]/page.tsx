import Link from "next/link";
import { notFound } from "next/navigation";
import {
  articles,
  articleKeys,
  readingMinutes,
  type ArticleKey,
} from "../../../lib/editorial-content";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ article: string }>;
}) {
  const { article } = await params;
  const p = Object.hasOwn(articles, article)
    ? articles[article as ArticleKey]
    : undefined;
  return p
    ? {
        title: p.title,
        description: p.summary,
        alternates: { canonical: "/blog/" + article },
      }
    : {};
}
export const dynamicParams = false;
export function generateStaticParams() {
  return articleKeys.map((article) => ({ article }));
}
export default async function Article({
  params,
}: {
  params: Promise<{ article: string }>;
}) {
  const { article } = await params;
  const a = Object.hasOwn(articles, article)
    ? articles[article as ArticleKey]
    : undefined;
  if (!a) notFound();
  return (
    <section className="ref-section ref-wrap ref-inner help-article editorial-article">
      <Link href="/blog">Notes / {a.category}</Link>
      <p className="ref-kicker">
        {a.category.toUpperCase()} · {readingMinutes(article as ArticleKey)} MIN
        READ
      </p>
      <h1>{a.title}</h1>
      <p className="ref-lead">{a.summary}</p>
      <p className="ref-caption">KXRA editorial · 22October2026</p>
      <div className="help-article-layout">
        <article>
          {a.sections.map(([title, copy], i) => (
            <section id={"section-" + i} key={title}>
              <h2>{title}</h2>
              <p>{copy}</p>
            </section>
          ))}
        </article>
        <aside>
          <h2>In this article</h2>
          {a.sections.map(([title], i) => (
            <a key={title} href={"#section-" + i}>
              {title}
            </a>
          ))}
          <Link href="/contact">Discuss a workflow ↗</Link>
        </aside>
      </div>
      <section className="help-related">
        <h2>Read next.</h2>
        {a.related.map((k) => (
          <Link key={k} href={"/blog/" + k}>
            {articles[k].title} ↗
          </Link>
        ))}
      </section>
    </section>
  );
}
