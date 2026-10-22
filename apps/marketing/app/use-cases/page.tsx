import { UseCaseExplorer } from "../../components/UseCaseExplorer";
export default function UseCases() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">ONE WORKSPACE, DIFFERENT WORK</p>
      <h1>
        One useful outcome.
        <br />A deliberate next step.
      </h1>
      <p className="ref-lead">
        Explore a scenario, an illustrative industry workflow or a connection
        boundary. Try the sample before discussing a real implementation.
      </p>
      <UseCaseExplorer />
    </section>
  );
}
