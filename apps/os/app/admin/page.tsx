import { actor } from "../../lib/auth";
import { loadPlatformAdmin } from "../../lib/platform-admin";
import styles from "./admin.module.css";

export const metadata = { title: "Admin overview · KXRA" };

const money = (minor: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(minor / 100);

export default async function AdminHome() {
  const data = await loadPlatformAdmin(await actor());
  const cards = [
    ["Organisations", String(data.organisations)],
    ["Active accounts", String(data.activeAccounts)],
    ["New accounts, 7 days", String(data.signups.d7)],
    ["New accounts, 30 days", String(data.signups.d30)],
    ["New accounts, 90 days", String(data.signups.d90)],
    ["DAU", String(data.securityEvents.day)],
    ["WAU", String(data.securityEvents.week)],
    ["MAU", String(data.securityEvents.month)],
    ["Active subscriptions", String(data.billing.active)],
    ["Trialing", String(data.billing.trialing)],
    ["Past due", String(data.billing.pastDue)],
    ["Cancelled", String(data.billing.cancelled)],
    ["MRR", money(data.billing.mrrMinor)],
    ["ARR", money(data.billing.arrMinor)],
    [
      "Trial to paid",
      data.billing.trialToPaid === null
        ? "No trials or paid subscriptions yet"
        : `${Math.round(data.billing.trialToPaid * 100)}%`,
    ],
    [
      "Churn",
      data.billing.churn === null
        ? "No paid or cancelled subscriptions yet"
        : `${Math.round(data.billing.churn * 100)}%`,
    ],
    ["Decision Review requests", String(data.decisionReviews)],
  ];
  return (
    <>
      <h1>Overview</h1>
      <p className={styles.note}>
        Figures come from the KXRA database. DAU, WAU and MAU count distinct
        accounts with a security event in 1, 7 and 30 days. The database does
        not store a row for every sign-in, and the release lock blocks the
        migration that would add one. Monthly recurring revenue counts only
        active GBP monthly subscriptions already written by a verified Stripe
        webhook. Nothing on this page charges a card or sends a refund.
      </p>
      <div className={styles.grid}>
        {cards.map(([label, value]) => (
          <article className={styles.card} key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </article>
        ))}
      </div>
    </>
  );
}
