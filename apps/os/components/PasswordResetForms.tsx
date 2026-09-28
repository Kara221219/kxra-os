"use client";

import { useState } from "react";

async function post(data: unknown) {
  const response = await fetch("/api/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Request unavailable");
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
  recoverySession?: { accessToken: string; refreshToken: string };
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
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
          });
          window.location.assign(result.next || "/os");
        } catch (error) {
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
      <button disabled={busy}>{busy ? "Updating…" : "Set new password"}</button>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
