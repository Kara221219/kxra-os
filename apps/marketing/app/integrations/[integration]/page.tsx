import Link from "next/link";
import { notFound } from "next/navigation";
import {
  integrations,
  integrationKeys,
  type IntegrationKey,
} from "../../../lib/integration-content";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ integration: string }>;
}) {
  const { integration } = await params;
  const p = Object.hasOwn(integrations, integration)
    ? integrations[integration as IntegrationKey]
    : undefined;
  return p
    ? {
        title: p.name + " connection boundary",
        description: p.summary,
        alternates: { canonical: "/integrations/" + integration },
      }
    : {};
}
export const dynamicParams = false;
export function generateStaticParams() {
  return integrationKeys.map((integration) => ({ integration }));
}
export default async function Integration({
  params,
}: {
  params: Promise<{ integration: string }>;
}) {
  const { integration } = await params;
  const p = Object.hasOwn(integrations, integration)
    ? integrations[integration as IntegrationKey]
    : undefined;
  if (!p) notFound();
  return (
    <section className="ref-section ref-wrap ref-inner">
      <Link href="/integrations">Integrations / {p.group}</Link>
      <p className="ref-kicker">
        {p.group === "Accounts"
          ? "CONNECTION DESIGN · NOT CONNECTED HERE"
          : "CAPABILITY · ACCEPTANCE REQUIRED"}
      </p>
      <h1>{p.name}</h1>
      <p className="ref-lead">{p.summary}</p>
      <div className="ref-split connection-scope">
        <div>
          <h2>Define the scope first.</h2>
          <ul>
            {p.scope.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
        <aside>
          <strong>Public-site status</strong>
          <p>
            No OAuth connection, credential or external action is created here.
            A real connection requires a separately authorised implementation
            and acceptance.
          </p>
        </aside>
      </div>
      <div className="partner-guide-sections">
        {p.flow.map(([title, copy], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="ref-readiness">
        <h2>Keep this boundary visible.</h2>
        <p>{p.risk}</p>
        <Link className="ref-button" href={"/solutions/" + p.related}>
          See the related workflow ↗
        </Link>
      </div>
      <section className="help-related">
        <h2>Before a real connection.</h2>
        <Link href="/help/connection-revocation">
          Review access and revocation ↗
        </Link>
        <Link href="/contact">Discuss a specific setup ↗</Link>
      </section>
    </section>
  );
}
