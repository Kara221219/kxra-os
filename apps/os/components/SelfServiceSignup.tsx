"use client";
import { useRef, useState } from "react";
export function SelfServiceSignup({
  verified,
  signedIn,
}: {
  verified: boolean;
  signedIn: boolean;
}) {
  const attempt = useRef<string | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  return (
    <section className="panel">
      <p className="eyebrow">LOCAL CUSTOMER ENTRY</p>
      <h1>Create your workspace</h1>
      <p>
        Local acceptance only. Email delivery and payments are synthetic; no
        subscription, provider or charge is activated.
      </p>
      {!verified && signedIn && (
        <>
          <h2>Verify your email</h2>
          <p>
            Use the verification message before creating any organisation or
            membership. No workspace has been created. Re-enter the same
            credentials below to resend a verification message if needed.
          </p>
          <a href="/signup">Check verified session</a>
        </>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setNotice("");
          const d = new FormData(e.currentTarget);
          try {
            const action = verified ? "provision" : "register";
            const body = verified
              ? {
                  action,
                  request_id: (attempt.current ||= crypto.randomUUID()),
                  workspace_name: d.get("workspace_name"),
                }
              : {
                  action,
                  email: d.get("email"),
                  password: d.get("password"),
                  confirmation: d.get("confirmation"),
                };
            const r = await fetch("/api/signup", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            });
            const v = await r.json();
            if (!r.ok) throw Error(v.error || "Unable to continue");
            window.location.assign(v.next);
          } catch (e) {
            setNotice(e instanceof Error ? e.message : "Unable to continue");
          } finally {
            setBusy(false);
          }
        }}
      >
        {verified ? (
          <>
            <h2>Verified account</h2>
            <label>
              Workspace name
              <input
                name="workspace_name"
                required
                minLength={2}
                maxLength={120}
              />
            </label>
            <p>
              Recovery returns the same workspace. New work stays disabled until
              onboarding and authoritative billing permit it.
            </p>
          </>
        ) : (
          <>
            <label>
              Email
              <input name="email" type="email" required autoComplete="email" />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={256}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm password
              <input
                name="confirmation"
                type="password"
                required
                autoComplete="new-password"
              />
            </label>
            <p>
              Use at least 12 characters, including uppercase, lowercase and a
              number.
            </p>
          </>
        )}
        <button disabled={busy} type="submit">
          {busy
            ? "Checking…"
            : verified
              ? "Create or recover workspace"
              : "Create local account"}
        </button>
      </form>
      <p role="status">{notice}</p>
      <a href="/login">Already registered? Sign in</a>
    </section>
  );
}
