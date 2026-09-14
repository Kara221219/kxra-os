import { localMode } from "../../../../packages/db";
import Link from "next/link";
export const dynamic = "force-dynamic";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
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
      <form action="/api/auth" method="post">
        {local ? (
          <>
            <label>
              Local test identity
              <select name="fixture">
                <option value="owner">Owner — all five projects</option>
                <option value="partner">Partner — seat covers only</option>
                <option value="viewer">Viewer — property only</option>
                <option value="revoked">Revoked partner — no projects</option>
                <option value="invitee">
                  Unassigned invitation test account
                </option>
              </select>
            </label>
            <p className="notice">
              Synthetic accounts in an isolated local database. No real
              credentials or cloud services are used.
            </p>
          </>
        ) : (
          <>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
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
          </>
        )}
        <button>Sign in →</button>
      </form>
      <p style={{ marginTop: 24 }}>
        <Link href="/redeem">Redeem a project invitation</Link>
      </p>
    </main>
  );
}
