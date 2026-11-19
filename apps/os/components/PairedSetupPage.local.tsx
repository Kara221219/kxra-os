import Link from "next/link";
import { pairedSetupPageData } from "#kxra/paired-setup-runtime";
import { PairedSetupForm } from "./PairedSetupForm";
export async function PairedSetupPage() {
  const data = await pairedSetupPageData();
  return (
    <main className="paired-setup">
      <p className="eyebrow">KXRA · local preview</p>
      <h1>Prepare a private agent</h1>
      <p>
        This synthetic preview saves setup requests only. Agents stay disabled;
        no account keys or device credentials are issued.
      </p>
      {data ? (
        <PairedSetupForm initial={data} />
      ) : (
        <section aria-label="Setup unavailable">
          <h2>Local setup unavailable</h2>
          <p>
            A current, authorised local session and room membership are
            required.
          </p>
        </section>
      )}
      <Link href="/os/workspace">Return to rooms</Link>
    </main>
  );
}
