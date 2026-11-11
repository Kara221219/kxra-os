"use client";

import Link from "next/link";

export default function MarketingError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <h1>This page could not be shown.</h1>
      <p>Nothing was charged and no message was sent.</p>
      <p>
        <button
          className="ref-button ref-button-sage"
          type="button"
          onClick={() => reset()}
        >
          Try again
        </button>{" "}
        <Link href="/">Back to the homepage</Link>
      </p>
    </section>
  );
}
