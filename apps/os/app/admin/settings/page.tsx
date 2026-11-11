export const metadata = { title: "Admin settings · KXRA" };

const flags = [
  "KXRA_HOSTED_SELF_SERVICE_ENABLED",
  "KXRA_EMAIL_ENABLED",
  "KXRA_LIVE_BILLING_ENTRY_ENABLED",
  "KXRA_LIVE_WEBHOOK_ENABLED",
  "KXRA_MODERN_BILLING_DISPATCH_ENABLED",
  "KXRA_CHECKOUT_RESULT_ENABLED",
  "KXRA_PORTAL_DELIVERY_ENABLED",
  "KXRA_BILLING_ENABLED",
];

export default function AdminSettings() {
  const banner = process.env.KXRA_MAINTENANCE_BANNER || "";
  return (
    <>
      <h1>Settings</h1>
      <p>
        These values are read from the host. This page does not change them and
        does not show secret values. Set them in the Vercel project for the
        private app, then redeploy. Live card charges also need a live Stripe
        secret key, which must never be committed.
      </p>
      <table>
        <thead>
          <tr>
            <th>Flag</th>
            <th>Current value</th>
          </tr>
        </thead>
        <tbody>
          {flags.map((name) => (
            <tr key={name}>
              <td>{name}</td>
              <td>{process.env[name] === "true" ? "On" : "Off"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Pricing shown to customers</h2>
      <p>
        Starter £29, Team £79, Business £199 a month. Decision Review £250.
        Business Improvement Sprint £750. No VAT is added.
      </p>
      <h2>Maintenance banner</h2>
      <p>
        {banner
          ? banner
          : "No banner is set. Set KXRA_MAINTENANCE_BANNER on the host to show one."}
      </p>
    </>
  );
}
