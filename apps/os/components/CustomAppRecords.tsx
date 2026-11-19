"use client";
import { useState, type ChangeEvent } from "react";
import {
  emptyAppValues,
  type AppRecord,
  type AppRecordPage,
  type AppRecordReceipt,
  type AppValues,
} from "../../../packages/custom-apps/records";
import type { CustomAppSchema } from "../../../packages/custom-apps/contract";
import type { CustomAppRecordCopy } from "../lib/custom-app-record-copy";
type Draft = {
  id: string;
  version: number;
  appRevision: number;
  schemaVersion: number;
  schema: CustomAppSchema;
  values: AppValues;
};
type Save = {
  operation_id: string;
  record_id: string;
  expected_app_revision: number;
  schema_version: number;
  expected_record_revision: number;
  data: AppValues;
};
export function CustomAppRecords({
  room,
  app,
  initial,
  copy,
}: {
  room: string;
  app: string;
  initial: AppRecordPage;
  copy: CustomAppRecordCopy;
}) {
  const [page, setPage] = useState(initial),
    [draft, setDraft] = useState<Draft | null>(() => fresh(initial)),
    [pending, setPending] = useState<Save | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  function fresh(data: AppRecordPage): Draft | null {
    return data.active_schema && data.app.active_version
      ? {
          id: crypto.randomUUID(),
          version: 0,
          appRevision: data.app.revision,
          schemaVersion: data.app.active_version,
          schema: data.active_schema,
          values: emptyAppValues(data.active_schema),
        }
      : null;
  }
  async function request(path = "", body?: Save) {
    const r = await fetch(
      `/api/custom-apps/${room}/${app}/${path || "records"}`,
      {
        method: body ? "POST" : "GET",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
      },
    );
    const data = await r.json();
    if (!r.ok)
      throw Object.assign(Error(data.error || copy.unavailable), {
        status: r.status,
      });
    return data;
  }
  async function refresh(append = false) {
    const data: AppRecordPage = await request(
      append ? `records?before=${page.next_cursor}` : "",
    );
    setPage((old) => ({
      ...data,
      records: append
        ? [
            ...old.records,
            ...data.records.filter(
              (r) => !old.records.some((x) => x.id === r.id),
            ),
          ]
        : data.records,
    }));
    return data;
  }
  async function work(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : copy.unavailable);
    } finally {
      setBusy(false);
    }
  }
  async function completed(receipt: AppRecordReceipt) {
    setPending(null);
    setDraft(null);
    setNotice(`Saved record revision ${receipt.version}.`);
    try {
      const data = await refresh();
      setDraft(fresh(data));
    } catch {
      setError(copy.refreshFailed);
    }
  }
  async function save(body: Save) {
    const wasUnknown = pending?.operation_id === body.operation_id;
    setPending(body);
    setNotice("");
    try {
      await completed(await request("", body));
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status && status >= 400 && status < 500 && !wasUnknown) {
        setPending(null);
        setError(
          `${e instanceof Error ? e.message : copy.unavailable}${copy.rejected}`,
        );
      } else setError(copy.unknown);
    }
  }
  function edit(r: AppRecord) {
    setError("");
    setNotice("");
    setDraft({
      id: r.id,
      version: r.version,
      appRevision: page.app.revision,
      schemaVersion: r.schema_version,
      schema: r.schema,
      values: { ...r.data },
    });
  }
  const changed = Boolean(
    draft &&
    (draft.schemaVersion !== page.app.active_version ||
      draft.appRevision !== page.app.revision),
  );
  return (
    <section style={{ overflowWrap: "anywhere", minWidth: 0 }}>
      <h1>{page.active_schema?.title ?? "Local app"}</h1>
      <p>{page.active_schema?.description}</p>
      <p>{copy.intro}</p>
      <p>
        <button
          disabled={busy}
          onClick={() =>
            work(async () => {
              await refresh();
            })
          }
        >
          {copy.reload}
        </button>{" "}
        <button
          disabled={
            busy || Boolean(pending) || !page.can_write || !page.active_schema
          }
          onClick={() => {
            setDraft(fresh(page));
            setNotice("");
            setError("");
          }}
        >
          {copy.newRecord}
        </button>
      </p>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {pending ? (
        <aside>
          <p>{copy.unconfirmed}</p>
          <button
            disabled={busy}
            onClick={() => work(async () => save(pending))}
          >
            {copy.retry}
          </button>{" "}
          <button
            disabled={busy}
            onClick={() =>
              work(async () => {
                const receipt = await request(
                  `receipts/${pending.operation_id}`,
                );
                await completed(receipt);
              })
            }
          >
            {copy.check}
          </button>
        </aside>
      ) : null}
      {!page.active_schema ? <p>{copy.unpublished}</p> : null}
      {draft ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const body: Save = {
              operation_id: crypto.randomUUID(),
              record_id: draft.id,
              expected_app_revision: draft.appRevision,
              schema_version: draft.schemaVersion,
              expected_record_revision: draft.version,
              data: draft.values,
            };
            void work(async () => save(body));
          }}
        >
          <h2>
            {draft.version ? "Edit record" : copy.newRecord} — schema v
            {draft.schemaVersion}
          </h2>
          {changed ? <p>{copy.changed}</p> : null}
          {draft.schema.fields.map((f) => {
            const common = {
              id: `record-${f.key}`,
              required: f.required,
              disabled: busy || Boolean(pending) || changed || !page.can_write,
              onChange: (
                e: ChangeEvent<
                  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
                >,
              ) => {
                const value =
                  f.type === "checkbox"
                    ? (e.currentTarget as HTMLInputElement).checked
                    : e.currentTarget.value;
                setDraft({
                  ...draft,
                  values: { ...draft.values, [f.key]: value },
                });
              },
            };
            const value = String(draft.values[f.key]);
            return (
              <p key={f.key}>
                <label htmlFor={common.id}>
                  {f.label}
                  {f.required ? " (required)" : ""}
                </label>{" "}
                {f.type === "select" ? (
                  <select {...common} value={value}>
                    <option value="">Select…</option>
                    {f.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea {...common} value={value} maxLength={4000} />
                ) : (
                  <input
                    {...common}
                    style={
                      f.type === "checkbox" ? { width: "auto" } : undefined
                    }
                    type={f.type}
                    value={f.type === "text" ? value : undefined}
                    checked={
                      f.type === "checkbox"
                        ? draft.values[f.key] === true
                        : undefined
                    }
                    maxLength={f.type === "text" ? 1000 : undefined}
                  />
                )}
              </p>
            );
          })}
          <button
            disabled={busy || Boolean(pending) || changed || !page.can_write}
          >
            {copy.save}
          </button>
        </form>
      ) : null}
      <h2>{copy.saved}</h2>
      {page.records.length === 0 ? <p>{copy.empty}</p> : null}
      {page.records.map((r) => (
        <article key={r.id} aria-label={`Record ${r.id}`}>
          <h3>Record {r.id}</h3>
          <p>
            Schema v{r.schema_version}; record revision {r.version}.
          </p>
          <dl>
            {r.schema.fields.map((f) => (
              <div key={f.key}>
                <dt>{f.label}</dt>
                <dd>
                  {typeof r.data[f.key] === "boolean"
                    ? r.data[f.key]
                      ? "Yes"
                      : "No"
                    : r.data[f.key] || "—"}
                </dd>
              </div>
            ))}
          </dl>
          {r.schema_version === page.app.active_version && page.can_write ? (
            <button disabled={busy || Boolean(pending)} onClick={() => edit(r)}>
              Edit record {r.id}
            </button>
          ) : (
            <p>{copy.historical}</p>
          )}
        </article>
      ))}
      {page.next_cursor ? (
        <button
          disabled={busy}
          onClick={() =>
            work(async () => {
              await refresh(true);
            })
          }
        >
          {copy.older}
        </button>
      ) : null}
    </section>
  );
}
