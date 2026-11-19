import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About us",
  alternates: { canonical: "/about-us" },
};

export default function AboutUs() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">ABOUT US</p>
      <h1>KXRA Group</h1>
      <p className="ref-lead">
        KXRA Group builds a private workspace where a team and the agents they
        choose work from the same room. The company is based in the United
        Kingdom and is not VAT registered.
      </p>
      <h2>What the product does today</h2>
      <ul>
        <li>Shared rooms, with membership checked on every request.</li>
        <li>Drafts from a model the customer connects and pays for.</li>
        <li>Approvals before a consequential action.</li>
        <li>
          Decision Review as a scoped service at £250, tracked from the request
          through delivery.
        </li>
      </ul>
      <h2>What we do not claim</h2>
      <p>
        There is no catalogue of thousands of live integrations, no included
        model credits, and no customer results invented for this page.
      </p>
      <p>
        <Link className="ref-button ref-button-sage" href="/lets-connect">
          Let’s connect →
        </Link>
      </p>
    </section>
  );
}
