import Link from "next/link";
import { PageHero } from "../../components/PageHero";
export const metadata = { robots: { index: false, follow: false } };
export default function RetiredTool() {
  return (
    <>
      <PageHero eyebrow="KXRA Group" title="This tool has been retired.">
        Explore our current services or contact us about previous work.
      </PageHero>
      <section className="section">
        <Link className="button" href="/#contact">
          Talk to KXRA
        </Link>
      </section>
    </>
  );
}
