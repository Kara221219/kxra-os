import { localMode } from "../../../../packages/db";
import Link from "next/link";
import LocalFixtureLogin from "#kxra/local-fixture-ui";
export const dynamic = "force-dynamic";

const signInErrors: Record<string, string> = {
  credentials: "The email address or password was not accepted.",
  rate_limited:
    "Too many sign-in attempts. Please wait 15 minutes and try again.",
  verification: "Verify your email address before signing in.",
  configuration:
    "Sign-in is temporarily unavailable because the secure service connection failed.",
};

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; verify?: string; reset?: string }>;
}) {
  const { error, verify, reset } = await searchParams;
  const local = localMode();
  return (
    <main className="login">
      <Link href="/" className="wordmark">
        KXRA<span>OS</span>
      </Link>
      <h1>Welcome back.</h1>
      <p>Sign in to your project workspace.</p>
      {error && (
        <p role="alert" className="error">
          {signInErrors[error] || "Sign-in failed. Please try again."}
        </p>
      )}
      {verify && (
        <p role="status" className="notice">
          Verify your invited email before signing in. Reopen the verification
          message or ask the KXRA owner for help.
        </p>
      )}
      {reset && (
        <p role="status" className="notice">
          Password updated. Sign in again with your new password.
        </p>
      )}
      <form action="/api/auth" method="post">
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button>Sign in →</button>
      </form>
      <p className="subtle">
        <Link href="/reset-password">Forgot your password?</Link>
      </p>
      <LocalFixtureLogin enabled={local} />
      <p style={{ marginTop: 24 }}>
        KXRA has no public registration. New partners join through the secure
        link in an owner-issued invitation.
      </p>
    </main>
  );
}
