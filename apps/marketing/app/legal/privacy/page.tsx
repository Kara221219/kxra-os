import { PageHero } from "../../../components/PageHero";
import { publication } from "../../../lib/publication";
export default function Privacy() {
  return (
    <>
      <PageHero eyebrow="Review placeholder" title="Privacy information">
        This page is present for build and legal-review workflow. It is not
        approved for production publication.
      </PageHero>
      <section className="section prose">
        <p className="notice">{publication.legalStatus}</p>
        <p>
          Public enquiry submissions are intended to be stored in an owner-only
          KXRA review inbox so KXRA can respond. Final controller identity,
          lawful basis, retention, rights process, subprocessors and contact
          wording require solicitor review before launch.
        </p>
        <p>
          Contact: <a href="mailto:info@kxra-group.com">info@kxra-group.com</a>.
        </p>
      </section>
    </>
  );
}
