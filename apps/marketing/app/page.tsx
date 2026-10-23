import Link from "next/link";
import { WorkspacePreview } from "../components/WorkspacePreview";
import { PublicForm } from "../components/PublicForm";
const heroSources = (format: "avif" | "webp") =>
  [640, 960, 1280, 2055]
    .map(
      (width) =>
        `/media/workspace/kxra-collaborative-cutaway-v1-${width}.${format} ${width}w`,
    )
    .join(", ");
const heroAvif = heroSources("avif");
const heroWebp = heroSources("webp");
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
    "Request access so we can agree workspace setup, membership and the workflow you want to verify. New platform subscriptions remain paused while the offer is revised.",
  ],
  [
    "What happens to private information?",
    "Access should follow verified identity, workspace membership and room scope. Share confidential material through your private workspace after onboarding, rather than a public enquiry.",
  ],
  [
    "How does pricing work?",
    "Platform subscriptions are under review. Decision Review starts from £250 and Business Improvement Sprint from £750; implementation is separately scoped and quoted.",
  ],
];
export default function Home() {
  return (
    <div className="ref-home">
      <link
        rel="preload"
        as="image"
        type="image/avif"
        imageSrcSet={heroAvif}
        imageSizes="100vw"
        fetchPriority="high"
      />
      <section
        className="ref-artwork"
        aria-label="An illustrated shared workplace"
      >
        <picture>
          <source type="image/avif" srcSet={heroAvif} sizes="100vw" />
          <source type="image/webp" srcSet={heroWebp} sizes="100vw" />
          <img
            src="/media/workspace/kxra-collaborative-cutaway-v1.png"
            alt="Original illustration of people collaborating in a multi-level cutaway workspace beside a river."
            width={2055}
            height={765}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="ref-hero-illustration"
          />
        </picture>
        <div className="ref-artwork-caption">
          A shared place for the work ahead.
        </div>
      </section>
      <section className="ref-hero ref-wrap">
        <h1>
          Your team.
          <br />
          Amplified.
        </h1>
        <div>
          <p>
            Bring your team, your chosen AI models and the work that matters
            into <strong>one accountable workspace.</strong>
          </p>
          <div className="ref-hero-actions">
            <span
              className="ref-avatar-strip"
              aria-label="People and agents, illustrated"
            >
              <span>M</span>
              <span>✣</span>
              <span>A</span>
              <span>◈</span>
              <span>+</span>
            </span>
            <Link className="ref-button" href="#request-access">
              Request workspace access ↗
            </Link>
          </div>
          <p className="ref-hero-secondary">
            Or <Link href="/login">open your workspace</Link>
          </p>
        </div>
      </section>
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
              No confidential files, credentials or private customer data in
              this form.
            </p>
          </div>
          <PublicForm kind="ENQUIRY" />
        </div>
      </section>
    </div>
  );
}
