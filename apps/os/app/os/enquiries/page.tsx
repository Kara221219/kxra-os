import { notFound, redirect } from "next/navigation";
import styles from "../../../components/OwnerEnquiryInbox.module.css";
import Shell from "../../../components/Shell";
import EnquiryDocumentBoundary from "../../../components/EnquiryDocumentBoundary";
import OwnerEnquiryInbox from "../../../components/OwnerEnquiryInbox";
import { actor, HttpError, type Actor } from "../../../lib/auth";
import { ownerEnquiries } from "../../../lib/owner-enquiries";
import { localMode } from "../../../../../packages/db";
import {
  enquiryFilters,
  EnquiryParametersError,
} from "../../../../../packages/workspace/owner-enquiry-contract";
export const dynamic = "force-dynamic";
// Exact route owns the inbox; the historical catchall remains unchanged.
export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let a: Actor;
  try {
    a = await actor();
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 401) redirect("/login");
      if (error.code === "TENANT_SELECTION_REQUIRED")
        redirect("/select-organisation");
      if (error.code === "MFA_REQUIRED") redirect("/login/mfa");
      if (error.code === "AGREEMENT_REQUIRED") redirect("/agreements");
      if (error.code === "ONBOARDING_REQUIRED") redirect("/onboarding");
    }
    return (
      <main className="login">
        <h1>Access unavailable</h1>
        <a href="/login">Return to sign in</a>
      </main>
    );
  }
  if (a.security_role !== "KXRA_OWNER" || a.organisation_kind !== "KXRA")
    notFound();
  let content;
  try {
    const filters = enquiryFilters(await searchParams);
    content = (
      <OwnerEnquiryInbox
        className={styles.inbox}
        filters={filters}
        result={await ownerEnquiries(a, filters)}
      />
    );
  } catch (error) {
    if (
      error instanceof EnquiryParametersError &&
      error.message === "Choose a valid enquiry."
    )
      notFound();
    if (
      error instanceof HttpError &&
      (error.status === 403 || error.status === 404)
    )
      notFound();
    content = (
      <section role="status">
        <h2>
          {error instanceof EnquiryParametersError
            ? "Check the inbox filters"
            : "Enquiries temporarily unavailable"}
        </h2>
        <p>
          {error instanceof EnquiryParametersError
            ? error.message
            : "The inbox could not be loaded. No enquiry counts are shown."}
        </p>
        <a href="/os/enquiries">Open the inbox again</a>
      </section>
    );
  }
  return (
    <Shell actor={a} active="enquiries" local={localMode()} documentNavigation>
      <div className="page-heading">
        <div>
          <p className="eyebrow">KXRA owner · Read only</p>
          <h1>Website enquiries</h1>
          <p>Private website submissions for your selected organisation.</p>
        </div>
      </div>
      <EnquiryDocumentBoundary>{content}</EnquiryDocumentBoundary>
    </Shell>
  );
}
