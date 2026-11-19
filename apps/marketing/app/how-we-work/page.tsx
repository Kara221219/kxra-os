import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How we work",
  alternates: { canonical: "/how-we-work" },
};

export default function HowWeWork() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">HOW WE WORK</p>
      <h1>
        People decide.
        <br />
        The room keeps the record.
      </h1>
      <p className="ref-lead">
        KXRA is a shared workspace. Access follows membership. A model does not
        grant permission, move money, or treat a draft as a decision.
      </p>
      <div className="ref-three">
        <article>
          <span>01</span>
          <h2>Agree the work</h2>
          <p>
            Name the problem, the person responsible, and what done means before
            a tool is connected.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Bring the evidence</h2>
          <p>
            Keep the source with the conversation. The room, not the model,
            decides what a person or agent can see.
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>Review the result</h2>
          <p>
            A recorded decision comes before anything leaves the room. The
            sample on the homepage does not call a model or send a message.
          </p>
        </article>
      </div>
      <p>
        <Link className="ref-button ref-button-sage" href="/solutions">
          Explore solutions →
        </Link>{" "}
        <Link className="ref-text-link" href="/pricing">
          See pricing
        </Link>
      </p>
    </section>
  );
}
