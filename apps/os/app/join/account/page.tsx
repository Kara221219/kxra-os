import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import JoinAccountForm from "../../../components/JoinAccountForm";
import { localMode, query } from "../../../../../packages/db";
import {
  joinIntentCookie,
  openJoinIntent,
} from "../../../../../packages/authz/join-intent";
import { principal } from "../../../lib/auth";
import { fakeEmailTransport, joinSecret } from "#kxra/local-runtime";

export const dynamic = "force-dynamic";

export default async function JoinAccount({
  searchParams,
}: {
  searchParams: Promise<{
    state?: string;
    registered?: string;
    error?: string;
  }>;
}) {
  const parameters = await searchParams;
  const sealed = (await cookies()).get(joinIntentCookie)?.value;
  const intent = openJoinIntent(sealed, joinSecret());
  if (!intent || parameters.state === "invalid")
    return (
      <main className="join-page">
        <div className="join-card">
          <Link href="/" className="wordmark">
            KXRA<span>OS</span>
          </Link>
          <p className="eyebrow">Invitation access</p>
          <h1>This invitation is unavailable.</h1>
          <p>
            The link may be expired, revoked, already used or incomplete. Ask
            the KXRA owner for a refreshed invitation.
          </p>
          <Link className="button" href="/login">
            Return to sign in
          </Link>
        </div>
      </main>
    );

  const preview = await query<{ invitation_id: string }>(
    null,
    "select invitation_id from kxra.preview_invitation($1)",
    [intent.tokenDigest],
  );
  if (!preview[0])
    return (
      <main className="join-page">
        <div className="join-card">
          <Link href="/" className="wordmark">
            KXRA<span>OS</span>
          </Link>
          <h1>This invitation is no longer active.</h1>
          <p>
            Ask the KXRA owner to review its status or issue a new invitation.
          </p>
        </div>
      </main>
    );

  const identity = await principal();
  if (identity && identity.email !== intent.email)
    return (
      <main className="join-page">
        <div className="join-card">
          <Link href="/" className="wordmark">
            KXRA<span>OS</span>
          </Link>
          <h1>Use the invited account.</h1>
          <p>
            This invitation is locked to {intent.recipientHint}. Sign out before
            continuing with that address.
          </p>
          <form action="/api/auth" method="post">
            <button name="logout" value="1">
              Sign out
            </button>
          </form>
        </div>
      </main>
    );

  if (identity?.email_verified) {
    const profile = await query<{ account_state: string }>(
      identity,
      "select account_state from kxra.profiles where user_id=$1",
      [identity.id],
    );
    if (profile[0]?.account_state === "ONBOARDING") redirect("/onboarding");
    if (profile[0]?.account_state === "ACTIVE") redirect("/os");
  }

  let verificationUrl: string | undefined;
  if (localMode() && identity?.email === intent.email) {
    const messages = await fakeEmailTransport().list(intent.email);
    const verification = messages.find(
      (message) =>
        message.template === "EMAIL_VERIFICATION" && message.state === "SENT",
    );
    verificationUrl = verification?.text.match(
      /Continue securely: (https?:\/\/\S+)/,
    )?.[1];
  }

  return (
    <main className="join-page">
      <div className="join-card">
        <Link href="/" className="wordmark">
          KXRA<span>OS</span>
        </Link>
        <p className="eyebrow">Invitation-only access</p>
        <h1>{identity ? "Verify your email." : "Create your KXRA account."}</h1>
        <p>
          This invitation is locked to <strong>{intent.recipientHint}</strong>.
          Your project roles are set by KXRA and cannot be selected here.
        </p>
        {parameters.error && (
          <p className="error" role="alert">
            The secure return could not be completed. The invitation remains
            protected; retry or ask the KXRA owner for help.
          </p>
        )}
        {!identity ? (
          <JoinAccountForm />
        ) : (
          <section className="notice" aria-live="polite">
            <h2>Check your email</h2>
            <p>
              Verify the invited address before KXRA creates any project access.
              You can safely reload or return through sign in.
            </p>
            {verificationUrl && (
              <p>
                <Link className="button" href={verificationUrl}>
                  Verify in local test provider
                </Link>
              </p>
            )}
            {localMode() && (
              <p className="subtle">
                Local test provider only. This does not prove hosted Supabase
                email delivery.
              </p>
            )}
          </section>
        )}
        <p className="subtle">
          Already created the account?{" "}
          <Link href="/login">Sign in and return</Link>.
        </p>
      </div>
    </main>
  );
}
