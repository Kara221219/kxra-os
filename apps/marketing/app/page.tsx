import Link from "next/link";
import { publication } from "../lib/publication";

const layers = [
  [
    "01",
    "Business context",
    "Start with the company, customer, evidence and actual constraint.",
    publication.industries.slice(0, 3),
  ],
  [
    "02",
    "Reusable capability",
    "Bring structured research, brand knowledge, decisions and project delivery into one controlled workspace.",
    ["Research", "Brand", "Projects", "Knowledge"],
  ],
  [
    "03",
    "Controlled AI",
    "Give each specialist a defined role, bounded tools and a human approval boundary.",
    ["Scoped context", "Run logs", "Approvals", "QA"],
  ],
  [
    "04",
    "Measurable outcome",
    "Track evidence, work, costs and decisions so useful progress can be inspected and repeated.",
    ["Experiments", "Metrics", "Finance", "Continuity"],
  ],
] as const;

export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="hero-inner">
          <p className="eyebrow">KXRA Group · business operating platform</p>
          <h1>Make AI useful to the business.</h1>
          <p className="hero-copy">
            {publication.brand.summary} The platform is being prepared for
            controlled customer onboarding.
          </p>
          <div className="actions">
            <Link className="button light" href="/platform">
              Explore the platform
            </Link>
            <Link className="button ghost" href="/submit-opportunity">
              Bring us a business need
            </Link>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-lead">
          <div>
            <p className="eyebrow">A practical starting point</p>
            <h2>Tools for recurring work. A route for work that is unique.</h2>
          </div>
          <p>
            Use a shared KXRA capability where it fits. When the problem needs
            discovery, integration or a bespoke build, submit it as a separately
            scoped custom project.
          </p>
        </div>
        <div className="card-grid">
          {publication.capabilities.map((item, index) => (
            <article className="card" key={item.name}>
              <p className="number">0{index + 1}</p>
              <span className="status">{item.status}</span>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="layers" aria-labelledby="layers-title">
        <div className="layer-track">
          <div className="section-lead">
            <div>
              <p className="eyebrow">One operating core</p>
              <h2 id="layers-title">
                Built to move through different business contexts.
              </h2>
            </div>
            <p>
              These industries are examples of applicability. They are not
              customer or outcome claims.
            </p>
          </div>
          {layers.map(([index, title, copy, tags]) => (
            <article className="layer" key={index}>
              <p className="layer-index">PLANE {index}</p>
              <div>
                <h2>{title}</h2>
                <p>{copy}</p>
                <ul className="layer-tags">
                  {tags.map((tag) => (
                    <li key={tag}>{tag}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="section">
        <div className="section-lead">
          <div>
            <p className="eyebrow">Governance by design</p>
            <h2>Permission, evidence and approval stay visible.</h2>
          </div>
          <p>
            KXRA separates project access, records AI runs, and holds
            consequential actions for explicit approval. Connected provider
            capabilities remain disabled until they pass staged review.
          </p>
        </div>
        <div className="card-grid">
          {publication.principles.map((principle, index) => (
            <article className="card" key={principle}>
              <p className="number">CONTROL 0{index + 1}</p>
              <h3>{principle}</h3>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
