import Link from "next/link";
import type { Metadata } from "next";
import { sprintPackages } from "../../lib/business-sprints";
import { PublicForm } from "../../components/PublicForm";
import "./sprints.css";
export const metadata: Metadata = {
  title: "Business Improvement Sprints",
  description:
    "Bring KXRA one business problem. Get an evidence-backed decision, a practical action plan or a separately scoped implementation project.",
};
export default function BusinessSprints() {
  return (
    <div className="sprint-site">
      <section className="sprint-hero">
        <div className="sprint-hero-copy">
          <p className="eyebrow">KXRA / BUSINESS IMPROVEMENT</p>
          <h1>
            From stuck.
            <br />
            To a clear next move.
          </h1>
          <p>
            One business problem. A focused assessment. A practical plan you can
            act on.
          </p>
          <div className="actions">
            <a className="button light" href="#start">
              Tell us what needs to change ↗
            </a>
            <a className="button ghost" href="#packages">
              Explore packages
            </a>
          </div>
          <p className="sprint-detail">
            Fixed scope · Agreed price · Human review
          </p>
        </div>
        <div className="sprint-sculpture" aria-hidden="true">
          <div className="sprint-orbit orbit-one" />
          <div className="sprint-orbit orbit-two" />
          <div className="sprint-core">
            <span>ASSESS</span>
            <span>DECIDE</span>
            <span>ACT</span>
          </div>
          <div className="sprint-horizon" />
        </div>
      </section>
      <section className="section sprint-intro">
        <p className="eyebrow">A useful outcome, clearly defined</p>
        <h2>Your business does not need another vague report.</h2>
        <p>
          Choose the decision or process that matters now. We investigate the
          situation, challenge the options and organise the next steps around
          your budget, constraints and team.
        </p>
        <div className="sprint-examples">
          <article>
            <h3>Enquiries getting lost?</h3>
            <p>Map the handoffs, response process and follow-up gaps.</p>
          </article>
          <article>
            <h3>Repetitive admin?</h3>
            <p>Compare practical automation options and their ongoing costs.</p>
          </article>
          <article>
            <h3>Unsure what to build?</h3>
            <p>Assess feasibility and define a useful first version.</p>
          </article>
        </div>
        <p className="sprint-detail">
          Examples illustrate the problems we can assess; they are not client
          results.
        </p>
      </section>
      <section className="section" id="packages">
        <p className="eyebrow">Choose a starting point</p>
        <h2>
          Small enough to start.
          <br />
          Specific enough to matter.
        </h2>
        <div className="sprint-packages">
          {sprintPackages.map((item, index) => (
            <article
              key={item.key}
              className={
                index === 1 ? "sprint-package featured" : "sprint-package"
              }
            >
              <span className="eyebrow">
                0{index + 1} /{" "}
                {index === 1 ? "FOCUSED IMPROVEMENT" : "YOUR NEXT STEP"}
              </span>
              <h3>{item.name}</h3>
              <p className="sprint-price">
                {item.priceMinor === null
                  ? "Scoped quote"
                  : `From £${item.priceMinor / 100}`}
              </p>
              <p>{item.summary}</p>
              <ul>
                {item.milestones.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
              <p>{item.turnaround} after agreed inputs</p>
              <Link
                className="button"
                href={`/business-sprints?package=${item.key}#start`}
              >
                Request this package
              </Link>
            </article>
          ))}
        </div>
        <p className="sprint-detail">
          Starting prices guide the conversation. Your proposal sets the exact
          price, deliverables, exclusions, payment terms and deadline. No VAT is
          charged while KXRA is not VAT registered. Implementation and
          subscriptions are separate.
        </p>
      </section>
      <section className="section sprint-method">
        <div>
          <p className="eyebrow">An organised route forward</p>
          <h2>
            Understand.
            <br />
            Agree.
            <br />
            Deliver.
          </h2>
        </div>
        <ol>
          <li>
            <strong>Describe the problem</strong>
            <p>
              Start with a non-confidential summary. We assess fit and ask for
              the missing information.
            </p>
          </li>
          <li>
            <strong>Review your scoped proposal</strong>
            <p>
              See what is included, what we need from you, the exact price and
              how delivery will be assessed.
            </p>
          </li>
          <li>
            <strong>Accept and arrange payment</strong>
            <p>
              Payment instructions follow the agreed proposal. Work starts once
              the required payment and inputs are confirmed.
            </p>
          </li>
          <li>
            <strong>Receive and use the work</strong>
            <p>
              Get the recommendation, working assets and walkthrough. Further
              implementation is separately agreed.
            </p>
          </li>
        </ol>
      </section>
      <section className="section sprint-sample">
        <p className="eyebrow">Inside a useful plan</p>
        <h2>Evidence. Decisions. Action.</h2>
        <div className="sprint-examples">
          <article>
            <h3>What is happening</h3>
            <p>
              Current process, available evidence and questions that still need
              answers.
            </p>
          </article>
          <article>
            <h3>What could change</h3>
            <p>
              Options, costs, dependencies and the trade-offs behind the
              recommendation.
            </p>
          </article>
          <article>
            <h3>What happens next</h3>
            <p>
              Tasks, responsibilities, success measures and a checkpoint to
              continue or change course.
            </p>
          </article>
        </div>
        <p>
          We commit to agreed deliverables and quality. Recommendations do not
          guarantee revenue or eliminate business uncertainty.
        </p>
      </section>
      <section className="section sprint-intake" id="start">
        <div>
          <p className="eyebrow">Start with one problem</p>
          <h2>What would make your business work better?</h2>
          <p>
            Tell us the useful outcome and the constraints. This is a request
            for assessment, with no payment or project commitment.
          </p>
          <p>
            Share confidential evidence through your private workspace after
            onboarding.
          </p>
        </div>
        <PublicForm kind="CUSTOM_PROJECT" sprintIntake />
      </section>
      <section className="section sprint-faq">
        <h2>Before you begin</h2>
        <details>
          <summary>Can I buy the plan without implementation?</summary>
          <p>
            Yes. Decision Review and Business Improvement Sprint are standalone
            engagements. You can execute the recommendations yourself or request
            a separately priced implementation.
          </p>
        </details>
        <details>
          <summary>Will AI make decisions for my business?</summary>
          <p>
            AI may assist research and drafting. Evidence, assumptions and
            recommendations are reviewed. You approve business decisions and
            commitments.
          </p>
        </details>
        <details>
          <summary>What if the scope changes?</summary>
          <p>
            Additional work needs a revised agreement. The proposal states the
            included clarification allowance and delivery conditions.
          </p>
        </details>
        <details>
          <summary>Do I need a platform subscription?</summary>
          <p>
            No subscription is included or required by these starting packages.
            Private delivery access is arranged separately after assessment.
          </p>
        </details>
      </section>
    </div>
  );
}
