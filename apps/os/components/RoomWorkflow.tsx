"use client";
import { ActionForm } from "./TeamActionForm";
import { useRoomCatalog } from "./useRoomCatalog";
import type { WorkflowRecord, WorkflowAction } from "../lib/team-workflow";
const noRecords = { records: [] as WorkflowRecord[] },
  noActions = { actions: [] as WorkflowAction[] };
export function RoomWorkflow({
  roomId,
  canWrite,
  canManage,
}: {
  roomId: string;
  canWrite: boolean;
  canManage: boolean;
}) {
  const records = useRoomCatalog(roomId, "workflow-records", noRecords),
    actions = useRoomCatalog(roomId, "workflow-actions", noActions);
  const refresh = () => {
    records.reload();
    actions.reload();
  };
  return (
    <section className="panel" aria-label="Room CRM workflow">
      <h2>Lead conversion</h2>
      <p>
        Room-scoped operational template. Capture a lead, propose exact
        account/opportunity names and next step, have the room creator review,
        then explicitly execute the local conversion. No external CRM, email,
        contract or financial transaction.
      </p>
      <button type="button" onClick={refresh}>
        Refresh workflow
      </button>
      <p role="status">{records.notice || actions.notice}</p>
      {records.data.records.map((r) => (
        <article
          key={r.id}
          className="team-message"
          aria-label={`Workflow record ${r.id}`}
        >
          <h3>
            {r.kind} · {r.title}
          </h3>
          <p>
            {r.state} · Version {r.version} · Record {r.id}
          </p>
          <p>{r.body}</p>
          <p>Next step: {r.next_step}</p>
          {r.source_id && (
            <p>
              Converted from lead {r.source_id}. Receipt {r.action_id}.
            </p>
          )}
          {canWrite && r.kind === "LEAD" && r.state === "OPEN" && (
            <ActionForm
              path={`/${roomId}/lead`}
              title={`Update lead ${r.title}`}
              onSaved={refresh}
              build={(d) => ({
                request_id: r.id,
                version: r.version,
                title: d.get("title"),
                body: d.get("body"),
                next_step: d.get("next_step"),
              })}
            >
              <label>
                Updated lead name
                <input
                  name="title"
                  required
                  defaultValue={r.title}
                  maxLength={160}
                />
              </label>
              <label>
                Updated lead context
                <textarea name="body" defaultValue={r.body} maxLength={4000} />
              </label>
              <label>
                Updated next step
                <input
                  name="next_step"
                  required
                  defaultValue={r.next_step}
                  maxLength={500}
                />
              </label>
            </ActionForm>
          )}
        </article>
      ))}
      {records.next && (
        <button type="button" disabled={records.busy} onClick={records.more}>
          Load earlier workflow records
        </button>
      )}
      {canWrite && (
        <ActionForm
          path={`/${roomId}/lead`}
          title="Capture lead"
          onSaved={refresh}
          build={(d, id) => ({
            request_id: id,
            title: d.get("title"),
            body: d.get("body"),
            next_step: d.get("next_step"),
          })}
        >
          <label>
            Lead name
            <input name="title" required maxLength={160} />
          </label>
          <label>
            Lead context
            <textarea name="body" maxLength={4000} />
          </label>
          <label>
            Lead next step
            <input name="next_step" required maxLength={500} />
          </label>
        </ActionForm>
      )}
      {canWrite &&
        records.data.records.some(
          (r) => r.kind === "LEAD" && r.state === "OPEN",
        ) && (
          <ActionForm
            path={`/${roomId}/conversion`}
            title="Propose lead conversion"
            onSaved={refresh}
            build={(d, id) => {
              const r = records.data.records.find(
                (r) => r.id === d.get("source_id"),
              )!;
              return {
                request_id: id,
                source_id: r.id,
                source_version: r.version,
                account_name: d.get("account_name"),
                opportunity_name: d.get("opportunity_name"),
                next_step: d.get("next_step"),
              };
            }}
          >
            <label>
              Conversion lead
              <select name="source_id" aria-label="Conversion lead">
                {records.data.records
                  .filter((r) => r.kind === "LEAD" && r.state === "OPEN")
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} · v{r.version}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Account name
              <input name="account_name" required maxLength={160} />
            </label>
            <label>
              Opportunity name
              <input name="opportunity_name" required maxLength={160} />
            </label>
            <label>
              Conversion next step
              <input name="next_step" required maxLength={500} />
            </label>
            <p>
              Any change to the lead invalidates the approval. Execution creates
              two local records and marks the exact lead converted atomically.
            </p>
          </ActionForm>
        )}
      <h3>Conversion reviews and receipts</h3>
      {actions.data.actions.map((a) => (
        <article
          className="team-message"
          key={a.id}
          aria-label={`Conversion ${a.id}`}
        >
          <h4>
            {a.account_name} → {a.opportunity_name}
          </h4>
          <p>
            {a.state} · Revision {a.version} · Source {a.source_id} v
            {a.source_version}
          </p>
          <p>
            Next step: {a.next_step}. Expires{" "}
            {new Date(a.expires_at).toISOString()}.
          </p>
          {a.state === "EXECUTED" && (
            <p>
              Account {a.account_id}; opportunity {a.opportunity_id}. Conversion
              receipt {a.id}.
            </p>
          )}
          {canManage && ["PROPOSED", "APPROVED"].includes(a.state) && (
            <>
              {(a.state === "PROPOSED"
                ? ["APPROVED", "REJECTED", "CANCELLED"]
                : ["CANCELLED"]
              ).map((decision) => (
                <ActionForm
                  key={decision}
                  path={`/${roomId}/conversion-review`}
                  title={`${decision === "APPROVED" ? "Approve" : decision === "REJECTED" ? "Reject" : "Cancel"} conversion ${a.id}`}
                  onSaved={refresh}
                  build={() => ({
                    action_id: a.id,
                    version: a.version,
                    decision,
                  })}
                >
                  <p>
                    Review the exact source version, destination names and next
                    step above. Approval does not execute the conversion.
                  </p>
                </ActionForm>
              ))}
              {a.state === "APPROVED" && (
                <ActionForm
                  path={`/${roomId}/conversion-execute`}
                  title={`Execute conversion ${a.id}`}
                  onSaved={refresh}
                  build={() => ({ action_id: a.id, version: a.version })}
                >
                  <p>
                    Create the approved local records once. Retries return the
                    same receipt.
                  </p>
                </ActionForm>
              )}
            </>
          )}
        </article>
      ))}
      {actions.next && (
        <button type="button" disabled={actions.busy} onClick={actions.more}>
          Load earlier conversion receipts
        </button>
      )}
    </section>
  );
}
