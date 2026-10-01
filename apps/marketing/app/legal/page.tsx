import Link from "next/link";
import { PageHero } from "../../components/PageHero";
import { legalApproval, legalPack } from "../../lib/legal";

export default function LegalIndex() {
  return (
    <>
      <PageHero eyebrow="Customer documents" title="Clear terms before launch.">
        The complete KXRA customer-document pack is owner approved and ready for
        controlled activation.
      </PageHero>
      <section className="section">
        <p className="notice">
          Version {legalPack.version} was approved on {legalApproval.approvedOn}
          . Live checkout and customer acceptance remain disabled until staging
          activation and the complete release checks pass.
        </p>
        <div className="card-grid legal-index">
          {legalPack.documents.map((document) => (
            <article className="card" key={document.slug}>
              <p className="number">{document.documentType}</p>
              <h2>{document.title}</h2>
              <p>{document.summary}</p>
              <Link href={`/legal/${document.slug}`}>Read document →</Link>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
