"use client";
import Link from "next/link";
import { useState } from "react";
import { ActionForm } from "./TeamActionForm";
import { useRoomCatalog } from "./useRoomCatalog";
import {
  collaborationStages,
  nextCollaborationStages,
  type CollaborationKind,
  type CollaborationRecord,
  type CollaborationAction,
} from "../../../packages/workspace/collaboration-contract";
import styles from "./RoomCollaboration.module.css";
const emptyRecords = { records: [] as CollaborationRecord[] },
  emptyActions = { actions: [] as CollaborationAction[] };
function Fields({
  record,
  kind,
}: {
  record?: CollaborationRecord;
  kind: CollaborationKind;
}) {
  return (
    <>
      <label>
        {kind === "CREATOR" ? "Creator name" : "Sample item"}
        <input
          name="title"
          required
          maxLength={160}
          defaultValue={record?.title}
        />
      </label>
      <label>
        {kind === "CREATOR" ? "Brief and recorded evidence" : "Sample details"}
        <textarea name="body" maxLength={4000} defaultValue={record?.body} />
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
    </>
  );
}
const payload = (d: FormData) => ({
  title: d.get("title"),
  body: d.get("body"),
  responsible: d.get("responsible"),
  next_step: d.get("next_step"),
  due_on: d.get("due_on") || null,
});
function SampleEntry({
  roomId,
  onSaved,
}: {
  roomId: string;
  onSaved: () => void;
}) {
  const roster = useRoomCatalog(roomId, "creator-records", emptyRecords);
  const available = roster.data.records.filter((c) => c.stage !== "ARCHIVED");
  return (
    <section className="panel" aria-label="Sample recipient selection">
      <p>
        Choose a recorded creator from this room. No address, carrier lookup or
        external reminder is used.
      </p>
      <p role="status">{roster.notice}</p>
      <button type="button" onClick={roster.reload}>
        Refresh creator choices
      </button>
      {roster.next && (
        <button disabled={roster.busy} type="button" onClick={roster.more}>
          Load earlier creators
        </button>
      )}
      {available.length ? (
        <ActionForm
          path={`/${roomId}/sample-save`}
          title="Add sample request"
          onSaved={onSaved}
          build={(d, id) => ({
            request_id: id,
            version: 0,
            ...payload(d),
            creator_id: d.get("creator_id"),
          })}
        >
          <label>
            Recorded creator
            <select name="creator_id" required>
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} · Revision {c.version}
                </option>
              ))}
            </select>
          </label>
          <Fields kind="SAMPLE" />
        </ActionForm>
      ) : (
        <p>
          No available creators loaded.{" "}
          <Link href={`/os/workspace/${roomId}?view=creators`}>
            Add or review the creator roster
          </Link>
          .
        </p>
      )}
    </section>
  );
}
export function RoomCollaboration({
  roomId,
  kind,
  canWrite,
  canManage,
}: {
  roomId: string;
  kind: CollaborationKind;
  canWrite: boolean;
  canManage: boolean;
}) {
  const prefix = kind === "CREATOR" ? "creator" : "sample",
    title = kind === "CREATOR" ? "Creator Management" : "Sampling Desk";
  const records = useRoomCatalog(roomId, prefix + "-records", emptyRecords),
    actions = useRoomCatalog(roomId, prefix + "-actions", emptyActions);
  const [query, setQuery] = useState(""),
    [stage, setStage] = useState("ALL");
  const refresh = () => {
    records.reload();
    actions.reload();
  };
  const matches = records.data.records.filter(
    (r) =>
      (stage === "ALL" || r.stage === stage) &&
      (r.title + " " + r.body + " " + r.responsible + " " + r.next_step)
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className={styles.root}>
      <section className="panel" aria-label={title}>
        <p className="eyebrow">
          ROOM APP · {kind === "CREATOR" ? "CREATORS" : "SAMPLES"}
        </p>
        <h2>{title}</h2>
        <p>
          {kind === "CREATOR"
            ? "Build a roster, record the brief and responsible follow-up, then propose a collaboration step for exact-version review. Audience and performance claims remain unverified."
            : "Link a sample to a recorded creator, review preparation, record delivery and review the post window. Delivery is a human record, not carrier confirmation."}
        </p>
        <p>
          Propose → room creator reviews → explicitly record once. These actions
          update local application records; they never contact a creator, send a
          shipment or schedule an external reminder.
        </p>
        <button type="button" onClick={refresh}>
          Refresh {title}
        </button>
        <p role="status">{records.notice}</p>
        <p role="status">{actions.notice}</p>
        <ul className={styles.stages} aria-label="Loaded stage counts">
          {collaborationStages[kind].map((s) => (
            <li key={s}>
              {s}: {records.data.records.filter((r) => r.stage === s).length}
            </li>
          ))}
        </ul>
        <div className={styles.filters}>
          <label>
            Search {title}
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
              {collaborationStages[kind].map((s) => (
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
            Reset app filters
          </button>
        )}
        {!records.busy && !matches.length && (
          <p>
            {records.data.records.length
              ? "No matching loaded records. Reset the filters to return to the records."
              : "No records yet. Add the first recorded request below."}
          </p>
        )}
        {matches.map((r) => (
          <article key={r.id} className={styles.card} aria-label={r.title}>
            <h3>{r.title}</h3>
            <p className={styles.meta}>
              Stage {r.stage} · Revision {r.version}
            </p>
            <p className={styles.body}>{r.body}</p>
            <p>Responsible: {r.responsible}</p>
            <p>
              Next follow-up: {r.next_step}
              {r.due_on ? " · " + r.due_on : ""}
            </p>
            {r.creator_id && (
              <p className={styles.meta}>
                Creator:{" "}
                <Link href={`/os/workspace/${roomId}?view=creators`}>
                  {r.creator_title || "Review creator roster"}
                </Link>
              </p>
            )}
            {canWrite &&
              !["ARCHIVED", "CANCELLED", "COMPLETE"].includes(r.stage) && (
                <details>
                  <summary>Edit recorded details</summary>
                  <ActionForm
                    key={r.version}
                    path={`/${roomId}/${prefix}-save`}
                    title="Save recorded details"
                    onSaved={refresh}
                    build={(d) => ({
                      request_id: r.id,
                      version: r.version,
                      ...payload(d),
                      creator_id: r.creator_id,
                    })}
                  >
                    <Fields record={r} kind={kind} />
                  </ActionForm>
                </details>
              )}
            {canWrite && nextCollaborationStages(kind, r.stage).length > 0 && (
              <details>
                <summary>Propose reviewed step</summary>
                <ActionForm
                  path={`/${roomId}/${prefix}-propose`}
                  title="Propose recorded step"
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
                    <select name="target_stage">
                      {nextCollaborationStages(kind, r.stage).map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Review note or outreach draft
                    <textarea name="note" required maxLength={4000} />
                  </label>
                  <p>
                    This snapshots revision {r.version}. No external action will
                    run.
                  </p>
                </ActionForm>
              </details>
            )}
          </article>
        ))}
        {records.next && (
          <button disabled={records.busy} type="button" onClick={records.more}>
            Load earlier {title} records
          </button>
        )}
      </section>
      <section className="panel" aria-label={title + " reviews"}>
        <h2>Reviewed steps and receipts</h2>
        <p>
          If the source or linked creator changes, or a review expires, refresh
          and propose a fresh step. An earlier approval never carries over.
        </p>
        {!actions.busy && !actions.data.actions.length && (
          <p>No proposed steps yet.</p>
        )}
        {actions.data.actions.map((a) => (
          <article
            key={a.id}
            className={styles.card}
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
              <strong>
                Exact recorded source · revision {a.source_version}
              </strong>
              <p>{a.source_snapshot.body}</p>
              <p>Responsible: {a.source_snapshot.responsible}</p>
              <p>
                Follow-up: {a.source_snapshot.next_step}
                {a.source_snapshot.due_on
                  ? " · " + a.source_snapshot.due_on
                  : ""}
              </p>
              {a.source_snapshot.creator_title && (
                <p>
                  Creator: {a.source_snapshot.creator_title} · revision{" "}
                  {a.source_snapshot.creator_version}
                </p>
              )}
            </div>
            <p className={styles.body}>Review note: {a.note}</p>
            {canManage && ["PROPOSED", "APPROVED"].includes(a.state) && (
              <ActionForm
                path={`/${roomId}/${prefix}-review`}
                title="Record app review"
                onSaved={refresh}
                build={(d) => ({
                  action_id: a.id,
                  version: a.version,
                  decision: d.get("decision"),
                })}
              >
                <label>
                  Review decision
                  <select name="decision">
                    {a.state === "PROPOSED" && (
                      <>
                        <option value="APPROVED">
                          Approve exact recorded step
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
                title="Apply reviewed step once"
                onSaved={refresh}
                build={() => ({ action_id: a.id, version: a.version })}
              >
                <p>
                  Rechecks the current source, creator context, membership and
                  entitlement before recording the stage. No external execution.
                </p>
              </ActionForm>
            )}
            {a.result && (
              <p>
                Receipt {a.result.action_id}: {a.result.stage} · Record revision{" "}
                {a.result.version}.
              </p>
            )}
          </article>
        ))}
        {actions.next && (
          <button disabled={actions.busy} type="button" onClick={actions.more}>
            Load earlier {title} reviews
          </button>
        )}
        {!canManage && <p>Only the room creator can review or apply a step.</p>}
      </section>
      {canWrite &&
        (kind === "CREATOR" ? (
          <ActionForm
            path={`/${roomId}/creator-save`}
            title="Add creator"
            onSaved={refresh}
            build={(d, id) => ({ request_id: id, version: 0, ...payload(d) })}
          >
            <Fields kind="CREATOR" />
          </ActionForm>
        ) : (
          <SampleEntry roomId={roomId} onSaved={refresh} />
        ))}
    </div>
  );
}
