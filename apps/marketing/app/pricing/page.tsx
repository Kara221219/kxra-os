import type { Metadata } from "next";
import Link from "next/link";
import { approvedCatalogue } from "../../../../packages/workspace/approved-catalogue";
import { sprintPackages } from "../../lib/business-sprints";

export const metadata: Metadata = {
  title: "Pricing",
  alternates: { canonical: "/pricing" },
};

const pounds = (minor: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(minor / 100);

export default function Pricing() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">PRICING</p>
      <h1>Workspace plans</h1>
      <p className="ref-lead">
        One price for the workspace, not a charge per person inside the limit.
        You bring your own model accounts, so the software price does not
        include model usage. The founding price for one organisation is £29 a
        month or £290 a year. KXRA is not VAT registered, and VAT is not added.
      </p>
      <div className="ref-three">
        {approvedCatalogue.map((plan) => (
          <article key={plan.offer_key}>
            <h2>{plan.name.replace("KXRA ", "")}</h2>
            <p>
              {pounds(plan.monthly_amount_minor)} a month for up to{" "}
              {plan.people} {plan.people === 1 ? "person" : "people"}.
            </p>
            <p>Rooms, reviewed drafts, and the agents you connect.</p>
            <Link
              className="ref-button ref-button-sage"
              href="/#request-access"
            >
              Request this plan
            </Link>
          </article>
        ))}
      </div>
      <h2>Separate services</h2>
      <div className="ref-three">
        {sprintPackages.map((item) => (
          <article key={item.key}>
            <h3>{item.name}</h3>
            <p>
              {item.priceMinor === null
                ? "Quoted after the scope is agreed."
                : `${pounds(item.priceMinor)}. ${item.summary}`}
            </p>
            <Link
              className="ref-text-link"
              href={
                item.key === "implementation"
                  ? "/custom-projects"
                  : `/business-sprints#${item.key === "decision-review" ? "decision-review" : "packages"}`
              }
            >
              {item.priceMinor === null
                ? "Discuss a scoped project"
                : "Request this service"}
            </Link>
          </article>
        ))}
      </div>
      <p>
        Requesting a plan sends an enquiry. It does not open a card payment or
        create a subscription. Stripe checkout is used only after the business
        Stripe account is connected, and live charges stay switched off until
        that account is approved.
      </p>
      <p>
        <Link href="/approach">See how we work</Link>
      </p>
    </section>
  );
}
