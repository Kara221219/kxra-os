import type { Metadata } from "next";
import Link from "next/link";
import { publication } from "../lib/publication";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "KXRA Group", template: "%s · KXRA Group" },
  description: publication.brand.summary,
  metadataBase: new URL("https://kxra-group.com"),
  robots: { index: false, follow: false },
};

const links = [
  ["Platform", "/platform"],
  ["Brand Studio", "/brand-studio"],
  ["Custom projects", "/custom-projects"],
  ["Industries", "/industries"],
  ["About", "/about"],
  ["Contact", "/contact"],
] as const;

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="site-header">
          <Link className="mark" href="/" aria-label="KXRA Group home">
            KXRA<span>GROUP</span>
          </Link>
          <nav aria-label="Primary navigation">
            {links.map(([label, href]) => (
              <Link href={href} key={href}>
                {label}
              </Link>
            ))}
          </nav>
          <Link className="header-login" href="/login">
            Sign in
          </Link>
        </header>
        <main id="main">{children}</main>
        <footer>
          <div>
            <Link className="mark" href="/">
              KXRA<span>GROUP</span>
            </Link>
            <p>{publication.brand.strapline}</p>
          </div>
          <div className="footer-links">
            <a href={`mailto:${publication.brand.email}`}>
              {publication.brand.email}
            </a>
            <Link href="/legal/privacy">Privacy</Link>
            <Link href="/legal/terms">Terms</Link>
            <Link href="/legal/cookies">Cookies</Link>
          </div>
          <p className="preview-note">
            Private build preview · publication is disabled
          </p>
        </footer>
      </body>
    </html>
  );
}
