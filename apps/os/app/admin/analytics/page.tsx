import { actor } from "../../../lib/auth";
import { loadPlatformAdmin } from "../../../lib/platform-admin";

export const metadata = { title: "Admin analytics · KXRA" };

export default async function AdminAnalytics() {
  const data = await loadPlatformAdmin(await actor());
  const verified = data.accounts
    .filter((row) =>
      ["EMAIL_VERIFIED", "ONBOARDING", "ACTIVE"].includes(row.state),
    )
    .reduce((sum, row) => sum + row.count, 0);
  return (
    <>
      <h1>Analytics</h1>
      <p>
        This view uses records KXRA already stores. It does not set a cookie.
        Page views, top pages and traffic sources are not stored. Adding that
        table would be a new migration, and the release check rejects any
        migration file that is not already in its locked list. No third-party
        analytics cookie is set.
      </p>
      <ol>
        <li>Accounts created in 30 days: {data.signups.d30}</li>
        <li>Verified, onboarding or active accounts: {verified}</li>
        <li>Active subscriptions: {data.billing.active}</li>
      </ol>
    </>
  );
}
