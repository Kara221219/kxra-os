import Link from "next/link";
import {
  ImmersiveJourney,
  type JourneyChapter,
} from "../components/ImmersiveJourney";
import { publication } from "../lib/publication";

const journey: readonly JourneyChapter[] = [
  {
    index: "01",
    eyebrow: "Context · professional services · technology",
    title: "See the business before asking AI to act.",
    copy: "KXRA starts with the company, customer, evidence and real constraint. The operating context becomes the boundary for research, decisions and delivery.",
    tags: ["Business context", "Evidence", "Research", "Decisions"],
    signal: "Context established",
  },
  {
    index: "02",
    eyebrow: "Property · hospitality · place",
    title: "Turn complex opportunities into governed projects.",
    copy: "Property and hospitality work can move from an early idea into assumptions, experiments, risks, partners and an explicit next gate—without presenting exploration as proven demand.",
    tags: ["Property", "Hospitality", "Partners", "Experiments"],
    signal: "Opportunity structured",
  },
  {
    index: "03",
    eyebrow: "Retail · e-commerce · health services",
    title: "Build reusable capability around real work.",
    copy: "Brand knowledge, customer needs, approved source material and project evidence can support repeatable tools while custom needs remain separately scoped and priced.",
    tags: ["Brand Studio", "Commerce", "Knowledge", "Custom projects"],
    signal: "Capability assembled",
  },
  {
    index: "04",
    eyebrow: "Measurement · learning · controlled AI",
    title: "Improve the system from measured outcomes.",
    copy: "KXRA connects ideas, experiments, results and decisions. Specialist AI can identify the next improvement signal, while project access, budgets, releases and consequential action stay under explicit control.",
    tags: ["Outcomes", "Experiments", "Run history", "Approvals"],
    signal: "Learning governed",
  },
];

export default function Home() {
  return (
    <>
      <section className="hero home-hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-circuit hero-circuit-left" aria-hidden="true" />
        <div className="hero-circuit hero-circuit-right" aria-hidden="true" />
        <div className="hero-inner">
          <p className="eyebrow">
            KXRA Group · AI-native venture and business platform
          </p>
          <h1>Ideas take shape.</h1>
          <p className="hero-copy">
            Move from business need to evidence, capability and controlled
            delivery in one operating system.
          </p>
          <div className="actions">
            <Link className="button light" href="/platform">
              Explore the platform
            </Link>
            <Link className="button ghost" href="/submit-opportunity">
              Bring us a business need
            </Link>
          </div>
          <p className="hero-proof">
            Context <span /> Connections <span /> Capabilities <span /> Control
          </p>
        </div>
        <div className="hero-object" aria-hidden="true">
          <div className="hero-object-frame">
            <div className="hero-prism">
              <i />
              <i />
              <i />
            </div>
            <div className="hero-object-label">
              <span>KXRA OS</span>
              <small>OPERATING CORE</small>
            </div>
          </div>
        </div>
        <a className="scroll-cue" href="#journey-title">
          Enter the operating journey <span aria-hidden="true">↓</span>
        </a>
      </section>
      <section className="section proposition-section">
        <div className="section-lead">
          <div>
            <p className="eyebrow">One platform · two ways to work</p>
            <h2>Use a proven tool. Build what your business uniquely needs.</h2>
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
      <ImmersiveJourney chapters={journey} />
      <section className="section governance-section">
        <div className="section-lead">
          <div>
            <p className="eyebrow">Governance by design</p>
            <h2>Permission, evidence and approval stay visible.</h2>
          </div>
          <p>
            KXRA separates project access, records AI runs, surfaces measured
            improvement signals, and holds consequential actions for explicit
            approval. Connected provider capabilities remain disabled until they
            pass staged review.
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
        <div className="final-cta">
          <p className="eyebrow">Start with the need</p>
          <h2>Bring KXRA the problem worth solving.</h2>
          <p>
            Explore the shared platform or submit a custom project for separate
            discovery, scope and commercial review.
          </p>
          <div className="actions">
            <Link className="button light" href="/submit-opportunity">
              Start a project
            </Link>
            <Link className="button ghost" href="/contact">
              Contact KXRA
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
