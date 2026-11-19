import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refunds",
  description:
    "How KXRA handles cancellation and refunds for workspace plans and fixed services.",
  alternates: { canonical: "/legal/refunds" },
};

export default function Refunds() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">LEGAL</p>
      <h1>Refunds and cancellation</h1>
      <p className="ref-lead">
        KXRA is not VAT registered. The prices on the pricing page are the full
        prices. A workspace plan renews each month until you cancel.
        Cancellation takes effect at the end of the period already paid. Fees
        for a period that has started are not refunded, except for a duplicate
        charge, a charge KXRA made in error, a legal requirement, or a remedy
        KXRA agrees in writing for a serious service failure.
      </p>
      <p>
        Decision Review (£250) and a Business Improvement Sprint (£750) are
        fixed services. They are refunded in full if KXRA has not started the
        work. After work has started, the refund is limited to the unused
        portion KXRA confirms in writing. Implementation projects follow the
        signed proposal.
      </p>
      <p>
        Ask for a refund from the support page inside your workspace, or email
        info@kxra-group.com. KXRA does not take refunds from a button in the
        owner admin. Card refunds are issued in Stripe.
      </p>
      <p>
        <Link href="/legal/terms">Terms</Link> ·{" "}
        <Link href="/pricing">Pricing</Link>
      </p>
    </section>
  );
}
