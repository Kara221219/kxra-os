import Link from "next/link";
import { PageHero } from "../../components/PageHero";
import { publication } from "../../lib/publication";

export default function Platform() {
  return (
    <>
      <PageHero
        eyebrow="KXRA OS"
        title="One place to move business work forward."
      >
        KXRA OS brings structured projects, evidence, controlled AI and reusable
        tools into one permission-aware workspace.
      </PageHero>
      <section className="section">
        <div className="card-grid">
          {publication.capabilities.map((item) => (
            <article className="card" key={item.name}>
              <span className="status">{item.status}</span>
              <h2>{item.name}</h2>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
        <div className="actions">
          <Link className="button" href="/partner">
            Register your interest
          </Link>
          <Link className="button ghost" href="/custom-projects">
            Discuss a custom project
          </Link>
        </div>
      </section>
    </>
  );
}
