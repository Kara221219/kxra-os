"use client";
import { useCallback, useEffect, useState } from "react";
import type { TeamMessage } from "../lib/team-workspace";
type Agent = { id: string; name: string; presence: string };
type Task = {
  id: string;
  agent_id: string;
  objective: string;
  content_hash: string;
  state: string;
  thread_id: string;
  result_message_id: string | null;
};
async function control(operation: string, payload: unknown) {
  const r = await fetch("/api/team-space/paired-agents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation, payload }),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Paired operation unavailable");
  return d;
}
async function device(token: string, operation: string, payload: unknown) {
  const r = await fetch("/api/paired-device", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
    },
    body: JSON.stringify({ operation, payload }),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Synthetic device disconnected or revoked");
  return d;
}
export function RoomPairedAgents({
  roomId,
  messages,
}: {
  roomId: string;
  messages: TeamMessage[];
}) {
  const [agents, setAgents] = useState<Agent[]>([]),
    [tasks, setTasks] = useState<Task[]>([]),
    [agent, setAgent] = useState(""),
    [code, setCode] = useState(""),
    [token, setToken] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [view, setView] = useState<{
      task_id: string;
      objective: string;
      sources: { id: string; body: string }[];
      content_hash: string;
    } | null>(null);
  const refresh = useCallback(async () => {
    const r = await fetch(
      "/api/team-space/paired-agents?room_id=" + encodeURIComponent(roomId),
      { cache: "no-store" },
    );
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Private paired agents unavailable");
    setAgents(d.agents);
    setTasks(d.tasks);
  }, [roomId]);
  useEffect(() => {
    let active = true;
    setAgents([]);
    setTasks([]);
    setAgent("");
    setCode("");
    setToken("");
    setView(null);
    void fetch(
      "/api/team-space/paired-agents?room_id=" + encodeURIComponent(roomId),
      { cache: "no-store" },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Private paired agents unavailable");
        if (active) {
          setAgents(d.agents);
          setTasks(d.tasks);
        }
      })
      .catch((e) => {
        if (active) setNotice(e.message);
      });
    return () => {
      active = false;
    };
  }, [roomId]);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Operation unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Synthetic paired agents">
      <h2>Private paired agents · synthetic acceptance</h2>
      <p>
        Generated fixture credentials only. No live provider, installation, user
        files or commands. Manual handoffs below retain MANUAL_UNVERIFIED
        provenance. Device sessions last fifteen minutes; invitations are
        single-use for two minutes. A missed dispatch becomes uncertain and is
        never replayed automatically.
      </p>
      <p role="status">{notice}</p>
      <button disabled={busy} onClick={() => void act(async () => {})}>
        Refresh paired status
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.currentTarget);
          void act(async () => {
            const id = crypto.randomUUID();
            await control("CREATE", {
              room_id: roomId,
              agent_id: id,
              name: d.get("name"),
            });
            setAgent(id);
          });
        }}
      >
        <label>
          Private synthetic agent name
          <input name="name" required maxLength={80} />
        </label>
        <button disabled={busy}>Create private synthetic agent</button>
      </form>
      <label>
        Private paired agent
        <select
          disabled={busy}
          value={agent}
          onChange={(e) => {
            setAgent(e.target.value);
            setCode("");
            setToken("");
            setView(null);
          }}
        >
          <option value="">Choose agent</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.presence}
            </option>
          ))}
        </select>
      </label>
      {agent && (
        <>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const r = await control("INVITE", {
                  room_id: roomId,
                  agent_id: agent,
                });
                setCode(r.pairing_code);
              })
            }
          >
            Request single-use fixture pairing
          </button>
          {code && (
            <>
              <label>
                Fixture pairing invitation
                <textarea readOnly value={code} />
              </label>
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const r = await device(code, "REDEEM", {});
                    setToken(r.session_token);
                    setNotice(
                      "Synthetic device paired. Token stays in this page memory only.",
                    );
                  })
                }
              >
                Redeem on synthetic device
              </button>
            </>
          )}
          {token && (
            <>
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await device(token, "HEARTBEAT", {});
                    setNotice(
                      "Synthetic device reconnected. Dispatched work is not replayed.",
                    );
                  })
                }
              >
                Reconnect synthetic device
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const p = await device(token, "POLL", {
                      request_id: crypto.randomUUID(),
                    });
                    if (!p.task) {
                      setNotice("No eligible approved draft.");
                      return;
                    }
                    const t = p.task;
                    try {
                      const started = await device(token, "START", {
                        task_id: t.id,
                        fence: t.fence,
                      });
                      if (started.dispatched !== true) {
                        setNotice("Already dispatched; not replayed.");
                        return;
                      }
                      await device(token, "RESULT", {
                        task_id: t.id,
                        fence: t.fence,
                        draft_text:
                          "Synthetic paired draft: " +
                          t.objective +
                          " — review required.",
                      });
                      setNotice(
                        "Paired synthetic draft returned to its original thread.",
                      );
                    } catch (e) {
                      try {
                        await device(token, "ABANDON", {
                          task_id: t.id,
                          fence: t.fence,
                        });
                      } catch {}
                      throw e;
                    }
                  })
                }
              >
                Run one synthetic paired draft
              </button>
            </>
          )}
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                await control("REVOKE", { room_id: roomId, agent_id: agent });
                setToken("");
                setCode("");
                setNotice(
                  "Device revoked. Further polling and late results are rejected.",
                );
              })
            }
          >
            Revoke paired device
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.currentTarget);
              void act(async () => {
                await control("PROPOSE", {
                  room_id: roomId,
                  agent_id: agent,
                  request_id: crypto.randomUUID(),
                  objective: d.get("objective"),
                  message_ids: [d.get("message")],
                });
                setView(null);
              });
            }}
          >
            <label>
              Paired draft objective
              <input required name="objective" maxLength={2000} />
            </label>
            <label>
              Original thread message
              <select required name="message">
                {messages.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.body.slice(0, 100)}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={busy || !messages.length}>
              Propose paired text task
            </button>
          </form>
        </>
      )}
      {tasks.map((t) => (
        <article key={t.id} aria-label={"Paired task " + t.objective}>
          <h3>{t.objective}</h3>
          <p>
            State {t.state} · Original thread {t.thread_id}
          </p>
          {t.state === "PROPOSED" && (
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const r = await control("VIEW", {
                    room_id: roomId,
                    agent_id: t.agent_id,
                    task_id: t.id,
                  });
                  setView({ ...r, task_id: t.id });
                })
              }
            >
              Inspect exact paired task
            </button>
          )}
          {view?.task_id === t.id && (
            <>
              <p style={{ overflowWrap: "anywhere" }}>
                Review fingerprint {view.content_hash}
              </p>
              {view.sources.map((s) => (
                <pre
                  key={s.id}
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {s.body}
                </pre>
              ))}
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    await control("APPROVE", {
                      room_id: roomId,
                      agent_id: t.agent_id,
                      task_id: t.id,
                      content_hash: view.content_hash,
                    });
                    setView(null);
                  })
                }
              >
                Approve exact paired task
              </button>
            </>
          )}
          {["PROPOSED", "APPROVED", "LEASED", "RUNNING"].includes(t.state) && (
            <button
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await control("CANCEL", {
                    room_id: roomId,
                    agent_id: t.agent_id,
                    task_id: t.id,
                  });
                  setView(null);
                })
              }
            >
              Cancel paired task
            </button>
          )}
          {t.result_message_id && (
            <p>
              Draft recorded in the original conversation. Provenance:
              PAIRED_SYNTHETIC_DRAFT, review required.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
