"use client";

import { useState } from "react";

export default function JoinAccountForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="create-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (busy) return;
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setMessage("");
        try {
          const response = await fetch("/api/join/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              password: form.get("password"),
              confirmation: form.get("confirmation"),
            }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error);
          window.location.assign(result.next || "/join/account?registered=1");
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Registration unavailable",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Create your password
        <input
          name="password"
          type="password"
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
          required
          aria-describedby="password-requirements"
        />
      </label>
      <p id="password-requirements" className="subtle">
        Use at least 12 characters with upper and lower case letters and a
        number.
      </p>
      <label>
        Confirm your password
        <input
          name="confirmation"
          type="password"
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
          required
        />
      </label>
      <button disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}
    </form>
  );
}
