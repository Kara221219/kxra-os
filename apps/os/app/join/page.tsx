import Link from "next/link";
import JoinExchange from "../../components/JoinExchange";

export const dynamic = "force-dynamic";
export const metadata = { referrer: "no-referrer" };

export default function Join() {
  return (
    <main className="join-page">
      <div className="join-card">
        <Link href="/" className="wordmark">
          KXRA<span>OS</span>
        </Link>
        <p className="eyebrow">Invitation-only access</p>
        <h1>Securing your invitation.</h1>
        <p>
          KXRA is validating the one-use invitation before any account or
          project information is shown.
        </p>
        <JoinExchange />
      </div>
    </main>
  );
}
