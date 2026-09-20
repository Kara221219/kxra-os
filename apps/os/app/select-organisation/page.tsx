import Link from "next/link";
import { redirect } from "next/navigation";
import { availableOrganisations, HttpError, principal } from "../../lib/auth";

export const dynamic = "force-dynamic";

export default async function SelectOrganisationPage() {
  const identity = await principal();
  if (!identity) redirect("/login");
  let organisations;
  try {
    organisations = await availableOrganisations(identity);
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/login");
    throw error;
  }
  return (
    <main className="login">
      <section className="auth-panel">
        <p className="eyebrow">KXRA OS</p>
        <h1>Select your organisation</h1>
        <p>
          Each private request uses one organisation. Your current role and
          project access are checked again after selection.
        </p>
        <div className="stack">
          {organisations.map((organisation) => (
            <form action="/api/context" method="post" key={organisation.org_id}>
              <input
                type="hidden"
                name="organisation_id"
                value={organisation.org_id}
              />
              <button className="secondary" type="submit">
                {organisation.organisation_name} · {organisation.security_role}
              </button>
            </form>
          ))}
          {!organisations.length && (
            <p>No active organisation memberships are available.</p>
          )}
        </div>
        <Link href="/login">Return to sign in</Link>
      </section>
    </main>
  );
}
