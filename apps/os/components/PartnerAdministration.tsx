"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Project = { id: string; code: string; name: string };
type Partner = {
  id: string;
  display_name: string;
  active: boolean;
  access_version: number;
  account_state: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  company: string | null;
  mfa_state: string;
  onboarding_completed_at: string | null;
  session_version: number;
};
type Membership = {
  user_id: string;
  project_id: string;
  active: boolean;
  role: "viewer" | "contributor";
  expires_at: string | null;
};
type Invitation = {
  id: string;
  recipient_email: string;
  note: string | null;
  state: string;
  version: number;
  delivery_version: number;
  expires_at: string;
  sent_at: string | null;
  redeemed_at: string | null;
  revoked_at: string | null;
  grants: {
    project_id: string;
    project_code: string;
    project_name: string;
    role: string;
    expires_at: string | null;
  }[];
};

async function post(url: string, data: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Action unavailable");
  return result;
}

function Status({ message }: { message: string }) {
  return message ? <p role="status">{message}</p> : null;
}

export function PartnerCards({
  partners,
  memberships,
  projects,
}: {
  partners: Partner[];
  memberships: Membership[];
  projects: Project[];
}) {
  return (
    <div className="partner-admin-list">
      {partners.map((partner) => (
        <PartnerCard
          key={partner.id}
          partner={partner}
          memberships={memberships.filter(
            (item) => item.user_id === partner.id,
          )}
          projects={projects}
        />
      ))}
      {!partners.length && (
        <div className="empty">No registered partner accounts.</div>
      )}
    </div>
  );
}

function PartnerCard({
  partner,
  memberships,
  projects,
}: {
  partner: Partner;
  memberships: Membership[];
  projects: Project[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await work();
      setMessage(success);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
    } finally {
      setBusy(false);
    }
  };
  const assignedIds = new Set(memberships.map((item) => item.project_id));
  const available = projects.filter((project) => !assignedIds.has(project.id));
  const lifecycle =
    partner.account_state === "SUSPENDED"
      ? ["ACTIVE", "REVOKED"]
      : ["SUSPENDED", "REVOKED"];
  return (
    <article className="panel partner-admin-card">
      <div className="record-top">
        <div>
          <p className="eyebrow">Partner account</p>
          <h2>{partner.display_name}</h2>
          <p>
            {[partner.job_title, partner.company].filter(Boolean).join(" · ") ||
              "Profile details unavailable"}
          </p>
        </div>
        <div>
          <span
            className={`badge ${partner.account_state === "ACTIVE" ? "" : "amber"}`}
          >
            {partner.account_state}
          </span>
        </div>
      </div>
      <dl className="definition-list compact">
        <div>
          <dt>MFA</dt>
          <dd>{partner.mfa_state.replaceAll("_", " ")}</dd>
        </div>
        <div>
          <dt>Access version</dt>
          <dd>{partner.access_version}</dd>
        </div>
        <div>
          <dt>Session version</dt>
          <dd>{partner.session_version}</dd>
        </div>
        <div>
          <dt>Onboarding</dt>
          <dd>{partner.onboarding_completed_at ? "Complete" : "Incomplete"}</dd>
        </div>
      </dl>
      <h3>Project access</h3>
      {memberships.map((membership) => {
        const project = projects.find(
          (item) => item.id === membership.project_id,
        );
        return (
          <form
            className="assignment-admin-row"
            key={membership.project_id}
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(
                () =>
                  post("/api/approvals", {
                    action: "membership.change",
                    project_id: membership.project_id,
                    payload: {
                      user_id: partner.id,
                      role: form.get("role"),
                      active: form.get("active") === "true",
                    },
                  }),
                "Exact membership change requested. Review it in Approvals.",
              );
            }}
          >
            <div>
              <strong>{project?.code}</strong>
              <span>{project?.name}</span>
            </div>
            <label>
              <span className="sr-only">Role for {project?.name}</span>
              <select name="role" defaultValue={membership.role}>
                <option value="viewer">Viewer</option>
                <option value="contributor">Contributor</option>
              </select>
            </label>
            <label>
              <span className="sr-only">Access state for {project?.name}</span>
              <select name="active" defaultValue={String(membership.active)}>
                <option value="true">Active</option>
                <option value="false">Revoked</option>
              </select>
            </label>
            <button disabled={busy || partner.account_state !== "ACTIVE"}>
              Request change
            </button>
          </form>
        );
      })}
      {available.length > 0 && partner.account_state === "ACTIVE" && (
        <form
          className="assignment-admin-row add"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run(
              () =>
                post("/api/approvals", {
                  action: "membership.change",
                  project_id: form.get("project_id"),
                  payload: {
                    user_id: partner.id,
                    role: form.get("role"),
                    active: true,
                  },
                }),
              "New project assignment requested. Review it in Approvals.",
            );
          }}
        >
          <div>
            <strong>Add project</strong>
            <span>Creates an exact approval request</span>
          </div>
          <label>
            <span className="sr-only">Project</span>
            <select name="project_id">
              {available.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} · {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Role</span>
            <select name="role">
              <option value="viewer">Viewer</option>
              <option value="contributor">Contributor</option>
            </select>
          </label>
          <button disabled={busy}>Request assignment</button>
        </form>
      )}
      {partner.account_state !== "REVOKED" && (
        <form
          className="lifecycle-form"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run(
              () =>
                post("/api/approvals", {
                  action: "account.lifecycle",
                  project_id: null,
                  payload: {
                    user_id: partner.id,
                    desired_state: form.get("desired_state"),
                    reason: form.get("reason"),
                  },
                }),
              "Account lifecycle change requested. Review it in Approvals.",
            );
          }}
        >
          <h3>Organisation access</h3>
          <div className="form-grid">
            <label>
              Desired state
              <select name="desired_state">
                {lifecycle.map((state) => (
                  <option key={state}>{state}</option>
                ))}
              </select>
            </label>
            <label>
              Reason
              <input
                name="reason"
                required
                minLength={1}
                maxLength={1000}
                placeholder="Reason visible in the exact approval"
              />
            </label>
          </div>
          <button disabled={busy}>Request lifecycle change</button>
        </form>
      )}
      <div className="record-actions">
        <button
          disabled={busy || partner.account_state === "REVOKED"}
          onClick={() =>
            void run(
              () =>
                post(`/api/partners/${partner.id}/sessions`, {
                  reason: "Owner forced sign-out from partner administration",
                }),
              "All current sessions revoked.",
            )
          }
        >
          Force sign-out
        </button>
        <button
          className="secondary"
          disabled={busy}
          onClick={() =>
            void run(
              () => post(`/api/partners/${partner.id}/whatsapp/unpair`, {}),
              "WhatsApp pairing revoked if one existed.",
            )
          }
        >
          Unpair WhatsApp
        </button>
      </div>
      <Status message={message} />
    </article>
  );
}

export function InvitationList({ invitations }: { invitations: Invitation[] }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  async function act(invitation: Invitation, action: "resend" | "revoke") {
    setBusy(invitation.id);
    setMessage("");
    try {
      await post(`/api/invitations/${invitation.id}/${action}`, {});
      setMessage(
        action === "resend"
          ? "A refreshed link was captured by the configured email provider; the earlier link is invalid."
          : "Invitation revoked. Its link can no longer be redeemed.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Invitation action unavailable",
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="panel full-span">
      <div className="record-top">
        <div>
          <h2>Invitation history</h2>
          <p>Links are hash-only in PostgreSQL and never displayed here.</p>
        </div>
        <span className="badge">{invitations.length} total</span>
      </div>
      <div className="invitation-list">
        {invitations.map((invitation) => {
          const actionable = ["PENDING", "SENT", "DELIVERY_FAILED"].includes(
            invitation.state,
          );
          return (
            <article key={invitation.id}>
              <div className="record-top">
                <div>
                  <strong>{invitation.recipient_email}</strong>
                  <p>
                    Grant version {invitation.version} · delivery{" "}
                    {invitation.delivery_version} · expires{" "}
                    {new Date(invitation.expires_at).toLocaleString("en-GB")}
                  </p>
                </div>
                <span
                  className={`badge ${["EXPIRED", "REVOKED", "DELIVERY_FAILED"].includes(invitation.state) ? "amber" : ""}`}
                >
                  {invitation.state}
                </span>
              </div>
              <ul>
                {invitation.grants.map((grant) => (
                  <li key={grant.project_id}>
                    {grant.project_code} · {grant.project_name} · {grant.role}
                  </li>
                ))}
              </ul>
              {invitation.note && (
                <p>
                  Owner note recorded ({invitation.note.length} characters). It
                  is not included in email content.
                </p>
              )}
              {actionable && (
                <div className="record-actions">
                  <button
                    disabled={busy === invitation.id}
                    onClick={() => void act(invitation, "resend")}
                  >
                    Resend with new link
                  </button>
                  <button
                    className="secondary"
                    disabled={busy === invitation.id}
                    onClick={() => void act(invitation, "revoke")}
                  >
                    Revoke
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {!invitations.length && <p>No invitations created.</p>}
      </div>
      <Status message={message} />
    </section>
  );
}
