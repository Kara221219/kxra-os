import type { Metadata } from "next";
import Link from "next/link";
import { publication } from "../lib/publication";
import "./globals.css";
import "./reference.css";
import { ReferenceNavigation } from "../components/ReferenceNavigation";

export const metadata: Metadata = {
  title: { default: "KXRA Group", template: "%s · KXRA Group" },
  description: publication.brand.summary,
  metadataBase: new URL("https://kxra-group.com"),
  robots: {
    index: process.env.KXRA_ENVIRONMENT === "production",
    follow: process.env.KXRA_ENVIRONMENT === "production",
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <ReferenceNavigation />
        <main id="main">{children}</main>
        <footer className="ref-footer">
          <div className="ref-footer-top">
            <Link className="ref-brand" href="/">
              KXRA<span>GROUP</span>
            </Link>
            <h2>One place for the next move.</h2>
            <Link className="ref-button" href="/#request-access">
              Talk about your workspace ↗
            </Link>
          </div>
          <div className="ref-footer-groups">
            {Object.entries({
              Product: [
                ["Overview", "/product"],
                ["Workspace", "/product/workspace"],
                ["Agents", "/product/agents"],
                ["Apps", "/apps"],
              ],
              Solutions: [
                ["Use cases", "/use-cases"],
                ["Business sprints", "/business-sprints"],
                ["Custom projects", "/custom-projects"],
              ],
              Resources: [
                ["About", "/about"],
                ["Resources", "/resources"],
                ["KXRA notes", "/blog"],
                ["Compare approaches", "/alternatives"],
                ["Help center", "/help"],
                ["Pricing", "/pricing"],
                ["Contact", "/contact"],
              ],
              Company: [
                ["Partner with us", "/partner"],
                ["Privacy", "/legal/privacy"],
                ["Terms", "/legal/terms"],
                ["Customer documents", "/legal"],
              ],
            }).map(([name, links]) => (
              <div key={name}>
                <h3>{name}</h3>
                {links.map(([label, href]) => (
                  <Link key={href} href={href}>
                    {label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          <div className="ref-footer-bottom">
            <p>KXRA Group · Tools and services for growing businesses</p>
            <a href={`mailto:${publication.brand.email}`}>
              {publication.brand.email}
            </a>
            <span>English</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
