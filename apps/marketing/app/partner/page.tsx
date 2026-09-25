import { PageHero } from "../../components/PageHero";
import { NoScriptContact } from "../../components/NoScriptContact";
import { PublicForm } from "../../components/PublicForm";

export default function Partner() {
  return (
    <>
      <PageHero
        eyebrow="Partner and customer discovery"
        title="Help shape a platform businesses will use."
      >
        Tell KXRA about your organisation and the recurring work you want to
        improve. Access remains invitation-led during private preview.
      </PageHero>
      <section className="section form-shell">
        <NoScriptContact />
        <PublicForm kind="ENQUIRY" />
      </section>
    </>
  );
}
