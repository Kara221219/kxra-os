"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Profile = {
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  company: string | null;
  phone: string | null;
  account_state: string;
  mfa_state: string;
  onboarding_completed_at: string | null;
};
type Preferences = {
  timezone: string;
  email_notifications: boolean;
  whatsapp_notifications: boolean;
  security_alerts: boolean;
  display_density: "comfortable" | "compact";
};
type Assignment = {
  project_id: string;
  code: string;
  name: string;
  role: "viewer" | "contributor";
  active: boolean;
  expires_at: string | null;
};
type SecurityEvent = {
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

async function request(url: string, method: string, data: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Action unavailable");
  return result;
}

function useAction() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await work();
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action unavailable");
    } finally {
      setBusy(false);
    }
  };
  return { message, busy, run };
}

export default function AccountControls({
  profile,
  preferences,
  assignments,
  securityEvents,
  email,
  role,
  source,
  hasActivePairing,
}: {
  profile: Profile;
  preferences: Preferences;
  assignments: Assignment[];
  securityEvents: SecurityEvent[];
  email?: string;
  role: string;
  source?: string;
  hasActivePairing: boolean;
}) {
  return (
    <div className="account-grid">
      <section className="panel account-summary">
        <div>
          <p className="eyebrow">Account</p>
          <h2>
            {profile.first_name} {profile.last_name}
          </h2>
          <p>{email}</p>
        </div>
        <dl className="definition-list">
          <div>
            <dt>Status</dt>
            <dd>
              <span className="badge">{profile.account_state}</span>
            </dd>
          </div>
          <div>
            <dt>Organisation role</dt>
            <dd>{role}</dd>
          </div>
          <div>
            <dt>Authentication</dt>
            <dd>
              {source === "fake-provider"
                ? "Local provider double"
                : source || "Hosted provider"}
            </dd>
          </div>
          <div>
            <dt>Onboarding</dt>
            <dd>
              {profile.onboarding_completed_at
                ? new Date(profile.onboarding_completed_at).toLocaleString(
                    "en-GB",
                  )
                : "Incomplete"}
            </dd>
          </div>
        </dl>
      </section>
      <ProfileForm profile={profile} />
      <PreferencesForm
        preferences={preferences}
        hasActivePairing={hasActivePairing}
      />
      <SecurityControls profile={profile} source={source} />
      <section className="panel full-span">
        <h2>Project assignments</h2>
        <p>
          Roles and permissions are read-only here and can be changed only
          through owner controls.
        </p>
        <div className="access-cards compact">
          {assignments.map((assignment) => (
            <article key={assignment.project_id}>
              <small>{assignment.code}</small>
              <h3>{assignment.name}</h3>
              <span className="badge">{assignment.role}</span>{" "}
              <span className={`badge ${assignment.active ? "" : "amber"}`}>
                {assignment.active ? "ACTIVE" : "REVOKED"}
              </span>
              <p className="subtle">
                {assignment.expires_at
                  ? `Expires ${new Date(assignment.expires_at).toLocaleString("en-GB")}`
                  : "No assignment expiry"}
              </p>
            </article>
          ))}
        </div>
      </section>
      <WhatsAppControl hasActivePairing={hasActivePairing} />
      <section className="panel full-span">
        <h2>Recent security activity</h2>
        {securityEvents.map((event, index) => (
          <div
            className="list-item"
            key={`${event.event_type}-${event.created_at}-${index}`}
          >
            <strong>{event.event_type.replaceAll("_", " ")}</strong>
            <p>{new Date(event.created_at).toLocaleString("en-GB")}</p>
          </div>
        ))}
        {!securityEvents.length && <p>No security events are visible.</p>}
      </section>
    </div>
  );
}

function ProfileForm({ profile }: { profile: Profile }) {
  const action = useAction();
  const router = useRouter();
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void action.run(
          () =>
            request("/api/account/profile", "PATCH", {
              first_name: form.get("first_name"),
              last_name: form.get("last_name"),
              job_title: form.get("job_title"),
              company: form.get("company"),
              phone: form.get("phone"),
            }).then(() => router.refresh()),
          "Profile updated.",
        );
      }}
    >
      <h2>Profile</h2>
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
          Phone
          <input
            name="phone"
            type="tel"
            defaultValue={profile.phone || ""}
            maxLength={40}
          />
        </label>
      </div>
      <button disabled={action.busy}>
        {action.busy ? "Saving…" : "Save profile"}
      </button>
      {action.message && <p role="status">{action.message}</p>}
    </form>
  );
}

function PreferencesForm({
  preferences,
  hasActivePairing,
}: {
  preferences: Preferences;
  hasActivePairing: boolean;
}) {
  const action = useAction();
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        void action.run(
          () =>
            request("/api/account/preferences", "PATCH", {
              timezone: form.get("timezone"),
              email_notifications: form.get("email_notifications") === "on",
              whatsapp_notifications:
                form.get("whatsapp_notifications") === "on",
              display_density: form.get("display_density"),
            }),
          "Preferences updated.",
        );
      }}
    >
      <h2>Preferences</h2>
      <label>
        Timezone
        <select name="timezone" defaultValue={preferences.timezone}>
          <option value="Europe/London">Europe/London</option>
          <option value="America/New_York">America/New_York</option>
          <option value="America/Los_Angeles">America/Los_Angeles</option>
          <option value="UTC">UTC</option>
        </select>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          name="email_notifications"
          defaultChecked={preferences.email_notifications}
        />
        <span>Email notifications</span>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          name="whatsapp_notifications"
          defaultChecked={preferences.whatsapp_notifications}
          disabled={!hasActivePairing}
        />
        <span>WhatsApp notifications</span>
      </label>
      {!hasActivePairing && (
        <p className="subtle">
          A verified WhatsApp pairing is required before these notifications can
          be enabled.
        </p>
      )}
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
        Security alerts remain enabled and cannot be disabled.
      </p>
      <button disabled={action.busy}>
        {action.busy ? "Saving…" : "Save preferences"}
      </button>
      {action.message && <p role="status">{action.message}</p>}
    </form>
  );
}

function SecurityControls({
  profile,
  source,
}: {
  profile: Profile;
  source?: string;
}) {
  const password = useAction();
  const mfa = useAction();
  const sessions = useAction();
  const router = useRouter();
  const localProvider = source === "fake-provider";
  const proof = () =>
    (document.getElementById("mfa-proof") as HTMLInputElement)?.value;
  const mfaRequest = (data: Record<string, unknown>) =>
    request("/api/account/mfa", "POST", data).then(() => router.refresh());
  return (
    <section className="panel full-span">
      <h2>Security</h2>
      <div className="security-grid">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void password.run(
              () =>
                request("/api/account/password", "POST", {
                  current_password: form.get("current_password"),
                  new_password: form.get("new_password"),
                  confirmation: form.get("confirmation"),
                }),
              "Password changed and earlier provider sessions invalidated.",
            );
          }}
        >
          <h3>Change password</h3>
          <label>
            Current password
            <input
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              name="new_password"
              type="password"
              minLength={12}
              maxLength={256}
              autoComplete="new-password"
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              name="confirmation"
              type="password"
              minLength={12}
              maxLength={256}
              autoComplete="new-password"
              required
            />
          </label>
          <button disabled={password.busy || !localProvider}>
            Change password
          </button>
          {!localProvider && (
            <p className="subtle">
              Hosted password controls require the verified Supabase adapter.
            </p>
          )}
          {password.message && <p role="status">{password.message}</p>}
        </form>
        <div>
          <h3>Multi-factor authentication</h3>
          <p>
            State:{" "}
            <span className="badge">
              {profile.mfa_state.replaceAll("_", " ")}
            </span>
          </p>
          {localProvider && (
            <p className="notice">
              Local provider double: use <code>KXRA-LOCAL-MFA</code> for the
              factor and <code>KXRA-LOCAL-RECOVERY</code> for recovery. This is
              test evidence, not a production factor.
            </p>
          )}
          <label>
            Provider proof
            <input
              id="mfa-proof"
              defaultValue={
                localProvider
                  ? profile.mfa_state === "RECOVERY_REQUIRED"
                    ? "KXRA-LOCAL-RECOVERY"
                    : "KXRA-LOCAL-MFA"
                  : ""
              }
            />
          </label>
          <div className="record-actions">
            {profile.mfa_state === "NOT_ENROLLED" && (
              <button
                type="button"
                onClick={() =>
                  void mfa.run(
                    () => mfaRequest({ action: "begin" }),
                    "MFA enrollment started.",
                  )
                }
                disabled={mfa.busy || !localProvider}
              >
                Begin enrollment
              </button>
            )}
            {profile.mfa_state === "ENROLLING" && (
              <button
                type="button"
                onClick={() =>
                  void mfa.run(
                    () => mfaRequest({ action: "complete", proof: proof() }),
                    "MFA enrollment recorded.",
                  )
                }
                disabled={mfa.busy || !localProvider}
              >
                Complete enrollment
              </button>
            )}
            {profile.mfa_state === "ENROLLED" && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void mfa.run(
                      () => mfaRequest({ action: "challenge", proof: proof() }),
                      "Recent AAL2 challenge recorded.",
                    )
                  }
                  disabled={mfa.busy || !localProvider}
                >
                  Verify now
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void mfa.run(
                      () => mfaRequest({ action: "begin_recovery" }),
                      "MFA recovery state recorded.",
                    )
                  }
                  disabled={mfa.busy || !localProvider}
                >
                  Test recovery
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void mfa.run(
                      () => mfaRequest({ action: "remove", proof: proof() }),
                      "MFA removed in the local provider.",
                    )
                  }
                  disabled={mfa.busy || !localProvider}
                >
                  Remove
                </button>
              </>
            )}
            {profile.mfa_state === "RECOVERY_REQUIRED" && (
              <button
                type="button"
                onClick={() =>
                  void mfa.run(
                    () => mfaRequest({ action: "recover", proof: proof() }),
                    "MFA recovery completed.",
                  )
                }
                disabled={mfa.busy || !localProvider}
              >
                Recover MFA
              </button>
            )}
          </div>
          {mfa.message && <p role="status">{mfa.message}</p>}
        </div>
      </div>
      <div className="danger-zone">
        <h3>Sign out all sessions</h3>
        <p>
          This increments KXRA’s session version and invokes the configured
          provider revocation hook.
        </p>
        <button
          onClick={() =>
            void sessions.run(
              () =>
                request("/api/account/sessions", "POST", {}).then(() => {
                  window.location.assign("/login");
                }),
              "Sessions revoked.",
            )
          }
          disabled={sessions.busy}
        >
          Sign out everywhere
        </button>
        {sessions.message && <p role="status">{sessions.message}</p>}
      </div>
    </section>
  );
}

function WhatsAppControl({ hasActivePairing }: { hasActivePairing: boolean }) {
  const action = useAction();
  return (
    <section className="panel full-span">
      <h2>WhatsApp connection</h2>
      <p>
        <span className={`badge ${hasActivePairing ? "" : "amber"}`}>
          {hasActivePairing ? "PAIRED" : "NOT PAIRED"}
        </span>
      </p>
      <p>
        The Meta gateway remains disabled. A future pairing will still be bound
        to this account and assigned projects.
      </p>
      {hasActivePairing && (
        <button
          onClick={() =>
            void action.run(
              () => request("/api/account/whatsapp/unpair", "POST", {}),
              "WhatsApp unpaired.",
            )
          }
          disabled={action.busy}
        >
          Unpair WhatsApp
        </button>
      )}
      {action.message && <p role="status">{action.message}</p>}
    </section>
  );
}
