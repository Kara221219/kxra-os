import Link from "next/link";
import { notFound } from "next/navigation";
import { ReferenceCatalog } from "../../components/ReferenceCatalog";
const pages = {
  integrations: [
    "CONNECTIONS",
    "Your tools. Your access boundary.",
    "Directory entries explain capability categories. They do not mean an account is connected or a provider has passed acceptance.",
  ],
  solutions: [
    "WAYS TO WORK",
    "One workspace. Different kinds of work.",
    "Start with a specific workflow, selected evidence and a responsible person.",
  ],
  "use-cases": [
    "REAL WORK, CLEAR CONTEXT",
    "Start with one useful outcome.",
    "Explore finance, hiring, sales and operations using the clearly labelled sample workspace.",
  ],
  "bring-your-own-agent": [
    "YOUR CHOICE OF AGENT",
    "Your agent. Your team’s context.",
    "An external agent needs a verified identity, a bounded task and a visible handoff. Pairing, expiry and revocation must pass acceptance before hosted execution is offered.",
  ],
} as const;
export function generateStaticParams() {
  return Object.keys(pages).map((reference) => ({ reference }));
}
export default async function Reference({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const p = pages[reference as keyof typeof pages];
  if (!p) notFound();
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">{p[0]}</p>
      <h1>{p[1]}</h1>
      <p className="ref-lead">{p[2]}</p>
      {reference === "bring-your-own-agent" ? (
        <>
          <div className="ref-three">
            {[
              "Pair through an authorised flow.",
              "Scope the room, task and sources.",
              "Review the output. Revoke when finished.",
            ].map((s, i) => (
              <article key={s}>
                <span>0{i + 1}</span>
                <h2>{s}</h2>
              </article>
            ))}
          </div>
          <Link className="ref-button" href="/#request-access">
            Discuss your workflow ↗
          </Link>
        </>
      ) : (
        <ReferenceCatalog
          kind={
            reference as
              "apps" | "integrations" | "help" | "solutions" | "use-cases"
          }
        />
      )}
    </section>
  );
}
