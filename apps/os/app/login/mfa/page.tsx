import Link from "next/link";
import { redirect } from "next/navigation";
import {
  hostedMfaGate,
  type HostedMfaApi,
} from "../../../../../packages/authz/supabase-mfa";
import { localMode } from "../../../../../packages/db";
import { supabase } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export default async function MfaChallenge({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (localMode()) redirect("/login");
  const client = await supabase();
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) redirect("/login");
  let challengeRequired = false;
  try {
    challengeRequired = (
      await hostedMfaGate(client.auth.mfa as unknown as HostedMfaApi)
    ).challengeRequired;
  } catch {
    return (
      <main className="login">
        <h1>MFA support required.</h1>
        <p>Your enrolled factors could not be selected safely.</p>
        <form action="/api/auth" method="post">
          <input type="hidden" name="logout" value="1" />
          <button>Return to sign in</button>
        </form>
      </main>
    );
  }
  if (!challengeRequired) redirect("/os");
  const { error } = await searchParams;
  return (
    <main className="login">
      <Link href="/" className="wordmark">
        KXRA<span>OS</span>
      </Link>
      <p className="eyebrow">Second-factor verification</p>
      <h1>Enter your authenticator code.</h1>
      <p>Use the current six-digit code for your KXRA OS factor.</p>
      {error && (
        <p role="alert" className="error">
          Verification failed. Check the current code and try again.
        </p>
      )}
      <form action="/api/auth" method="post">
        <input type="hidden" name="mfa" value="1" />
        <label>
          Six-digit code
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
          />
        </label>
        <button>Verify →</button>
      </form>
      <form action="/api/auth" method="post">
        <input type="hidden" name="logout" value="1" />
        <button className="secondary">Cancel and sign out</button>
      </form>
    </main>
  );
}
