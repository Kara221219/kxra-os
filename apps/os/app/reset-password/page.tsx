import Link from "next/link";
import {
  PasswordResetConfirmForm,
  PasswordResetRequestForm,
} from "../../components/PasswordResetForms";

export const dynamic = "force-dynamic";

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;
  const validToken =
    token && /^[A-Za-z0-9_-]{32,100}$/.test(token) ? token : undefined;
  return (
    <main className="login">
      <Link href="/" className="wordmark">
        KXRA<span>OS</span>
      </Link>
      <p className="eyebrow">Account recovery</p>
      <h1>{validToken ? "Choose a new password." : "Reset your password."}</h1>
      <p>
        {validToken
          ? "The authentication provider will validate this time-limited reset."
          : "The response is identical whether or not an eligible account exists."}
      </p>
      {validToken ? (
        <PasswordResetConfirmForm token={validToken} />
      ) : (
        <PasswordResetRequestForm />
      )}
      <p style={{ marginTop: 24 }}>
        <Link href="/login">Return to sign in</Link>
      </p>
    </main>
  );
}
