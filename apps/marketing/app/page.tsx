import Link from "next/link";
import { WorkspacePreview } from "../components/WorkspacePreview";
import { PublicForm } from "../components/PublicForm";
export const metadata = {
  title: "Your team. Amplified.",
  alternates: { canonical: "/" },
};

const faq = [
  [
    "What is KXRA?",
    "A shared working environment for teams, context, decisions and reviewed agent work. Start with a specific workflow and agree what operational acceptance requires.",
  ],
  [
    "Can I bring my own model?",
    "Provider choice and costs are separate from workspace access. A real provider connection, permission and usage boundary must be verified before execution is offered.",
  ],
  [
    "Is this a live agent demonstration?",
    "No. The public preview uses sample records and local interaction state. It does not call an agent, connect an account or send a message.",
  ],
  [
    "Can I use KXRA with my team?",
    "Yes. Starter is £29 a month for one person, Team is £79 for five, and Business is £199 for fifteen. You bring your own model accounts. Request a plan and nothing is charged until a proposal or Stripe checkout is confirmed.",
  ],
  [
    "What happens to private information?",
    "Access should follow verified identity, workspace membership and room scope. Share confidential material through your private workspace after onboarding, rather than a public enquiry.",
  ],
  [
    "How does pricing work?",
    "Workspace plans are £29, £79 and £199 a month. Decision Review is £250 and a Business Improvement Sprint is £750. Implementation is quoted. KXRA is not VAT registered, so VAT is not added. Card checkout stays off until the Stripe account is connected.",
  ],
];
export default function Home() {
  return (
    <div className="ref-home">
      <section className="studio-hero">
        <div className="studio-copy">
          <p className="eyebrow">HUMAN INTELLIGENCE. AMPLIFIED.</p>
          <h1>
            Your team.
            <br />
            Amplified.
          </h1>
          <p className="studio-lead">
            A shared accountable workspace where people, AI agents, and smart
            tools work together with clarity, ownership, and impact.
          </p>
          <ul className="studio-trust">
            <li>
              <TrustIcon kind="people" />
              <div>
                <strong>Accountable together</strong>
                <span>Ownership at every step</span>
              </div>
            </li>
            <li>
              <TrustIcon kind="leaf" />
              <div>
                <strong>Human-centric AI</strong>
                <span>Augmenting potential</span>
              </div>
            </li>
            <li>
              <TrustIcon kind="shield" />
              <div>
                <strong>Trusted environment</strong>
                <span>Secure. Transparent. Reliable.</span>
              </div>
            </li>
          </ul>
          <div className="studio-actions">
            <Link className="ref-button ref-button-sage" href="/solutions">
              Explore solutions →
            </Link>
            <Link className="ref-text-link" href="/approach">
              See how we work
            </Link>
          </div>
        </div>
        <figure className="studio-scene">
          <img
            src="/media/hero/kxra-team-table.webp"
            alt="A team meeting at a stone table with two small robot assistants. The interface cards beside them are sample HTML, not live records."
            width={574}
            height={572}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          <article className="studio-card studio-card-invoice">
            <p className="studio-kicker">Sample</p>
            <h2>Invoice review</h2>
            <ul className="studio-lines">
              <li>
                <span>Project Alpha</span>
                <span>£9,860 · Approved</span>
              </li>
              <li>
                <span>Workshop Series</span>
                <span>£2,960 · Pending</span>
              </li>
              <li>
                <span>Platform Access</span>
                <span>£950 · Approved</span>
              </li>
            </ul>
            <p className="studio-total">
              <span>Total £13,770</span>
              <span className="studio-pill">Ready to pay</span>
            </p>
          </article>
          <article className="studio-card studio-card-decision">
            <p className="studio-kicker">Sample</p>
            <h2>Decision review</h2>
            <p className="studio-note">Q2 campaign budget</p>
            <p className="studio-approved">Approved</p>
            <p className="studio-meta">Impact: High · Confidence: 85%</p>
            <Link href="/business-sprints#decision-review">
              View rationale →
            </Link>
          </article>
          <article className="studio-card studio-card-assistant">
            <p className="studio-kicker">Sample assistant</p>
            <h2>AI assistant</h2>
            <p className="studio-note">
              I’ve analysed the pipeline and flagged two opportunities to
              discuss.
            </p>
            <p className="studio-meta">Not a live model response.</p>
          </article>
        </figure>
      </section>
      <p className="studio-divider">WORK BETTER. TOGETHER.</p>
      <section id="workspace-preview" className="ref-preview-section ref-wrap">
        <WorkspacePreview />
        <p className="ref-caption">
          Explore the sample workspace. Changes here stay in this page; no live
          account or external system is connected.
        </p>
      </section>
      <section className="ref-section ref-wrap">
        <p className="ref-kicker">PEOPLE, CONTEXT, WORK</p>
        <h2>
          From separate conversations
          <br />
          to a shared next step.
        </h2>
        <p className="ref-lead">
          Keep the evidence, the discussion and the decision together, so the
          next teammate can pick up where the work left off.
        </p>
        <div className="ref-comparison">
          <article>
            <span>One person · Separate conversations</span>
            <h3>
              Useful answers.
              <br />
              Scattered context.
            </h3>
            <p>
              Research in one place, decisions in another and the handoff left
              to you.
            </p>
          </article>
          <article className="ref-comparison-team">
            <span>Your team · Shared context</span>
            <h3>
              Bring the work.
              <br />
              Keep the thread.
            </h3>
            <p>
              People, selected context and reviewed drafts around the same task.
            </p>
            <Link href="/product/workspace">Explore the workspace ↗</Link>
          </article>
        </div>
      </section>
      <section className="ref-principles">
        <div className="ref-wrap">
          <p className="ref-kicker">A PRACTICAL START</p>
          <h2>
            One team.
            <br />
            One useful workflow.
          </h2>
          <p className="ref-lead">
            A product preview is a starting point, not customer proof. Agree the
            outcome, test the boundaries and review the actual result.
          </p>
          <div className="ref-three">
            <article>
              <span>01</span>
              <h3>Agree the work</h3>
              <p>A clear problem, scope and responsible person.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Bring the evidence</h3>
              <p>Selected context with a source and access boundary.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Review the result</h3>
              <p>A recorded decision before an external action.</p>
            </article>
          </div>
        </div>
      </section>
      <section className="ref-section ref-wrap ref-split">
        <div>
          <p className="ref-kicker">YOUR CHOICE OF AGENT</p>
          <h2>
            Your tools.
            <br />
            Working as a team.
          </h2>
          <p className="ref-lead">
            Give external agents a deliberate task, selected context and a
            visible handoff. Keep the final call with your team.
          </p>
          <Link className="ref-button" href="/bring-your-own-agent">
            Explore the approach ↗
          </Link>
        </div>
        <div className="ref-collaboration">
          <div>
            team-plan <span>SAMPLE ROOM</span>
          </div>
          <p>
            <strong>Maya</strong> Let’s agree the scope before we start.
          </p>
          <p>
            <strong>Research agent</strong> Here are the evidence gaps to
            review.
          </p>
          <p>
            <strong>Implementation agent</strong> I’ll work from the approved
            version.
          </p>
          <footer>
            Proposed collaboration pattern. No live pairing or execution in this
            preview.
          </footer>
        </div>
      </section>
      <section className="ref-section ref-wrap ref-centered">
        <p className="ref-kicker">CONNECTIONS WITH CONTEXT</p>
        <h2>
          The tools you use.
          <br />
          The access you choose.
        </h2>
        <p className="ref-lead">
          Connect only what the task needs. Review the provider, permissions and
          data boundary before any external work.
        </p>
        <div className="ref-integration-wall">
          {[
            "Email",
            "Team chat",
            "Knowledge",
            "CRM",
            "Calendars",
            "Project tracking",
            "Files",
            "Models",
            "Billing",
            "Business records",
            "Research",
            "Your tools",
          ].map((s, i) => (
            <Link key={s} href="/integrations">
              <span>{["✉", "◈", "▧", "◎"][i % 4]}</span>
              {s}
            </Link>
          ))}
        </div>
        <p className="ref-caption">
          Capability categories, not a claim that accounts or providers are
          connected.
        </p>
      </section>
      <section className="ref-section ref-wrap">
        <p className="ref-kicker">ONE WORKSPACE, DIFFERENT WORK</p>
        <h2>
          Start where your team
          <br />
          needs a better next step.
        </h2>
        <div className="ref-scenario-grid">
          {[
            [
              "01",
              "Finance",
              "Review the next invoice action.",
              "Keep the customer record, evidence and follow-up decision in one room.",
            ],
            [
              "02",
              "Hiring",
              "Keep a considered shortlist.",
              "Organise applications and human reviews without automated hiring decisions.",
            ],
            [
              "03",
              "Sales",
              "Know the next conversation.",
              "Give each opportunity an owner, stage and a deliberate next action.",
            ],
            [
              "04",
              "Operations",
              "Turn a question into a record.",
              "Validate the input, keep the evidence and review a change before it becomes live.",
            ],
          ].map(([n, title, h, copy]) => (
            <article key={n}>
              <span>
                {n} / {title}
              </span>
              <h3>{h}</h3>
              <p>{copy}</p>
              <Link href="#workspace-preview">
                Explore the sample workspace ↑
              </Link>
            </article>
          ))}
        </div>
      </section>
      <section className="ref-security ref-wrap">
        <div>
          <p className="ref-kicker">CLEAR BOUNDARIES</p>
          <h2>
            Shared work.
            <br />
            Deliberate access.
          </h2>
        </div>
        <div>
          {[
            [
              "Scoped context",
              "Workspace membership and room permissions determine what a request can use.",
            ],
            [
              "Human review",
              "Keep the proposed action, evidence and decision version connected.",
            ],
            [
              "Recorded decisions",
              "Review work history without inventing certifications or provider acceptance.",
            ],
          ].map(([h, p]) => (
            <article key={h}>
              <span>✓</span>
              <div>
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section id="faq" className="ref-section ref-wrap ref-faq">
        <div>
          <p className="ref-kicker">A FEW USEFUL ANSWERS</p>
          <h2>
            Questions?
            <br />
            Start here.
          </h2>
          <Link href="/help">Visit the help center ↗</Link>
        </div>
        <div>
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>
                {q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
      <section id="request-access" className="ref-conversion">
        <div className="ref-wrap ref-split">
          <div>
            <p className="ref-kicker">YOUR NEXT CHAPTER</p>
            <h2>
              Bring one team.
              <br />
              Start one workflow.
            </h2>
            <p className="ref-lead">
              Tell us what would make your work clearer. We’ll agree the right
              next step before any project or payment commitment.
            </p>
            <p>
              <Link href="#request-access">Request workspace access</Link>
            </p>
            <p>
              No confidential files, credentials or private customer data in
              this form.
            </p>
          </div>
          <PublicForm kind="ENQUIRY" pagePath="/" />
        </div>
      </section>
    </div>
  );
}

function TrustIcon({ kind }: { kind: "people" | "leaf" | "shield" }) {
  const common = {
    viewBox: "0 0 36 36",
    "aria-hidden": true as const,
  };
  if (kind === "people")
    return (
      <svg {...common}>
        <circle cx="18" cy="18" r="17" fill="#e7efe4" />
        <circle
          cx="18"
          cy="14"
          r="4"
          fill="none"
          stroke="#6a7362"
          strokeWidth="1.6"
        />
        <path
          d="M10 26c1.4-4 4-6 8-6s6.6 2 8 6"
          fill="none"
          stroke="#6a7362"
          strokeWidth="1.6"
        />
      </svg>
    );
  if (kind === "leaf")
    return (
      <svg {...common}>
        <circle cx="18" cy="18" r="17" fill="#e7efe4" />
        <path
          d="M12 22c6-1 10-6 12-12-6 1-11 5-12 12z"
          fill="none"
          stroke="#6a7362"
          strokeWidth="1.6"
        />
        <path
          d="M14 20c2-2 4-4 7-6"
          fill="none"
          stroke="#6a7362"
          strokeWidth="1.6"
        />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="18" cy="18" r="17" fill="#e7efe4" />
      <path
        d="M18 9l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9v-6l7-3z"
        fill="none"
        stroke="#6a7362"
        strokeWidth="1.6"
      />
    </svg>
  );
}
