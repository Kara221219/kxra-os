"use client";
import { useState } from "react";
import { ActionForm } from "./TeamActionForm";
import { useRoomCatalog } from "./useRoomCatalog";
import type { TeamMessage } from "../lib/team-workspace";
import type { BridgeRequest, BridgeView } from "../lib/team-bridge";
import styles from "./RoomCollaboration.module.css";
import bridgeStyles from "./RoomBridge.module.css";
const empty = { requests: [] as BridgeRequest[] };
async function send(path: string, body?: unknown) {
  const r = await fetch("/api/team-space" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const value = await r.json();
  if (!r.ok) throw Error(value.error || "Handoff unavailable");
  return value;
}
function RequestCard({
  request: r,
  roomId,
  refresh,
}: {
  request: BridgeRequest;
  roomId: string;
  refresh: () => void;
}) {
  const [view, setView] = useState<BridgeView | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [packet, setPacket] = useState("");
  async function inspect() {
    setBusy(true);
    setNotice("");
    try {
      setView(await send(`/${roomId}/bridge/${r.id}`));
    } catch (e) {
      setView(null);
      setNotice(e instanceof Error ? e.message : "Request unavailable");
    } finally {
      setBusy(false);
    }
  }
  const saved = () => {
    refresh();
    void inspect();
  };
  return (
    <article className={styles.card} aria-label={r.objective}>
      <h3>{r.objective}</h3>
      <p>
        State {r.state} · Revision {r.version} · Handoffs recorded{" "}
        {r.export_count}
      </p>
      <p>
        Expires {new Date(r.expires_at).toISOString()}. Changed source or access
        blocks further use.
      </p>
      <button type="button" disabled={busy} onClick={() => void inspect()}>
        Inspect scoped request
      </button>
      <p role="status">{notice}</p>
      {view && (
        <div>
          <p>
            Request {r.id} · Manual, unpaired draft. No tools or external
            execution.
          </p>
          <h4>Exact selected context</h4>
          {view.packet.sources.map((m) => (
            <blockquote key={m.id} className={styles.body}>
              {m.body}
            </blockquote>
          ))}
          {["PROPOSED", "RESULT_PROPOSED"].includes(r.state) && (
            <ActionForm
              path={`/${roomId}/bridge/${r.id}/review`}
              title={
                r.state === "PROPOSED"
                  ? "Record handoff review"
                  : "Record returned draft review"
              }
              onSaved={saved}
              build={(d) => ({
                version: r.version,
                decision: d.get("decision"),
              })}
            >
              {r.state === "RESULT_PROPOSED" && (
                <>
                  <p>Manual unverified draft; accepting records it only.</p>
                  <pre className={bridgeStyles.text}>{view.result_text}</pre>
                </>
              )}
              <label>
                Review decision
                <select name="decision" aria-label="Review decision">
                  <option
                    value={r.state === "PROPOSED" ? "APPROVED" : "ACCEPTED"}
                  >
                    {r.state === "PROPOSED"
                      ? "Approve this exact handoff"
                      : "Accept draft record only"}
                  </option>
                  <option value="REJECTED">Reject</option>
                  <option value="CANCELLED">Cancel</option>
                </select>
              </label>
            </ActionForm>
          )}
          {["APPROVED", "EXPORTED"].includes(r.state) && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setNotice("");
                  try {
                    const receipt = await send(
                      `/${roomId}/bridge/${r.id}/export`,
                      { version: 2 },
                    );
                    setPacket(JSON.stringify(receipt, null, 2));
                    setNotice(
                      receipt.replayed
                        ? "Original handoff receipt recovered. No second handoff recorded."
                        : "One manual handoff recorded. No device or provider was contacted.",
                    );
                    refresh();
                  } catch (e) {
                    setNotice(
                      e instanceof Error
                        ? e.message
                        : "Retry the same receipt after refreshing",
                    );
                    refresh();
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Get reviewed handoff packet
              </button>
              {packet && (
                <label>
                  Manual handoff packet
                  <textarea
                    readOnly
                    aria-label="Manual handoff packet"
                    className={bridgeStyles.packet}
                    value={packet}
                  />
                </label>
              )}
            </>
          )}
          {r.state === "EXPORTED" && (
            <ActionForm
              path={`/${roomId}/bridge/${r.id}/result`}
              title="Record returned draft"
              onSaved={saved}
              build={(d) => ({
                version: 3,
                result: {
                  request_id: r.id,
                  packet_sha256: view.packet_sha256,
                  draft_text: d.get("draft_text"),
                },
              })}
            >
              <p>
                Paste draft text only. Do not paste passwords, keys or private
                account credentials. Returned text is unverified and will need
                review; no command or action is run.
              </p>
              <label>
                Returned draft text
                <textarea
                  name="draft_text"
                  aria-label="Returned draft text"
                  required
                  maxLength={12000}
                />
              </label>
            </ActionForm>
          )}
          {r.state === "ACCEPTED" && (
            <>
              <h4>Accepted manual draft record</h4>
              <pre className={bridgeStyles.text}>{view.result_text}</pre>
              <p>
                Unverified external provenance. Nothing was executed or sent.
              </p>
            </>
          )}
        </div>
      )}
      {["PROPOSED", "APPROVED", "EXPORTED", "RESULT_PROPOSED"].includes(
        r.state,
      ) && (
        <ActionForm
          path={`/${roomId}/bridge/${r.id}/review`}
          title="Cancel this handoff"
          onSaved={() => {
            setView(null);
            setPacket("");
            refresh();
          }}
          build={() => ({ version: r.version, decision: "CANCELLED" })}
        >
          <p>
            Cancellation prevents further export, returned-draft submission and
            acceptance.
          </p>
        </ActionForm>
      )}
    </article>
  );
}
export function RoomBridge({
  roomId,
  messages,
  local,
  canManage,
}: {
  roomId: string;
  messages: TeamMessage[];
  local: boolean;
  canManage: boolean;
}) {
  if (!local)
    return (
      <section className="panel">
        <h2>Agent handoff</h2>
        <p>
          Native device pairing and hosted handoff are not activated. No
          provider or device is connected by this screen.
        </p>
      </section>
    );
  if (!canManage)
    return (
      <section className="panel">
        <h2>Agent handoff</h2>
        <p>
          Manual draft handoffs are restricted to this room's creator. No native
          device is paired.
        </p>
      </section>
    );
  return <LocalBridge roomId={roomId} messages={messages} />;
}
function LocalBridge({
  roomId,
  messages,
}: {
  roomId: string;
  messages: TeamMessage[];
}) {
  const catalog = useRoomCatalog(roomId, "bridge", empty),
    [query, setQuery] = useState("");
  const visible = catalog.data.requests.filter((r) =>
    (r.objective + " " + r.state).toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className={bridgeStyles.root}>
      <section className="panel">
        <p>LOCAL MANUAL DRAFT HANDOFF</p>
        <h2>Agent handoff</h2>
        <p>
          No native device is paired. This records a reviewed manual exchange;
          it does not launch Codex, Claude, a provider, a command or an external
          action.
        </p>
        <p>
          Create request → inspect exact context → approve → get one recoverable
          packet → manually return draft text → review draft record. Changed
          work needs a new request and fresh review.
        </p>
        <ActionForm
          path={`/${roomId}/bridge`}
          title="Create draft handoff request"
          onSaved={catalog.reload}
          build={(d, request_id) => ({
            request_id,
            adapter: "MANUAL_DRAFT",
            objective: d.get("objective"),
            message_ids: d.getAll("message_id"),
          })}
        >
          <label>
            Draft objective
            <textarea
              name="objective"
              aria-label="Draft objective"
              required
              maxLength={2000}
            />
          </label>
          <fieldset>
            <legend>
              Select context from this room (up to ten loaded messages)
            </legend>
            {[...messages]
              .reverse()
              .slice(0, 10)
              .map((m) => (
                <label key={m.id}>
                  <input type="checkbox" name="message_id" value={m.id} />
                  {m.body.slice(0, 200)}
                </label>
              ))}
          </fieldset>
          {!messages.length && (
            <p>Write a room message first, then return here to select it.</p>
          )}
        </ActionForm>
      </section>
      <section className="panel" aria-label="Recorded handoffs">
        <h2>Recorded handoffs</h2>
        <button type="button" onClick={catalog.reload}>
          Refresh handoffs
        </button>
        <p role="status">{catalog.notice}</p>
        <label>
          Search handoffs
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {query && (
          <button type="button" onClick={() => setQuery("")}>
            Reset handoff search
          </button>
        )}
        {!catalog.busy && !visible.length && (
          <p>
            {query ? "No matching loaded handoffs." : "No handoffs recorded."}
          </p>
        )}
        {visible.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            roomId={roomId}
            refresh={catalog.reload}
          />
        ))}
        {catalog.next && (
          <button type="button" disabled={catalog.busy} onClick={catalog.more}>
            Load earlier handoffs
          </button>
        )}
      </section>
    </div>
  );
}
