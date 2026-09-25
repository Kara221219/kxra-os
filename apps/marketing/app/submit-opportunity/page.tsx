import { PageHero } from "../../components/PageHero";
import { NoScriptContact } from "../../components/NoScriptContact";
import { PublicForm } from "../../components/PublicForm";

export default function SubmitOpportunity() {
  return (
    <>
      <PageHero
        eyebrow="Custom project intake"
        title="What should KXRA help you solve?"
      >
        Describe the business need and useful outcome at a non-confidential
        level. Submissions enter a private, unverified review inbox.
      </PageHero>
      <section className="section form-shell">
        <NoScriptContact />
        <PublicForm kind="CUSTOM_PROJECT" />
      </section>
    </>
  );
}
