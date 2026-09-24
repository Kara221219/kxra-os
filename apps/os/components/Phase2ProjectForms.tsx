"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  RepositoryAssessment,
  RepositoryCandidate,
  RepositoryProposal,
  RepositoryQuarantine,
  YoutubeContentPackage,
  YoutubeContentReview,
} from "../lib/project-workspaces";

function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}

function ApiForm({
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
    const form = event.currentTarget;
    const data = new FormData(form);
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
      form.reset();
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

function checked(form: FormData, name: string) {
  return form.get(name) === "on";
}

function HashField({ name, label }: { name: string; label: string }) {
  return (
    <label>
      {label}
      <input name={name} required pattern="[a-f0-9]{64}" maxLength={64} />
    </label>
  );
}

export function YoutubePackageForm({ projectId }: { projectId: string }) {
  return (
    <details className="workspace-controls">
      <summary>Create exact local content package</summary>
      <ApiForm
        endpoint={`/api/project-workspaces/${projectId}/youtube-packages`}
        label="Save package draft"
        success="Content package draft saved."
        payload={(form) => ({
          topic: form.get("topic"),
          source_pack: [
            {
              source_url: form.get("source_url"),
              title: form.get("source_title"),
              published_at: form.get("published_at"),
              accessed_at: form.get("accessed_at"),
              source_type: form.get("source_type"),
            },
          ],
          claim_ledger: [
            {
              claim_id: form.get("claim_id"),
              text: form.get("claim_text"),
              source_url: form.get("source_url"),
              classification: form.get("classification"),
              script_usage: form.get("script_usage"),
              review_state: form.get("claim_state"),
            },
          ],
          script: form.get("script"),
          red_team: {
            financial_promotions_clear: checked(
              form,
              "financial_promotions_clear",
            ),
            misinformation_clear: checked(form, "misinformation_clear"),
            originality_clear: checked(form, "originality_clear"),
            advice_language_clear: checked(form, "advice_language_clear"),
          },
          storyboard: { scenes: [{ description: form.get("scene") }] },
          rights_review: {
            assets_cleared: checked(form, "assets_cleared"),
            music_cleared: checked(form, "music_cleared"),
            voice_rights_cleared: checked(form, "voice_rights_cleared"),
          },
          voice_provenance: {
            voice_type: form.get("voice_type"),
            provider: form.get("voice_provider"),
            rights_basis: form.get("voice_rights_basis"),
            disclosure_required: checked(form, "disclosure_required"),
            disclosure_present: checked(form, "disclosure_present"),
          },
          render_manifest: {
            render_sha256: form.get("render_sha256"),
            captions_sha256: form.get("captions_sha256"),
            duration_seconds: Number(form.get("duration_seconds")),
            format: form.get("format"),
            local_only: true,
          },
          qa_review: {
            technical: checked(form, "technical"),
            captions: checked(form, "captions"),
            editorial: checked(form, "editorial"),
            accessibility: checked(form, "accessibility"),
          },
          publication_metadata: {
            title: form.get("metadata_title"),
            description: form.get("metadata_description"),
            thumbnail_sha256: form.get("thumbnail_sha256"),
            disclosure_text: form.get("disclosure_text"),
            visibility: form.get("visibility"),
            deceptive_metadata_clear: checked(form, "deceptive_metadata_clear"),
          },
          request_id: crypto.randomUUID(),
        })}
      >
        <label>
          Topic hypothesis
          <input name="topic" required minLength={3} maxLength={500} />
        </label>
        <div className="form-grid">
          <label>
            Primary source URL
            <input name="source_url" type="url" required maxLength={2000} />
          </label>
          <label>
            Source title
            <input name="source_title" required minLength={3} maxLength={500} />
          </label>
          <label>
            Published date
            <input name="published_at" type="date" required />
          </label>
          <label>
            Accessed date
            <input name="accessed_at" type="date" required />
          </label>
          <label>
            Source type
            <select name="source_type" defaultValue="PRIMARY">
              <option>PRIMARY</option>
              <option>OFFICIAL</option>
              <option>SECONDARY</option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>
            Claim ID
            <input
              name="claim_id"
              required
              pattern="[A-Z0-9][A-Z0-9_-]{0,39}"
            />
          </label>
          <label>
            Classification
            <select name="classification" defaultValue="EXTERNAL RESEARCH">
              <option>FACT</option>
              <option>USER-SUPPLIED INFORMATION</option>
              <option>EXTERNAL RESEARCH</option>
              <option>ASSUMPTION</option>
              <option>HYPOTHESIS</option>
              <option>ESTIMATE</option>
              <option>AI INFERENCE</option>
              <option>UNRESOLVED QUESTION</option>
            </select>
          </label>
          <label>
            Claim review
            <select name="claim_state" defaultValue="NEEDS_REVIEW">
              <option>NEEDS_REVIEW</option>
              <option>SUPPORTED</option>
              <option>UNSUPPORTED</option>
            </select>
          </label>
        </div>
        <label>
          Atomic claim
          <textarea name="claim_text" required minLength={3} maxLength={2000} />
        </label>
        <label>
          Exact script usage
          <textarea
            name="script_usage"
            required
            minLength={3}
            maxLength={2000}
          />
        </label>
        <label>
          Script version
          <textarea name="script" required minLength={100} maxLength={50000} />
        </label>
        <label>
          Storyboard scene
          <textarea name="scene" required minLength={3} maxLength={5000} />
        </label>
        <div className="form-grid">
          <label>
            Voice type
            <select name="voice_type" defaultValue="SYNTHETIC">
              <option>HUMAN</option>
              <option>SYNTHETIC</option>
              <option>NONE</option>
            </select>
          </label>
          <label>
            Voice provider
            <input name="voice_provider" required maxLength={240} />
          </label>
        </div>
        <label>
          Voice consent / rights basis
          <textarea
            name="voice_rights_basis"
            required
            minLength={3}
            maxLength={2000}
          />
        </label>
        <div className="form-grid">
          <HashField name="render_sha256" label="Local render SHA-256" />
          <HashField name="captions_sha256" label="Caption artifact SHA-256" />
          <HashField name="thumbnail_sha256" label="Thumbnail SHA-256" />
          <label>
            Duration in seconds
            <input
              name="duration_seconds"
              type="number"
              min={1}
              max={43200}
              required
            />
          </label>
          <label>
            Render format
            <select name="format" defaultValue="MP4">
              <option>MP4</option>
              <option>WEBM</option>
            </select>
          </label>
          <label>
            Intended initial visibility
            <select name="visibility" defaultValue="PRIVATE">
              <option>PRIVATE</option>
              <option>UNLISTED</option>
            </select>
          </label>
        </div>
        <label>
          Metadata title
          <input name="metadata_title" required minLength={3} maxLength={100} />
        </label>
        <label>
          Metadata description
          <textarea
            name="metadata_description"
            required
            minLength={3}
            maxLength={5000}
          />
        </label>
        <label>
          Disclosure text, if required
          <textarea name="disclosure_text" maxLength={2000} />
        </label>
        <div className="check-grid">
          {[
            ["financial_promotions_clear", "Financial-promotion review passed"],
            ["misinformation_clear", "Misinformation review passed"],
            ["originality_clear", "Originality review passed"],
            ["advice_language_clear", "Advice-language review passed"],
            ["assets_cleared", "Asset rights cleared"],
            ["music_cleared", "Music rights cleared"],
            ["voice_rights_cleared", "Voice rights cleared"],
            ["disclosure_required", "Synthetic disclosure required"],
            ["disclosure_present", "Required disclosure present"],
            ["technical", "Technical QA passed"],
            ["captions", "Caption QA passed"],
            ["editorial", "Editorial QA passed"],
            ["accessibility", "Accessibility QA passed"],
            ["deceptive_metadata_clear", "Metadata review passed"],
          ].map(([name, text]) => (
            <label className="check-row" key={name}>
              <input name={name} type="checkbox" />
              {text}
            </label>
          ))}
        </div>
        <p className="notice">
          Saving records evidence only. It cannot upload, schedule or publish a
          video.
        </p>
      </ApiForm>
    </details>
  );
}

const youtubeChecks = [
  "sources",
  "claims",
  "originality",
  "rights",
  "disclosure",
  "compliance",
  "technical_qa",
  "captions",
  "metadata",
] as const;

export function YoutubeReviewForm({
  projectId,
  item,
}: {
  projectId: string;
  item: YoutubeContentPackage;
}) {
  return (
    <details className="workspace-controls">
      <summary>Review exact package v{item.current_version}</summary>
      <ApiForm
        endpoint={`/api/project-workspaces/${projectId}/youtube-package-versions/${item.version_id}/review`}
        label="Record independent review"
        success="Exact package review recorded."
        payload={(form) => ({
          expected_version: item.current_version,
          content_sha256: item.content_sha256,
          checks: Object.fromEntries(
            youtubeChecks.map((key) => [key, checked(form, key)]),
          ),
          decision: form.get("decision"),
          note: form.get("note"),
          request_id: crypto.randomUUID(),
        })}
      >
        <p className="subtle">Content hash: {item.content_sha256}</p>
        <div className="check-grid">
          {youtubeChecks.map((key) => (
            <label className="check-row" key={key}>
              <input name={key} type="checkbox" />
              {key.replaceAll("_", " ")} passed
            </label>
          ))}
        </div>
        <label>
          Decision
          <select name="decision" defaultValue="REQUEST_CHANGES">
            <option>REQUEST_CHANGES</option>
            <option>APPROVE_UPLOAD_INTENT</option>
            <option>REJECT</option>
          </select>
        </label>
        <label>
          Review note
          <textarea name="note" required minLength={3} maxLength={5000} />
        </label>
      </ApiForm>
    </details>
  );
}

export function YoutubeIntentForm({
  projectId,
  item,
  review,
}: {
  projectId: string;
  item: YoutubeContentPackage;
  review: YoutubeContentReview;
}) {
  return (
    <ApiForm
      endpoint={`/api/project-workspaces/${projectId}/youtube-upload-intents`}
      label="Create disabled upload intent"
      success="Immutable not-sent upload intent recorded."
      payload={() => ({
        package_version_id: item.version_id,
        review_id: review.id,
        content_sha256: item.content_sha256,
        idempotency_key: crypto.randomUUID(),
      })}
    >
      <p className="notice">
        This records a local intent with adapter DISABLED and delivery state
        NOT_SENT.
      </p>
    </ApiForm>
  );
}

export function RepositoryCandidateForm({ projectId }: { projectId: string }) {
  return (
    <details className="workspace-controls">
      <summary>Add metadata-only repository candidate</summary>
      <ApiForm
        endpoint={`/api/project-workspaces/${projectId}/repository-candidates`}
        label="Record pinned metadata"
        success="Metadata-only candidate recorded."
        payload={(form) => ({
          repository_owner: form.get("repository_owner"),
          repository_name: form.get("repository_name"),
          source_url: form.get("source_url"),
          default_branch: form.get("default_branch"),
          commit_sha: form.get("commit_sha"),
          tree_sha: form.get("tree_sha"),
          fetched_at: new Date(String(form.get("fetched_at"))).toISOString(),
          licence_observation: form.get("licence_observation"),
          adoption_recommendation: form.get("adoption_recommendation"),
          request_id: crypto.randomUUID(),
        })}
      >
        <div className="form-grid">
          <label>
            Repository owner
            <input name="repository_owner" required maxLength={40} />
          </label>
          <label>
            Repository name
            <input name="repository_name" required maxLength={100} />
          </label>
          <label>
            Default branch
            <input name="default_branch" required maxLength={240} />
          </label>
          <label>
            Metadata fetched at
            <input name="fetched_at" type="datetime-local" required />
          </label>
        </div>
        <label>
          Exact public GitHub URL
          <input name="source_url" type="url" required maxLength={300} />
        </label>
        <div className="form-grid">
          <label>
            Full commit SHA
            <input
              name="commit_sha"
              required
              pattern="[a-f0-9]{40}"
              maxLength={40}
            />
          </label>
          <label>
            Full tree SHA
            <input
              name="tree_sha"
              required
              pattern="[a-f0-9]{40}"
              maxLength={40}
            />
          </label>
        </div>
        <label>
          Licence observation
          <textarea
            name="licence_observation"
            required
            minLength={3}
            maxLength={3000}
          />
        </label>
        <label>
          Initial adoption recommendation
          <textarea
            name="adoption_recommendation"
            required
            minLength={3}
            maxLength={3000}
          />
        </label>
        <p className="notice">
          This stores metadata only and cannot fetch or execute repository
          content.
        </p>
      </ApiForm>
    </details>
  );
}

const repositoryControlKeys = [
  "hooks_disabled",
  "submodules_disabled",
  "lifecycle_scripts_disabled",
  "actions_disabled",
  "network_disabled",
  "secrets_absent",
  "path_traversal_rejected",
  "symlink_escape_rejected",
  "archive_bomb_rejected",
  "binary_policy_passed",
] as const;

export function RepositoryQuarantineForm({
  projectId,
  candidate,
}: {
  projectId: string;
  candidate: RepositoryCandidate;
}) {
  if (!candidate.tree_sha) return null;
  return (
    <details className="workspace-controls">
      <summary>Record bounded quarantine evidence</summary>
      <ApiForm
        endpoint={`/api/project-workspaces/${projectId}/repository-candidates/${candidate.id}/quarantine`}
        label="Record quarantine evidence"
        success="Quarantine evidence recorded."
        payload={(form) => ({
          commit_sha: candidate.commit_sha,
          tree_sha: candidate.tree_sha,
          archive_sha256: form.get("archive_sha256"),
          manifest_sha256: form.get("manifest_sha256"),
          archive_size_bytes: Number(form.get("archive_size_bytes")),
          controls: Object.fromEntries(
            repositoryControlKeys.map((key) => [key, checked(form, key)]),
          ),
          policy_version: form.get("policy_version"),
          reason: form.get("reason"),
          request_id: crypto.randomUUID(),
        })}
      >
        <div className="form-grid">
          <HashField name="archive_sha256" label="Archive SHA-256" />
          <HashField name="manifest_sha256" label="Tree manifest SHA-256" />
          <label>
            Archive bytes
            <input
              name="archive_size_bytes"
              type="number"
              min={1}
              max={104857600}
              required
            />
          </label>
          <label>
            Extraction policy version
            <input name="policy_version" required maxLength={80} />
          </label>
        </div>
        <div className="check-grid">
          {repositoryControlKeys.map((key) => (
            <label className="check-row" key={key}>
              <input name={key} type="checkbox" />
              {key.replaceAll("_", " ")}
            </label>
          ))}
        </div>
        <label>
          Bounded result note
          <textarea name="reason" required minLength={3} maxLength={3000} />
        </label>
      </ApiForm>
    </details>
  );
}

export function RepositoryAssessmentForm({
  projectId,
  candidate,
  quarantine,
}: {
  projectId: string;
  candidate: RepositoryCandidate;
  quarantine: RepositoryQuarantine;
}) {
  const states = ["dependency", "sast", "workflow", "binary"];
  return (
    <details className="workspace-controls">
      <summary>Record licence and security assessment</summary>
      <ApiForm
        endpoint={`/api/project-workspaces/${projectId}/repository-candidates/${candidate.id}/assessments`}
        label="Record bounded assessment"
        success="Repository assessment recorded."
        payload={(form) => ({
          quarantine_id: quarantine.id,
          toolchain: {
            secret_scanner: form.get("secret_scanner"),
            malware_scanner: form.get("malware_scanner"),
            dependency_scanner: form.get("dependency_scanner"),
            sbom_tool: form.get("sbom_tool"),
            sast_tool: form.get("sast_tool"),
            workflow_inspector: form.get("workflow_inspector"),
            signatures_as_of: form.get("signatures_as_of"),
          },
          findings: [],
          licence_state: form.get("licence_state"),
          provenance_state: form.get("provenance_state"),
          secret_state: form.get("secret_state"),
          malware_state: form.get("malware_state"),
          dependency_state: form.get("dependency_state"),
          sast_state: form.get("sast_state"),
          workflow_state: form.get("workflow_state"),
          binary_state: form.get("binary_state"),
          critical_count: Number(form.get("critical_count")),
          high_count: Number(form.get("high_count")),
          bounded_conclusion: form.get("bounded_conclusion"),
          residual_risk: form.get("residual_risk"),
          request_id: crypto.randomUUID(),
        })}
      >
        <div className="form-grid">
          {[
            "secret_scanner",
            "malware_scanner",
            "dependency_scanner",
            "sbom_tool",
            "sast_tool",
            "workflow_inspector",
          ].map((name) => (
            <label key={name}>
              {name.replaceAll("_", " ")} and version
              <input name={name} required maxLength={240} />
            </label>
          ))}
          <label>
            Signatures as of
            <input name="signatures_as_of" required maxLength={240} />
          </label>
          <label>
            Licence state
            <select name="licence_state" defaultValue="AMBIGUOUS">
              <option>AMBIGUOUS</option>
              <option>CLEAR</option>
              <option>BLOCKED</option>
            </select>
          </label>
          <label>
            Provenance state
            <select name="provenance_state" defaultValue="UNRESOLVED">
              <option>UNRESOLVED</option>
              <option>CLEAR</option>
              <option>BLOCKED</option>
            </select>
          </label>
          <label>
            Secret scan
            <select name="secret_state" defaultValue="FINDING">
              <option>FINDING</option>
              <option>NO_FINDING</option>
            </select>
          </label>
          <label>
            Malware/signature scan
            <select name="malware_state" defaultValue="FINDING">
              <option>FINDING</option>
              <option>NO_FINDING</option>
            </select>
          </label>
          {states.map((name) => (
            <label key={name}>
              {name} review
              <select name={`${name}_state`} defaultValue="BLOCKED">
                <option>BLOCKED</option>
                <option>PASS</option>
              </select>
            </label>
          ))}
          <label>
            Critical findings
            <input
              name="critical_count"
              type="number"
              min={0}
              defaultValue={0}
              required
            />
          </label>
          <label>
            High findings
            <input
              name="high_count"
              type="number"
              min={0}
              defaultValue={0}
              required
            />
          </label>
        </div>
        <label>
          Bounded conclusion
          <textarea
            name="bounded_conclusion"
            required
            minLength={20}
            maxLength={3000}
          />
        </label>
        <label>
          Residual risk
          <textarea
            name="residual_risk"
            required
            minLength={3}
            maxLength={5000}
          />
        </label>
        <p className="notice">
          A pass must begin “No findings were detected in the tested scope”. The
          system rejects claims that a repository is safe, clean or
          malware-free.
        </p>
      </ApiForm>
    </details>
  );
}

export function RepositoryProposalForm({
  projectId,
  candidate,
  assessment,
}: {
  projectId: string;
  candidate: RepositoryCandidate;
  assessment: RepositoryAssessment;
}) {
  return (
    <details className="workspace-controls">
      <summary>Create exact adoption proposal</summary>
      <ApiForm
        endpoint={`/api/project-workspaces/${projectId}/repository-proposals`}
        label="Save adoption proposal"
        success="Exact adoption proposal saved."
        payload={(form) => ({
          candidate_id: candidate.id,
          assessment_id: assessment.id,
          need_statement: form.get("need_statement"),
          exact_scope: String(form.get("exact_scope"))
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          licence_obligations: form.get("licence_obligations"),
          architecture_changes: form.get("architecture_changes"),
          threat_model: form.get("threat_model"),
          test_plan: form.get("test_plan"),
          rollback_plan: form.get("rollback_plan"),
          request_id: crypto.randomUUID(),
        })}
      >
        {[
          ["need_statement", "KXRA need"],
          ["exact_scope", "Exact source files or concepts, one per line"],
          ["licence_obligations", "Licence and attribution obligations"],
          ["architecture_changes", "Architecture changes"],
          ["threat_model", "Threat model"],
          ["test_plan", "Test plan"],
          ["rollback_plan", "Rollback plan"],
        ].map(([name, label]) => (
          <label key={name}>
            {label}
            <textarea name={name} required minLength={3} maxLength={10000} />
          </label>
        ))}
      </ApiForm>
    </details>
  );
}

const repositoryReviewKeys = [
  "licence",
  "provenance",
  "security",
  "scope",
  "architecture",
  "threat_model",
  "tests",
  "rollback",
] as const;

export function RepositoryReviewForm({
  projectId,
  proposal,
}: {
  projectId: string;
  proposal: RepositoryProposal;
}) {
  return (
    <details className="workspace-controls">
      <summary>
        Review exact adoption proposal v{proposal.current_version}
      </summary>
      <ApiForm
        endpoint={`/api/project-workspaces/${projectId}/repository-proposal-versions/${proposal.version_id}/review`}
        label="Record independent adoption review"
        success="Exact adoption review recorded."
        payload={(form) => ({
          expected_version: proposal.current_version,
          proposal_sha256: proposal.proposal_sha256,
          checks: Object.fromEntries(
            repositoryReviewKeys.map((key) => [key, checked(form, key)]),
          ),
          decision: form.get("decision"),
          note: form.get("note"),
          request_id: crypto.randomUUID(),
        })}
      >
        <div className="check-grid">
          {repositoryReviewKeys.map((key) => (
            <label className="check-row" key={key}>
              <input name={key} type="checkbox" />
              {key.replaceAll("_", " ")} passed
            </label>
          ))}
        </div>
        <label>
          Decision
          <select name="decision" defaultValue="REQUEST_CHANGES">
            <option>REQUEST_CHANGES</option>
            <option>APPROVE_IMPLEMENTATION_INTENT</option>
            <option>REJECT</option>
          </select>
        </label>
        <label>
          Review note
          <textarea name="note" required minLength={3} maxLength={5000} />
        </label>
      </ApiForm>
    </details>
  );
}

export function RepositoryIntentForm({
  projectId,
  proposal,
  reviewId,
}: {
  projectId: string;
  proposal: RepositoryProposal;
  reviewId: string;
}) {
  return (
    <ApiForm
      endpoint={`/api/project-workspaces/${projectId}/repository-implementation-intents`}
      label="Record isolated-branch intent"
      success="No-execution implementation intent recorded."
      payload={(form) => ({
        proposal_version_id: proposal.version_id,
        review_id: reviewId,
        proposal_sha256: proposal.proposal_sha256,
        branch_name: form.get("branch_name"),
        idempotency_key: crypto.randomUUID(),
      })}
    >
      <label>
        Isolated branch name
        <input
          name="branch_name"
          required
          pattern="codex/[a-z0-9]+(?:-[a-z0-9]+)*"
          maxLength={120}
        />
      </label>
      <p className="notice">
        This record cannot create a branch, copy code, merge, release or deploy.
      </p>
    </ApiForm>
  );
}
