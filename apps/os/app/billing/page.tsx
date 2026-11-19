import { checkoutResultConfiguration } from "../../../../packages/authz/checkout-result-controller";
import { portalDeliveryConfiguration } from "../../../../packages/authz/portal-delivery";
import Link from "next/link";
import BusinessAdmission from "../../components/BusinessAdmission";
import LiveBillingEntry from "../../components/LiveBillingEntry";
import { liveEntryController } from "../../lib/live-billing-entry";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export default async function BillingPage() {
  try {
    const status = await liveEntryController().read();
    return (
      <main>
        <h1>Workspace billing</h1>
        <BusinessAdmission />
        <LiveBillingEntry
          initial={status}
          checkoutResultAvailable={Boolean(checkoutResultConfiguration())}
          portalAvailable={Boolean(portalDeliveryConfiguration())}
        />
        <p>
          <Link href="/os">Return to workspace</Link>
        </p>
      </main>
    );
  } catch {
    return (
      <main>
        <h1>Workspace billing</h1>
        <p>
          Payment setup is unavailable. Sign in to your customer workspace or
          return later.
        </p>
        <p>
          <Link href="/login">Sign in</Link> ·{" "}
          <Link href="/os">Return to workspace</Link>
        </p>
      </main>
    );
  }
}
