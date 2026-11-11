import { actor } from "../../../lib/auth";
import { loadBillingMirror } from "../../../lib/platform-admin";

export const metadata = { title: "Admin billing · KXRA" };

export default async function AdminBilling() {
  const rows = (await loadBillingMirror(await actor())) as {
    provider_subscription_id: string;
    state: string;
    organisation: string;
    currency: string;
    amount_minor: number;
    billing_interval: string;
  }[];
  return (
    <>
      <h1>Billing</h1>
      <p>
        These rows are the subscriptions already stored from verified Stripe
        webhooks. Refunds and new charges are not available here. Open the
        subscription in Stripe to change money.
      </p>
      <table>
        <thead>
          <tr>
            <th>Organisation</th>
            <th>State</th>
            <th>Price</th>
            <th>Stripe</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.provider_subscription_id}>
              <td>{row.organisation}</td>
              <td>{row.state}</td>
              <td>
                {row.currency} {Number(row.amount_minor) / 100} /{" "}
                {row.billing_interval}
              </td>
              <td>
                <a
                  href={`https://dashboard.stripe.com/subscriptions/${encodeURIComponent(row.provider_subscription_id)}`}
                >
                  Open in Stripe
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p>No subscription webhooks have been stored yet.</p>
      )}
    </>
  );
}
