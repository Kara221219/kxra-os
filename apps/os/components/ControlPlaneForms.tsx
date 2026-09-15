"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { IdeaRow } from "../lib/control-plane";

const ideaStates = [
  "NEW",
  "TRIAGE",
  "VALIDATING",
  "PROMISING",
  "BUILDING",
  "PAUSED",
  "REJECTED",
  "ARCHIVED",
] as const;
const lifecycleStages = [
  "IDEA_INBOX",
  "PROBLEM_DISCOVERY",
  "VALIDATION",
  "MARKET_ANALYSIS",
  "FEASIBILITY",
  "BUSINESS_CASE",
  "MVP",
  "PILOT",
  "REVIEW",
  "LAUNCH",
  "SCALE",
] as const;
const dispositions = [
  "ACTIVE",
  "MONITOR",
  "PAUSED",
  "REJECTED",
  "ARCHIVED",
] as const;
const recommendations = ["GO", "ITERATE", "PAUSE", "KILL"] as const;

type Project = {
  id: string;
  code: string;
  name: string;
  lifecycle_stage?: string | null;
  disposition?: string | null;
  next_gate?: string | null;
  next_action?: string;
  current_recommendation?: string | null;
  owner_user_id?: string | null;
  governance_version?: number;
};

type Member = { id: string; display_name: string; role?: string };

function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

function ControlledForm({
  endpoint,
  method = "POST",
  label,
  success,
  payload,
  children,
  className = "workflow-form",
}: {
  endpoint: string;
  method?: "POST" | "PATCH";
  label: string;
  success: string;
  payload: (form: FormData) => unknown;
  children: ReactNode;
  className?: string;
}) {
  const ready = useReady();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      method="post"
      className={className}
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = event.currentTarget;
        setBusy(true);
        setMessage("");
        try {
          const response = await fetch(endpoint, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload(new FormData(form))),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Action failed");
          setMessage(success);
          form.reset();
          router.refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Action failed");
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={!ready || busy}>{children}</fieldset>
      <button disabled={!ready || busy}>{busy ? "Saving…" : label}</button>
      {message && (
        <p role="status" className={message === success ? "success" : "error"}>
          {message}
        </p>
      )}
    </form>
  );
}

function nullable(form: FormData, key: string) {
  const value = String(form.get(key) || "").trim();
  return value || null;
}

export function IdeaForm({
  projects,
  partner,
  projectId,
}: {
  projects: Project[];
  partner: boolean;
  projectId?: string;
}) {
  return (
    <ControlledForm
      endpoint="/api/ideas"
      label="Submit idea"
      success="Idea submitted to KXRA."
      className="panel create-form"
      payload={(form) => ({
        project_id: nullable(form, "project_id"),
        title: form.get("title"),
        raw_idea: form.get("raw_idea"),
        structured_summary: nullable(form, "structured_summary"),
        problem_statement: nullable(form, "problem_statement"),
        target_customer: nullable(form, "target_customer"),
        validation_plan: nullable(form, "validation_plan"),
        next_experiment: nullable(form, "next_experiment"),
        source_note: nullable(form, "source_note"),
        evidence: [],
      })}
    >
      <h2>Submit an idea</h2>
      <p>
        Capture the original idea first. Structured fields may remain Unknown
        until evidence exists.
      </p>
      <label>
        Title
        <input name="title" required maxLength={240} />
      </label>
      <label>
        Project
        <select
          name="project_id"
          defaultValue={projectId || ""}
          required={partner}
        >
          {!partner && <option value="">Group inbox — owner only</option>}
          {partner && <option value="">Choose an assigned project</option>}
          {projects.map((project) => (
            <option value={project.id} key={project.id}>
              {project.code} · {project.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Raw idea
        <textarea name="raw_idea" required maxLength={50000} />
      </label>
      <details>
        <summary>Add structured triage detail</summary>
        <label>
          Structured summary
          <textarea name="structured_summary" maxLength={50000} />
        </label>
        <label>
          Problem
          <textarea name="problem_statement" maxLength={50000} />
        </label>
        <label>
          Target customer
          <textarea name="target_customer" maxLength={50000} />
        </label>
        <label>
          Validation plan
          <textarea name="validation_plan" maxLength={50000} />
        </label>
        <label>
          Next experiment
          <textarea name="next_experiment" maxLength={50000} />
        </label>
        <label>
          Source note
          <input name="source_note" maxLength={1000} />
        </label>
      </details>
    </ControlledForm>
  );
}

export function IdeaOwnerControls({
  idea,
  possibleDuplicates,
  partners,
}: {
  idea: IdeaRow;
  possibleDuplicates: IdeaRow[];
  partners: Member[];
}) {
  return (
    <div className="control-stack">
      {idea.state !== "ARCHIVED" && (
        <details>
          <summary>Change idea state</summary>
          <ControlledForm
            endpoint={`/api/ideas/${idea.record_id}/state`}
            label="Change state"
            success="Idea state changed."
            payload={(form) => ({
              version: idea.version,
              state: form.get("state"),
              reason: form.get("reason"),
            })}
          >
            <label>
              New state
              <select name="state" defaultValue="" required>
                <option value="" disabled>
                  Select a valid next state
                </option>
                {ideaStates
                  .filter((state) => state !== idea.state)
                  .map((state) => (
                    <option key={state}>{state}</option>
                  ))}
              </select>
            </label>
            <label>
              Reason
              <textarea name="reason" required maxLength={2000} />
            </label>
          </ControlledForm>
        </details>
      )}
      {idea.project_id && partners.length > 0 && (
        <details>
          <summary>Request idea sharing change</summary>
          <ControlledForm
            endpoint={`/api/ideas/${idea.record_id}/share-approval`}
            label="Request approval"
            success="Idea share approval requested."
            payload={(form) => ({
              user_id: form.get("user_id"),
              active: form.get("active") === "true",
            })}
          >
            <label>
              Partner
              <select name="user_id" required defaultValue="">
                <option value="" disabled>
                  Choose an assigned partner
                </option>
                {partners.map((partner) => (
                  <option value={partner.id} key={partner.id}>
                    {partner.display_name}{" "}
                    {partner.role ? `· ${partner.role}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Access after approval
              <select name="active" defaultValue="true">
                <option value="true">Shared</option>
                <option value="false">Removed</option>
              </select>
            </label>
          </ControlledForm>
        </details>
      )}
      {idea.state !== "ARCHIVED" && possibleDuplicates.length > 0 && (
        <details>
          <summary>Merge as duplicate</summary>
          <ControlledForm
            endpoint={`/api/ideas/${idea.record_id}/merge`}
            label="Archive duplicate"
            success="Duplicate linked and archived."
            payload={(form) => ({
              version: idea.version,
              canonical_id: form.get("canonical_id"),
              reason: form.get("reason"),
            })}
          >
            <label>
              Canonical idea
              <select name="canonical_id" required defaultValue="">
                <option value="" disabled>
                  Choose an idea
                </option>
                {possibleDuplicates.map((candidate) => (
                  <option value={candidate.record_id} key={candidate.record_id}>
                    {candidate.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Merge reason
              <textarea name="reason" required maxLength={2000} />
            </label>
          </ControlledForm>
        </details>
      )}
    </div>
  );
}

export function ProjectGovernanceForm({
  project,
  members,
}: {
  project: Project;
  members: Member[];
}) {
  return (
    <ControlledForm
      endpoint="/api/approvals"
      label="Request governance approval"
      success="Project governance approval requested."
      className="workflow-form governance-form"
      payload={(form) => ({
        action: "project.governance",
        project_id: project.id,
        payload: {
          expected_version: project.governance_version,
          lifecycle_stage: form.get("lifecycle_stage"),
          disposition: form.get("disposition"),
          next_gate: nullable(form, "next_gate"),
          next_action: form.get("next_action"),
          current_recommendation: nullable(form, "current_recommendation"),
          owner_user_id: nullable(form, "owner_user_id"),
        },
      })}
    >
      <div className="form-grid">
        <label>
          Lifecycle stage
          <select
            name="lifecycle_stage"
            defaultValue={project.lifecycle_stage || "IDEA_INBOX"}
          >
            {lifecycleStages.map((stage) => (
              <option key={stage}>{stage}</option>
            ))}
          </select>
        </label>
        <label>
          Disposition
          <select
            name="disposition"
            defaultValue={project.disposition || "ACTIVE"}
          >
            {dispositions.map((disposition) => (
              <option key={disposition}>{disposition}</option>
            ))}
          </select>
        </label>
        <label>
          Current recommendation
          <select
            name="current_recommendation"
            defaultValue={project.current_recommendation || ""}
          >
            <option value="">Unknown</option>
            {recommendations.map((recommendation) => (
              <option key={recommendation}>{recommendation}</option>
            ))}
          </select>
        </label>
        <label>
          Venture owner
          <select
            name="owner_user_id"
            defaultValue={project.owner_user_id || ""}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option value={member.id} key={member.id}>
                {member.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Next gate
        <input
          name="next_gate"
          defaultValue={project.next_gate || ""}
          maxLength={240}
        />
      </label>
      <label>
        Next action
        <textarea
          name="next_action"
          required
          defaultValue={project.next_action}
          maxLength={5000}
        />
      </label>
      <p className="subtle">
        Scores remain unchanged. Evidence-backed scoring is a separate
        controlled workflow.
      </p>
    </ControlledForm>
  );
}
