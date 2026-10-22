import { ReferenceCatalog } from "../../components/ReferenceCatalog";
export default function Apps() {
  return (
    <section className="ref-section ref-wrap ref-inner">
      <p className="ref-kicker">KXRA APPS</p>
      <h1>
        A useful starting point.
        <br />
        Your way of working.
      </h1>
      <p className="ref-lead">
        Explore six independently designed samples. Try the workflow, review its
        boundaries and discuss what a persistent version would need.
      </p>
      <ReferenceCatalog kind="apps" />
    </section>
  );
}
