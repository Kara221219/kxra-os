import Link from "next/link";
import { notFound } from "next/navigation";
import { appExamples, appKeys, type AppKey } from "../../../lib/app-examples";
import { AppExamplePreview } from "../../../components/AppExamplePreview";
export const dynamicParams = false;
export function generateStaticParams() {
  return appKeys.map((template) => ({ template }));
}
export default async function App({
  params,
}: {
  params: Promise<{ template: string }>;
}) {
  const { template } = await params;
  const e = Object.hasOwn(appExamples, template)
    ? appExamples[template as AppKey]
    : undefined;
  if (!e) notFound();
  return (
    <section className="ref-section ref-wrap ref-inner">
      <Link href="/apps">Apps / {e.category}</Link>
      <p className="ref-kicker">{e.category.toUpperCase()} · SAMPLE WORKFLOW</p>
      <h1>{e.name}</h1>
      <p className="ref-lead">{e.intro}</p>
      <AppExamplePreview key={template} appKey={template as AppKey} />
      <div className="ref-section">
        <h2>{e.question}</h2>
        <div className="ref-three">
          {e.features.map(([title, copy], i) => (
            <article key={title}>
              <span>0{i + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </div>
      <div className="ref-readiness">
        <h2>Make the next step specific.</h2>
        <p>
          {e.boundary} A live version needs an agreed data model, permissions,
          persistence, acceptance tests and release approval.
        </p>
        <Link className="ref-button" href={"/contact?workflow=" + template}>
          Discuss this workflow ↗
        </Link>
      </div>
      <div className="ref-section">
        <h2>More starting points.</h2>
        <div className="ref-filter-row">
          {appKeys
            .filter((k) => k !== template)
            .map((k) => (
              <Link
                className="ref-button ref-button-outline"
                href={"/apps/" + k}
                key={k}
              >
                {appExamples[k].name} ↗
              </Link>
            ))}
        </div>
      </div>
    </section>
  );
}
