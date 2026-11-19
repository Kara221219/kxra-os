import Link from "next/link";
import styles from "../../../components/CustomerDirectory.module.css";
import { notFound, redirect } from "next/navigation";
import Shell from "../../../components/Shell";
import DirectoryDocumentBoundary from "../../../components/DirectoryDocumentBoundary";
import CustomerDirectory, {
  CustomerDirectoryUnavailable,
} from "../../../components/CustomerDirectory";
import { actor, HttpError, type Actor } from "../../../lib/auth";
import { customerDirectory } from "../../../lib/customer-directory";
import { localMode } from "../../../../../packages/db";
import { CustomerDirectoryError } from "../../../../../packages/workspace/customer-admin-contract";

export const dynamic = "force-dynamic";
export default async function CustomerDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let a: Actor;
  try {
    a = await actor();
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 401) redirect("/login");
      if (error.code === "TENANT_SELECTION_REQUIRED")
        redirect("/select-organisation");
      if (error.code === "MFA_REQUIRED") redirect("/login/mfa");
      if (error.code === "AGREEMENT_REQUIRED") redirect("/agreements");
      if (error.code === "ONBOARDING_REQUIRED") redirect("/onboarding");
    }
    return (
      <main className="login">
        <h1>Access unavailable</h1>
        <Link href="/login">Return to sign in</Link>
      </main>
    );
  }
  if (
    a.security_role !== "KXRA_OWNER" ||
    a.organisation_kind !== "KXRA" ||
    a.relationship_type !== "INTERNAL"
  )
    notFound();
  const parameters = await searchParams;
  const state =
    parameters.organisation_state === ""
      ? undefined
      : parameters.organisation_state;
  let content;
  try {
    const page = await customerDirectory({
      version: 1,
      page_size: 25,
      organisation_state: state,
      cursor: parameters.cursor,
    });
    content = (
      <CustomerDirectory
        page={page}
        state={typeof state === "string" ? state : undefined}
        continued={parameters.cursor !== undefined}
      />
    );
  } catch (error) {
    content = (
      <CustomerDirectoryUnavailable
        disabled={
          error instanceof CustomerDirectoryError && error.code === "DISABLED"
        }
      />
    );
  }
  return (
    <Shell
      actor={a}
      active="customer-directory"
      local={localMode()}
      documentNavigation
    >
      <div className="page-heading">
        <div>
          <p className="eyebrow">KXRA owner · Read only</p>
          <h1>Customer directory</h1>
          <p>
            Organisation metadata only. Private workspace contents remain
            separate.
          </p>
        </div>
      </div>
      <DirectoryDocumentBoundary>
        <div className={styles.directory}>{content}</div>
      </DirectoryDocumentBoundary>
    </Shell>
  );
}
