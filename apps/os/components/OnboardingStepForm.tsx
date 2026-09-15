"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ProjectAccess = {
  project_id: string;
  project_code: string;
  project_name: string;
  project_role: "viewer" | "contributor";
  access_expires_at: string | null;
  summary: string;
  permissions: string[];
};
type Agreement = {
  id: string;
  document_key: string;
  version: number;
  title: string;
  body: string;
  status: "APPROVED" | "UNAPPROVED_PLACEHOLDER";
};
type Profile = {
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  company: string | null;
  phone: string | null;
  mfa_state: string;
};
type Preferences = {
  timezone: string;
  email_notifications: boolean;
  whatsapp_notifications: boolean;
  display_density: "comfortable" | "compact";
};

const titles = [
  "Welcome to KXRA",
  "Personal Profile",
  "Security",
  "Project Access",
  "Working With KXRA",
  "WhatsApp",
  "Preferences",
  "Terms, Privacy & Required Agreements",
  "Complete",
];

export default function OnboardingStepForm({
  step,
  currentStep,
  completedSteps,
  projects,
  agreements,
  profile,
  preferences,
  recipientHint,
}: {
  step: number;
  currentStep: number;
  completedSteps: number[];
  projects: ProjectAccess[];
  agreements: Agreement[];
  profile: Profile;
  preferences: Preferences;
  recipientHint: string;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ready) return;
    const form = new FormData(event.currentTarget);
    let data: Record<string, unknown>;
    switch (step) {
      case 1:
        data = { acknowledged: form.get("acknowledged") === "on" };
        break;
      case 2:
        data = {
          first_name: form.get("first_name"),
          last_name: form.get("last_name"),
          job_title: form.get("job_title"),
          company: form.get("company"),
          phone: form.get("phone"),
        };
        break;
      case 3:
        data = {
          security_acknowledged: form.get("security_acknowledged") === "on",
        };
        break;
      case 4:
        data = {
          access_acknowledged: form.get("access_acknowledged") === "on",
        };
        break;
      case 5:
        data = {
          working_acknowledged: form.get("working_acknowledged") === "on",
        };
        break;
      case 6:
        data = { whatsapp_choice: form.get("whatsapp_choice") };
        break;
      case 7:
        data = {
          timezone: form.get("timezone"),
          email_notifications: form.get("email_notifications") === "on",
          whatsapp_notifications: false,
          display_density: form.get("display_density"),
        };
        break;
      case 8:
        data = {
          agreement_ids: form.getAll("agreement_id"),
          placeholder_acknowledged:
            form.get("placeholder_acknowledged") === "on",
        };
        break;
      default:
        data = { complete: form.get("complete") === "on" };
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/onboarding/step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, data }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign(
        result.complete ? "/os?tour=1" : `/onboarding?step=${result.next}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Step unavailable");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="onboarding-form" onSubmit={submit}>
      <header>
        <p className="eyebrow">Step {step} of 9</p>
        <h1>{titles[step - 1]}</h1>
      </header>

      {step === 1 && (
        <>
          <p>
            KXRA is an AI-native venture group that turns evidence into
            controlled experiments and decisions. Your access is limited to the
            projects below.
          </p>
          <ProjectCards projects={projects} compact />
          <Check
            name="acknowledged"
            label="I understand that KXRA access is project-scoped."
          />
        </>
      )}

      {step === 2 && (
        <div className="form-grid">
          <label>
            First name
            <input
              name="first_name"
              defaultValue={profile.first_name || ""}
              required
              maxLength={100}
            />
          </label>
          <label>
            Last name
            <input
              name="last_name"
              defaultValue={profile.last_name || ""}
              required
              maxLength={100}
            />
          </label>
          <label>
            Role or title
            <input
              name="job_title"
              defaultValue={profile.job_title || ""}
              maxLength={160}
            />
          </label>
          <label>
            Employer or company
            <input
              name="company"
              defaultValue={profile.company || ""}
              maxLength={200}
            />
          </label>
          <label>
            Phone (optional)
            <input
              name="phone"
              type="tel"
              defaultValue={profile.phone || ""}
              maxLength={40}
              autoComplete="tel"
            />
          </label>
          <p className="notice">
            A profile image remains optional and unavailable until KXRA’s
            trusted file pipeline is implemented. No organisation or access
            setting can be changed here.
          </p>
        </div>
      )}

      {step === 3 && (
        <>
          <dl className="definition-list">
            <div>
              <dt>Verified account</dt>
              <dd>{recipientHint}</dd>
            </div>
            <div>
              <dt>MFA evidence</dt>
              <dd>{profile.mfa_state.replaceAll("_", " ")}</dd>
            </div>
          </dl>
          <p>
            Keep your password private. KXRA never stores it. Partner MFA can be
            managed from Security after onboarding; owner MFA is mandatory for
            controlled actions.
          </p>
          <Check
            name="security_acknowledged"
            label="I understand the account security requirements."
          />
        </>
      )}

      {step === 4 && (
        <>
          <ProjectCards projects={projects} />
          <Check
            name="access_acknowledged"
            label="I have reviewed my read-only project roles and permissions."
          />
        </>
      )}

      {step === 5 && (
        <>
          <p>Your partner workspace includes these scoped destinations:</p>
          <ul className="feature-list">
            {[
              "My Projects — assigned ventures only",
              "Ask KXRA — evidence retrieval within one selected project",
              "Ideas — your submissions and explicit shares",
              "Tasks and Files — authorized project work",
              "Activity — your permitted operating history",
              "WhatsApp — optional paired access when enabled",
            ].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Check
            name="working_acknowledged"
            label="I understand how to work within KXRA OS."
          />
        </>
      )}

      {step === 6 && (
        <fieldset>
          <legend>Choose how to continue</legend>
          <label className="choice-card">
            <input
              type="radio"
              name="whatsapp_choice"
              value="SKIP"
              defaultChecked
              required
            />
            <span>
              <strong>Skip for now</strong>
              <small>Onboarding continues without WhatsApp.</small>
            </span>
          </label>
          <label className="choice-card">
            <input
              type="radio"
              name="whatsapp_choice"
              value="CONNECT_LATER"
              required
            />
            <span>
              <strong>Connect later</strong>
              <small>
                The pairing gateway remains disabled in this milestone.
              </small>
            </span>
          </label>
        </fieldset>
      )}

      {step === 7 && (
        <>
          <label>
            Timezone
            <select name="timezone" defaultValue={preferences.timezone}>
              <option value="Europe/London">Europe/London</option>
              <option value="America/New_York">America/New_York</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="UTC">UTC</option>
            </select>
          </label>
          <Check
            name="email_notifications"
            label="Receive permitted account and project email"
            defaultChecked={preferences.email_notifications}
          />
          <label>
            Display density
            <select
              name="display_density"
              defaultValue={preferences.display_density}
            >
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>
          <p className="subtle">
            WhatsApp notifications remain off until a verified pairing exists.
          </p>
        </>
      )}

      {step === 8 && (
        <>
          {agreements.map((agreement) => (
            <article className="agreement" key={agreement.id}>
              <div className="record-top">
                <h2>{agreement.title}</h2>
                <span
                  className={`badge ${agreement.status === "UNAPPROVED_PLACEHOLDER" ? "amber" : ""}`}
                >
                  {agreement.status === "UNAPPROVED_PLACEHOLDER"
                    ? "UNAPPROVED PLACEHOLDER"
                    : "APPROVED"}{" "}
                  · v{agreement.version}
                </span>
              </div>
              <p>{agreement.body}</p>
              <Check
                name="agreement_id"
                value={agreement.id}
                label={`Acknowledge this exact version: ${agreement.title}`}
              />
            </article>
          ))}
          <Check
            name="placeholder_acknowledged"
            label="I understand that documents marked UNAPPROVED PLACEHOLDER are not approved legal terms or a privacy notice."
          />
        </>
      )}

      {step === 9 && (
        <>
          <p>
            Your profile, project access, preferences and required
            acknowledgements are ready.
          </p>
          <ProjectCards projects={projects} compact />
          <Check
            name="complete"
            label="Complete onboarding and open my KXRA dashboard."
          />
        </>
      )}

      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
      <div className="wizard-actions">
        {step > 1 && (
          <Link
            className="button secondary"
            href={`/onboarding?step=${step - 1}`}
          >
            Back
          </Link>
        )}
        <button disabled={busy || !ready}>
          {busy
            ? "Saving…"
            : step === 9
              ? "Complete onboarding"
              : "Save and continue"}
        </button>
      </div>
      {completedSteps.includes(step) && step < currentStep && (
        <p className="subtle">
          This step was completed earlier. Saving again updates permitted values
          without resetting later progress.
        </p>
      )}
    </form>
  );
}

function Check({
  name,
  label,
  value,
  defaultChecked,
}: {
  name: string;
  label: string;
  value?: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="check-row">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        required
      />
      <span>{label}</span>
    </label>
  );
}

function ProjectCards({
  projects,
  compact = false,
}: {
  projects: ProjectAccess[];
  compact?: boolean;
}) {
  return (
    <div className={`access-cards ${compact ? "compact" : ""}`}>
      {projects.map((project) => (
        <article key={project.project_id}>
          <small>{project.project_code}</small>
          <h3>{project.project_name}</h3>
          <span className="badge">{project.project_role}</span>
          {!compact && (
            <>
              <p>{project.summary}</p>
              <ul>
                {project.permissions.map((permission) => (
                  <li key={permission}>{permission}</li>
                ))}
              </ul>
              <p className="subtle">
                {project.access_expires_at
                  ? `Access expires ${new Date(project.access_expires_at).toLocaleDateString("en-GB")}`
                  : "No assignment expiry set"}
              </p>
            </>
          )}
        </article>
      ))}
    </div>
  );
}
