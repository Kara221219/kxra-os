import { actor } from "../../../lib/auth";
import { loadPlatformAdmin } from "../../../lib/platform-admin";

export const metadata = { title: "Admin health · KXRA" };

export default async function AdminHealth() {
  const data = await loadPlatformAdmin(await actor());
  const deploy =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "This process was not started by a Vercel deployment, so no deploy id is available.";
  const emailOn = process.env.KXRA_EMAIL_ENABLED === "true";
  const resend = Boolean(process.env.RESEND_API_KEY);
  return (
    <>
      <h1>System health</h1>
      <p>Latest deploy: {deploy}</p>
      <p>
        Email delivery is {emailOn && resend ? "configured" : "not connected"}.
        The latest deploy is the release currently serving this app. This screen
        does not call Resend or Stripe.
      </p>
      <h2>Email outbox</h2>
      <ul>
        {data.email.map((row) => (
          <li key={row.state}>
            {row.state}: {row.count}
          </li>
        ))}
      </ul>
      <h2>Stripe webhook processing</h2>
      <ul>
        {data.webhooks.map((row) => (
          <li key={row.state}>
            {row.state}: {row.count}
          </li>
        ))}
      </ul>
      {data.webhooks.length === 0 && <p>No webhook receipts stored.</p>}
    </>
  );
}
