import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspacePreview } from "../../../components/WorkspacePreview";
import { useCases, type UseCaseKey } from "../../../lib/use-case-content";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario } = await params;
  const p = Object.hasOwn(useCases, scenario)
    ? useCases[scenario as UseCaseKey]
    : undefined;
  return p
    ? {
        title: p.title,
        description: p.intro,
        alternates: { canonical: "/use-cases/" + scenario },
      }
    : {};
}
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(useCases).map((scenario) => ({ scenario }));
}
export default async function UseCase({
  params,
}: {
  params: Promise<{ scenario: string }>;
}) {
  const { scenario } = await params;
  const c = Object.hasOwn(useCases, scenario)
    ? useCases[scenario as UseCaseKey]
    : undefined;
  if (!c) notFound();
  return (
    <section className="ref-section ref-wrap ref-inner">
      <Link href="/use-cases">Use cases / {c.name}</Link>
      <h1>{c.title}</h1>
      <p className="ref-lead">{c.intro}</p>
      <WorkspacePreview key={scenario} initialScenario={c.scenario} />
      <p className="ref-caption">
        Interactive sample records only. Changes stay in the page; no account,
        provider or external system is connected.
      </p>
      <div className="ref-readiness">
        <h2>Keep the review boundary.</h2>
        <p>{c.review}</p>
        <Link className="ref-button" href={"/solutions/" + c.solution}>
          Read the implementation approach ↗
        </Link>
      </div>
    </section>
  );
}
