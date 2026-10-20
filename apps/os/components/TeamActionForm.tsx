"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
async function send(path: string, body: unknown) {
  const r = await fetch("/api/team-space" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const value = await r.json();
  if (!r.ok) throw Error(value.error || "Unable to save");
  return value;
}
export function ActionForm({
  path,
  title,
  children,
  build,
  navigate = false,
  onSaved,
}: {
  path: string;
  title: string;
  children: React.ReactNode;
  build: (d: FormData, id: string) => unknown;
  navigate?: boolean;
  onSaved?: () => void;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [notice, setNotice] = useState("");
  const attempt = useRef<{ payload: string; id: string } | null>(null);
  useEffect(() => setReady(true), []);
  return (
    <form
      className="panel create-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setNotice("");
        const form = e.currentTarget,
          data = new FormData(form),
          payload = JSON.stringify([...data.entries()]);
        if (attempt.current?.payload !== payload)
          attempt.current = { payload, id: crypto.randomUUID() };
        try {
          const result = await send(path, build(data, attempt.current.id));
          attempt.current = null;
          form.reset();
          setNotice(
            result.status === "FAILED"
              ? `Model could not complete: ${result.error_code}. Check the connection and try again.`
              : result.status === "CANCELLED"
                ? "Run cancelled. No output was released."
                : "Saved.",
          );
          if (navigate) router.push("/os/workspace/" + result.id);
          onSaved?.();
          router.refresh();
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Unable to save");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3>{title}</h3>
      <fieldset disabled={busy || !ready}>
        {children}
        <button type="submit">{busy ? "Working…" : title}</button>
      </fieldset>
      <p role="status">{notice}</p>
    </form>
  );
}
