import { localMode } from "../../../../packages/db";
import Link from "next/link";
import LocalFixtureLogin from "#kxra/local-fixture-ui";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; verify?: string }>;
}) {
  const { error, verify } = await searchParams;
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
          Sign-in failed. Check your details or configuration.
        </p>
      )}
      {verify && (
        <p role="status" className="notice">
          Verify your invited email before signing in. Reopen the verification
          message or ask the KXRA owner for help.
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
