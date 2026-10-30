"use client";

import { useState } from "react";

class RecoveryResponseError extends Error {
  constructor(
    message: string,
    readonly recoveryStep?: "TOTP" | "NONCE",
  ) {
    super(message);
  }
}
async function post(data: unknown) {
  const response = await fetch("/api/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok)
    throw new RecoveryResponseError(
      typeof result.error === "string" ? result.error : "Request unavailable",
      result.recoveryStep === "TOTP" || result.recoveryStep === "NONCE"
        ? result.recoveryStep
        : undefined,
    );
  return result;
}

export function PasswordResetRequestForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        try {
          await post({ action: "request", email: data.get("email") });
          setMessage(
            "If an eligible invited account exists, its provider has queued a time-limited reset message.",
          );
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Request unavailable",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          maxLength={320}
        />
      </label>
      <button disabled={busy}>{busy ? "Requesting…" : "Request reset"}</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export function PasswordResetConfirmForm({
  token,
  recoverySession,
}: {
  token?: string;
  recoverySession?: {
    accessToken: string;
    refreshToken: string;
    intent: string;
  };
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [needsNonce, setNeedsNonce] = useState(false);
  const [nonceRequested, setNonceRequested] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const password = String(data.get("password") || "");
        const confirmation = String(data.get("confirmation") || "");
        if (password !== confirmation) {
          setMessage("The passwords do not match.");
          return;
        }
        setBusy(true);
        try {
          const result = await post({
            action: "confirm",
            ...(token ? { token } : {}),
            ...(recoverySession || {}),
            password,
            confirmation,
            ...(needsMfa && data.get("mfaCode")
              ? { mfaCode: data.get("mfaCode") }
              : {}),
            ...(needsNonce && data.get("nonce")
              ? { nonce: data.get("nonce") }
              : {}),
          });
          window.location.assign(result.next || "/os");
        } catch (error) {
          if (error instanceof RecoveryResponseError) {
            if (error.recoveryStep === "TOTP") setNeedsMfa(true);
            if (error.recoveryStep === "NONCE") setNeedsNonce(true);
          }
          const code = form.elements.namedItem("mfaCode");
          if (code instanceof HTMLInputElement) code.value = "";
          setMessage(
            error instanceof Error ? error.message : "Reset unavailable",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        New password
        <input
          name="password"
          type="password"
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
          required
        />
      </label>
      <p className="form-hint">Use 12 to 256 characters.</p>
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
      {needsMfa && (
        <label>
          Existing authenticator code
          <input
            name="mfaCode"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            minLength={6}
            maxLength={6}
            required
          />
        </label>
      )}
      {needsNonce && recoverySession && (
        <>
          <p>
            Request a verification code, then enter it below. This sends a
            separate verification email.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await post({ action: "reauthenticate", ...recoverySession });
                setNonceRequested(true);
                setMessage(
                  "The provider accepted the verification request. Check your email for its code.",
                );
              } catch {
                setMessage("Verification request unavailable");
              } finally {
                setBusy(false);
              }
            }}
          >
            Send verification code
          </button>
          {nonceRequested && (
            <label>
              Email verification code
              <input
                name="nonce"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6,10}"
                minLength={6}
                maxLength={10}
                required
              />
            </label>
          )}
        </>
      )}
      <button disabled={busy || (needsNonce && !nonceRequested)}>
        {busy ? "Updating…" : "Set new password"}
      </button>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
