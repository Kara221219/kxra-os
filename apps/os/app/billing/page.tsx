import Link from "next/link";
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
        <LiveBillingEntry initial={status} />
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
          Billing entry is unavailable. Sign in to your verified customer
          workspace; live billing remains disabled until its release checks are
          complete.
        </p>
        <p>
          <Link href="/login">Sign in</Link> ·{" "}
          <Link href="/os">Return to workspace</Link>
        </p>
      </main>
    );
  }
}
