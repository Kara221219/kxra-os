"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import {
  githubList,
  githubReadResult,
  githubConnection,
  githubWrite,
  type GithubList,
  type GithubRead,
  type GithubCommand,
} from "../../../packages/connectors/github-contracts";
import styles from "./CustomerConnections.module.css";
const notices: Record<string, string> = {
  QUEUED: "Queued durably. No write request has started.",
  DISPATCHING:
    "Dispatch started. Cancellation may be too late. A lost worker requires recovery, never replay.",
  UNCERTAIN:
    "The provider may have accepted this comment. Read-only reconciliation is allowed; dispatch will not replay it.",
  ACCEPTED:
    "Matching provider acceptance was recorded. This does not prove globally exactly-once provider behavior.",
  REJECTED:
    "The provider returned a definite rejection. This write will not be retried.",
  NOT_EXECUTED:
    "The write did not reach the dispatch boundary, or local code confirmed no HTTP send. Review its recorded reason.",
  CANCELLED: "Cancelled before dispatch. No write was sent by this attempt.",
};
async function api(command?: GithubCommand): Promise<unknown> {
  try {
    const response = await fetch("/api/customer-connectors/github", {
      method: command ? "POST" : "GET",
      headers: command ? { "content-type": "application/json" } : undefined,
      body: command ? JSON.stringify(command) : undefined,
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error();
    const data = await response.json();
    if (!command) return githubList.parse(data);
    const result = data.result;
    if (
      command.action === "connect_fixture" ||
      command.action === "revoke" ||
      command.action === "rotate_fixture_grant"
    )
      return githubConnection.parse(result);
    if (command.action === "read") return githubReadResult.parse(result);
    if (command.action === "recover") {
      if (result?.recovered !== true) throw Error();
      return result;
    }
    const write = githubWrite.parse(result);
    if (
      write.connection_id !== command.connection_id ||
      ("write_id" in command && write.id !== command.write_id)
    )
      throw Error();
    return write;
  } catch {
    throw Error(
      "The outcome could not be confirmed. Refresh durable outcomes. Do not assume failure or submit the comment again.",
    );
  }
}
export function GithubConnections({ initial }: { initial: GithubList }) {
  const [data, setData] = useState(initial),
    [selectedId, setSelectedId] = useState(
      initial.connections.at(-1)?.id || "",
    );
  const [scope, setScope] = useState(false),
    [read, setRead] = useState<GithubRead | null>(null),
    [note, setNote] = useState(""),
    [checked, setChecked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const guard = useRef(false);
  const c = data.connections.find((value) => value.id === selectedId);
  async function refresh() {
    const value = githubList.parse(await api());
    setData(value);
    setRead(null);
    setChecked({});
  }
  async function perform(work: () => Promise<void>) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setRead(null);
      setChecked({});
      setError(e instanceof Error ? e.message : "Outcome unavailable");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function act(command: GithubCommand) {
    await api(command);
    await refresh();
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/os/connections">Connections</Link>
        <span className={styles.badge}>GitHub issue comments · local fake</span>
      </header>
      <h1>Approved comment delivery</h1>
      <p className={styles.notice}>
        GitHub protocol code talks only to a local fake endpoint. No real GitHub
        account, grant or external action is enabled.
      </p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <p role="status">
        {busy ? "Working…" : "No automatic retries or background replay."}
      </p>
      <section className={styles.panel} aria-label="GitHub connection scope">
        <h2>Connection and scope</h2>
        <p>
          Fixture account101 · installation303 · repository
          fixture-org/fixture-repo (ID404) · issue1. Tokens stay behind a
          credential reference.
        </p>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={scope}
            disabled={busy}
            onChange={(e) => setScope(e.target.checked)}
          />
          Allow approved issue-comment writes
        </label>
        <button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const connected = githubConnection.parse(
                await api({ action: "connect_fixture", allow_write: scope }),
              );
              await refresh();
              setSelectedId(connected.id);
              setScope(false);
            })
          }
        >
          Create fixture GitHub connection
        </button>
        <button
          disabled={busy}
          className={styles.secondary}
          onClick={() => void perform(refresh)}
        >
          Refresh durable outcomes
        </button>
        {c ? (
          <>
            <label>
              Connection
              <select
                value={selectedId}
                disabled={busy}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setRead(null);
                  setChecked({});
                  setNote("");
                }}
              >
                {data.connections.map((value, index) => (
                  <option key={value.id} value={value.id}>
                    GitHub fixture {index + 1} · {value.state} ·{" "}
                    {value.allow_write ? "read + approved write" : "read only"}
                  </option>
                ))}
              </select>
            </label>
            <p>
              Status: <strong>{c.state}</strong> · Grant version
              {c.grant_version} · Expires {c.expires_at}.{" "}
              {c.allow_write ? "Issues read/write" : "Issues read only"}.
            </p>
            <div className={styles.actions}>
              <button
                disabled={busy || c.state !== "ACTIVE"}
                onClick={() =>
                  void perform(async () =>
                    setRead(
                      githubReadResult.parse(
                        await api({ action: "read", connection_id: c.id }),
                      ),
                    ),
                  )
                }
              >
                Read issue comments
              </button>
              <button
                disabled={busy || c.state !== "ACTIVE"}
                className={styles.secondary}
                onClick={() =>
                  void perform(() =>
                    act({
                      action: "rotate_fixture_grant",
                      connection_id: c.id,
                    }),
                  )
                }
              >
                Simulate grant rotation
              </button>
              <button
                disabled={busy || c.state !== "ACTIVE"}
                className={styles.secondary}
                onClick={() =>
                  void perform(() =>
                    act({ action: "revoke", connection_id: c.id }),
                  )
                }
              >
                Revoke GitHub connection
              </button>
            </div>
          </>
        ) : null}
        {read ? (
          <section aria-label="GitHub read results">
            <h3>Untrusted comment content</h3>
            <p>
              {read.comments.length} shown; scan{" "}
              {read.complete
                ? "complete within limit"
                : "bounded and incomplete"}
              . Read authority expires {read.receipt.expires_at}.
            </p>
            {read.comments.map((value) => (
              <p key={value.id} className={styles.note}>
                {value.body}
              </p>
            ))}
          </section>
        ) : null}
      </section>
      {c ? (
        <section className={styles.panel}>
          <h2>Prepare and approve</h2>
          <p>
            The full comment includes a correlation marker. Review the account,
            target, scope and entire body before approving. Enqueue and dispatch
            are separate actions.
          </p>
          <label>
            Comment to propose
            <textarea
              aria-label="Comment to propose"
              rows={3}
              maxLength={2000}
              disabled={busy || !c.allow_write || c.state !== "ACTIVE"}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            disabled={
              busy ||
              !c.allow_write ||
              !read ||
              !note.trim() ||
              c.state !== "ACTIVE"
            }
            onClick={() =>
              void perform(() =>
                act({
                  action: "prepare",
                  connection_id: c.id,
                  read_id: read!.receipt.id,
                  note,
                }),
              )
            }
          >
            Prepare GitHub comment
          </button>
        </section>
      ) : null}
      <section className={styles.panel} aria-label="Durable GitHub outcomes">
        <h2>Durable outcomes</h2>
        <p>
          Refreshing or leaving this page does not cancel approval. Cancel
          before dispatch, or revoke the connection. Once dispatch starts,
          cancellation cannot guarantee that the provider did nothing.
        </p>
        {data.writes
          .filter((w) => w.connection_id === selectedId)
          .map((w) => (
            <article
              key={w.id}
              className={styles.review}
              aria-label={`Comment ${w.id}`}
            >
              <h3>{w.state}</h3>
              <p>{notices[w.state] || "Review the exact bound payload."}</p>
              <p>
                Reason: {w.reason}.{" "}
                {w.cancel_requested
                  ? "Cancellation/revocation requested after dispatch; historical outcome may still arrive."
                  : ""}
              </p>
              <p>
                Target: {w.payload.binding.owner}/{w.payload.binding.repo},
                issue{w.payload.binding.issue_number} · account
                {w.payload.binding.account_id} · issues:write · grant version
                {w.payload.grant_version}.
              </p>
              <pre className={styles.note}>{w.payload.body}</pre>
              <details>
                <summary>Approval fingerprint and expiry</summary>
                <code className={styles.digest}>{w.digest}</code>
                <p>{w.expires_at}</p>
              </details>
              {w.state === "PENDING" ? (
                <>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={!!checked[w.id]}
                      onChange={(e) =>
                        setChecked((previous) => ({
                          ...previous,
                          [w.id]: e.target.checked,
                        }))
                      }
                    />
                    I approve this exact GitHub account, target and full comment
                    once.
                  </label>
                  <button
                    disabled={busy || !checked[w.id]}
                    onClick={() =>
                      void perform(() =>
                        act({
                          action: "approve",
                          connection_id: w.connection_id,
                          write_id: w.id,
                          digest: w.digest,
                        }),
                      )
                    }
                  >
                    Approve exact GitHub comment
                  </button>
                </>
              ) : null}
              {w.state === "APPROVED" ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      act({
                        action: "enqueue",
                        connection_id: w.connection_id,
                        write_id: w.id,
                        digest: w.digest,
                      }),
                    )
                  }
                >
                  Queue approved comment
                </button>
              ) : null}
              {w.state === "QUEUED" ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      act({
                        action: "dispatch",
                        connection_id: w.connection_id,
                        write_id: w.id,
                      }),
                    )
                  }
                >
                  Dispatch once to local fake
                </button>
              ) : null}
              {w.state === "DISPATCHING" ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      act({
                        action: "recover",
                        connection_id: w.connection_id,
                      }),
                    )
                  }
                >
                  Recover stalled dispatch
                </button>
              ) : null}
              {w.state === "UNCERTAIN" ? (
                <button
                  disabled={busy || c?.state !== "ACTIVE"}
                  onClick={() =>
                    void perform(() =>
                      act({
                        action: "reconcile",
                        connection_id: w.connection_id,
                        write_id: w.id,
                      }),
                    )
                  }
                >
                  Reconcile by reading only
                </button>
              ) : null}
              {["PENDING", "APPROVED", "QUEUED", "DISPATCHING"].includes(
                w.state,
              ) ? (
                <button
                  className={styles.secondary}
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      act({
                        action: "cancel",
                        connection_id: w.connection_id,
                        write_id: w.id,
                      }),
                    )
                  }
                >
                  Request cancellation
                </button>
              ) : null}
              {w.provider_comment_id ? (
                <p>Provider comment receipt: {w.provider_comment_id}</p>
              ) : null}
              <ul>
                {data.receipts
                  .filter((r) => r.write_id === w.id)
                  .map((r) => (
                    <li key={r.id}>
                      {r.event} · {r.created_at}
                      {typeof r.evidence.reason === "string"
                        ? ` · ${r.evidence.reason}`
                        : ""}
                    </li>
                  ))}
              </ul>
            </article>
          ))}
      </section>
    </main>
  );
}
