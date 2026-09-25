import { PageHero } from "../../components/PageHero";

export default function About() {
  return (
    <>
      <PageHero
        eyebrow="KXRA Group"
        title="An AI-native venture group building useful operating capability."
      >
        KXRA develops reusable business tools and separately scoped ventures and
        customer projects through one governed operating system.
      </PageHero>
      <section className="section prose">
        <h2>How KXRA works</h2>
        <p>
          KXRA starts with context, connects evidence and people, applies
          bounded capabilities, and keeps cadence, control, confidence,
          compliance and continuity visible.
        </p>
        <p>
          The company is building its platform in controlled stages. Current
          public descriptions distinguish working private-preview foundations
          from connected or published capabilities.
        </p>
        <h2>Operating principles</h2>
        <ul>
          <li>Evidence is classified and its limits remain visible.</li>
          <li>Database policy, rather than an AI model, determines access.</li>
          <li>Consequential actions require a defined approval boundary.</li>
          <li>
            Financial calculations use deterministic code and reviewed data.
          </li>
          <li>
            Projects have explicit hard stops when evidence or authority is
            missing.
          </li>
        </ul>
      </section>
    </>
  );
}
