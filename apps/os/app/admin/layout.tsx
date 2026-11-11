import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { actor, HttpError } from "../../lib/auth";
import { assertPlatformAdmin } from "../../lib/platform-admin";
import styles from "./admin.module.css";

const links = [
  ["Overview", "/admin"],
  ["Users", "/admin/users"],
  ["Billing", "/admin/billing"],
  ["Support", "/admin/support"],
  ["Decision Review", "/admin/reviews"],
  ["Analytics", "/admin/analytics"],
  ["Health", "/admin/health"],
  ["Settings", "/admin/settings"],
  ["Audit log", "/admin/audit"],
];

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    assertPlatformAdmin(await actor());
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 401) redirect("/login");
      if (error.code === "MFA_REQUIRED" || error.code === "RECENT_MFA_REQUIRED")
        redirect("/login/mfa");
      if (error.code === "TENANT_SELECTION_REQUIRED")
        redirect("/select-organisation");
      if (error.code === "AGREEMENT_REQUIRED") redirect("/agreements");
      if (error.code === "ONBOARDING_REQUIRED") redirect("/onboarding");
      if (error.status === 404 || error.code === "NOT_FOUND") notFound();
    }
    throw error;
  }
  return (
    <div className={styles.shell}>
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className={styles.bar}>
        <Link href="/admin">
          <strong>KXRA admin</strong>
        </Link>
        <nav aria-label="Platform admin">
          {links.map(([label, href]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <Link href="/os">Back to the workspace</Link>
      </header>
      <main id="content" className={styles.main}>
        {children}
      </main>
    </div>
  );
}
