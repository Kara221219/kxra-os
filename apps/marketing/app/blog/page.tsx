import { ArticleDirectory } from "../../components/ArticleDirectory";
export default function Blog() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">KXRA NOTES</p>
      <h1>
        Clearer thinking.
        <br />
        More deliberate work.
      </h1>
      <p className="ref-lead">
        Original guides and product explanations about context, review and
        practical implementation. No invented customer stories or results.
      </p>
      <ArticleDirectory />
    </section>
  );
}
