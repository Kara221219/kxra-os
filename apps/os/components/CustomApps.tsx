"use client";
import { useState } from "react";
import type { customAppDetail } from "../lib/custom-apps";
import {
  exampleCustomApp,
  type CustomApp,
} from "../../../packages/custom-apps/contract";
import { renderCustomAppPreview } from "../../../packages/custom-apps/preview";
type Detail = Awaited<ReturnType<typeof customAppDetail>>;
export function CustomApps({
  room,
  initialApps,
  canManage,
}: {
  room: string;
  initialApps: CustomApp[];
  canManage: boolean;
}) {
  const [apps, setApps] = useState(initialApps),
    [detail, setDetail] = useState<Detail | null>(null),
    [source, setSource] = useState(JSON.stringify(exampleCustomApp, null, 2)),
    [preview, setPreview] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function request(path: string, body?: unknown) {
    const response = await fetch(`/api/custom-apps/${room}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Custom app unavailable");
    return data;
  }
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action unavailable");
    } finally {
      setBusy(false);
    }
  }
  function update(data: Detail) {
    setDetail(data);
    setApps((old) => [...old.filter((a) => a.id !== data.app.id), data.app]);
    setSource(JSON.stringify(data.versions[0].artifact.schema, null, 2));
    setPreview("");
  }
  return (
    <section>
      <h1>Local custom apps</h1>
      <p>
        Synthetic local forms. Publication selects an immutable saved version.
        Preview entries are discarded. Published forms can save typed local
        records. External hosting and provider actions are not connected.
      </p>
      <ul>
        {apps.map((a) => (
          <li key={a.id}>
            <button
              disabled={busy}
              onClick={() => act(async () => update(await request(`/${a.id}`)))}
            >
              {a.title}
            </button>{" "}
            <a href={`/os/apps/${room}/${a.id}`}>Use app</a> — latest v
            {a.latest_version}, active {a.active_version ?? "none"}
          </li>
        ))}
      </ul>
      <button
        disabled={busy}
        onClick={() => {
          setDetail(null);
          setSource(JSON.stringify(exampleCustomApp, null, 2));
          setPreview("");
          setError("");
        }}
      >
        New app
      </button>
      <p>
        <label htmlFor="app-schema">Declarative schema (kxra.form.v1)</label>
      </p>
      <textarea
        id="app-schema"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        maxLength={32768}
        rows={18}
        style={{ width: "100%" }}
        disabled={busy || !canManage}
      />
      <p>
        <button
          disabled={busy}
          onClick={() => {
            setError("");
            try {
              setPreview(renderCustomAppPreview(JSON.parse(source)));
            } catch {
              setError(
                "Invalid form schema. Use the example format and unique field keys.",
              );
              setPreview("");
            }
          }}
        >
          Preview schema
        </button>{" "}
        {canManage ? (
          <button
            disabled={busy}
            onClick={() =>
              act(async () =>
                update(
                  await request("", {
                    operation: "register",
                    app_id: detail?.app.id ?? crypto.randomUUID(),
                    expected_revision: detail?.app.revision ?? 0,
                    schema: JSON.parse(source),
                  }),
                ),
              )
            }
          >
            {detail ? "Register new version" : "Register app"}
          </button>
        ) : (
          "Only the room creator can register or release apps."
        )}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {detail ? (
        <section>
          <h2>Immutable versions</h2>
          <p>
            Revision {detail.app.revision}. Active local release:{" "}
            {detail.app.active_version ?? "none"}.
          </p>
          <ul>
            {detail.versions.map((v) => (
              <li key={v.version}>
                v{v.version} — <code>{v.sha256}</code>{" "}
                <button
                  disabled={busy}
                  onClick={() => {
                    setError("");
                    setPreview(renderCustomAppPreview(v.artifact.schema));
                  }}
                >
                  Preview v{v.version}
                </button>{" "}
                <button
                  disabled={busy}
                  onClick={() => {
                    setSource(JSON.stringify(v.artifact.schema, null, 2));
                    setPreview("");
                  }}
                >
                  Load v{v.version} into editor
                </button>{" "}
                {canManage && detail.app.active_version !== v.version ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(async () =>
                        update(
                          await request("", {
                            app_id: detail.app.id,
                            expected_revision: detail.app.revision,
                            version: v.version,
                            operation: v.previously_released
                              ? "ROLLBACK_LOCAL"
                              : "PUBLISH_LOCAL",
                          }),
                        ),
                      )
                    }
                  >
                    {v.previously_released
                      ? "Rollback locally"
                      : "Publish locally"}{" "}
                    v{v.version}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <h2>Local release history</h2>
          <ol>
            {detail.releases.map((r) => (
              <li key={r.revision}>
                Revision {r.revision}: {r.action} v{r.version}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {preview ? (
        <iframe
          key={preview}
          title="Isolated custom app preview"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={preview}
          style={{ width: "100%", height: 560, background: "white" }}
        />
      ) : null}
    </section>
  );
}
