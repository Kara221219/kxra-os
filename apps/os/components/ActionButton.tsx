"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
function useReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready;
}
export function ActionButton({
  url,
  payload,
  label,
  confirmation,
  disabled = false,
  secondary,
}: {
  url: string;
  payload: unknown;
  label: string;
  confirmation?: string;
  disabled?: boolean;
  secondary?: { payload: unknown; label: string };
}) {
  const ready = useReady();
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const pending = useRef(false);
  const router = useRouter();
  async function perform(value: unknown, primary: boolean) {
    if (
      !ready ||
      pending.current ||
      busy ||
      (primary && (disabled || (confirmation && !confirmed)))
    )
      return;
    pending.current = true;
    setBusy(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(value),
      });
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      setMessage("Saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <span>
      {confirmation && (
        <label>
          <input
            type="checkbox"
            required
            checked={confirmed}
            disabled={!ready || busy || disabled}
            onChange={(event) => setConfirmed(event.target.checked)}
          />{" "}
          {confirmation}
        </label>
      )}
      <button
        disabled={
          !ready || busy || disabled || Boolean(confirmation && !confirmed)
        }
        onClick={() => void perform(payload, true)}
      >
        {label}
      </button>
      {secondary && (
        <button
          type="button"
          disabled={!ready || busy}
          onClick={() => void perform(secondary.payload, false)}
        >
          {secondary.label}
        </button>
      )}
      {message && <span role="status"> {message}</span>}
    </span>
  );
}
