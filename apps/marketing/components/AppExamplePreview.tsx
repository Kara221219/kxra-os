"use client";
import { useEffect, useRef, useState } from "react";
import { appExamples, type AppKey } from "../lib/app-examples";
export function AppExamplePreview({ appKey }: { appKey: AppKey }) {
  const example = appExamples[appKey];
  const [step, setStep] = useState(0),
    [rows, setRows] = useState(
      example.records.map((r, i) => ({
        id: i,
        name: r[0] as string,
        state: r[1] as string,
        next: r[2] as string,
      })),
    ),
    [view, setView] = useState("Leads"),
    [converted, setConverted] = useState<number[]>([]),
    [version, setVersion] = useState(1),
    [reviewed, setReviewed] = useState<number | null>(null),
    [notice, setNotice] = useState(""),
    [expanded, setExpanded] = useState(false);
  const modal = useRef<HTMLDialogElement>(null),
    expand = useRef<HTMLButtonElement>(null),
    wasExpanded = useRef(false);
  useEffect(() => {
    if (expanded) {
      wasExpanded.current = true;
      modal.current?.showModal();
    } else if (wasExpanded.current) expand.current?.focus();
  }, [expanded]);
  const reset = () => {
    setRows(
      example.records.map((r, i) => ({
        id: i,
        name: r[0],
        state: r[1],
        next: r[2],
      })),
    );
    setConverted([]);
    setVersion(1);
    setReviewed(null);
    setNotice("Sample reset.");
    setStep(0);
  };
  const move = (id: number) => {
    setRows((current) =>
      current.map((r) =>
        r.id === id
          ? {
              ...r,
              state:
                appKey === "sampling-desk"
                  ? r.state === "Requested"
                    ? "Prepared"
                    : r.state === "Prepared"
                      ? "Delivered"
                      : "Review"
                  : appKey === "recruiting-workspace"
                    ? r.state === "Review"
                      ? "Interview"
                      : r.state === "Interview"
                        ? "Decision review"
                        : "Review"
                    : r.state === "Research"
                      ? "Shortlist"
                      : r.state === "Shortlist"
                        ? "Brief review"
                        : "Research",
            }
          : r,
      ),
    );
    setNotice("Sample record updated locally. No external action.");
  };
  const body = (
    <>
      <div className="example-toolbar">
        <div>
          <strong>{example.name}</strong>
          <span>INTERACTIVE SAMPLE · LOCAL STATE</span>
        </div>
        <button onClick={reset}>Reset sample</button>
        {!expanded && (
          <button ref={expand} onClick={() => setExpanded(true)}>
            Full screen ↗
          </button>
        )}
      </div>
      <div className="example-steps" role="group" aria-label="Workflow steps">
        {example.steps.map((s, i) => (
          <button key={s} aria-pressed={step === i} onClick={() => setStep(i)}>
            <span>0{i + 1}</span>
            {s}
          </button>
        ))}
      </div>
      <div className="example-body">
        <div className="example-context">
          <span>STEP 0{step + 1}</span>
          <h3>{example.steps[step]}</h3>
          <p>{example.features[Math.min(step, 2)][1]}</p>
          <p className="ref-caption">{example.boundary}</p>
        </div>
        <div className="example-records">
          {appKey === "general-crm" && (
            <div className="ref-filter-row">
              {["Leads", "Opportunities"].map((v) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                >
                  {v} (
                  {v === "Leads"
                    ? rows.length - converted.length
                    : converted.length}
                  )
                </button>
              ))}
            </div>
          )}
          {(appKey === "remodeling-crm" || appKey === "travel-desk") && (
            <div className="example-version">
              <strong>
                Sample {appKey === "travel-desk" ? "proposal" : "estimate"} · v
                {version}
              </strong>
              <span>
                {reviewed === version ? "Reviewed version" : "Review required"}
              </span>
              <button
                onClick={() => {
                  setVersion((n) => n + 1);
                  setReviewed(null);
                  setNotice(
                    "New sample version. Previous review does not apply.",
                  );
                }}
              >
                Revise scope
              </button>
              <button
                onClick={() => {
                  setReviewed(version);
                  setNotice(
                    "Sample version " +
                      version +
                      " reviewed locally. No agreement or payment created.",
                  );
                }}
              >
                Review this version
              </button>
            </div>
          )}
          <div className="ref-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>
                    {appKey === "recruiting-workspace"
                      ? "Application"
                      : "Record"}
                  </th>
                  <th>Stage</th>
                  <th>Next step</th>
                  <th>Sample control</th>
                </tr>
              </thead>
              <tbody>
                {rows
                  .filter(
                    (r) =>
                      appKey !== "general-crm" ||
                      (view === "Leads"
                        ? !converted.includes(r.id)
                        : converted.includes(r.id)),
                  )
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>
                        {converted.includes(r.id) ? "Qualified" : r.state}
                      </td>
                      <td>{r.next}</td>
                      <td>
                        {appKey === "general-crm" ? (
                          converted.includes(r.id) ? (
                            <span>Converted once</span>
                          ) : (
                            <button
                              onClick={() => {
                                setConverted((current) =>
                                  current.includes(r.id)
                                    ? current
                                    : [...current, r.id],
                                );
                                setNotice(
                                  "Lead moved to sample opportunities once.",
                                );
                              }}
                            >
                              Qualify & convert
                            </button>
                          )
                        ) : appKey === "remodeling-crm" ||
                          appKey === "travel-desk" ? (
                          <button
                            onClick={() =>
                              setNotice(
                                "Sample context selected: " +
                                  r.name +
                                  ". No customer record changed.",
                              )
                            }
                          >
                            Review context
                          </button>
                        ) : (
                          <button onClick={() => move(r.id)}>
                            {appKey === "sampling-desk"
                              ? "Move sample"
                              : appKey === "recruiting-workspace"
                                ? "Move application"
                                : "Move collaboration"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {appKey === "general-crm" &&
            view === "Opportunities" &&
            !converted.length && (
              <p className="ref-caption">
                No sample opportunities. Qualify a lead first; unqualified
                records do not enter the pipeline.
              </p>
            )}
          <p className="example-notice" role="status">
            {notice ||
              "Explore a workflow step or change a sample record. Nothing leaves this page."}
          </p>
        </div>
      </div>
    </>
  );
  return (
    <>
      <div className="example-preview">{!expanded && body}</div>
      <dialog
        ref={modal}
        className="example-fullscreen"
        onClose={() => setExpanded(false)}
      >
        <button
          className="ref-dialog-close"
          aria-label="Close full screen preview"
          onClick={() => modal.current?.close()}
        >
          ×
        </button>
        {expanded && body}
      </dialog>
    </>
  );
}
