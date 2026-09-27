import Link from "next/link";
import {
  PasswordResetConfirmForm,
  PasswordResetRequestForm,
} from "../../components/PasswordResetForms";
import { localMode } from "../../../../packages/db";
import { principal } from "../../lib/auth";
import { cookies } from "next/headers";
import {
  openRecoveryIntent,
  recoveryIntentCookie,
} from "../../../../packages/authz/recovery-intent";

export const dynamic = "force-dynamic";

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token;
  const localToken =
    token && /^[A-Za-z0-9_-]{32,100}$/.test(token) ? token : undefined;
  const identity = !localMode() ? await principal() : null;
  const secret = process.env.KXRA_JOIN_SECRET || "";
  const recovery =
    identity && secret
      ? openRecoveryIntent(
          (await cookies()).get(recoveryIntentCookie)?.value,
          secret,
        )
      : null;
  const hostedRecovery = Boolean(identity && recovery?.userId === identity.id);
  const canConfirm = Boolean(localToken || hostedRecovery);
  return (
    <main className="login">
      <Link href="/" className="wordmark">
        KXRA<span>OS</span>
      </Link>
      <p className="eyebrow">Account recovery</p>
      <h1>{canConfirm ? "Choose a new password." : "Reset your password."}</h1>
      <p>
        {canConfirm
          ? "The authentication provider will validate this time-limited reset."
          : "The response is identical whether or not an eligible account exists."}
      </p>
      {canConfirm ? (
        <PasswordResetConfirmForm token={localToken} />
      ) : (
        <PasswordResetRequestForm />
      )}
      <p style={{ marginTop: 24 }}>
        <Link href="/login">Return to sign in</Link>
      </p>
    </main>
  );
}
