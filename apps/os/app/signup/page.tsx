import { localMode, query } from "../../../../packages/db";
import { principal } from "../../lib/auth";
import { SelfServiceSignup } from "../../components/SelfServiceSignup";
import {
  hostedSignupAvailable,
  hostedSignupStatus,
} from "../../lib/hosted-self-service";
export const dynamic = "force-dynamic";
export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<{ verify?: string }>;
}) {
  const local = localMode() && !process.env.VERCEL_ENV;
  if (!local && !(await hostedSignupAvailable()))
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
  const status = !local ? await hostedSignupStatus(identity) : undefined;
  const existing =
    local && identity?.email_verified
      ? (
          await query<{ requested_name: string }>(
            identity,
            "select requested_name from kxra.self_service_workspaces where account_id=auth.uid() limit 1",
          )
        )[0]
      : undefined;
  return (
    <main className="join-page">
      <SelfServiceSignup
        verified={Boolean(identity?.email_verified)}
        signedIn={Boolean(identity)}
        mode={local ? "local" : "hosted"}
        verificationRequested={(await searchParams).verify === "1"}
        existingWorkspaceName={
          status?.workspace_name || existing?.requested_name
        }
        accountState={status?.state}
      />
    </main>
  );
}
