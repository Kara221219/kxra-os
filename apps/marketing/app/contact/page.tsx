import { PageHero } from "../../components/PageHero";
import { NoScriptContact } from "../../components/NoScriptContact";
import { PublicForm } from "../../components/PublicForm";

export default function Contact() {
  return (
    <>
      <PageHero eyebrow="Contact" title="Start a conversation with KXRA.">
        Use this form for a general enquiry. Do not include passwords,
        credentials, special-category personal data or confidential project
        files.
      </PageHero>
      <section className="section form-shell">
        <NoScriptContact />
        <PublicForm kind="CONTACT" />
      </section>
    </>
  );
}
