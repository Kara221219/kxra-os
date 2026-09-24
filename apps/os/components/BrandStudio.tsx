"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { BrandStudioSnapshot } from "../lib/brand-studio";

type Project = { id: string; code: string; name: string };
type Source = {
  id: string;
  project_id: string;
  project_code: string;
  source_type: string;
  locator: string | null;
  rights_basis: string;
  source_version_id: string;
  fetch_state: string;
  security_result: string;
  source_classification: string;
  created_at: string;
};
type ProfileData = {
  business_name: string;
  summary: string;
  tone: string[];
  audiences: string[];
  offers: string[];
  prohibited_claims: string[];
  required_disclaimers: string[];
  palette: string[];
  typography: string[];
};
type Profile = {
  id: string;
  project_id: string;
  project_code: string;
  name: string;
  current_version: number;
  approved_version: number | null;
  state: string;
  profile_data: ProfileData;
  profile_sha256: string;
  current_status: string;
  classification: string;
  evidence_count: number;
};
type Campaign = {
  id: string;
  project_id: string;
  project_code: string;
  profile_id: string;
  name: string;
  current_version: number;
  approved_version: number | null;
  state: string;
  objective: string;
  audience: string;
  offer: string;
  channels: string[];
  constraints: string;
  claims: { text: string; evidence_note: string }[];
  success_measure: string;
  current_status: string;
};
type CreativeContent = {
  headline: string;
  body: string;
  call_to_action: string;
  alt_text: string;
  warnings: string[];
};
type Variant = {
  id: string;
  project_id: string;
  project_code: string;
  request_id: string;
  channel: string;
  content: CreativeContent;
  content_sha256: string;
  parent_variant_id: string | null;
  state: string;
  adapter: string;
  adapter_version: string;
  latest_review_id: string | null;
  latest_decision: string | null;
  latest_checks: Record<string, boolean> | null;
  latest_review_note: string | null;
  export_id: string | null;
  export_format: string | null;
  export_state: string | null;
  created_at: string;
};
type Export = {
  id: string;
  project_id: string;
  project_code: string;
  variant_id: string;
  export_format: string;
  state: string;
  created_at: string;
  delivered_at: string | null;
};

function lines(value: FormDataEntryValue | null) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function request(url: string, payload: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error || "Brand Studio action unavailable");
  return result;
}

function Usage({
  label,
  decision,
}: {
  label: string;
  decision: BrandStudioSnapshot["entitlements"]["access"];
}) {
  const limit = decision.quantity_limit;
  return (
    <div className="stat">
      <p>{label}</p>
      <strong>{decision.allowed ? "Available" : "Locked"}</strong>
      <span className="subtle">
        {limit
          ? `${decision.consumed_units} used · ${decision.reserved_units} reserved · ${limit} limit`
          : decision.reason.replaceAll("_", " ")}
      </span>
    </div>
  );
}

function SourceAndProfileForm({ projects }: { projects: Project[] }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const projectId = String(form.get("project_id"));
      const websiteUrl = String(form.get("website_url") || "").trim();
      const source = await request("/api/brand-studio/sources", {
        project_id: projectId,
        source_type: websiteUrl ? "WEBSITE" : "MANUAL",
        website_url: websiteUrl || null,
        source_text: form.get("source_text"),
        rights_basis: form.get("rights_basis"),
        consent: form.get("consent") === "on",
        request_id: crypto.randomUUID(),
      });
      await request("/api/brand-studio/profiles", {
        project_id: projectId,
        source_version_id: source.source_version_id,
        name: form.get("profile_name"),
        business_name: form.get("business_name") || null,
        tone: form.get("tone"),
        audiences: form.get("audiences"),
        offers: form.get("offers"),
        request_id: crypto.randomUUID(),
      });
      setMessage("Draft profile created from the supplied source snapshot.");
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
      setBusy(false);
    }
  }
  return (
    <form className="panel form-grid brand-form" onSubmit={submit}>
      <h2>Create a source-linked profile</h2>
      <p>
        Website fetching is disabled. Supply a public HTTPS address and paste
        the public text you want KXRA to use, or leave the address blank for a
        manual source. Every inferred field remains a draft until you approve
        it.
      </p>
      <label>
        Project
        <select name="project_id" required>
          {projects.map((project) => (
            <option value={project.id} key={project.id}>
              {project.code} · {project.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Public website (optional)
        <input
          name="website_url"
          type="url"
          placeholder="https://example.com"
          maxLength={2000}
        />
      </label>
      <label>
        Supplied source snapshot
        <textarea name="source_text" rows={7} required maxLength={50000} />
      </label>
      <label>
        Rights basis
        <textarea
          name="rights_basis"
          rows={3}
          required
          maxLength={2000}
          placeholder="I own this website/content or have authority to use it."
        />
      </label>
      <label className="check-row">
        <input name="consent" type="checkbox" required />I consent to KXRA
        processing this supplied material for this private Brand Studio project.
      </label>
      <label>
        Profile name
        <input name="profile_name" required maxLength={160} />
      </label>
      <label>
        Business name (optional inference correction)
        <input name="business_name" maxLength={160} />
      </label>
      <label>
        Tone words
        <input name="tone" placeholder="clear, credible, practical" />
      </label>
      <label>
        Audiences
        <textarea name="audiences" rows={3} />
      </label>
      <label>
        Offers
        <textarea name="offers" rows={3} />
      </label>
      <button type="submit" disabled={busy || !projects.length}>
        {busy ? "Creating…" : "Create draft profile"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

function ProfileCard({
  profile,
  sources,
}: {
  profile: Profile;
  sources: Source[];
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const projectSources = sources.filter(
    (source) => source.project_id === profile.project_id,
  );
  async function decide(decision: "APPROVE" | "REJECT") {
    setBusy(true);
    setMessage("");
    try {
      await request(`/api/brand-studio/profiles/${profile.id}/decision`, {
        version: profile.current_version,
        decision,
        note:
          decision === "APPROVE"
            ? "Customer reviewed and approved this exact profile version."
            : "Customer rejected this draft profile version.",
      });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
      setBusy(false);
    }
  }
  async function revise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await request(`/api/brand-studio/profiles/${profile.id}/revise`, {
        expected_version: profile.current_version,
        source_version_id: form.get("source_version_id"),
        profile_data: {
          business_name: form.get("business_name"),
          summary: form.get("summary"),
          tone: lines(form.get("tone")),
          audiences: lines(form.get("audiences")),
          offers: lines(form.get("offers")),
          prohibited_claims: lines(form.get("prohibited_claims")),
          required_disclaimers: lines(form.get("required_disclaimers")),
          palette: lines(form.get("palette")),
          typography: lines(form.get("typography")),
        },
        request_id: crypto.randomUUID(),
      });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
      setBusy(false);
    }
  }
  return (
    <article className="record">
      <div className="record-top">
        <h3>{profile.name}</h3>
        <span className="badge">{profile.current_status}</span>
      </div>
      <p>{profile.profile_data.summary}</p>
      <dl className="definition">
        <dt>Business</dt>
        <dd>{profile.profile_data.business_name}</dd>
        <dt>Tone</dt>
        <dd>{profile.profile_data.tone.join(", ")}</dd>
        <dt>Audiences</dt>
        <dd>{profile.profile_data.audiences.join(", ")}</dd>
        <dt>Offers</dt>
        <dd>{profile.profile_data.offers.join(", ")}</dd>
        <dt>Evidence</dt>
        <dd>{profile.evidence_count} source-linked field(s)</dd>
        <dt>Version</dt>
        <dd>
          current {profile.current_version} · approved{" "}
          {profile.approved_version || "none"}
        </dd>
      </dl>
      {profile.current_status === "DRAFT" && (
        <div className="record-actions">
          <button disabled={busy} onClick={() => decide("APPROVE")}>
            Approve exact profile
          </button>
          <button disabled={busy} onClick={() => decide("REJECT")}>
            Reject draft
          </button>
        </div>
      )}
      <details>
        <summary>Edit as a new version</summary>
        <form className="form-grid compact-form" onSubmit={revise}>
          <label>
            Evidence source
            <select name="source_version_id" required>
              {projectSources.map((source) => (
                <option
                  value={source.source_version_id}
                  key={source.source_version_id}
                >
                  {source.source_type} · {source.locator || "manual source"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Business name
            <input
              name="business_name"
              defaultValue={profile.profile_data.business_name}
              required
            />
          </label>
          <label>
            Summary
            <textarea
              name="summary"
              defaultValue={profile.profile_data.summary}
              rows={5}
              required
            />
          </label>
          {[
            ["tone", "Tone", profile.profile_data.tone],
            ["audiences", "Audiences", profile.profile_data.audiences],
            ["offers", "Offers", profile.profile_data.offers],
            [
              "prohibited_claims",
              "Prohibited claims",
              profile.profile_data.prohibited_claims,
            ],
            [
              "required_disclaimers",
              "Required disclaimers",
              profile.profile_data.required_disclaimers,
            ],
            ["palette", "Palette hex colours", profile.profile_data.palette],
            [
              "typography",
              "Typography references",
              profile.profile_data.typography,
            ],
          ].map(([name, label, value]) => (
            <label key={String(name)}>
              {String(label)}
              <textarea
                name={String(name)}
                defaultValue={(value as string[]).join("\n")}
                rows={3}
                required={["tone", "audiences", "offers"].includes(
                  String(name),
                )}
              />
            </label>
          ))}
          <button disabled={busy || !projectSources.length}>
            Save new draft version
          </button>
        </form>
      </details>
      {message && <p role="status">{message}</p>}
    </article>
  );
}

function CampaignForm({ profiles }: { profiles: Profile[] }) {
  const approved = profiles.filter((profile) => profile.approved_version);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const profile = approved.find((item) => item.id === form.get("profile_id"));
    if (!profile) return;
    const claim = String(form.get("claim") || "").trim();
    const claimEvidence = String(form.get("claim_evidence") || "").trim();
    try {
      await request("/api/brand-studio/campaigns", {
        project_id: profile.project_id,
        profile_id: profile.id,
        profile_version: profile.approved_version,
        name: form.get("name"),
        objective: form.get("objective"),
        audience: form.get("audience"),
        offer: form.get("offer"),
        channels: form.getAll("channels"),
        constraints: form.get("constraints") || "",
        claims: claim ? [{ text: claim, evidence_note: claimEvidence }] : [],
        success_measure: form.get("success_measure"),
        request_id: crypto.randomUUID(),
      });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
      setBusy(false);
    }
  }
  return (
    <form className="panel form-grid brand-form" onSubmit={submit}>
      <h2>Create a campaign brief</h2>
      <label>
        Approved brand profile
        <select name="profile_id" required>
          {approved.map((profile) => (
            <option value={profile.id} key={profile.id}>
              {profile.project_code} · {profile.name} · v
              {profile.approved_version}
            </option>
          ))}
        </select>
      </label>
      <label>
        Brief name
        <input name="name" required maxLength={160} />
      </label>
      <label>
        Objective
        <textarea name="objective" required rows={3} />
      </label>
      <label>
        Audience
        <textarea name="audience" required rows={3} />
      </label>
      <label>
        Offer
        <textarea name="offer" required rows={3} />
      </label>
      <fieldset>
        <legend>Channels</legend>
        <div className="check-grid">
          {["LINKEDIN", "INSTAGRAM", "FACEBOOK", "EMAIL", "WEB", "YOUTUBE"].map(
            (channel) => (
              <label className="check-row" key={channel}>
                <input type="checkbox" name="channels" value={channel} />{" "}
                {channel}
              </label>
            ),
          )}
        </div>
      </fieldset>
      <label>
        Constraints
        <textarea name="constraints" rows={3} />
      </label>
      <label>
        Claim requiring review (optional)
        <textarea name="claim" rows={2} />
      </label>
      <label>
        Claim evidence note
        <textarea name="claim_evidence" rows={2} />
      </label>
      <label>
        Success measure
        <textarea name="success_measure" required rows={3} />
      </label>
      <button disabled={busy || !approved.length}>
        {busy ? "Creating…" : "Create draft brief"}
      </button>
      {!approved.length && (
        <p className="subtle">Approve a brand profile first.</p>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function decide(decision: "APPROVE" | "REJECT") {
    setBusy(true);
    try {
      await request(`/api/brand-studio/campaigns/${campaign.id}/decision`, {
        version: campaign.current_version,
        decision,
        note:
          decision === "APPROVE"
            ? "Customer reviewed and approved this exact campaign brief."
            : "Customer rejected this campaign brief.",
      });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
      setBusy(false);
    }
  }
  return (
    <article className="record">
      <div className="record-top">
        <h3>{campaign.name}</h3>
        <span className="badge">{campaign.current_status}</span>
      </div>
      <p>{campaign.objective}</p>
      <footer>
        <span>{campaign.project_code}</span>
        <span>{campaign.channels.join(", ")}</span>
        <span>{campaign.claims.length} claim(s) requiring review</span>
      </footer>
      {campaign.current_status === "DRAFT" && (
        <div className="record-actions">
          <button disabled={busy} onClick={() => decide("APPROVE")}>
            Approve exact brief
          </button>
          <button disabled={busy} onClick={() => decide("REJECT")}>
            Reject draft
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}

function GenerateForm({
  profiles,
  campaigns,
  enabled,
}: {
  profiles: Profile[];
  campaigns: Campaign[];
  enabled: boolean;
}) {
  const approvedCampaigns = campaigns.filter(
    (campaign) => campaign.approved_version,
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const campaign = approvedCampaigns.find(
      (item) => item.id === form.get("brief_id"),
    );
    const profile = profiles.find((item) => item.id === campaign?.profile_id);
    if (!campaign || !profile?.approved_version || !campaign.approved_version)
      return;
    try {
      await request("/api/brand-studio/generate", {
        project_id: campaign.project_id,
        profile_id: profile.id,
        profile_version: profile.approved_version,
        brief_id: campaign.id,
        brief_version: campaign.approved_version,
        channels: campaign.channels,
        variant_count: Math.min(6, campaign.channels.length),
        request_id: crypto.randomUUID(),
      });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
      setBusy(false);
    }
  }
  return (
    <form className="panel form-grid brand-form" onSubmit={submit}>
      <h2>Generate review drafts</h2>
      <p>
        The local deterministic adapter creates one text draft per approved
        channel. It makes no model or network call and cannot publish.
      </p>
      <label>
        Approved campaign
        <select name="brief_id" required>
          {approvedCampaigns.map((campaign) => (
            <option value={campaign.id} key={campaign.id}>
              {campaign.project_code} · {campaign.name} · v
              {campaign.approved_version}
            </option>
          ))}
        </select>
      </label>
      <button disabled={busy || !enabled || !approvedCampaigns.length}>
        {busy ? "Generating…" : "Reserve usage and generate"}
      </button>
      {!enabled && (
        <p className="subtle">Generation is disabled in this environment.</p>
      )}
      {message && <p role="status">{message}</p>}
    </form>
  );
}

function VariantCard({ variant }: { variant: Variant }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await request(`/api/brand-studio/variants/${variant.id}/revise`, {
        expected_sha256: variant.content_sha256,
        content: {
          headline: form.get("headline"),
          body: form.get("body"),
          call_to_action: form.get("call_to_action"),
          alt_text: form.get("alt_text"),
          warnings: lines(form.get("warnings")),
        },
        request_id: crypto.randomUUID(),
      });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
      setBusy(false);
    }
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await request(`/api/brand-studio/variants/${variant.id}/review`, {
        expected_sha256: variant.content_sha256,
        checks: {
          brand: form.get("brand") === "on",
          claims: form.get("claims") === "on",
          rights: form.get("rights") === "on",
          accessibility: form.get("accessibility") === "on",
          compliance: form.get("compliance") === "on",
        },
        decision: form.get("decision"),
        note: form.get("note"),
        request_id: crypto.randomUUID(),
      });
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
      setBusy(false);
    }
  }
  async function createExport(format: "TEXT" | "MARKDOWN" | "JSON") {
    if (!variant.latest_review_id) return;
    setBusy(true);
    try {
      const result = await request("/api/brand-studio/exports", {
        variant_id: variant.id,
        expected_sha256: variant.content_sha256,
        review_id: variant.latest_review_id,
        format,
        request_id: crypto.randomUUID(),
      });
      window.location.assign(`/api/brand-studio/exports/${result.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
      setBusy(false);
    }
  }
  return (
    <article className="record">
      <div className="record-top">
        <h3>{variant.content.headline}</h3>
        <span className="badge">{variant.state}</span>
      </div>
      <p>{variant.content.body}</p>
      <p>
        <strong>Call to action:</strong> {variant.content.call_to_action}
      </p>
      <p>
        <strong>Alt text:</strong> {variant.content.alt_text}
      </p>
      <ul>
        {variant.content.warnings.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
      <footer>
        <span>
          {variant.project_code} · {variant.channel}
        </span>
        <span>
          {variant.adapter} · {variant.adapter_version}
        </span>
      </footer>
      <details>
        <summary>Edit as a new variant</summary>
        <form className="form-grid compact-form" onSubmit={edit}>
          <label>
            Headline
            <input
              name="headline"
              defaultValue={variant.content.headline}
              required
            />
          </label>
          <label>
            Body
            <textarea
              name="body"
              defaultValue={variant.content.body}
              rows={6}
              required
            />
          </label>
          <label>
            Call to action
            <input
              name="call_to_action"
              defaultValue={variant.content.call_to_action}
              required
            />
          </label>
          <label>
            Alt text
            <textarea
              name="alt_text"
              defaultValue={variant.content.alt_text}
              rows={3}
              required
            />
          </label>
          <label>
            Warnings
            <textarea
              name="warnings"
              defaultValue={variant.content.warnings.join("\n")}
              rows={3}
            />
          </label>
          <button disabled={busy}>Save edited variant</button>
        </form>
      </details>
      {!variant.export_id && (
        <details open={variant.state === "REVIEW_REQUIRED"}>
          <summary>Review for export</summary>
          <form className="form-grid compact-form" onSubmit={review}>
            <div className="check-grid">
              {[
                ["brand", "Matches the approved brand profile"],
                ["claims", "Claims are supported or removed"],
                ["rights", "Inputs and intended use have appropriate rights"],
                [
                  "accessibility",
                  "Alt text and accessible treatment are adequate",
                ],
                [
                  "compliance",
                  "Compliance and required disclaimers are addressed",
                ],
              ].map(([name, label]) => (
                <label className="check-row" key={name}>
                  <input type="checkbox" name={name} /> {label}
                </label>
              ))}
            </div>
            <label>
              Decision
              <select name="decision" required defaultValue="APPROVE_EXPORT">
                <option value="APPROVE_EXPORT">Approve for export</option>
                <option value="REQUEST_CHANGES">Request changes</option>
                <option value="REJECT">Reject</option>
              </select>
            </label>
            <label>
              Review note
              <textarea name="note" rows={3} required />
            </label>
            <button disabled={busy}>Record exact review</button>
          </form>
        </details>
      )}
      {variant.latest_decision === "APPROVE_EXPORT" && !variant.export_id && (
        <div className="record-actions">
          <button disabled={busy} onClick={() => createExport("TEXT")}>
            Export text
          </button>
          <button disabled={busy} onClick={() => createExport("MARKDOWN")}>
            Export Markdown
          </button>
          <button disabled={busy} onClick={() => createExport("JSON")}>
            Export JSON
          </button>
        </div>
      )}
      {variant.export_id && (
        <a href={`/api/brand-studio/exports/${variant.export_id}`}>
          Download {variant.export_format} export ↗
        </a>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}

export default function BrandStudio({
  snapshot,
  projects,
}: {
  snapshot: BrandStudioSnapshot;
  projects: Project[];
}) {
  const sources = snapshot.sources as Source[];
  const profiles = snapshot.profiles as Profile[];
  const campaigns = snapshot.campaigns as Campaign[];
  const variants = snapshot.variants as Variant[];
  const exports = snapshot.exports as Export[];
  const accessibleProjects = useMemo(
    () => projects.filter((project) => project.id),
    [projects],
  );
  if (!snapshot.entitlements.access.allowed)
    return (
      <div className="panel">
        <h2>Brand Studio is not included</h2>
        <p>
          This organization has no current Brand Studio subscription entitlement
          or free owner grant. No private Brand Studio records were loaded.
        </p>
        <span className="badge amber">
          {snapshot.entitlements.access.reason.replaceAll("_", " ")}
        </span>
      </div>
    );
  return (
    <>
      <div className="stats brand-usage">
        <Usage label="Studio access" decision={snapshot.entitlements.access} />
        <Usage label="Generation" decision={snapshot.entitlements.generate} />
        <Usage label="Exports" decision={snapshot.entitlements.export} />
      </div>
      <p className="notice">
        Source snapshots and generated drafts stay inside the selected project.
        Export requires an exact five-part review. Publication, scheduling,
        website fetching and external AI generation remain disabled.
      </p>
      <SourceAndProfileForm projects={accessibleProjects} />
      <section className="studio-section">
        <h2>Brand profiles</h2>
        <div className="record-list">
          {profiles.map((profile) => (
            <ProfileCard profile={profile} sources={sources} key={profile.id} />
          ))}
          {!profiles.length && (
            <div className="empty">No brand profiles yet.</div>
          )}
        </div>
      </section>
      <CampaignForm profiles={profiles} />
      <section className="studio-section">
        <h2>Campaign briefs</h2>
        <div className="record-list">
          {campaigns.map((campaign) => (
            <CampaignCard campaign={campaign} key={campaign.id} />
          ))}
          {!campaigns.length && (
            <div className="empty">No campaign briefs yet.</div>
          )}
        </div>
      </section>
      <GenerateForm
        profiles={profiles}
        campaigns={campaigns}
        enabled={
          snapshot.generation_available &&
          snapshot.entitlements.generate.allowed
        }
      />
      <section className="studio-section">
        <h2>Creative review queue</h2>
        <div className="record-list">
          {variants.map((variant) => (
            <VariantCard variant={variant} key={variant.id} />
          ))}
          {!variants.length && (
            <div className="empty">No generated variants yet.</div>
          )}
        </div>
      </section>
      <section className="panel studio-section">
        <h2>Export history</h2>
        {exports.map((item) => (
          <div className="list-item" key={item.id}>
            <a href={`/api/brand-studio/exports/${item.id}`}>
              {item.project_code} · {item.export_format} export
            </a>
            <p>
              {item.state} · {new Date(item.created_at).toLocaleString("en-GB")}
            </p>
          </div>
        ))}
        {!exports.length && <p>No approved exports yet.</p>}
      </section>
    </>
  );
}
