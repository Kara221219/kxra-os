"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
const roomViews = [
  "conversation",
  "tasks",
  "agents",
  "knowledge",
  "memory",
  "jobs",
  "workflow",
  "creators",
  "samples",
  "settings",
] as const;
type RoomView = (typeof roomViews)[number];
import type {
  TeamRoom,
  ModelConnection,
  TeamMessagePage,
  teamDetail,
} from "../lib/team-workspace";
type Detail = Awaited<ReturnType<typeof teamDetail>>;
type Project = { id: string; name: string };
import { ActionForm } from "./TeamActionForm";
import { RoomKnowledge } from "./RoomKnowledge";
import { RoomMemory } from "./RoomMemory";
import { WorkspacePilot } from "./WorkspacePilot";
import { RoomCollaboration } from "./RoomCollaboration";
import { RoomWorkflow } from "./RoomWorkflow";
import { RoomTaskBoard } from "./RoomTaskBoard";
import { RoomJobs } from "./RoomJobs";
import type { teamKnowledge, RoomChunk } from "../lib/team-knowledge";
export function TeamWorkspace({
  rooms,
  projects,
  connections,
  detail,
  actorId,
  local,
  candidates = [],
  isOrgOwner = false,
  knowledge,
}: {
  rooms: TeamRoom[];
  projects: Project[];
  connections: ModelConnection[];
  detail?: Detail;
  actorId: string;
  local: boolean;
  isOrgOwner?: boolean;
  candidates?: { account_id: string; display_name: string }[];
  knowledge?: Awaited<ReturnType<typeof teamKnowledge>>;
}) {
  const router = useRouter(),
    search = useSearchParams(),
    [roomQuery, setRoomQuery] = useState(""),
    [ready, setReady] = useState(false),
    [history, setHistory] = useState<TeamMessagePage | null>(null),
    [loadingHistory, setLoadingHistory] = useState(false),
    [historyNotice, setHistoryNotice] = useState(""),
    [selectedChunks, setSelectedChunks] = useState<RoomChunk[]>([]);
  const requestedView = search.get("view"),
    tab: RoomView = roomViews.includes(requestedView as RoomView)
      ? (requestedView as RoomView)
      : "conversation";
  function selectView(view: RoomView) {
    const params = new URLSearchParams(search.toString());
    params.set("view", view);
    router.replace("?" + params.toString(), { scroll: false });
  }
  useEffect(() => setReady(true), []);
  useEffect(() => {
    if (!detail) return;
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 8000);
    return () => clearInterval(tick);
  }, [detail?.room.id, router]);
  const room = detail?.room,
    canManage = room?.created_by === actorId,
    canWrite = projects.some((p) => p.id === room?.project_id);
  const older = history?.room_id === room?.id ? history : null,
    messages = [
      ...new Map(
        [...(older?.messages || []), ...(detail?.messages || [])].map((m) => [
          m.id,
          m,
        ]),
      ).values(),
    ],
    eligibleFiles = new Set(
      knowledge?.files
        .filter((file) => file.active)
        .map((file) => file.file_version_id) || [],
    ),
    approvedSkills = new Set(
      knowledge?.skills
        .filter((skill) => skill.state === "APPROVED")
        .map((skill) => skill.id) || [],
    ),
    selectedEvidence = selectedChunks.filter((chunk) =>
      eligibleFiles.has(chunk.file_version_id),
    ),
    approvedMemories = new Set(
      knowledge?.memory.entries
        .filter((memory) => memory.eligible)
        .map((memory) => memory.id) || [],
    ),
    runs = [
      ...new Map(
        [...(older?.runs || []), ...(detail?.runs || [])].map((run) => [
          run.id,
          run,
        ]),
      ).values(),
    ].filter(
      (run) =>
        !knowledge ||
        ((run.chunk_ids || []).length === (run.sources || []).length &&
          (run.skill_ids || []).length === (run.skills || []).length &&
          (run.memory_ids || []).length === (run.memories || []).length &&
          (run.memories || []).every((memory) =>
            approvedMemories.has(memory.id),
          ) &&
          (run.sources || []).every((source) =>
            eligibleFiles.has(source.file_version_id),
          ) &&
          (run.skills || []).every(
            (skill) =>
              approvedSkills.has(skill.id) &&
              knowledge.bindings.some(
                (binding) =>
                  binding.enabled &&
                  binding.agent_id === run.agent_id &&
                  binding.skill_id === skill.id,
              ),
          )),
    ),
    nextBefore = older ? older.next_before : detail?.next_before;
  useEffect(() => {
    setHistory(null);
    setHistoryNotice("");
    setLoadingHistory(false);
    setSelectedChunks([]);
  }, [room?.id]);
  const historyRequest = useRef<AbortController | null>(null);
  useEffect(() => () => historyRequest.current?.abort(), [room?.id]);
  async function loadOlder() {
    if (!room || !nextBefore || loadingHistory) return;
    const controller = new AbortController();
    historyRequest.current = controller;
    setLoadingHistory(true);
    setHistoryNotice("");
    try {
      const response = await fetch(
        `/api/team-space/${room.id}/messages?before=${encodeURIComponent(nextBefore)}`,
        { signal: controller.signal, cache: "no-store" },
      );
      const value = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        // Clear cached private history when authorisation has been withdrawn.
        if ([401, 403, 404].includes(response.status)) {
          setHistory(null);
          router.refresh();
        }
        throw Error(value.error || "Unable to load earlier messages");
      }
      const page = value as TeamMessagePage;
      setHistory({
        ...page,
        messages: [...page.messages, ...messages],
        runs: [...page.runs, ...runs],
      });
      setHistoryNotice(
        `${page.messages.length} earlier messages loaded.${page.next_before ? "" : " Beginning of conversation reached."}`,
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setHistoryNotice(
          error instanceof Error
            ? error.message
            : "Unable to load earlier messages",
        );
    } finally {
      if (!controller.signal.aborted) setLoadingHistory(false);
    }
  }
  return (
    <div className="team-space team-workbench">
      <div className="team-space-heading">
        <div>
          <p className="eyebrow">PEOPLE + AGENTS + BUSINESS</p>
          <h1>{room?.name || "Your team workspace"}</h1>
          <p>
            {room
              ? `${room.access === "PRIVATE" ? "Private room · explicit members only" : "Project room · current project members"}`
              : "Bring the conversation, the thinking and the next action together."}
          </p>
        </div>
        <Link href="/os/workspace">All rooms</Link>
      </div>
      {local && (
        <p className="notice">
          Local demonstration: synthetic models only. No provider is billed and
          no information leaves this machine.
        </p>
      )}
      <div className="team-space-layout">
        <nav className="panel team-room-list" aria-label="Workspace rooms">
          <div className="team-rail-brand">
            ✣ KXRA <span>WORKSPACE</span>
          </div>
          <h2>Team rooms</h2>
          <label htmlFor="workspace-room-search">Find a room</label>
          <input
            id="workspace-room-search"
            type="search"
            value={roomQuery}
            onChange={(e) => setRoomQuery(e.target.value)}
            placeholder="Search your rooms"
          />
          {rooms
            .filter((r) =>
              r.name.toLowerCase().includes(roomQuery.toLowerCase()),
            )
            .map((r) => (
              <Link
                aria-current={r.id === room?.id ? "page" : undefined}
                href={"/os/workspace/" + r.id}
                key={r.id}
              >
                {r.access === "PRIVATE" ? "◈" : "#"} {r.name}
              </Link>
            ))}
          {!rooms.length && <p>Create your first room to start.</p>}
          {!!rooms.length &&
            !rooms.some((r) =>
              r.name.toLowerCase().includes(roomQuery.toLowerCase()),
            ) && (
              <p role="status">
                No matching rooms.{" "}
                <button type="button" onClick={() => setRoomQuery("")}>
                  Clear room search
                </button>
              </p>
            )}
          <Link href="/os/workspace">＋ Create a room</Link>
          <hr />
          <Link href="/os/projects">Projects</Link>
          <Link href="/os/files">Files & knowledge</Link>
          <Link href="/os/tasks">Assigned work</Link>
          <Link href="/os/workrooms">Archived discussions</Link>
        </nav>
        <div className="team-space-main">
          {!detail ? (
            <>
              <div className="team-summary">
                <article className="panel">
                  <h2>One place for shared work</h2>
                  <p>
                    Create a room for a project or a private team conversation.
                    Add an agent with a defined role, choose its model, then ask
                    it to work on a message or thread.
                  </p>
                </article>
                <article className="panel">
                  <h2>People stay in control</h2>
                  <p>
                    Review draft outputs, propose a task and approve the next
                    step. Every model request has an access scope and a recorded
                    outcome.
                  </p>
                </article>
              </div>
              <ActionForm
                path=""
                title="Create room"
                navigate
                build={(d) => ({
                  name: d.get("name"),
                  project_id: d.get("project_id"),
                  guidelines: d.get("guidelines"),
                  access: d.get("access"),
                })}
              >
                <label>
                  Room name
                  <input
                    name="name"
                    maxLength={120}
                    required
                    placeholder="Customer success"
                  />
                </label>
                <label>
                  Project
                  <select name="project_id" aria-label="Project" required>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Who can see this?
                  <select name="access">
                    <option value="PRIVATE">Only invited room members</option>
                    <option value="PROJECT">
                      Everyone with access to this project
                    </option>
                  </select>
                </label>
                <label>
                  Room guidelines
                  <textarea
                    name="guidelines"
                    maxLength={4096}
                    placeholder="Purpose, constraints and the decisions this room owns"
                  />
                </label>
              </ActionForm>
              <ConnectionManager connections={connections} local={local} />
            </>
          ) : (
            <>
              <div className="team-tabs" role="tablist" aria-label="Room views">
                {roomViews.map((t) => (
                  <button
                    role="tab"
                    disabled={!ready}
                    aria-selected={tab === t}
                    id={"room-tab-" + t}
                    aria-controls="room-view-panel"
                    tabIndex={tab === t ? 0 : -1}
                    onKeyDown={(e) => {
                      const index = roomViews.indexOf(t);
                      const next =
                        e.key === "ArrowRight"
                          ? roomViews[(index + 1) % roomViews.length]
                          : e.key === "ArrowLeft"
                            ? roomViews[
                                (index + roomViews.length - 1) %
                                  roomViews.length
                              ]
                            : e.key === "Home"
                              ? roomViews[0]
                              : e.key === "End"
                                ? roomViews.at(-1)!
                                : null;
                      if (next) {
                        e.preventDefault();
                        document.getElementById("room-tab-" + next)?.focus();
                        selectView(next);
                      }
                    }}
                    key={t}
                    onClick={() => selectView(t)}
                  >
                    {t[0].toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <div
                id="room-view-panel"
                role="tabpanel"
                aria-labelledby={"room-tab-" + tab}
                tabIndex={0}
                className="team-view-panel"
              >
                {tab === "conversation" && (
                  <>
                    <section className="panel">
                      <h2>Conversation</h2>
                      <p>
                        Updates refresh every eight seconds. Agents receive only
                        the selected thread, or just one message for an
                        independent view.
                      </p>
                      {nextBefore && (
                        <button
                          type="button"
                          disabled={!ready || loadingHistory}
                          onClick={loadOlder}
                        >
                          {loadingHistory
                            ? "Loading earlier messages…"
                            : "Load earlier messages"}
                        </button>
                      )}
                      <p role="status" aria-live="polite">
                        {historyNotice}
                      </p>
                      {!messages.length && (
                        <p>
                          Start with the problem, the evidence and the outcome
                          you need.
                        </p>
                      )}
                      {messages.map((m) => (
                        <article
                          className="team-message"
                          key={m.id}
                          id={"message-" + m.id}
                        >
                          <small>
                            {m.author_id === actorId ? "You" : "Team member"} ·{" "}
                            {new Date(m.created_at).toLocaleString("en-GB")}
                            {m.parent_id && (
                              <>
                                {" "}
                                ·{" "}
                                {messages.some(
                                  (parent) => parent.id === m.parent_id,
                                ) ? (
                                  <a href={"#message-" + m.parent_id}>
                                    Reply to thread
                                  </a>
                                ) : (
                                  <span>
                                    Reply to an earlier thread · load earlier
                                    messages to view
                                  </span>
                                )}
                              </>
                            )}
                          </small>
                          <p className="team-text">{m.body}</p>
                          {runs
                            .filter((run) => run.message_id === m.id)
                            .map((run) => (
                              <div className="team-agent-output" key={run.id}>
                                <strong>
                                  {detail.agents.find(
                                    (ag) => ag.id === run.agent_id,
                                  )?.name || "Agent"}{" "}
                                  · {run.status}
                                </strong>
                                <p className="team-text">
                                  {run.output ||
                                    run.error_code ||
                                    (run.status === "INTERRUPTED"
                                      ? "Request interrupted. It is safe to start a new run."
                                      : "Awaiting response.")}
                                </p>
                                <small>
                                  {run.input_tokens + run.output_tokens}{" "}
                                  reported tokens · Run {run.id}
                                </small>
                                {run.sources?.map((source) => (
                                  <p key={source.id}>
                                    <a
                                      href={`/api/team-space/${room!.id}/files/${source.file_version_id}`}
                                    >
                                      Evidence: {source.filename} · v
                                      {source.source_version}
                                    </a>
                                  </p>
                                ))}
                                {run.skills?.map((skill) => (
                                  <p key={skill.id}>
                                    Instruction skill: {skill.name} · v
                                    {skill.version}
                                  </p>
                                ))}
                                {run.memories?.map((memory) => (
                                  <p key={memory.id}>
                                    Room memory: {memory.title} · v
                                    {memory.version} · {memory.kind}
                                  </p>
                                ))}
                                {run.status === "RUNNING" && canWrite && (
                                  <ActionForm
                                    path={`/${room!.id}/cancel`}
                                    title="Cancel run"
                                    build={() => ({ run_id: run.id })}
                                  >
                                    <p>
                                      Prevents result publication. Provider
                                      billing may already have started.
                                    </p>
                                  </ActionForm>
                                )}
                              </div>
                            ))}
                        </article>
                      ))}
                    </section>
                    {canWrite && (
                      <ActionForm
                        path={`/${room!.id}/messages`}
                        title="Send message"
                        build={(d, id) => ({
                          request_id: id,
                          body: d.get("body"),
                          parent_id: d.get("parent_id") || null,
                        })}
                      >
                        <label>
                          Thread
                          <select name="parent_id" aria-label="Thread">
                            <option value="">New conversation</option>
                            {messages
                              .filter((m) => !m.parent_id)
                              .map((m) => (
                                <option value={m.id} key={m.id}>
                                  {m.body.slice(0, 80)}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Message
                          <textarea name="body" required maxLength={12000} />
                        </label>
                      </ActionForm>
                    )}
                    {canWrite &&
                      detail.agents.some((agent) => agent.enabled) &&
                      messages.length > 0 && (
                        <ActionForm
                          path={`/${room!.id}/run`}
                          title="Ask agent"
                          build={(d, id) => ({
                            request_id: id,
                            agent_id: d.get("agent_id"),
                            message_id: d.get("message_id"),
                            context: d.get("context"),
                            chunk_ids:
                              d.get("context") === "MESSAGE_ONLY"
                                ? []
                                : selectedEvidence.map((chunk) => chunk.id),
                            use_memory:
                              d.get("context") !== "MESSAGE_ONLY" &&
                              d.get("use_memory") === "on",
                          })}
                        >
                          <p>
                            The authorised context is sent to the selected
                            provider. Limit: 20 attempts per person per 24
                            hours, 1,200 output tokens per request. Your
                            provider may charge separately.
                          </p>
                          <p>
                            Selected file excerpts: {selectedEvidence.length}.
                            Choose evidence in Knowledge. Reviewed attached
                            skills apply to thread mode; message-only mode
                            excludes files, skills and memory.
                          </p>
                          <label>
                            <input type="checkbox" name="use_memory" /> Use
                            approved memory for this agent (thread mode only)
                          </label>
                          <label>
                            Agent
                            <select name="agent_id">
                              {detail.agents
                                .filter((agent) => agent.enabled)
                                .map((ag) => (
                                  <option value={ag.id} key={ag.id}>
                                    {ag.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label>
                            Message
                            <select
                              name="message_id"
                              aria-label="Message to analyse"
                            >
                              {[...messages].reverse().map((m) => (
                                <option value={m.id} key={m.id}>
                                  {m.body.slice(0, 100)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            Context
                            <select name="context">
                              <option value="THREAD">
                                This thread (up to 40 messages)
                              </option>
                              <option value="MESSAGE_ONLY">
                                This message only · independent view
                              </option>
                            </select>
                          </label>
                        </ActionForm>
                      )}
                  </>
                )}
                {tab === "tasks" && (
                  <RoomTaskBoard
                    key={room!.id}
                    roomId={room!.id}
                    items={detail.items}
                    canWrite={canWrite}
                    canManage={canManage}
                  />
                )}
                {tab === "agents" && (
                  <>
                    <section className="panel">
                      <h2>Your room’s AI team</h2>
                      {detail.agents.map((ag) => (
                        <article key={ag.id} className="team-message">
                          <h3>{ag.name}</h3>
                          <p className="team-text">{ag.instructions}</p>
                          <p>
                            Draft responses only · this room’s authorised
                            context
                          </p>
                          <p>{ag.enabled ? "Active" : "Paused"}</p>
                          {canManage && (
                            <ActionForm
                              path={`/${room!.id}/agent-state`}
                              title={
                                ag.enabled ? "Pause agent" : "Resume agent"
                              }
                              build={() => ({
                                agent_id: ag.id,
                                enabled: !ag.enabled,
                              })}
                            >
                              <p>
                                Pausing blocks new runs and publication of any
                                pending response. Existing history remains.
                              </p>
                            </ActionForm>
                          )}
                        </article>
                      ))}
                      {!detail.agents.length && (
                        <p>
                          No agents yet. Connect a model and give your first
                          agent a specific job.
                        </p>
                      )}
                    </section>
                    {canManage && (
                      <ActionForm
                        path={`/${room!.id}/agents`}
                        title="Add agent"
                        build={(d) => ({
                          name: d.get("name"),
                          instructions: d.get("instructions"),
                          connection_id: d.get("connection_id"),
                        })}
                      >
                        <label>
                          Name
                          <input
                            name="name"
                            required
                            maxLength={100}
                            placeholder="Operations partner"
                          />
                        </label>
                        <label>
                          Model connection
                          <select
                            name="connection_id"
                            aria-label="Model connection"
                            required
                          >
                            {connections
                              .filter((c) => c.enabled)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name} · {c.model}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Role and objective
                          <textarea
                            name="instructions"
                            maxLength={6000}
                            required
                            placeholder="Identify the bottleneck, list the evidence gaps and propose one measurable next step."
                          />
                        </label>
                        <p>
                          Adding this agent allows current room contributors to
                          use this connection. Disconnect it at any time to stop
                          new requests.
                        </p>
                      </ActionForm>
                    )}
                    <ConnectionManager
                      connections={connections}
                      local={local}
                    />
                  </>
                )}
                {tab === "settings" && isOrgOwner && (
                  <WorkspacePilot local={local} />
                )}
                {tab === "settings" && (
                  <>
                    <section className="panel">
                      <h2>Room guidelines</h2>
                      <p className="team-text">
                        {room!.guidelines || "No additional guidelines."}
                      </p>
                      <h3>Membership</h3>
                      <p>
                        Project access is always required. Private membership
                        does not override a revoked project or account.
                      </p>
                      {detail.members.map((m) => (
                        <p key={m.account_id}>
                          {candidates.find((c) => c.account_id === m.account_id)
                            ?.display_name ||
                            (m.account_id === actorId
                              ? "You"
                              : m.account_id)}{" "}
                          · {m.active ? "Active" : "Removed"}
                        </p>
                      ))}
                    </section>
                    {canManage && (
                      <ActionForm
                        path={`/${room!.id}/members`}
                        title="Update room member"
                        build={(d) => ({
                          account_id: d.get("account_id"),
                          active: d.get("active") === "true",
                        })}
                      >
                        <label>
                          Eligible team member
                          <select name="account_id" required>
                            {candidates.map((m) => (
                              <option key={m.account_id} value={m.account_id}>
                                {m.display_name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Access
                          <select name="active">
                            <option value="true">Add to private room</option>
                            <option value="false">
                              Remove from private room
                            </option>
                          </select>
                        </label>
                        <p>
                          For project rooms, visibility follows project
                          membership. Manage project access in Projects.
                        </p>
                      </ActionForm>
                    )}
                  </>
                )}
                {tab === "knowledge" && knowledge && (
                  <RoomKnowledge
                    roomId={room!.id}
                    knowledge={knowledge}
                    agents={detail.agents}
                    canWrite={canWrite}
                    canManage={canManage}
                    selected={selectedEvidence}
                    onSelection={setSelectedChunks}
                  />
                )}
                {tab === "memory" && knowledge && (
                  <RoomMemory
                    roomId={room!.id}
                    memory={knowledge.memory}
                    agents={detail.agents}
                    actorId={actorId}
                    canWrite={canWrite}
                    canManage={canManage}
                  />
                )}
                {(tab === "creators" || tab === "samples") && (
                  <RoomCollaboration
                    key={room!.id + tab}
                    roomId={room!.id}
                    kind={tab === "creators" ? "CREATOR" : "SAMPLE"}
                    canWrite={canWrite}
                    canManage={canManage}
                  />
                )}
                {tab === "workflow" && (
                  <RoomWorkflow
                    key={room!.id}
                    roomId={room!.id}
                    canWrite={canWrite}
                    canManage={canManage}
                  />
                )}
                {tab === "jobs" && (
                  <RoomJobs
                    roomId={room!.id}
                    agents={detail.agents}
                    messages={messages}
                    chunkIds={selectedEvidence.map((c) => c.id)}
                    actorId={actorId}
                    canManage={canManage}
                    canWrite={canWrite}
                    local={local}
                  />
                )}
              </div>
            </>
          )}
        </div>
        {detail && (
          <aside className="panel team-context" aria-label="Room context">
            <p className="eyebrow">THE WORK STAYS TOGETHER</p>
            <h2>Room context</h2>
            <dl>
              <div>
                <dt>Visibility</dt>
                <dd>
                  {room!.access === "PRIVATE"
                    ? "Explicit private membership"
                    : "Current project membership"}
                </dd>
              </div>
              <div>
                <dt>Your role here</dt>
                <dd>
                  {canManage
                    ? "Room creator · review and manage"
                    : canWrite
                      ? "Contributor"
                      : "Read only"}
                </dd>
              </div>
              <div>
                <dt>Active room agents</dt>
                <dd>{detail.agents.filter((a) => a.enabled).length}</dd>
              </div>
              <div>
                <dt>Attached active sources</dt>
                <dd>{knowledge?.files.filter((f) => f.active).length ?? 0}</dd>
              </div>
            </dl>
            <h3>Room brief</h3>
            <p className="team-text">
              {room!.guidelines || "No additional guidelines."}
            </p>
            <button type="button" onClick={() => selectView("knowledge")}>
              Review evidence
            </button>
            <button type="button" onClick={() => selectView("workflow")}>
              Open CRM workflow
            </button>
            <p className="team-context-boundary">
              {local
                ? "Local fixture environment. Model output is synthetic; records and messages persist in this isolated database."
                : "Only authorised room context is available. A configured model is not proof of accepted hosted execution."}
            </p>
          </aside>
        )}
      </div>
    </div>
  );
}
function ConnectionManager({
  connections,
  local,
}: {
  connections: ModelConnection[];
  local: boolean;
}) {
  return (
    <details className="panel">
      <summary>Model connections ({connections.length})</summary>
      <p>
        Keys are stored encrypted on the server and are never returned to the
        browser. Connections belong to you; only agents you explicitly attach
        may use them.
      </p>
      {connections.map((c) => (
        <div className="team-message" key={c.id}>
          <strong>
            {c.name} · {c.model}
          </strong>
          <ActionForm
            path={"/connections/" + c.id}
            title={c.enabled ? "Disconnect model" : "Enable model"}
            build={() => ({ enabled: !c.enabled })}
          >
            <p>{c.enabled ? "Available to attached agents" : "Disabled"}</p>
          </ActionForm>
        </div>
      ))}
      <ActionForm
        path="/connections"
        title="Connect model"
        build={(d) => ({
          name: d.get("name"),
          provider: d.get("provider"),
          model: d.get("model"),
          endpoint_id: d.get("endpoint_id") || "",
          key: d.get("key"),
        })}
      >
        <label>
          Connection name
          <input name="name" required maxLength={120} />
        </label>
        <label>
          Provider
          <select name="provider">
            {(local
              ? ["FIXTURE"]
              : ["OPENAI", "ANTHROPIC", "GOOGLE", "OPENROUTER", "COMPATIBLE"]
            ).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Model ID
          <input
            name="model"
            required
            defaultValue={local ? "fixture-draft" : ""}
            maxLength={160}
          />
        </label>
        {!local && (
          <label>
            Custom endpoint name (compatible providers only)
            <input name="endpoint_id" maxLength={80} />
          </label>
        )}
        <label>
          {local ? "Synthetic key" : "API key"}
          <input
            type="password"
            name="key"
            required
            autoComplete="off"
            defaultValue={local ? "local-fixture" : ""}
          />
        </label>
        <p>
          {local
            ? "Use the generated demonstration model. Real keys are rejected here."
            : "OpenAI, Anthropic, Google and OpenRouter protocols are supported. Other compatible providers require an administrator-approved endpoint. Model availability and billing are controlled by your provider."}
        </p>
      </ActionForm>
    </details>
  );
}
