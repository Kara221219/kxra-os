"use client";
import type { HostedSignupStatus } from "../../../packages/authz/hosted-self-service";
import React, { useRef, useState } from "react";
export function SelfServiceSignup({
  verified,
  signedIn,
  mode = "local",
  verificationRequested = false,
  existingWorkspaceName,
  accountState,
}: {
  verified: boolean;
  signedIn: boolean;
  mode?: "local" | "hosted";
  verificationRequested?: boolean;
  existingWorkspaceName?: string;
  accountState?: HostedSignupStatus["state"];
}) {
  const attempt = useRef<string | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  if (mode === "hosted" && accountState === "REVIEW_REQUIRED")
    return (
      <section className="panel">
        <h1>Workspace access review required</h1>
        <p>
          Your email is verified, but your account needs a workspace access
          review before you can continue. This page cannot renew or override an
          admission decision.
        </p>
        <a href="https://kxra-group.com/contact">Contact KXRA</a>
        <form method="post" action="/api/auth">
          <input type="hidden" name="logout" value="1" />
          <button type="submit">Sign out</button>
        </form>
      </section>
    );
  if (mode === "hosted" && accountState === "EXISTING_ACCOUNT")
    return (
      <section className="panel">
        <h1>Use your existing account</h1>
        <p>
          This account already has a KXRA identity. Continue to your existing
          workspace or contact KXRA if access needs review.
        </p>
        <a href="/os">Continue to workspace</a>
        <a href="https://kxra-group.com/contact">Contact KXRA</a>
      </section>
    );
  return (
    <section className="panel">
      <p className="eyebrow">
        {mode === "local" ? "LOCAL CUSTOMER ENTRY" : "CUSTOMER WORKSPACE"}
      </p>
      <h1>Create your workspace</h1>
      <p>
        {mode === "local"
          ? "Local acceptance only. Email delivery and payments are synthetic; no subscription, provider or charge is activated."
          : "Verify your email, create your private workspace and complete onboarding. Creating an account does not activate a subscription or grant paid access."}
      </p>
      {!verified && (signedIn || verificationRequested) && (
        <>
          <h2>Verify your email</h2>
          <p>
            If registration is available for this account, use its verification
            message before creating a workspace. You can also sign in to recover
            a verified account. No paid access is granted by this step.
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
                defaultValue={existingWorkspaceName}
                readOnly={mode === "hosted" && Boolean(existingWorkspaceName)}
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
              : mode === "local"
                ? "Create local account"
                : "Create account"}
        </button>
      </form>
      <p role="status">{notice}</p>
      <a href="/login">Already registered? Sign in</a>
    </section>
  );
}
