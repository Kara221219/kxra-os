import { PageHero } from "../../../components/PageHero";
import { publication } from "../../../lib/publication";
export default function Terms() {
  return (
    <>
      <PageHero eyebrow="Review placeholder" title="Website terms">
        This page reserves the public route while exact legal wording is
        reviewed.
      </PageHero>
      <section className="section prose">
        <p className="notice">{publication.legalStatus}</p>
        <p>
          No subscription, custom-project contract, guarantee or service
          commitment is offered by this preview build. Final website and service
          terms require solicitor and owner approval before activation.
        </p>
      </section>
    </>
  );
}
