import type { Metadata } from "next";
import { PublicForm } from "../../components/PublicForm";

export const metadata: Metadata = {
  title: "Let’s connect",
  alternates: { canonical: "/lets-connect" },
};

export default function LetsConnect() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">LET’S CONNECT</p>
      <h1>Tell us what you want to work on.</h1>
      <p className="ref-lead">
        This form records a message for KXRA. It does not create an account,
        start a subscription, or take a card payment.
      </p>
      <PublicForm
        kind="CONTACT"
        sourcePath="/contact"
        pagePath="/lets-connect"
      />
    </section>
  );
}
