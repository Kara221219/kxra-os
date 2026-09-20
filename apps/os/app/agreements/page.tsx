import crypto from "node:crypto";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { account, HttpError } from "../../lib/auth";
import { query } from "../../../../packages/db";

export const dynamic = "force-dynamic";

type Presentation = {
  presentation_id: string;
  title: string;
  rendered_content: string;
  document_version: number;
  document_sha256: string;
  acceptance_wording: string;
  acceptance_wording_version: number;
  presented_at: string;
};

function digest(value: string | null) {
  return value
    ? crypto.createHash("sha256").update(value.slice(0, 2000)).digest("hex")
    : null;
}

export default async function AgreementsPage() {
  let a;
  try {
    a = await account();
  } catch (error) {
    if (error instanceof HttpError && error.status === 401) redirect("/login");
    if (
      error instanceof HttpError &&
      error.code === "TENANT_SELECTION_REQUIRED"
    )
      redirect("/select-organisation");
    throw error;
  }
  const requestHeaders = await headers();
  const documents = await query<Presentation>(
    a,
    "select * from kxra.present_required_legal_documents($1,$2)",
    [
      digest(requestHeaders.get("user-agent")),
      digest(requestHeaders.get("x-forwarded-for")),
    ],
  );
  const gate = (
    await query<{ allowed: boolean; code: string; missing_count: number }>(
      a,
      "select * from kxra.legal_gate_status()",
    )
  )[0];
  if (gate?.allowed) redirect("/os");
  return (
    <main className="login legal-page">
      <section className="auth-panel legal-panel">
        <p className="eyebrow">First private access</p>
        <h1>Review required agreements</h1>
        <p>
          Access remains closed until every mandatory approved version for
          {` ${a.organisation_name} `}is accepted. Your response is stored with
          the exact version and SHA-256 shown below.
        </p>
        {documents.map((document) => (
          <article className="legal-document" key={document.presentation_id}>
            <header>
              <h2>{document.title}</h2>
              <small>
                Version {document.document_version} · SHA-256{" "}
                {document.document_sha256}
              </small>
            </header>
            <div className="legal-copy">{document.rendered_content}</div>
            <p className="acceptance-wording">{document.acceptance_wording}</p>
            <form
              action="/api/agreements"
              method="post"
              className="legal-actions"
            >
              <input
                type="hidden"
                name="presentation_id"
                value={document.presentation_id}
              />
              <input
                type="hidden"
                name="request_id"
                value={crypto.randomUUID()}
              />
              <button name="response" value="ACCEPTED" type="submit">
                Accept exact version
              </button>
              <button
                className="secondary"
                name="response"
                value="DECLINED"
                type="submit"
              >
                Decline
              </button>
            </form>
          </article>
        ))}
        {!documents.length && (
          <p>No approved document is available. Contact KXRA support.</p>
        )}
        <Link href="/login">Return to sign in</Link>
      </section>
    </main>
  );
}
