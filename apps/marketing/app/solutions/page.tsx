import { SolutionDirectory } from "../../components/SolutionDirectory";
export default function Solutions() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">WAYS TO WORK</p>
      <h1>
        Start with the work.
        <br />
        Keep the context.
      </h1>
      <p className="ref-lead">
        A customer question, a team handoff or a useful internal tool. Choose
        the outcome and review the boundary before connecting anything.
      </p>
      <SolutionDirectory />
    </section>
  );
}
