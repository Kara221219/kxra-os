"use client";
import { useEffect, useState, useRef } from "react";
export function RoomAuditExport({ roomId }: { roomId: string }) {
  const [before, setBefore] = useState<string | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [finished, setFinished] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    setBusy(false);
    setBefore(null);
    setNotice("");
    setFinished(false);
    return () => request.current?.abort();
  }, [roomId]);
  async function download(cursor: string | null) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch(
        `/api/team-space/${roomId}/audit-export${cursor ? `?before=${encodeURIComponent(cursor)}` : ""}`,
        { cache: "no-store", signal: controller.signal },
      );
      if (!r.ok) {
        const v = await r.json();
        throw Error(v.error || "Export unavailable");
      }
      const blob = await r.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `room-${roomId}-audit.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      const next = r.headers.get("X-KXRA-Next-Cursor");
      setBefore(next || null);
      setFinished(!next);
      setNotice(
        next
          ? "Downloaded up to 500 events. Another page is available."
          : "Downloaded audit metadata. End of current history.",
      );
    } catch (e) {
      if (!controller.signal.aborted)
        setNotice(e instanceof Error ? e.message : "Export unavailable");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Room audit export">
      <h2>Audit metadata</h2>
      <p>
        Creator-only CSV, 500 events per page. Includes event IDs, timestamps
        and safe state changes. Excludes people, prompts, output, record/source
        IDs, credentials and lease tokens. Pages reflect current access when
        downloaded.
      </p>
      <button type="button" disabled={busy} onClick={() => void download(null)}>
        Download latest audit page
      </button>
      {before && !finished && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void download(before)}
        >
          Download earlier audit page
        </button>
      )}
      <p role="status">{notice}</p>
    </section>
  );
}
