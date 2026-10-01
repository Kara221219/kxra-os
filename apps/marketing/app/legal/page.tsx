import Link from "next/link";
import { PageHero } from "../../components/PageHero";
import { legalPack } from "../../lib/legal";

export default function LegalIndex() {
  return (
    <>
      <PageHero eyebrow="Customer documents" title="Clear terms before launch.">
        The complete KXRA customer-document pack is available for owner review.
      </PageHero>
      <section className="section">
        <p className="notice">
          Version {legalPack.version} is a draft. Live checkout and agreement
          acceptance remain disabled until the owner approves the exact content
          and immutable hashes.
        </p>
        <div className="card-grid legal-index">
          {legalPack.documents.map((document) => (
            <article className="card" key={document.slug}>
              <p className="number">{document.documentType}</p>
              <h2>{document.title}</h2>
              <p>{document.summary}</p>
              <Link href={`/legal/${document.slug}`}>Review draft →</Link>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
