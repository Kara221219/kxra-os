import Link from "next/link";

export default function NotFound() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">404</p>
      <h1>That page is not on this site.</h1>
      <p className="ref-lead">
        The address may have changed. You can go back to the homepage, look at
        pricing, or write to us.
      </p>
      <p>
        <Link className="ref-button ref-button-sage" href="/">
          Back to the homepage
        </Link>{" "}
        <Link href="/pricing">Pricing</Link> ·{" "}
        <Link href="/contact">Contact</Link>
      </p>
    </section>
  );
}
