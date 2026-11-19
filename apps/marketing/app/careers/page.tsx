import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Careers",
  alternates: { canonical: "/careers" },
};

export default function Careers() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">CAREERS</p>
      <h1>No open roles</h1>
      <p className="ref-lead">
        KXRA is not hiring. There is no application form and no list of jobs,
        because none are open.
      </p>
      <p>
        If you still want to write to us, use{" "}
        <Link href="/lets-connect">Let’s connect</Link> or email{" "}
        <a href="mailto:info@kxra-group.com">info@kxra-group.com</a>.
      </p>
    </section>
  );
}
