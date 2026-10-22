import { IntegrationDirectory } from "../../components/IntegrationDirectory";
export default function Integrations() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">CONNECTIONS WITH CONTEXT</p>
      <h1>
        Your tools.
        <br />
        Your access boundary.
      </h1>
      <p className="ref-lead">
        Review the account, data and operation a workflow would need. These are
        connection designs and capability explanations, not a claim that a
        provider is live.
      </p>
      <IntegrationDirectory />
    </section>
  );
}
