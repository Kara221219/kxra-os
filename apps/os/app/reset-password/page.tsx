import Link from "next/link";
import {
  PasswordResetConfirmForm,
  PasswordResetRequestForm,
} from "../../components/PasswordResetForms";
import { HostedPasswordReset } from "../../components/HostedPasswordReset";
import { localMode } from "../../../../packages/db";

export const dynamic = "force-dynamic";

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;
  const localToken =
    token && /^[A-Za-z0-9_-]{32,100}$/.test(token) ? token : undefined;
  const local = localMode();
  const canConfirm = Boolean(localToken);
  return (
    <main className="login">
      <Link href="/" className="wordmark">
        KXRA<span>OS</span>
      </Link>
      <p className="eyebrow">Account recovery</p>
      <h1>
        {local && canConfirm
          ? "Choose a new password."
          : "Reset your password."}
      </h1>
      <p>
        {local && canConfirm
          ? "The authentication provider will validate this time-limited reset."
          : "Request a secure link, or choose a new password after opening a valid link."}
      </p>
      {local && canConfirm ? (
        <PasswordResetConfirmForm token={localToken} />
      ) : local ? (
        <PasswordResetRequestForm />
      ) : (
        <HostedPasswordReset />
      )}
      <p style={{ marginTop: 24 }}>
        <Link href="/login">Return to sign in</Link>
      </p>
    </main>
  );
}
