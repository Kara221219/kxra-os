import Link from "next/link";
import { pairedSetupPageData } from "#kxra/paired-setup-runtime";
export async function PairedSetupPage() {
  const data = await pairedSetupPageData();
  if (!data)
    return (
      <main className="paired-setup">
        <h1>Private agent setup is paused</h1>
        <p>Setup and device activation are not available here.</p>
        <Link href="/os/workspace">Return to rooms</Link>
      </main>
    );
  const { PairedSetupForm } = await import("./PairedSetupForm");
  return (
    <main className="paired-setup">
      <p className="eyebrow">KXRA · private agents</p>
      <h1>Prepare a private agent</h1>
      <p>
        This saves a setup request only. Your agent stays disabled until device
        connection and the required reviews are complete. No device credentials
        are issued here.
      </p>
      <PairedSetupForm initial={data} />
      <Link href="/os/workspace">Return to rooms</Link>
    </main>
  );
}
