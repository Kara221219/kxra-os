import Link from "next/link";
import { PageHero } from "../../components/PageHero";

export default function CustomProjects() {
  return (
    <>
      <PageHero
        eyebrow="Separate scope and price"
        title="Bring KXRA a business need, issue or opportunity."
      >
        A custom project starts with evidence and scope. It is reviewed and
        priced separately from platform subscription access.
      </PageHero>
      <section className="section split">
        <div className="prose">
          <h2>How it works</h2>
          <ol>
            <li>Submit the need and the outcome you are seeking.</li>
            <li>
              KXRA reviews fit, constraints, evidence and unresolved questions.
            </li>
            <li>
              If appropriate, KXRA prepares a scoped proposal with boundaries,
              milestones and separate pricing.
            </li>
            <li>
              Work begins only after the proposal and required agreements are
              accepted.
            </li>
          </ol>
        </div>
        <div className="card">
          <p className="eyebrow">Clear boundary</p>
          <h2>Subscription access does not include custom implementation.</h2>
          <p>
            No submission guarantees acceptance, timing, result or fixed price.
            Confidential material should be shared only through an approved
            private workspace after onboarding.
          </p>
          <Link className="button" href="/submit-opportunity">
            Submit an opportunity
          </Link>
        </div>
      </section>
    </>
  );
}
