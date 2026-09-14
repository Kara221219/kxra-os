import Link from "next/link";
import { RedeemInvitationForm } from "../../components/Forms";

export const dynamic = "force-dynamic";

export default async function Redeem({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  return (
    <main className="login">
      <Link href="/" className="wordmark">
        KXRA<span>OS</span>
      </Link>
      <h1>Redeem an invitation.</h1>
      <p>
        Sign in with the exact verified email named by the invitation, then
        enter its one-time token. The database grants only the approved project
        role.
      </p>
      <RedeemInvitationForm initialToken={token} />
      <p>
        <Link href="/login">Sign in first</Link>
      </p>
    </main>
  );
}
