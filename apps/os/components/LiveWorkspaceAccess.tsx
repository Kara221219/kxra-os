import React from "react";
import Link from "next/link";
import {
  liveWorkspacePresentation,
  type LiveWorkspaceAccess as Access,
  type OwnerLiveWorkspaceBilling,
} from "../../../packages/workspace/live-start";

export function LiveWorkspaceAccess({
  access,
  billingAdmin,
  billing,
}: {
  access: Access;
  billingAdmin: boolean;
  billing: OwnerLiveWorkspaceBilling | null;
}) {
  const view = liveWorkspacePresentation(access);
  return (
    <>
      <h2>{view.heading}</h2>
      <p>{view.detail}</p>
      {billingAdmin ? (
        <>
          {billing?.offer && (
            <p>
              {billing.offer.name}: £{billing.offer.monthly_amount_minor / 100}{" "}
              GBP per workspace per month,{" "}
              {billing.offer.people === 1
                ? "1 user"
                : `up to ${billing.offer.people} users`}
              .
            </p>
          )}
          <p>
            <Link href="/billing">Review workspace billing ↗</Link>
          </p>
          <p>
            Billing requests do not confirm payment or grant access. Provider
            dispatch and checkout remain separate release gates.
          </p>
        </>
      ) : (
        <p>
          Your workspace administrator manages billing. No billing actions or
          provider identifiers are available in this member view.
        </p>
      )}
      {access.reconciliation_required && (
        <p>The recorded access requires reconciliation.</p>
      )}
    </>
  );
}
