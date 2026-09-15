"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { classifications } from "../../../packages/domain";
import type {
  DigitalOpportunity,
  GateAuthorization,
  PropertyAsset,
  VehicleCompatibility,
  WorkspaceEntry,
  WorkspaceEntryType,
} from "../lib/project-workspaces";
import type { RecordRow } from "../lib/data";

function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

function TypedForm({
  endpoint,
  label,
  success,
  payload,
  children,
}: {
  endpoint: string;
  label: string;
  success: string;
  payload: (form: FormData) => unknown;
  children: ReactNode;
}) {
  const ready = useReady();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload(data)),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Action unavailable");
      setMessage(success);
      formElement.reset();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="create-form workspace-form" onSubmit={submit}>
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

function optional(form: FormData, key: string) {
  const value = String(form.get(key) || "").trim();
  return value || undefined;
}

function workspacePayload(type: WorkspaceEntryType, form: FormData) {
  switch (type) {
    case "NARRATIVE":
      return { statement: form.get("statement") };
    case "RESEARCH_FINDING":
      return {
        finding: form.get("finding"),
        ...(optional(form, "source_url")
          ? { source_url: optional(form, "source_url") }
          : {}),
        ...(optional(form, "as_of") ? { as_of: optional(form, "as_of") } : {}),
      };
    case "EVIDENCE_ITEM":
      return { claim: form.get("claim"), gap: form.get("gap") || "" };
    case "MILESTONE":
      return {
        outcome: form.get("outcome"),
        state: form.get("state"),
        ...(optional(form, "target_date")
          ? { target_date: optional(form, "target_date") }
          : {}),
      };
    case "METRIC":
      return {
        metric_name: form.get("metric_name"),
        value: form.get("value"),
        unit: form.get("unit"),
        as_of: form.get("as_of"),
        basis: form.get("basis"),
      };
    case "CATALOGUE_ITEM":
      return {
        item_code: form.get("item_code"),
        description: form.get("description"),
        item_state: form.get("item_state"),
      };
    case "MARKET_ITEM":
      return {
        channel: form.get("channel"),
        listing_state: form.get("listing_state"),
        ...(optional(form, "external_ref")
          ? { external_ref: optional(form, "external_ref") }
          : {}),
      };
    case "PAPER_RESEARCH":
      return {
        topic: form.get("topic"),
        observation: form.get("observation"),
        paper_only: true,
      };
    case "REPORT":
      return {
        report_period: form.get("report_period"),
        summary: form.get("report_summary"),
        paper_only: true,
      };
    case "ASSET_NOTE":
      return {
        description: form.get("asset_description"),
        origin: form.get("origin"),
        rights_state: form.get("rights_state"),
      };
  }
}

function EntryFields({ type }: { type: WorkspaceEntryType }) {
  if (type === "NARRATIVE")
    return (
      <label>
        Statement
        <textarea name="statement" required maxLength={50000} />
      </label>
    );
  if (type === "RESEARCH_FINDING")
    return (
      <>
        <label>
          Finding
          <textarea name="finding" required maxLength={50000} />
        </label>
        <label>
          Public source URL, if applicable
          <input name="source_url" type="url" maxLength={2000} />
        </label>
        <label>
          Evidence date
          <input name="as_of" type="date" />
        </label>
      </>
    );
  if (type === "EVIDENCE_ITEM")
    return (
      <>
        <label>
          Claim or question
          <textarea name="claim" required maxLength={50000} />
        </label>
        <label>
          Evidence gap
          <textarea name="gap" maxLength={50000} />
        </label>
      </>
    );
  if (type === "MILESTONE")
    return (
      <>
        <label>
          Intended outcome
          <textarea name="outcome" required maxLength={5000} />
        </label>
        <label>
          State
          <select name="state" defaultValue="PLANNED">
            <option>PLANNED</option>
            <option>IN_PROGRESS</option>
            <option>BLOCKED</option>
            <option>COMPLETE</option>
          </select>
        </label>
        <label>
          Target date, if known
          <input name="target_date" type="date" />
        </label>
      </>
    );
  if (type === "METRIC")
    return (
      <div className="form-grid">
        <label>
          Metric
          <input name="metric_name" required maxLength={240} />
        </label>
        <label>
          Value
          <input name="value" required maxLength={240} />
        </label>
        <label>
          Unit
          <input name="unit" required maxLength={120} />
        </label>
        <label>
          As of
          <input name="as_of" type="date" required />
        </label>
        <label>
          Basis / provenance
          <input name="basis" required maxLength={500} />
        </label>
      </div>
    );
  if (type === "CATALOGUE_ITEM")
    return (
      <>
        <label>
          Item code
          <input name="item_code" required maxLength={240} />
        </label>
        <label>
          Description
          <textarea name="description" required maxLength={5000} />
        </label>
        <label>
          Evidence state
          <select name="item_state" defaultValue="UNKNOWN">
            <option>UNKNOWN</option>
            <option>DRAFT</option>
            <option>EVIDENCE_PENDING</option>
          </select>
        </label>
      </>
    );
  if (type === "MARKET_ITEM")
    return (
      <>
        <label>
          Channel
          <input name="channel" required maxLength={240} />
        </label>
        <label>
          Listing state
          <select name="listing_state" defaultValue="NOT_STARTED">
            <option>NOT_STARTED</option>
            <option>DRAFT</option>
            <option>AWAITING_EVIDENCE</option>
          </select>
        </label>
        <label>
          External reference, if one already exists
          <input name="external_ref" maxLength={500} />
        </label>
      </>
    );
  if (type === "PAPER_RESEARCH")
    return (
      <>
        <label>
          Topic or instrument
          <input name="topic" required maxLength={240} />
        </label>
        <label>
          Paper-only observation
          <textarea name="observation" required maxLength={50000} />
        </label>
        <p className="notice">
          This record is permanently labelled paper-only.
        </p>
      </>
    );
  if (type === "REPORT")
    return (
      <>
        <label>
          Report period
          <input name="report_period" required maxLength={240} />
        </label>
        <label>
          Paper-only report
          <textarea name="report_summary" required maxLength={50000} />
        </label>
      </>
    );
  return (
    <>
      <label>
        Asset description
        <textarea name="asset_description" required maxLength={5000} />
      </label>
      <label>
        Origin
        <select name="origin" defaultValue="REAL_INPUT">
          <option>REAL_INPUT</option>
          <option>AI_GENERATED</option>
          <option>AI_INFERRED</option>
        </select>
      </label>
      <label>
        Rights state
        <select name="rights_state" defaultValue="UNKNOWN">
          <option>UNKNOWN</option>
          <option>EVIDENCE_PENDING</option>
        </select>
      </label>
    </>
  );
}

function EvidenceChoice({
  evidence,
  name = "evidence_id",
  required = false,
  label = "Accepted evidence",
}: {
  evidence: RecordRow[];
  name?: string;
  required?: boolean;
  label?: string;
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue="" required={required}>
        <option value="">
          {required ? "Choose evidence" : "None linked yet"}
        </option>
        {evidence.map((record) => (
          <option value={record.id} key={record.id}>
            {record.title} · {record.classification} · v{record.version}
          </option>
        ))}
      </select>
    </label>
  );
}

export function WorkspaceEntryForm({
  projectId,
  moduleKey,
  entryType,
  owner,
  evidence,
}: {
  projectId: string;
  moduleKey: string;
  entryType: WorkspaceEntryType;
  owner: boolean;
  evidence: RecordRow[];
}) {
  return (
    <details className="workspace-controls">
      <summary>Add typed record</summary>
      <TypedForm
        endpoint={`/api/project-workspaces/${projectId}/entries`}
        label="Save typed draft"
        success="Workspace draft saved."
        payload={(form) => {
          const linked = evidence.find(
            (record) => record.id === String(form.get("evidence_id") || ""),
          );
          return {
            module_key: moduleKey,
            title: form.get("title"),
            summary: form.get("summary"),
            classification: form.get("classification"),
            visibility:
              owner && form.get("owner_only") === "on"
                ? "owner_only"
                : "project_shared",
            payload: workspacePayload(entryType, form),
            evidence: linked
              ? [{ record_id: linked.id, version: linked.version }]
              : [],
          };
        }}
      >
        <label>
          Title
          <input name="title" required maxLength={240} />
        </label>
        <label>
          Summary
          <textarea name="summary" required maxLength={50000} />
        </label>
        <label>
          Classification
          <select
            name="classification"
            defaultValue="USER-SUPPLIED INFORMATION"
          >
            {classifications
              .filter((value) => value !== "FACT")
              .map((value) => (
                <option key={value}>{value}</option>
              ))}
          </select>
        </label>
        <EntryFields type={entryType} />
        <EvidenceChoice evidence={evidence} />
        {owner && (
          <label className="check-row">
            <input name="owner_only" type="checkbox" />
            Keep this draft owner-only
          </label>
        )}
      </TypedForm>
    </details>
  );
}

export function WorkspaceReviewButton({ entry }: { entry: WorkspaceEntry }) {
  return (
    <TypedForm
      endpoint={`/api/project-workspaces/${entry.project_id}/entries/${entry.id}/review`}
      label="Mark reviewed"
      success="Workspace record reviewed."
      payload={() => ({ version: entry.version })}
    >
      <p>
        Review binds version {entry.version}. Evidence-bearing types require a
        current exact evidence link.
      </p>
    </TypedForm>
  );
}

export function VehicleVerificationForm({
  projectId,
  row,
  evidence,
}: {
  projectId: string;
  row: VehicleCompatibility;
  evidence: RecordRow[];
}) {
  if (!evidence.length)
    return (
      <p className="notice">
        Accepted fitment and safety evidence is required.
      </p>
    );
  return (
    <details className="workspace-controls compact-control">
      <summary>Review {row.vehicle_family}</summary>
      <TypedForm
        endpoint={`/api/project-workspaces/${projectId}/vehicle-compatibility/${row.id}/verify`}
        label="Verify exact evidence"
        success="Compatibility evidence verified."
        payload={(form) => {
          const fitment = evidence.find(
            (record) => record.id === String(form.get("fitment_evidence_id")),
          );
          const safety = evidence.find(
            (record) => record.id === String(form.get("safety_evidence_id")),
          );
          if (!fitment || !safety) throw Error("Choose both evidence records");
          return {
            version: row.version,
            supplier_sku: form.get("supplier_sku"),
            fitment_evidence_id: fitment.id,
            fitment_evidence_version: fitment.version,
            safety_evidence_id: safety.id,
            safety_evidence_version: safety.version,
          };
        }}
      >
        <label>
          Exact supplier SKU
          <input name="supplier_sku" required maxLength={240} />
        </label>
        <EvidenceChoice
          evidence={evidence}
          name="fitment_evidence_id"
          required
          label="Fitment evidence"
        />
        <EvidenceChoice
          evidence={evidence}
          name="safety_evidence_id"
          required
          label="Safety / airbag evidence"
        />
      </TypedForm>
    </details>
  );
}

export function PropertyAssetForm({
  projectId,
  moduleKey,
  assetKind,
}: {
  projectId: string;
  moduleKey: string;
  assetKind: string;
}) {
  return (
    <details className="workspace-controls">
      <summary>Add property asset</summary>
      <TypedForm
        endpoint={`/api/project-workspaces/${projectId}/property-assets`}
        label="Save property asset"
        success="Property asset saved with explicit provenance."
        payload={(form) => ({
          module_key: moduleKey,
          title: form.get("title"),
          asset_kind: assetKind,
          origin: form.get("origin"),
        })}
      >
        <label>
          Asset title
          <input name="title" required maxLength={240} />
        </label>
        <label>
          Material origin
          <select name="origin" defaultValue="REAL_INPUT">
            <option value="REAL_INPUT">Real property input</option>
            <option value="AI_GENERATED">AI-generated material</option>
            <option value="AI_INFERRED">AI-inferred material</option>
          </select>
        </label>
      </TypedForm>
    </details>
  );
}

export function PropertyAssetReviewForm({
  projectId,
  asset,
  evidence,
}: {
  projectId: string;
  asset: PropertyAsset;
  evidence: RecordRow[];
}) {
  if (!evidence.length) return null;
  return (
    <details className="workspace-controls compact-control">
      <summary>Review rights and geometry</summary>
      <TypedForm
        endpoint={`/api/project-workspaces/${projectId}/property-assets/${asset.id}/review`}
        label="Record exact review"
        success="Property asset review recorded."
        payload={(form) => {
          const rights = evidence.find(
            (record) => record.id === String(form.get("rights_evidence_id")),
          );
          const geometry = evidence.find(
            (record) => record.id === String(form.get("geometry_evidence_id")),
          );
          if (!rights) throw Error("Choose rights evidence");
          return {
            version: asset.version,
            rights_evidence_id: rights.id,
            rights_evidence_version: rights.version,
            geometry_evidence_id: geometry?.id || null,
            geometry_evidence_version: geometry?.version || null,
          };
        }}
      >
        <EvidenceChoice
          evidence={evidence}
          name="rights_evidence_id"
          required
          label="Rights evidence"
        />
        <EvidenceChoice
          evidence={evidence}
          name="geometry_evidence_id"
          label="Geometry QA evidence, when applicable"
        />
      </TypedForm>
    </details>
  );
}

export function ClprRevisitForm({
  projectId,
  evidence,
}: {
  projectId: string;
  evidence: RecordRow[];
}) {
  if (evidence.length < 5)
    return (
      <p className="notice">
        Five distinct current CLPR evidence records are required.
      </p>
    );
  const categories = ["route", "liquidity", "recovery", "buyer", "regulatory"];
  return (
    <details className="workspace-controls">
      <summary>Record evidence-bound revisit recommendation</summary>
      <TypedForm
        endpoint={`/api/project-workspaces/${projectId}/clpr-reviews`}
        label="Record recommendation"
        success="CLPR revisit recommendation recorded."
        payload={(form) => {
          const result: Record<string, unknown> = {
            recommendation: form.get("recommendation"),
            rationale: form.get("rationale"),
          };
          const selectedIds: string[] = [];
          for (const category of categories) {
            const record = evidence.find(
              (candidate) =>
                candidate.id === String(form.get(`${category}_evidence_id`)),
            );
            if (!record) throw Error(`Choose ${category} evidence`);
            selectedIds.push(record.id);
            result[`${category}_evidence_id`] = record.id;
            result[`${category}_evidence_version`] = record.version;
          }
          if (new Set(selectedIds).size !== categories.length)
            throw Error("Choose a distinct evidence record for each category");
          return result;
        }}
      >
        <label>
          Recommendation
          <select name="recommendation" defaultValue="MONITOR">
            <option>MONITOR</option>
            <option>REVISIT</option>
            <option>DO_NOT_REVISIT</option>
          </select>
        </label>
        <label>
          Rationale
          <textarea name="rationale" required maxLength={50000} />
        </label>
        {categories.map((category) => (
          <EvidenceChoice
            key={category}
            evidence={evidence}
            name={`${category}_evidence_id`}
            required
            label={`${category[0].toUpperCase()}${category.slice(1)} evidence`}
          />
        ))}
      </TypedForm>
    </details>
  );
}

export function DigitalOpportunityForm({ projectId }: { projectId: string }) {
  return (
    <details className="workspace-controls">
      <summary>Add demand opportunity</summary>
      <TypedForm
        endpoint={`/api/project-workspaces/${projectId}/digital-opportunities`}
        label="Save discovery opportunity"
        success="Demand opportunity saved in discovery."
        payload={(form) => ({
          title: form.get("title"),
          buyer_problem: form.get("buyer_problem"),
        })}
      >
        <label>
          Opportunity title
          <input name="title" required maxLength={240} />
        </label>
        <label>
          Specific buyer problem
          <textarea name="buyer_problem" required maxLength={5000} />
        </label>
      </TypedForm>
    </details>
  );
}

export function DigitalOpportunityControls({
  projectId,
  opportunity,
  evidence,
  authorizations,
  owner,
}: {
  projectId: string;
  opportunity: DigitalOpportunity;
  evidence: RecordRow[];
  authorizations: GateAuthorization[];
  owner: boolean;
}) {
  return (
    <div className="specialist-controls">
      {opportunity.stage !== "LOCAL_PROTOTYPE_AUTHORIZED" &&
        evidence.length > 0 && (
          <TypedForm
            endpoint={`/api/project-workspaces/${projectId}/digital-opportunities/${opportunity.id}/evidence`}
            label="Attach demand evidence"
            success="Current demand evidence attached."
            payload={(form) => {
              const record = evidence.find(
                (candidate) => candidate.id === String(form.get("evidence_id")),
              );
              if (!record) throw Error("Choose demand evidence");
              return {
                version: opportunity.version,
                evidence_id: record.id,
                evidence_version: record.version,
              };
            }}
          >
            <EvidenceChoice
              evidence={evidence}
              required
              label="Reviewed demand evidence"
            />
          </TypedForm>
        )}
      {owner && opportunity.stage === "EVIDENCE_REVIEW" && (
        <TypedForm
          endpoint={`/api/project-workspaces/${projectId}/digital-opportunities/${opportunity.id}/authorize`}
          label="Bind local prototype authority"
          success="Local prototype authority bound."
          payload={(form) => ({
            version: opportunity.version,
            gate_authorization_id: form.get("gate_authorization_id"),
          })}
        >
          <label>
            Executed P005 gate authorization
            <select name="gate_authorization_id" required defaultValue="">
              <option value="">Choose exact authority</option>
              {authorizations
                .filter((item) => item.gate_code === "P005_LOCAL_PROTOTYPE")
                .map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.id.slice(0, 8)} · evidence v{item.evidence_version}
                  </option>
                ))}
            </select>
          </label>
        </TypedForm>
      )}
    </div>
  );
}
