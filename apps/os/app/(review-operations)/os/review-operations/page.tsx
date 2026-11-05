import Link from "next/link";
import { actor } from "../../../../lib/auth";
import { reviewOperationsConfiguration } from "../../../../lib/review-operations";
import EligibilityReviewLoader from "../../../../components/EligibilityReviewLoader";
export const dynamic = "force-dynamic";
export default async function ReviewOperationsPage() {
  try {
    const a = await actor();
    if (a.security_role !== "KXRA_OWNER" || a.organisation_kind !== "KXRA")
      return (
        <main>
          <h1>Eligibility reviews</h1>
          <p>Review access unavailable.</p>
          <Link href="/os">Return to workspace</Link>
        </main>
      );
    return (
      <main className="page-content">
        <h1>Eligibility reviews</h1>
        <p>
          This console records independent human review under an explicitly
          approved policy. It does not verify a provider account or payment by
          itself.
        </p>
        {reviewOperationsConfiguration() ? (
          <EligibilityReviewLoader />
        ) : (
          <p>
            Review operations are not configured. No review grant is implied by
            workspace ownership.
          </p>
        )}
        <Link href="/os">Return to workspace</Link>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Eligibility reviews</h1>
        <p>Sign in with current reviewer access and MFA to continue.</p>
        <Link href="/login">Sign in</Link>
      </main>
    );
  }
}
