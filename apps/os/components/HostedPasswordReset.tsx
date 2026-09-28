"use client";

import { useEffect, useState } from "react";
import {
  PasswordResetConfirmForm,
  PasswordResetRequestForm,
} from "./PasswordResetForms";

type RecoverySession = {
  accessToken: string;
  refreshToken: string;
  intent: string;
};

export function HostedPasswordReset() {
  const [recovery, setRecovery] = useState<RecoverySession | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const hadFragment = Boolean(window.location.hash);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const type = fragment.get("type");
    const accessToken = fragment.get("access_token");
    const refreshToken = fragment.get("refresh_token");
    const intent = new URLSearchParams(window.location.search).get("intent");
    const providerError = fragment.get("error_description");
    if (hadFragment || intent)
      window.history.replaceState(null, "", location.pathname);
    if (providerError) setError("This reset link is invalid or has expired.");
    else if (type === "recovery" && accessToken && refreshToken && intent)
      setRecovery({ accessToken, refreshToken, intent });
    else if (hadFragment)
      setError("This reset link is invalid or has expired.");
    setChecked(true);
  }, []);

  if (!checked) return <p role="status">Checking the reset link…</p>;
  if (recovery) return <PasswordResetConfirmForm recoverySession={recovery} />;
  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <PasswordResetRequestForm />
    </>
  );
}
