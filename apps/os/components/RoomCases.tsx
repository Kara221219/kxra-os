"use client";
import Link from "next/link";
import { useState } from "react";
import { ActionForm } from "./TeamActionForm";
import { useRoomCatalog } from "./useRoomCatalog";
import {
  caseDefinitions,
  caseStages,
  nextCaseStages,
  type CaseKind,
  type CaseRecord,
  type CaseAction,
  type CaseDetails,
} from "../../../packages/workspace/case-contract";
import styles from "./RoomCollaboration.module.css";
const emptyRecords = { records: [] as CaseRecord[] },
  emptyActions = { actions: [] as CaseAction[] };
function Fields({ record, kind }: { record?: CaseRecord; kind: CaseKind }) {
  return (
    <>
      <label>
        {caseDefinitions[kind].titleLabel}
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={record?.title}
        />
      </label>
      <label>
        Recorded context
        <textarea
          name="body"
          aria-label="Recorded context"
          maxLength={4000}
          defaultValue={record?.body}
        />
      </label>
      <label>
        Responsible person
        <input
          name="responsible"
          required
          maxLength={160}
          defaultValue={record?.responsible}
        />
      </label>
      <label>
        Next follow-up
        <input
          name="next_step"
          required
          maxLength={500}
          defaultValue={record?.next_step}
        />
      </label>
      <label>
        Follow-up date
        <input name="due_on" type="date" defaultValue={record?.due_on || ""} />
      </label>
      {caseDefinitions[kind].fields.map(([name, label, type]) => {
        const value =
          name === "estimate_amount" &&
          typeof record?.details.estimate_pence === "number"
            ? (record.details.estimate_pence / 100).toFixed(2)
            : String(record?.details[name] ?? "");
        return (
          <label key={name}>
            {label}
            {type === "long" ? (
              <textarea
                name={"detail_" + name}
                aria-label={label}
                required={name !== "exclusions"}
                maxLength={
                  ["review_note", "criteria", "exclusions"].includes(name)
                    ? 2000
                    : 4000
                }
                defaultValue={value}
              />
            ) : (
              <input
                name={"detail_" + name}
                aria-label={label}
                type={type === "date" ? "date" : "text"}
                inputMode={type === "money" ? "decimal" : undefined}
                required
                maxLength={
                  ["property", "destination"].includes(name) ? 240 : 500
                }
                defaultValue={value}
              />
            )}
          </label>
        );
      })}
    </>
  );
}
function Details({ kind, details }: { kind: CaseKind; details: CaseDetails }) {
  return (
    <dl>
      {caseDefinitions[kind].fields.map(([name, label]) => (
        <div key={name}>
          <dt>{label}</dt>
          <dd>
            {name === "estimate_amount"
              ? new Intl.NumberFormat("en-GB", {
                  style: "currency",
                  currency: "GBP",
                }).format(Number(details.estimate_pence) / 100)
              : String(details[name] ?? "")}
          </dd>
        </div>
      ))}
    </dl>
  );
}
const payload = (d: FormData, kind: CaseKind) => ({
  title: d.get("title"),
  body: d.get("body"),
  responsible: d.get("responsible"),
  next_step: d.get("next_step"),
  due_on: d.get("due_on") || null,
  details: Object.fromEntries(
    caseDefinitions[kind].fields.map(([name]) => [
      name,
      d.get("detail_" + name),
    ]),
  ),
});
function ApplicationEntry({
  roomId,
  onSaved,
}: {
  roomId: string;
  onSaved: () => void;
}) {
  const roles = useRoomCatalog(roomId, "role-records", emptyRecords),
    available = roles.data.records.filter((r) => r.stage === "OPEN");
  return (
    <section className="panel" aria-label="Application role selection">
      <p>
        Use an open role from this private room. No candidate ranking or
        external message.
      </p>
      <p role="status">{roles.notice}</p>
      <button type="button" onClick={roles.reload}>
        Refresh open roles
      </button>
      {roles.next && (
        <button type="button" disabled={roles.busy} onClick={roles.more}>
          Load earlier roles
        </button>
      )}
      {available.length ? (
        <ActionForm
          path={`/${roomId}/application-save`}
          title="Record application"
          onSaved={onSaved}
          build={(d, id) => ({
            request_id: id,
            version: 0,
            ...payload(d, "APPLICATION"),
            parent_id: d.get("parent_id"),
          })}
        >
          <label>
            Open role
            <select name="parent_id" aria-label="Open role">
              {available.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title} · Revision {r.version}
                </option>
              ))}
            </select>
          </label>
          <Fields kind="APPLICATION" />
        </ActionForm>
      ) : (
        <p>
          No open roles loaded.{" "}
          <Link href={`/os/workspace/${roomId}?view=roles`}>
            Define or review a role
          </Link>
          .
        </p>
      )}
    </section>
  );
}
export function RoomCases({
  roomId,
  kind,
  canWrite,
  canManage,
}: {
  roomId: string;
  kind: CaseKind;
  canWrite: boolean;
  canManage: boolean;
}) {
  const definition = caseDefinitions[kind],
    prefix = definition.prefix;
  const records = useRoomCatalog(roomId, prefix + "-records", emptyRecords),
    actions = useRoomCatalog(roomId, prefix + "-actions", emptyActions);
  const [query, setQuery] = useState(""),
    [stage, setStage] = useState("ALL");
  const refresh = () => {
    records.reload();
    actions.reload();
  };
  const matching = records.data.records.filter(
    (r) =>
      (stage === "ALL" || stage === r.stage) &&
      (
        r.title +
        " " +
        r.body +
        " " +
        r.responsible +
        " " +
        r.next_step +
        " " +
        Object.values(r.details).join(" ")
      )
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className={styles.root}>
      <section className="panel" aria-label={definition.title}>
        <p className="eyebrow">ROOM APP · REVIEWED RECORDS</p>
        <h2>{definition.title}</h2>
        <p>{definition.boundary}</p>
        <p>
          Propose → room creator reviews → explicitly record once. Changed
          details reset the relevant review stage. Earlier approval never
          carries over to changed scope, requirements or proposal.
        </p>
        <button type="button" onClick={refresh}>
          Refresh {definition.title}
        </button>
        <p role="status">{records.notice}</p>
        <p role="status">{actions.notice}</p>
        <ul className={styles.stages} aria-label="Loaded stage counts">
          {caseStages[kind].map((s) => (
            <li key={s}>
              {s}: {records.data.records.filter((r) => r.stage === s).length}
            </li>
          ))}
        </ul>
        <div className={styles.filters}>
          <label>
            Search {definition.title}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            Stage
            <select value={stage} onChange={(e) => setStage(e.target.value)}>
              <option value="ALL">All stages</option>
              {caseStages[kind].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        {(query || stage !== "ALL") && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setStage("ALL");
            }}
          >
            Reset case filters
          </button>
        )}
        {!records.busy && !matching.length && (
          <p>
            {records.data.records.length
              ? "No matching loaded cases. Reset the filters to return."
              : "No cases yet. Record the first request below."}
          </p>
        )}
        {matching.map((r) => (
          <article key={r.id} className={styles.card} aria-label={r.title}>
            <h3>{r.title}</h3>
            <p className={styles.meta}>
              Stage {r.stage} · Revision {r.version}
            </p>
            <p className={styles.body}>{r.body}</p>
            <Details kind={kind} details={r.details} />
            <p>Responsible: {r.responsible}</p>
            <p>
              Next follow-up: {r.next_step}
              {r.due_on ? " · " + r.due_on : ""}
            </p>
            {r.parent_id && (
              <p>
                Role:{" "}
                <Link href={`/os/workspace/${roomId}?view=roles`}>
                  {r.parent_title || "Review role requirements"}
                </Link>
              </p>
            )}
            {canWrite &&
              ![
                "ARCHIVED",
                "CANCELLED",
                "HANDOFF",
                "DECISION_RECORDED",
              ].includes(r.stage) && (
                <details>
                  <summary>Edit recorded case</summary>
                  <ActionForm
                    key={r.version}
                    path={`/${roomId}/${prefix}-save`}
                    title="Save case details"
                    onSaved={refresh}
                    build={(d) => ({
                      request_id: r.id,
                      version: r.version,
                      ...payload(d, kind),
                      parent_id: r.parent_id,
                    })}
                  >
                    <Fields kind={kind} record={r} />
                  </ActionForm>
                </details>
              )}
            {canWrite && nextCaseStages(kind, r.stage).length > 0 && (
              <details>
                <summary>Propose case step</summary>
                <ActionForm
                  path={`/${roomId}/${prefix}-propose`}
                  title="Propose reviewed case step"
                  onSaved={refresh}
                  build={(d, id) => ({
                    request_id: id,
                    source_id: r.id,
                    source_version: r.version,
                    target_stage: d.get("target_stage"),
                    note: d.get("note"),
                  })}
                >
                  <label>
                    Proposed stage
                    <select name="target_stage" aria-label="Proposed stage">
                      {nextCaseStages(kind, r.stage).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Human review reason
                    <textarea name="note" required maxLength={4000} />
                  </label>
                </ActionForm>
              </details>
            )}
          </article>
        ))}
        {records.next && (
          <button type="button" disabled={records.busy} onClick={records.more}>
            Load earlier {definition.title} cases
          </button>
        )}
      </section>
      <section className="panel" aria-label={definition.title + " reviews"}>
        <h2>Exact-version case reviews</h2>
        <p>
          Changed source/role, expiry or cancelled access prevents applying a
          step. Refresh and propose the current version. No external action
          runs.
        </p>
        {!actions.busy && !actions.data.actions.length && (
          <p>No case steps proposed.</p>
        )}
        {actions.data.actions.map((a) => (
          <article
            className={styles.card}
            key={a.id}
            aria-label={"Review " + a.source_snapshot.title}
          >
            <h3>
              {a.source_snapshot.title} → {a.target_stage}
            </h3>
            <p className={styles.meta}>
              {a.state} · Review revision {a.version} · Expires{" "}
              {new Date(a.expires_at).toISOString()}
            </p>
            <div className={styles.snapshot}>
              <strong>Exact source revision {a.source_version}</strong>
              <p>{a.source_snapshot.body}</p>
              <Details kind={kind} details={a.source_snapshot.details} />
              <p>
                Responsible: {a.source_snapshot.responsible} · Next:{" "}
                {a.source_snapshot.next_step}
              </p>
              {a.source_snapshot.parent_title && (
                <p>
                  Role {a.source_snapshot.parent_title} · revision{" "}
                  {a.source_snapshot.parent_version}
                </p>
              )}
            </div>
            <p>{a.note}</p>
            {canManage && ["PROPOSED", "APPROVED"].includes(a.state) && (
              <ActionForm
                path={`/${roomId}/${prefix}-review`}
                title="Record case review"
                onSaved={refresh}
                build={(d) => ({
                  action_id: a.id,
                  version: a.version,
                  decision: d.get("decision"),
                })}
              >
                <label>
                  Review decision
                  <select name="decision" aria-label="Review decision">
                    {a.state === "PROPOSED" && (
                      <>
                        <option value="APPROVED">
                          Approve exact case step
                        </option>
                        <option value="REJECTED">Reject step</option>
                      </>
                    )}
                    <option value="CANCELLED">Cancel step</option>
                  </select>
                </label>
              </ActionForm>
            )}
            {canManage && a.state === "APPROVED" && (
              <ActionForm
                path={`/${roomId}/${prefix}-execute`}
                title="Apply reviewed case step once"
                onSaved={refresh}
                build={() => ({ action_id: a.id, version: a.version })}
              >
                <p>
                  Only updates this application record after rechecking the
                  source, authority and entitlement.
                </p>
              </ActionForm>
            )}
            {a.result && (
              <p>
                Recorded receipt {a.result.action_id}: {a.result.stage} · Case
                revision {a.result.version}.
              </p>
            )}
          </article>
        ))}
        {actions.next && (
          <button type="button" disabled={actions.busy} onClick={actions.more}>
            Load earlier case reviews
          </button>
        )}
        {!canManage && (
          <p>Only the room creator can review or apply a case step.</p>
        )}
      </section>
      {canWrite &&
        (kind === "APPLICATION" ? (
          <ApplicationEntry roomId={roomId} onSaved={refresh} />
        ) : (
          <ActionForm
            path={`/${roomId}/${prefix}-save`}
            title={definition.add}
            onSaved={refresh}
            build={(d, id) => ({
              request_id: id,
              version: 0,
              ...payload(d, kind),
            })}
          >
            <Fields kind={kind} />
          </ActionForm>
        ))}
    </div>
  );
}
