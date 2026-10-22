import { HelpCenter } from "../../components/HelpCenter";
export default function Help() {
  return (
    <section className="ref-section ref-wrap ref-inner help-index">
      <p className="ref-kicker">KXRA HELP CENTER</p>
      <h1>
        What would you
        <br />
        like to work through?
      </h1>
      <p className="ref-lead">
        Practical guidance for workspace access, shared context and deliberate
        next steps.
      </p>
      <HelpCenter />
    </section>
  );
}
