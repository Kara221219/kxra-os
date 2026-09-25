import Link from "next/link";
import { PageHero } from "../../components/PageHero";

const steps = [
  ["Add evidence", "Provide the brand material you are entitled to use."],
  [
    "Review the profile",
    "Correct inferred audience, tone, offers and prohibited claims.",
  ],
  ["Create a brief", "Choose the objective, audience and channel."],
  [
    "Review variants",
    "Inspect editable options with source and generation lineage.",
  ],
  ["Export", "Export approved work. Publishing remains a separate decision."],
];
export default function BrandStudio() {
  return (
    <>
      <PageHero
        eyebrow="KXRA Brand Studio · private preview"
        title="Marketing work grounded in your brand evidence."
      >
        Build a correctable brand profile, create campaign concepts and review
        each output before export.
      </PageHero>
      <section className="section">
        <div className="steps">
          {steps.map(([title, body]) => (
            <article className="step" key={title}>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </article>
          ))}
        </div>
        <p className="notice">
          Brand Studio is in private preview. Remote website intake, external
          generation and publication are not currently offered as live
          capabilities.
        </p>
        <Link className="button" href="/partner">
          Join the discovery list
        </Link>
      </section>
    </>
  );
}
