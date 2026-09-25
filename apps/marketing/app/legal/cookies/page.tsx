import { PageHero } from "../../../components/PageHero";
import { publication } from "../../../lib/publication";
export default function Cookies() {
  return (
    <>
      <PageHero eyebrow="Review placeholder" title="Cookie information">
        The current marketing build does not activate analytics or advertising
        cookies.
      </PageHero>
      <section className="section prose">
        <p className="notice">{publication.legalStatus}</p>
        <p>
          Required final wording and any consent controls will be based on the
          exact production technologies enabled at launch. Analytics remains
          disabled in this preview.
        </p>
      </section>
    </>
  );
}
