"use client";
import { useRoomCatalog } from "./useRoomCatalog";
import Link from "next/link";
import { RoomAuditExport } from "./RoomAuditExport";
import { RoomSchedules } from "./RoomSchedules";
import { ActionForm } from "./TeamActionForm";
import type { TeamAgent, TeamMessage } from "../lib/team-workspace";
import type { TeamJob, TeamJobAttempt } from "../lib/team-jobs";
const emptyJobs = { jobs: [] as TeamJob[], attempts: [] as TeamJobAttempt[] };
export function RoomJobs({
  roomId,
  agents,
  messages,
  chunkIds,
  actorId,
  canManage,
  canWrite,
  local,
  hostedOperations = false,
}: {
  roomId: string;
  agents: TeamAgent[];
  messages: TeamMessage[];
  chunkIds: string[];
  actorId: string;
  canManage: boolean;
  canWrite: boolean;
  local: boolean;
  hostedOperations?: boolean;
}) {
  const {
    data,
    next,
    notice,
    busy,
    reload: refresh,
    more,
  } = useRoomCatalog(roomId, "jobs", emptyJobs, true);
  return (
    <section className="panel" aria-label="Durable room drafts">
      <RoomSchedules
        roomId={roomId}
        agents={agents}
        messages={messages}
        chunkIds={chunkIds}
        actorId={actorId}
        canManage={canManage && canWrite}
        local={local}
        hostedOperations={hostedOperations}
      />
      {canManage && canWrite && <RoomAuditExport roomId={roomId} />}
      <h2>Queued drafts</h2>
      <p>
        <Link href={`/os/room-operations/${roomId}`}>
          Review execution consent and uncertain outcomes
        </Link>
      </p>
      <p>
        100 jobs per page, with pending work first, then uncertain outcomes and
        completed history. Loaded earlier pages are snapshots; refresh to update
        current states.
      </p>
      <p>
        {hostedOperations
          ? "Hosted room drafts are enabled for scoped execution. Queueing requires recent MFA verification and authorises this draft until one hour after its due time, subject to current access and provider limits."
          : "Local fixture execution only. Hosted scheduled execution is not activated."}{" "}
        A queued due time is a one-off instant; reviewed daily schedules are
        available in this view. External actions are unavailable.
      </p>
      <p>
        Context is pinned when queued. Room, identity, sources and expiry are
        checked again before dispatch and publication. Pre-dispatch failures may
        retry up to three attempts. A lost worker after dispatch produces an
        uncertain outcome and is never replayed automatically.
      </p>
      <p>
        {hostedOperations
          ? "A configured hosted delivery service checks authorised due work. A due time is eligibility, not a completion guarantee."
          : "Due drafts run while an explicitly started local fixture worker is online, or when you use Run next due draft. No OS service is installed."}{" "}
        Leaving this page does not delete queued work.
      </p>
      <p role="status">
        {notice || (!data.jobs.length ? "No queued drafts." : "")}
      </p>
      <button type="button" onClick={refresh}>
        Refresh queued drafts
      </button>
      {local && canWrite && (
        <ActionForm
          path="/jobs/drain"
          title="Run next due draft"
          onSaved={refresh}
          build={(_d, id) => ({ request_id: id, room_id: roomId })}
        >
          <p>
            Processes at most one of your due drafts in this room. Other
            members' jobs require their own authenticated worker.
          </p>
        </ActionForm>
      )}
      {data.jobs.map((job) => (
        <article
          key={job.id}
          className="team-message"
          aria-label={`Queued draft ${job.id}`}
        >
          <h3>
            {agents.find((a) => a.id === job.agent_id)?.name || "Room agent"} ·{" "}
            {job.state}
          </h3>
          <p>
            Job {job.id} · Due {new Date(job.due_at).toLocaleString("en-GB")} ·
            Attempts {job.attempt_count}/3
          </p>
          <p>
            Due instant (UTC):{" "}
            <time dateTime={job.due_at}>
              {new Date(job.due_at).toISOString()}
            </time>
          </p>
          {job.state === "QUEUED" && job.last_error && (
            <p>
              Next eligible time:{" "}
              {new Date(job.available_at).toLocaleString("en-GB")}
            </p>
          )}
          {job.lease_expires_at && (
            <p>
              Current lease ends{" "}
              {new Date(job.lease_expires_at).toLocaleString("en-GB")}
            </p>
          )}
          {job.last_error && <p>Recorded reason: {job.last_error}</p>}
          {job.state === "UNCERTAIN" && (
            <p>
              Worker completion was not recorded after dispatch. Output is
              withheld. Review the attempt before explicitly queuing new work.
            </p>
          )}
          {job.run_id && (
            <p>
              Recorded run: {job.run_id}.{" "}
              <Link href="/os/runs">Open run history</Link>
            </p>
          )}
          <ol aria-label={`Attempts for job ${job.id}`}>
            {data.attempts
              .filter((a) => a.job_id === job.id)
              .map((a) => (
                <li key={a.id}>
                  Attempt {a.number}: {a.phase}
                  {a.error_code ? ` · ${a.error_code}` : ""}
                </li>
              ))}
          </ol>
          {canWrite &&
            (canManage || job.requested_by === actorId) &&
            ["QUEUED", "LEASED", "DISPATCHED"].includes(job.state) && (
              <ActionForm
                path={`/${roomId}/jobs/cancel`}
                title={`Cancel queued draft ${job.id}`}
                onSaved={refresh}
                build={() => ({ job_id: job.id, version: job.version })}
              >
                <p>
                  Stops future dispatch and prevents late output publication.
                  Already received provider work cannot be recalled.
                </p>
              </ActionForm>
            )}
        </article>
      ))}
      {next && (
        <button type="button" disabled={busy} onClick={more}>
          Load earlier jobs
        </button>
      )}
      {(local || hostedOperations) &&
        canWrite &&
        agents.some((a) => a.enabled) &&
        messages.length > 0 && (
          <ActionForm
            path={`/${roomId}/jobs`}
            title="Queue draft"
            onSaved={refresh}
            build={(d, id) => ({
              request_id: id,
              agent_id: d.get("agent_id"),
              message_id: d.get("message_id"),
              context: d.get("context"),
              chunk_ids: d.get("context") === "MESSAGE_ONLY" ? [] : chunkIds,
              use_memory:
                d.get("context") !== "MESSAGE_ONLY" &&
                d.get("use_memory") === "on",
              due_at: d.get("due_at")
                ? new Date(String(d.get("due_at"))).toISOString()
                : null,
            })}
          >
            <label>
              Queued draft agent
              <select name="agent_id" aria-label="Queued draft agent">
                {agents
                  .filter((a) => a.enabled)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Queued draft message
              <select name="message_id" aria-label="Queued draft message">
                {messages.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.body.slice(0, 100)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Queued draft context
              <select name="context" aria-label="Queued draft context">
                <option value="THREAD">Selected thread</option>
                <option value="MESSAGE_ONLY">Message only</option>
              </select>
            </label>
            <label>
              <input type="checkbox" name="use_memory" /> Include currently
              approved room memory in thread mode
            </label>
            <label>
              Due after (local time, optional)
              <input type="datetime-local" name="due_at" />
            </label>
            <p>
              The input uses your browser's local time. Review the recorded UTC
              instant after queuing.
            </p>
            <p>
              Selected file excerpts: {chunkIds.length}. Thread mode pins
              current reviewed skills and any opted-in memory. Message-only mode
              excludes files, skills and memory. Maximum seven days ahead and 20
              active jobs per person. Actual dispatch retains the 20-run rolling
              daily limit.
            </p>
          </ActionForm>
        )}
    </section>
  );
}
