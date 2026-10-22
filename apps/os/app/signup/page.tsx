import { localMode } from "../../../../packages/db";
import { principal } from "../../lib/auth";
import { SelfServiceSignup } from "../../components/SelfServiceSignup";
export const dynamic = "force-dynamic";
export default async function Signup() {
  if (!localMode() || process.env.VERCEL_ENV)
    return (
      <main className="join-page">
        <section className="panel">
          <h1>Registration is paused</h1>
          <p>Self-service customer registration is not enabled yet.</p>
          <a href="/login">Sign in</a>
        </section>
      </main>
    );
  const identity = await principal();
  return (
    <main className="join-page">
      <SelfServiceSignup
        verified={Boolean(identity?.email_verified)}
        signedIn={Boolean(identity)}
      />
    </main>
  );
}
