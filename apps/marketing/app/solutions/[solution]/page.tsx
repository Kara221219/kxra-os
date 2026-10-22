import Link from "next/link";
import { notFound } from "next/navigation";
import {
  solutions,
  solutionKeys,
  type SolutionKey,
} from "../../../lib/solution-content";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ solution: string }>;
}) {
  const { solution } = await params;
  const p = Object.hasOwn(solutions, solution)
    ? solutions[solution as SolutionKey]
    : undefined;
  return p
    ? {
        title: p.title,
        description: p.intro,
        alternates: { canonical: "/solutions/" + solution },
      }
    : {};
}
export const dynamicParams = false;
export function generateStaticParams() {
  return solutionKeys.map((solution) => ({ solution }));
}
export default async function Solution({
  params,
}: {
  params: Promise<{ solution: string }>;
}) {
  const { solution } = await params;
  const s = Object.hasOwn(solutions, solution)
    ? solutions[solution as SolutionKey]
    : undefined;
  if (!s) notFound();
  return (
    <section className="ref-section ref-wrap ref-inner">
      <Link href="/solutions">Solutions / {s.audience}</Link>
      <p className="ref-kicker">{s.audience.toUpperCase()}</p>
      <h1>{s.title}</h1>
      <p className="ref-lead">{s.intro}</p>
      <div className="solution-before-after">
        <article>
          <span>THE PROBLEM</span>
          <h2>Where the handoff breaks.</h2>
          <p>{s.problem}</p>
        </article>
        <article>
          <span>THE INTENDED OUTCOME</span>
          <h2>A clearer next step.</h2>
          <p>{s.outcome}</p>
        </article>
      </div>
      <div className="partner-guide-sections">
        {s.steps.map(([title, copy], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="solution-example">
        <p className="ref-kicker">ILLUSTRATIVE WORKFLOW</p>
        <h2>Try a bounded example.</h2>
        <p>{s.example}</p>
        <Link className="ref-button" href={"/apps/" + s.app}>
          Open the app sample ↗
        </Link>
      </div>
      <div className="ref-readiness">
        <h2>What this page does not establish.</h2>
        <p>{s.boundary}</p>
      </div>
      <div className="ref-section">
        <h2>Explore the building blocks.</h2>
        <div className="ref-filter-row">
          {s.links.map((k) => (
            <Link
              className="ref-button ref-button-outline"
              href={"/product/" + k}
              key={k}
            >
              {k.replaceAll("-", " ")} ↗
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
