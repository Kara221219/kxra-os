import Link from "next/link";
import { notFound } from "next/navigation";
import { partnerPages, type PartnerKey } from "../../../lib/partner-content";
import { PartnerWorksheet } from "../../../components/PartnerWorksheet";
import { PublicForm } from "../../../components/PublicForm";
import { NoScriptContact } from "../../../components/NoScriptContact";
export function generateStaticParams() {
  return [...Object.keys(partnerPages), "apply"].map((guide) => ({ guide }));
}
export default async function Guide({
  params,
}: {
  params: Promise<{ guide: string }>;
}) {
  const { guide } = await params;
  if (guide === "apply")
    return (
      <section className="ref-section ref-wrap ref-inner">
        <Link href="/partner">Partners / Join</Link>
        <p className="ref-kicker">START A CONVERSATION</p>
        <h1>
          What could we
          <br />
          help a team do?
        </h1>
        <div className="ref-split partner-application">
          <div>
            <p className="ref-lead">
              Tell us about your experience, the organisations you work with and
              the workflow you want to improve.
            </p>
            <h2>Before you send</h2>
            <ul>
              <li>
                Describe the opportunity without confidential client
                information.
              </li>
              <li>
                Include your delivery experience and the next decision you need.
              </li>
              <li>
                A request creates no partnership, booking, payment or account
                access.
              </li>
            </ul>
            <NoScriptContact />
          </div>
          <PublicForm kind="ENQUIRY" />
        </div>
      </section>
    );
  const p = partnerPages[guide as PartnerKey];
  if (!p) notFound();
  return (
    <section className="ref-section ref-wrap ref-inner">
      <Link href="/partner">Partners / {guide}</Link>
      <p className="ref-kicker">{p.eyebrow}</p>
      <h1>{p.title}</h1>
      <p className="ref-lead">{p.intro}</p>
      <div className="partner-guide-sections">
        {p.sections.map(([title, copy], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{copy}</p>
            </div>
          </article>
        ))}
      </div>
      {guide === "toolkit" && <PartnerWorksheet />}
      <div className="ref-readiness">
        <h2>Keep going.</h2>
        <Link className="ref-button" href={"/partner/" + p.next}>
          {p.next === "apply" ? "Discuss a partnership" : "Next: " + p.next} ↗
        </Link>
        <p>
          No credential, client record or external action is created by this
          guide.
        </p>
      </div>
    </section>
  );
}
