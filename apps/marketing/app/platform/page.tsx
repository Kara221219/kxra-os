import Link from "next/link";
import { PageHero } from "../../components/PageHero";
import { publication } from "../../lib/publication";

const operatingLoop = [
  [
    "Understand",
    "Capture the business context, constraint and intended outcome.",
  ],
  ["Prove", "Link claims to current evidence and mark what remains uncertain."],
  ["Test", "Run a bounded experiment with success, stop and cost criteria."],
  [
    "Decide",
    "Record the result, approval and next action so work can continue.",
  ],
  [
    "Improve",
    "Use failures, results and customer demand to identify the next governed change.",
  ],
] as const;

const audiences = [
  [
    "Business owners",
    "Bring scattered ideas, decisions, risks and evidence into one operating view.",
  ],
  [
    "Teams and partners",
    "Work only inside assigned organizations and projects with a visible activity trail.",
  ],
  [
    "Growing businesses",
    "Use packaged tools for repeatable work and request separate custom delivery when needed.",
  ],
] as const;

export default function Platform() {
  return (
    <>
      <PageHero
        eyebrow="KXRA OS"
        title="One place to move business work forward."
      >
        KXRA OS brings structured projects, evidence, controlled AI and reusable
        tools into one permission-aware workspace.
      </PageHero>
      <section className="section">
        <div className="section-lead">
          <div>
            <p className="eyebrow">Practical value</p>
            <h2>
              Less fragmented work. Better evidence. Clearer next actions.
            </h2>
          </div>
          <p>
            KXRA OS is designed to help a business keep its operating context,
            approved knowledge, experiments and AI-assisted work connected over
            time.
          </p>
        </div>
        <div className="card-grid">
          {audiences.map(([name, description], index) => (
            <article className="card" key={name}>
              <p className="number">WHO 0{index + 1}</p>
              <h2>{name}</h2>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="section operating-loop-section">
        <div className="section-lead">
          <div>
            <p className="eyebrow">A governed improvement loop</p>
            <h2>The platform learns by measuring work.</h2>
          </div>
          <p>
            It may surface the next useful action. It does not grant itself
            access, spend money, publish, release or approve its own work.
          </p>
        </div>
        <div className="steps">
          {operatingLoop.map(([name, description]) => (
            <article className="step" key={name}>
              <div>
                <h3>{name}</h3>
                <p>{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-lead">
          <div>
            <p className="eyebrow">Current product paths</p>
            <h2>Start with a reusable tool or a separately scoped project.</h2>
          </div>
          <p>
            Availability is stated directly. Private-preview tools are not
            presented as live public services.
          </p>
        </div>
        <div className="card-grid">
          {publication.capabilities.map((item) => (
            <article className="card" key={item.name}>
              <span className="status">{item.status}</span>
              <h2>{item.name}</h2>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
        <div className="actions">
          <Link className="button" href="/partner">
            Register your interest
          </Link>
          <Link className="button ghost" href="/custom-projects">
            Discuss a custom project
          </Link>
          <Link className="button ghost" href="/pricing">
            Review the commercial model
          </Link>
        </div>
      </section>
    </>
  );
}
