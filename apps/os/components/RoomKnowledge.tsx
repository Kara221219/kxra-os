"use client";
import { useEffect, useRef, useState } from "react";
import { ActionForm } from "./TeamActionForm";
import type { teamKnowledge, RoomChunk } from "../lib/team-knowledge";
import type { TeamAgent } from "../lib/team-workspace";
type Knowledge = Awaited<ReturnType<typeof teamKnowledge>>;
export function RoomKnowledge({
  roomId,
  knowledge,
  agents,
  canWrite,
  canManage,
  selected,
  onSelection,
}: {
  roomId: string;
  knowledge: Knowledge;
  agents: TeamAgent[];
  canWrite: boolean;
  canManage: boolean;
  selected: RoomChunk[];
  onSelection: (chunks: RoomChunk[]) => void;
}) {
  const [results, setResults] = useState<RoomChunk[]>([]),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const activeFiles = knowledge.files.filter((file) => file.active);
  const attached = new Set(activeFiles.map((file) => file.file_version_id));
  return (
    <>
      <section className="panel" aria-label="Room file evidence">
        <h2>Room file evidence</h2>
        <p>
          Attach existing project-shared, indexed files. Room membership never
          widens a file’s original permissions. Private-room uploads are not
          available yet.
        </p>
        <p>
          <a href="/os/files">Upload and process a project file</a>
        </p>
        {!activeFiles.length && <p>No eligible files attached.</p>}
        {activeFiles.map((file) => (
          <article className="team-message" key={file.file_version_id}>
            <a href={`/api/team-space/${roomId}/files/${file.file_version_id}`}>
              {file.filename} · v{file.version}
            </a>
            {canWrite && (
              <ActionForm
                path={`/${roomId}/files`}
                title={`Detach ${file.filename}`}
                build={() => ({
                  file_version_id: file.file_version_id,
                  active: false,
                })}
              >
                <p>
                  Blocks future retrieval and hides runs derived from this
                  attachment.
                </p>
              </ActionForm>
            )}
          </article>
        ))}
        {canWrite &&
          knowledge.available_files.some(
            (file) => !attached.has(file.file_version_id),
          ) && (
            <ActionForm
              path={`/${roomId}/files`}
              title="Attach shared file"
              build={(d) => ({
                file_version_id: d.get("file_version_id"),
                active: true,
              })}
            >
              <label>
                Indexed shared file
                <select
                  name="file_version_id"
                  aria-label="Indexed shared file"
                  required
                >
                  {knowledge.available_files
                    .filter((file) => !attached.has(file.file_version_id))
                    .map((file) => (
                      <option
                        key={file.file_version_id}
                        value={file.file_version_id}
                      >
                        {file.filename} · v{file.version}
                      </option>
                    ))}
                </select>
              </label>
            </ActionForm>
          )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            request.current?.abort();
            const controller = new AbortController();
            request.current = controller;
            setBusy(true);
            setNotice("");
            setResults([]);
            try {
              const response = await fetch(
                `/api/team-space/${roomId}/search?q=${encodeURIComponent(String(data.get("q") || ""))}`,
                { cache: "no-store", signal: controller.signal },
              );
              const value = await response.json();
              if (controller.signal.aborted) return;
              if (!response.ok)
                throw Error(value.error || "Search unavailable");
              setResults(value);
              setNotice(
                `${value.length} matching excerpts. Select up to three for your next thread-based agent request.`,
              );
            } catch (error) {
              if (!controller.signal.aborted)
                setNotice(
                  error instanceof Error ? error.message : "Search unavailable",
                );
            } finally {
              if (!controller.signal.aborted) setBusy(false);
            }
          }}
        >
          <label>
            Search room files
            <input name="q" maxLength={200} required type="search" />
          </label>
          <button type="submit" disabled={busy}>
            {busy ? "Searching…" : "Search room files"}
          </button>
        </form>
        <p role="status">{notice}</p>
        {results
          .filter((result) => attached.has(result.file_version_id))
          .map((result) => (
            <article className="team-message" key={result.id}>
              <strong>
                {result.filename} · v{result.source_version}
              </strong>
              <p className="team-text">{result.content}</p>
              {canWrite && (
                <label>
                  <input
                    type="checkbox"
                    checked={selected.some((chunk) => chunk.id === result.id)}
                    disabled={
                      selected.length >= 3 &&
                      !selected.some((chunk) => chunk.id === result.id)
                    }
                    onChange={(e) =>
                      onSelection(
                        e.target.checked
                          ? [...selected, result]
                          : selected.filter((chunk) => chunk.id !== result.id),
                      )
                    }
                  />{" "}
                  Use this excerpt for the next agent request
                </label>
              )}
            </article>
          ))}
        {selected.length > 0 && (
          <>
            <p>
              {selected.length} excerpts selected. Return to Conversation and
              choose a thread-based request. The server rechecks each source
              before dispatch and publication.
            </p>
            <button type="button" onClick={() => onSelection([])}>
              Clear selected evidence
            </button>
          </>
        )}
      </section>
      <section className="panel" aria-label="Room instruction skills">
        <h2>Versioned instruction skills</h2>
        <p>
          These are reviewed instructions used in draft generation, with no code
          or tools. Platform rules, room guidelines and the agent role take
          precedence. Only the room creator can approve, revoke or attach a
          version. Message-only mode excludes skills and files.
        </p>
        {knowledge.skills.map((skill) => (
          <article className="team-message" key={skill.id}>
            <h3>
              {skill.name} · v{skill.version}
            </h3>
            <p>{skill.state}</p>
            <p className="team-text">{skill.instructions}</p>
            <small>SHA-256: {skill.content_sha256}</small>
            {canManage && ["DRAFT", "APPROVED"].includes(skill.state) && (
              <ActionForm
                path={`/${roomId}/skill-review`}
                title={`Review ${skill.name} v${skill.version}`}
                build={(d) => ({ skill_id: skill.id, state: d.get("state") })}
              >
                <label>
                  Version decision
                  <select
                    name="state"
                    aria-label={`Decision for ${skill.name} v${skill.version}`}
                  >
                    {skill.state === "DRAFT" ? (
                      <>
                        <option value="APPROVED">Approve exact version</option>
                        <option value="REJECTED">Reject version</option>
                      </>
                    ) : (
                      <option value="REVOKED">Revoke version</option>
                    )}
                  </select>
                </label>
                <p>
                  Review the exact instructions and hash above. Revocation hides
                  derived run output and blocks new use.
                </p>
              </ActionForm>
            )}
            {canManage &&
              agents.length > 0 &&
              (skill.state === "APPROVED" ||
                knowledge.bindings.some(
                  (binding) => binding.skill_id === skill.id && binding.enabled,
                )) && (
                <ActionForm
                  path={`/${roomId}/agent-skill`}
                  title={`Set agent use of ${skill.name} v${skill.version}`}
                  build={(d) => ({
                    skill_id: skill.id,
                    agent_id: d.get("agent_id"),
                    enabled: d.get("enabled") === "true",
                  })}
                >
                  <label>
                    Agent for this skill
                    <select
                      name="agent_id"
                      aria-label={`Agent for ${skill.name} v${skill.version}`}
                    >
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Skill use
                    <select
                      name="enabled"
                      aria-label={`Use ${skill.name} v${skill.version}`}
                    >
                      {skill.state === "APPROVED" && (
                        <option value="true">Attach approved version</option>
                      )}
                      <option value="false">Detach version</option>
                    </select>
                  </label>
                  <p>
                    Maximum three skills per agent; detach an older version of
                    the same name before attaching another.
                  </p>
                </ActionForm>
              )}
            <p>
              Attached to:{" "}
              {knowledge.bindings
                .filter(
                  (binding) => binding.skill_id === skill.id && binding.enabled,
                )
                .map(
                  (binding) =>
                    agents.find((agent) => agent.id === binding.agent_id)
                      ?.name || "Agent",
                )
                .join(", ") || "No agents"}
            </p>
          </article>
        ))}
        {canWrite && (
          <ActionForm
            path={`/${roomId}/skills`}
            title="Propose skill version"
            build={(d, id) => ({
              request_id: id,
              name: d.get("name"),
              instructions: d.get("instructions"),
            })}
          >
            <label>
              Skill name
              <input name="name" maxLength={100} required />
            </label>
            <label>
              Skill instructions
              <textarea name="instructions" maxLength={4000} required />
            </label>
            <p>
              Reusing a name creates a new immutable draft version. Approval and
              attachment are separate human actions.
            </p>
          </ActionForm>
        )}
      </section>
    </>
  );
}
