"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  CustomerConnection,
  ConnectorRead,
  ConnectorProposal,
} from "../../../packages/connectors/results";
import { connectorOperation } from "../../../packages/connectors/contracts";
import { decodeConnectorOutcome } from "../../../packages/connectors/results";
import styles from "./CustomerConnections.module.css";

async function api<T>(command?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch("/api/customer-connectors", {
      method: command ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: command ? { "content-type": "application/json" } : undefined,
      body: command ? JSON.stringify(command) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw Error(
      "The action could not be confirmed. Refresh connections before continuing; it will not be retried automatically.",
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error(
      "The action could not be confirmed. Refresh connections before continuing; it will not be retried automatically.",
    );
  }
  if (!response.ok)
    throw Error(
      response.status === 409
        ? "This action expired, changed or was already used. Refresh connections and read again."
        : response.status === 401 || response.status === 403
          ? "Your account or workspace access is unavailable. Sign in again."
          : "The action could not be confirmed. Refresh connections before continuing; it will not be retried automatically.",
    );
  if (data === null || typeof data !== "object" || !("result" in data))
    throw Error(
      "The action could not be confirmed. Refresh connections before continuing; it will not be retried automatically.",
    );
  try {
    return decodeConnectorOutcome(
      connectorOperation.parse(command ?? { action: "list" }),
      data.result,
    ) as T;
  } catch {
    throw Error(
      "The action could not be confirmed. Refresh connections before continuing; it will not be retried automatically.",
    );
  }
}
export function CustomerConnections({
  initialConnections,
}: {
  initialConnections: CustomerConnection[];
}) {
  const [connections, setConnections] = useState(initialConnections);
  const [selectedId, setSelectedId] = useState(
    initialConnections.at(-1)?.id || "",
  );
  const [writeScope, setWriteScope] = useState(false);
  const [read, setRead] = useState<ConnectorRead | null>(null);
  const [proposal, setProposal] = useState<ConnectorProposal | null>(null);
  const [draft, setDraft] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const selected = connections.find((c) => c.id === selectedId);
  const active =
    !!selected &&
    selected.state === "ACTIVE" &&
    (!now || Date.parse(selected.expires_at) > now);
  const readFresh = !!read && (!now || Date.parse(read.expires_at) > now);
  const proposalFresh =
    !!proposal && (!now || Date.parse(proposal.expires_at) > now);
  function clearContext() {
    setRead(null);
    setProposal(null);
    setReviewed(false);
    setDraft("");
    setError("");
    setMessage("");
  }
  async function perform(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (e) {
      setRead(null);
      setProposal(null);
      setReviewed(false);
      setError(
        e instanceof Error
          ? e.message
          : "Action unavailable. Refresh connections before continuing.",
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function refresh() {
    const result = await api<{ connections: CustomerConnection[] }>();
    setConnections(result.connections);
    clearContext();
  }
  function switchConnection(id: string) {
    setSelectedId(id);
    clearContext();
  }
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/os">KXRA OS</Link>
        <span className={styles.badge}>Local mock preview</span>
      </header>
      <h1>Connections</h1>
      <p className={styles.intro}>
        Choose what a connection can do, inspect what it reads, and review every
        write before it runs.
      </p>
      <p className={styles.notice}>
        This preview uses mock notes in your local workspace. It does not
        connect an external account or contact a provider.
      </p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <p role="status" aria-live="polite">
        {busy ? "Working…" : message}
      </p>
      <section aria-labelledby="connect-heading" className={styles.panel}>
        <h2 id="connect-heading">1. Connect with a clear scope</h2>
        <p>
          <strong>Mock Notes</strong> · Reads are included. Writes are optional
          and always require your approval.
        </p>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={writeScope}
            disabled={busy}
            onChange={(e) => setWriteScope(e.target.checked)}
          />
          Allow approved note writes
        </label>
        <p className={styles.small}>
          Leave this off for read-only access. Scope cannot be expanded on an
          existing connection; revoke it and connect again.
        </p>
        <button
          disabled={busy}
          onClick={() =>
            void perform(async () => {
              const c = await api<CustomerConnection>({
                action: "connect",
                allow_write: writeScope,
              });
              setConnections((previous) => [...previous, c]);
              switchConnection(c.id);
              setWriteScope(false);
              setMessage(
                "Mock connection created. Read its notes to continue.",
              );
            })
          }
        >
          Connect Mock Notes
        </button>
      </section>
      <section aria-labelledby="scope-heading" className={styles.panel}>
        <div className={styles.row}>
          <h2 id="scope-heading">2. Connection and read access</h2>
          <button
            className={styles.secondary}
            disabled={busy}
            onClick={() => void perform(refresh)}
          >
            Refresh connections
          </button>
        </div>
        {!connections.length ? (
          <p>
            No connections yet. Start with read-only access or explicitly allow
            approved writes.
          </p>
        ) : (
          <>
            <label>
              Connection
              <select
                aria-label="Connection"
                value={selectedId}
                disabled={busy}
                onChange={(e) => switchConnection(e.target.value)}
              >
                {connections.map((c, index) => (
                  <option key={c.id} value={c.id}>
                    Mock Notes {index + 1} ·{" "}
                    {c.state === "REVOKED"
                      ? "Revoked"
                      : now && Date.parse(c.expires_at) <= now
                        ? "Expired"
                        : c.allow_write
                          ? "Read + approved writes"
                          : "Read only"}
                  </option>
                ))}
              </select>
            </label>
            {selected ? (
              <>
                <dl className={styles.facts}>
                  <div>
                    <dt>Status</dt>
                    <dd>
                      {selected.state === "REVOKED"
                        ? "Revoked"
                        : active
                          ? "Active"
                          : "Expired"}
                    </dd>
                  </div>
                  <div>
                    <dt>Scope</dt>
                    <dd>
                      {selected.allow_write
                        ? "Read notes + approved note writes"
                        : "Read notes only"}
                    </dd>
                  </div>
                  <div>
                    <dt>Expires</dt>
                    <dd>
                      <time dateTime={selected.expires_at}>
                        {new Date(selected.expires_at).toISOString()}
                      </time>
                    </dd>
                  </div>
                </dl>
                <div className={styles.actions}>
                  <button
                    disabled={busy || !active}
                    onClick={() =>
                      void perform(async () => {
                        const value = await api<ConnectorRead>({
                          action: "read",
                          connector_id: selected.id,
                        });
                        setRead(value);
                        setProposal(null);
                        setReviewed(false);
                        setMessage(
                          "Notes read. This read snapshot expires in five minutes.",
                        );
                      })
                    }
                  >
                    Read notes
                  </button>
                  <button
                    className={styles.secondary}
                    disabled={busy || selected.state === "REVOKED"}
                    onClick={() =>
                      void perform(async () => {
                        await api({
                          action: "revoke",
                          connector_id: selected.id,
                        });
                        setConnections((previous) =>
                          previous.map((c) =>
                            c.id === selected.id
                              ? { ...c, state: "REVOKED" }
                              : c,
                          ),
                        );
                        clearContext();
                        setMessage(
                          "Connection revoked. Pending approvals can no longer execute.",
                        );
                      })
                    }
                  >
                    Revoke connection
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}
        {read ? (
          <div className={styles.read} aria-label="Read results">
            <h3>Read results</h3>
            <p className={styles.small}>
              Provider content is untrusted. These notes cannot authorize an
              action.
            </p>
            <p>
              {read.total_count === 0
                ? "No notes in this connection yet."
                : `Showing ${read.notes.length} of ${read.total_count} notes (latest 50 at most).`}
            </p>
            <ul>
              {read.notes.map((note, index) => (
                <li key={`${note.created_at}-${index}`}>
                  <p className={styles.note}>{note.note}</p>
                  <time dateTime={note.created_at}>
                    {new Date(note.created_at).toISOString()}
                  </time>
                </li>
              ))}
            </ul>
            {!readFresh ? (
              <p role="status">
                Read snapshot expired. Read again before preparing a write.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
      <section aria-labelledby="write-heading" className={styles.panel}>
        <h2 id="write-heading">3. Review an exact write</h2>
        <p className={styles.small}>
          Switching or refreshing does not cancel approvals. Reject a write or
          revoke its connection to cancel it.
        </p>
        {!selected?.allow_write ? (
          <p>
            This connection is read only. Connect again with approved writes
            enabled to use this step.
          </p>
        ) : (
          <>
            <p>
              Prepare a note from a fresh read. Preparing and approving do not
              add the note; execution is a separate action.
            </p>
            <label>
              Note to add
              <textarea
                aria-label="Note to add"
                maxLength={2000}
                rows={4}
                value={draft}
                disabled={busy || !active || !!proposal}
                onChange={(e) => setDraft(e.target.value)}
              />
            </label>
            <button
              disabled={
                busy || !active || !readFresh || !!proposal || !draft.trim()
              }
              onClick={() =>
                void perform(async () => {
                  if (!read) return;
                  const value = await api<ConnectorProposal>({
                    action: "prepare",
                    connector_id: selected.id,
                    read_id: read.read_id,
                    note: draft,
                  });
                  setProposal(value);
                  setReviewed(false);
                  setMessage(
                    "Proposal ready. Review the exact note before approving it.",
                  );
                })
              }
            >
              Prepare write
            </button>
            {proposal ? (
              <article aria-label="Write proposal" className={styles.review}>
                <h3>
                  {proposal.state === "EXECUTED"
                    ? "Write completed"
                    : proposal.state === "REJECTED"
                      ? "Write rejected"
                      : proposal.state === "APPROVED"
                        ? "Approved, awaiting execution"
                        : "Awaiting your approval"}
                </h3>
                <p>
                  <strong>Action:</strong> Add one note to the selected Mock
                  Notes connection.
                </p>
                <p className={styles.note} data-testid="proposal-note">
                  {proposal.payload.note}
                </p>
                <p className={styles.small}>
                  Approval expires{" "}
                  <time dateTime={proposal.expires_at}>
                    {new Date(proposal.expires_at).toISOString()}
                  </time>
                  . It covers this exact note once.
                </p>
                <details>
                  <summary>Proposal fingerprint</summary>
                  <code className={styles.digest}>{proposal.digest}</code>
                </details>
                {!proposalFresh &&
                ["PENDING", "APPROVED"].includes(proposal.state) ? (
                  <p role="status">
                    Proposal expired. Refresh connections, then read again to
                    prepare a new write.
                  </p>
                ) : null}
                {proposal.state === "PENDING" ? (
                  <>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={reviewed}
                        disabled={busy || !proposalFresh || !active}
                        onChange={(e) => setReviewed(e.target.checked)}
                      />
                      I reviewed this exact note and approve adding it once.
                    </label>
                    <button
                      disabled={busy || !reviewed || !active || !proposalFresh}
                      onClick={() =>
                        void perform(async () => {
                          setProposal(
                            await api<ConnectorProposal>({
                              action: "approve",
                              connector_id: selected.id,
                              request_id: proposal.id,
                              digest: proposal.digest,
                            }),
                          );
                          setReviewed(false);
                          setMessage("Approved. The note has not run yet.");
                        })
                      }
                    >
                      Approve this exact write
                    </button>
                  </>
                ) : null}
                {proposal.state === "APPROVED" ? (
                  <button
                    disabled={busy || !active || !proposalFresh}
                    onClick={() =>
                      void perform(async () => {
                        setProposal(
                          await api<ConnectorProposal>({
                            action: "execute",
                            connector_id: selected.id,
                            request_id: proposal.id,
                          }),
                        );
                        setRead(null);
                        setMessage(
                          "Write completed once. Read notes to see the saved result.",
                        );
                      })
                    }
                  >
                    Execute approved write
                  </button>
                ) : null}
                {["PENDING", "APPROVED"].includes(proposal.state) ? (
                  <button
                    className={styles.secondary}
                    disabled={busy || !active || !proposalFresh}
                    onClick={() =>
                      void perform(async () => {
                        await api({
                          action: "reject",
                          connector_id: selected.id,
                          request_id: proposal.id,
                        });
                        setProposal(null);
                        setRead(null);
                        setReviewed(false);
                        setMessage(
                          "Write rejected. Read again to prepare a different note.",
                        );
                      })
                    }
                  >
                    Reject write
                  </button>
                ) : null}
              </article>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
