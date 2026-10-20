"use client";
import { useRoomCatalog } from "./useRoomCatalog";
import { ActionForm } from "./TeamActionForm";
import type { TeamAgent, TeamMessage } from "../lib/team-workspace";
import type { TeamSchedule, TeamOccurrence } from "../lib/team-schedules";
const emptySchedules = {
  schedules: [] as TeamSchedule[],
  occurrences: [] as TeamOccurrence[],
};
export function RoomSchedules({
  roomId,
  agents,
  messages,
  chunkIds,
  canManage,
  local,
  actorId,
}: {
  roomId: string;
  agents: TeamAgent[];
  messages: TeamMessage[];
  chunkIds: string[];
  canManage: boolean;
  local: boolean;
  actorId: string;
}) {
  const { data, next, notice, busy, reload, more } = useRoomCatalog(
    roomId,
    "schedules",
    emptySchedules,
  );
  return (
    <section aria-label="Recurring room drafts" className="panel">
      <h2>Recurring drafts</h2>
      <p>
        100 definitions per page, prioritising active and pending work before
        history. Loaded earlier pages are snapshots; refresh to update current
        states.
      </p>
      <p>
        Reviewed daily schedules, local fixture only. Hosted execution is not
        activated. Run next due draft or an explicitly started local worker
        admits due occurrences. No OS service is installed.
      </p>
      <p>
        Each definition pins its message, thread, selected file excerpts,
        reviewed skills and opted-in memory. Review a new definition to change
        them. Current permissions, source approvals and expiry are checked
        before execution and publication.
      </p>
      <p>
        Missing daylight-saving times are skipped; repeated times run at the
        earlier instant. On reconnect only the latest due local day is
        considered. Pending work skips the next occurrence. Every admitted
        occurrence consumes its budget, including failed or cancelled jobs.
        Uncertain completion pauses future admissions and requires a new
        reviewed definition.
      </p>
      <p role="status">
        {notice || (!data.schedules.length ? "No recurring drafts." : "")}
      </p>
      <button type="button" onClick={reload}>
        Refresh recurring drafts
      </button>
      {data.schedules.map((s) => (
        <article
          key={s.id}
          className="team-message"
          aria-label={`Schedule ${s.name}`}
        >
          <h3>
            {s.name} · {s.state}
          </h3>
          <p>
            Daily at {s.wall_time} ({s.timezone}), starting {s.starts_on}.
            Expires {new Date(s.expires_at).toISOString()}. Maximum{" "}
            {s.max_occurrences} admitted occurrences.
          </p>
          <p>
            Definition {s.id} · Revision {s.version}
            {s.reviewed_at
              ? ` · Reviewed ${new Date(s.reviewed_at).toISOString()}`
              : " · Awaiting explicit review"}
          </p>
          {s.receipt && (
            <p>
              Pinned agent{" "}
              {agents.find((a) => a.id === s.receipt?.agent_id)?.name ||
                s.receipt.agent_id}
              ; message {s.receipt.message_id}; {s.receipt.context};{" "}
              {s.receipt.messages} messages, {s.receipt.files} file excerpts,{" "}
              {s.receipt.skills} skills, {s.receipt.memories} memories. Context{" "}
              {s.receipt.context_active ? "available" : "withdrawn"}. Review
              digest:{" "}
              <code>
                {s.receipt.context_sha256 ??
                  "Withheld while context is unavailable"}
              </code>
            </p>
          )}
          {s.last_error && <p>Recorded reason: {s.last_error}</p>}
          <ol aria-label={`Occurrences for ${s.name}`}>
            {data.occurrences
              .filter((o) => o.schedule_id === s.id)
              .map((o) => (
                <li key={o.id}>
                  {o.local_day}: {o.outcome}
                  {o.scheduled_for
                    ? ` · ${new Date(o.scheduled_for).toISOString()}`
                    : " · No valid wall-time instant"}
                  {o.job_id ? ` · Job ${o.job_id} (see queued drafts)` : ""}
                </li>
              ))}
          </ol>
          {local &&
            canManage &&
            s.created_by === actorId &&
            !["REVOKED", "EXPIRED"].includes(s.state) && (
              <>
                {[
                  ...(s.state === "DRAFT" || s.state === "PAUSED"
                    ? ["ACTIVATE"]
                    : []),
                  ...(s.state !== "PAUSED" ? ["PAUSE"] : []),
                  "REVOKE",
                ].map((action) => (
                  <ActionForm
                    key={action}
                    path={`/${roomId}/schedules/review`}
                    title={`${action === "ACTIVATE" ? "Review and activate" : action === "PAUSE" ? "Pause" : "Revoke"} ${s.name}`}
                    onSaved={reload}
                    build={() => ({
                      schedule_id: s.id,
                      version: s.version,
                      action,
                    })}
                  >
                    <p>
                      {action === "ACTIVATE"
                        ? "I have reviewed this immutable daily definition, pinned source selection, timezone, expiry and occurrence budget. Activation authorises local fixture drafts only."
                        : "Stops pending children and fences late output. Previously completed runs remain in scoped history."}
                    </p>
                  </ActionForm>
                ))}
              </>
            )}
        </article>
      ))}
      {next && (
        <button type="button" disabled={busy} onClick={more}>
          Load earlier schedules
        </button>
      )}
      {local &&
        canManage &&
        agents.some((a) => a.enabled) &&
        messages.length > 0 && (
          <ActionForm
            path={`/${roomId}/schedules`}
            title="Propose daily draft"
            onSaved={reload}
            build={(d, id) => ({
              request_id: id,
              name: d.get("name"),
              agent_id: d.get("agent_id"),
              message_id: d.get("message_id"),
              context: d.get("context"),
              chunk_ids: d.get("context") === "MESSAGE_ONLY" ? [] : chunkIds,
              use_memory:
                d.get("context") !== "MESSAGE_ONLY" &&
                d.get("use_memory") === "on",
              timezone: d.get("timezone"),
              wall_time: d.get("wall_time"),
              starts_on: d.get("starts_on"),
              expires_at: new Date(String(d.get("expires_at"))).toISOString(),
              max_occurrences: Number(d.get("max_occurrences")),
            })}
          >
            <label>
              Schedule name
              <input name="name" required maxLength={120} />
            </label>
            <label>
              Scheduled draft agent
              <select name="agent_id" aria-label="Scheduled draft agent">
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
              Scheduled draft message
              <select name="message_id" aria-label="Scheduled draft message">
                {messages.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.body.slice(0, 100)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Scheduled draft context
              <select name="context" aria-label="Scheduled draft context">
                <option value="THREAD">Selected thread</option>
                <option value="MESSAGE_ONLY">Message only</option>
              </select>
            </label>
            <label>
              <input type="checkbox" name="use_memory" />
              Include approved room memory
            </label>
            <p>
              Selected file excerpts: {chunkIds.length}. Proposal records the
              current selection; later selections do not change it. The room
              creator proposes and separately activates each definition.
            </p>
            <label>
              IANA timezone
              <input
                name="timezone"
                required
                defaultValue="UTC"
                placeholder="Europe/London"
              />
            </label>
            <label>
              Daily wall time
              <input name="wall_time" type="time" required step="60" />
            </label>
            <label>
              First local date
              <input name="starts_on" type="date" required />
            </label>
            <label>
              Schedule expiry (browser local time)
              <input name="expires_at" type="datetime-local" required />
            </label>
            <label>
              Maximum admitted occurrences
              <input
                name="max_occurrences"
                type="number"
                min="1"
                max="20"
                defaultValue="7"
                required
              />
            </label>
            <p>
              Expires within 30 days. Maximum 20 active definitions and 20
              pending jobs per person; existing 20-run rolling daily limit also
              applies. No external actions or charges.
            </p>
          </ActionForm>
        )}
    </section>
  );
}
