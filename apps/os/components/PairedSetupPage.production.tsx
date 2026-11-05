import Link from "next/link";
export function PairedSetupPage() {
  return (
    <main className="paired-setup">
      <h1>Private agent setup is paused</h1>
      <p>Setup and device activation are not available here.</p>
      <Link href="/os/workspace">Return to rooms</Link>
    </main>
  );
}
