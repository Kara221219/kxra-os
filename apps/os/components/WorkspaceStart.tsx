"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { WorkspaceStart as Start } from "../lib/workspace-start";
import { WorkspacePilot } from "./WorkspacePilot";
import { LiveWorkspaceAccess } from "./LiveWorkspaceAccess";
import { liveWorkspacePresentation } from "../../../packages/workspace/live-start";
export function WorkspaceStart({ local }: { local: boolean }) {
  const [data, setData] = useState<Start | null>(null),
    [notice, setNotice] = useState("Checking recorded workspace state…"),
    [revision, setRevision] = useState(0),
    [returnState, setReturnState] = useState("");
  useEffect(() => {
    setReturnState(
      new URLSearchParams(window.location.search).get("pilot") || "",
    );
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setNotice("Checking recorded workspace state…");
    fetch("/api/team-space/start", { signal: c.signal, cache: "no-store" })
      .then(async (r) => {
        const v = await r.json();
        if (!r.ok) throw Error(v.error || "Workspace state unavailable");
        if (!c.signal.aborted) {
          setData(v);
          setNotice("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setData(null);
          setNotice(
            e instanceof Error ? e.message : "Workspace state unavailable",
          );
        }
      });
    return () => c.abort();
  }, [revision]);
  const billing = data?.billing,
    live = data && "live_access" in data ? data.live_access : null,
    blocked = live
      ? liveWorkspacePresentation(live).blocked
      : billing
        ? !billing.entitled
        : false;
  useEffect(() => {
    if (!live?.proof_valid_until) return;
    const delay = Date.parse(live.proof_valid_until) - Date.now();
    const timer = setTimeout(
      () => setRevision((n) => n + 1),
      Math.max(0, Math.min(delay + 25, 2_147_483_647)),
    );
    return () => clearTimeout(timer);
  }, [live?.proof_valid_until]);
  return (
    <div className="workspace-start">
      <p className="eyebrow">ACCOUNT → WORKSPACE</p>
      <h1>Getting started</h1>
      <p className="lead">
        Recover the recorded state, then take the next permitted step.
      </p>
      {local && (
        <p className="notice">
          Local acceptance environment. Accounts, messages and records persist
          locally; payment and model outcomes are synthetic. No live
          subscription or provider is activated.
        </p>
      )}
      <button type="button" onClick={() => setRevision((n) => n + 1)}>
        Check recorded access
      </button>
      <p role="status">{notice}</p>
      {returnState && (
        <p className="notice" role="status">
          {returnState === "cancelled"
            ? "Checkout was cancelled or left unfinished. No access is granted by this return."
            : "Returned from a billing screen. This URL does not prove payment or grant access; only the recorded server entitlement counts."}
        </p>
      )}
      {data && (
        <>
          <ol
            className="activation-steps"
            aria-label="Account to workspace progress"
          >
            <li>
              <span>01 · Account and onboarding</span>
              <h2>Active account</h2>
              <p>
                Current organisation: {data.organisation}. This view requires
                the existing verified session, membership and onboarding checks.
              </p>
              <Link href="/os/profile">Review profile and security ↗</Link>
            </li>
            <li>
              <span>02 · Billing record</span>
              {live ? (
                <LiveWorkspaceAccess
                  access={live}
                  billingAdmin={data.billing_admin}
                  billing={
                    "live_billing" in data ? (data.live_billing ?? null) : null
                  }
                />
              ) : (
                <>
                  <h2>
                    {!billing
                      ? "Workspace administrator manages billing"
                      : billing.test_billing.reconciliation_required
                        ? "Reconciliation required"
                        : billing.subscription
                          ? billing.subscription.state
                          : billing.entitled
                            ? "No pilot assigned"
                            : "Awaiting accepted subscription"}
                  </h2>
                  <p>
                    {!billing
                      ? "Your room access follows current membership. Billing details and actions are restricted to the workspace administrator."
                      : billing.subscription?.mode === "FIXTURE"
                        ? "Synthetic lifecycle record only. This is not a paid subscription."
                        : !billing.assigned && billing.entitled
                          ? "Existing workspace access is retained. No paid subscription has been established."
                          : blocked
                            ? "New work is disabled until an authoritative current entitlement is recorded. Existing history remains readable."
                            : "The current recorded test period permits work; this is not evidence of a live subscription."}
                  </p>
                  {billing?.subscription?.cancel_at_period_end && (
                    <p>
                      Cancellation is scheduled. Work remains subject to the
                      recorded period ending{" "}
                      {new Date(billing.subscription.period_end).toISOString()}.
                    </p>
                  )}
                  <p>
                    No live checkout is enabled here. Commercial terms and
                    provider acceptance remain separate release gates.
                  </p>
                </>
              )}
            </li>
            <li>
              <span>03 · First useful work</span>
              <h2>
                {blocked
                  ? "Read history while access is pending"
                  : "Open your workspace"}
              </h2>
              <p>
                Rooms, messages and reviewed CRM records use the persistent
                server API. Their writes still enforce membership, source
                versions and entitlement.
              </p>
              <Link className="button" href="/os/workspace">
                {blocked ? "View existing rooms" : "Create or open a room"} ↗
              </Link>
              {data.rooms.slice(0, 5).map((r) => (
                <Link
                  className="activation-room"
                  key={r.id}
                  href={"/os/workspace/" + r.id}
                >
                  {r.access === "PRIVATE" ? "◈" : "#"} {r.name} ↗
                </Link>
              ))}
            </li>
          </ol>
          {data.billing_admin && !live && (
            <details className="panel">
              <summary>
                Reviewed test billing and local lifecycle controls
              </summary>
              <WorkspacePilot local={local} />
              <p>
                After an event, check recorded access above. A simulated
                activation never verifies a provider or launches billing.
              </p>
            </details>
          )}
          <section className="panel">
            <h2>Execution availability</h2>
            <p>
              Real provider, worker and connector acceptance is still pending. A
              usable local workspace or synthetic model response does not
              establish hosted execution.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
