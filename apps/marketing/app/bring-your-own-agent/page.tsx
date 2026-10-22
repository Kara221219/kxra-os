import Link from "next/link";
export default function BringAgent() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">YOUR CHOICE OF AGENT</p>
      <h1>
        Your agent.
        <br />
        Your team’s context.
      </h1>
      <p className="ref-lead">
        An external agent needs a verified identity, a bounded task and a
        visible handoff. Pairing, expiry and revocation must pass acceptance
        before hosted execution is offered.
      </p>
      <div className="ref-three">
        {[
          [
            "Pair deliberately",
            "Use an authorised, expiring identity. A public page does not pair a device or inherit its files and credentials.",
          ],
          [
            "Scope the work",
            "Choose the room, task and permitted sources. The caller’s text cannot broaden its authority.",
          ],
          [
            "Review the handoff",
            "Record a result, respect revocation and reconcile uncertain external effects before retrying.",
          ],
        ].map(([title, copy], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <h2>{title}</h2>
            <p>{copy}</p>
          </article>
        ))}
      </div>
      <div className="ref-filter-row">
        <Link className="ref-button" href="/resources/developers">
          Read the developer boundary ↗
        </Link>
        <Link className="ref-button ref-button-outline" href="/#request-access">
          Discuss your workflow ↗
        </Link>
      </div>
      <p className="ref-caption">
        No executable CLI or native-agent download is offered by this public
        site. A real bridge is an implementation and acceptance task.
      </p>
    </section>
  );
}
