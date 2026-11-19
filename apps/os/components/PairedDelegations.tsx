"use client";
import Link from "next/link";
import { useState } from "react";
type Delegation = {
  id: string;
  connection_id: string;
  expires_at: string;
  revoked: boolean;
  allow_proposal: boolean;
};
type Proposal = {
  id: string;
  delegation_id: string;
  schema: unknown;
  digest: string;
};
export function PairedDelegations({
  task,
  initial,
}: {
  task: string;
  initial: { delegations: Delegation[]; app_proposals: Proposal[] };
}) {
  const [data, setData] = useState(initial),
    [connections, setConnections] = useState<
      {
        id: string;
        binding: { owner: string; repo: string; issue_number: number };
      }[]
    >([]),
    [token, setToken] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [appLink, setAppLink] = useState("");
  async function command(input: Record<string, unknown>) {
    const r = await fetch("/api/paired-integration", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_id: task, ...input }),
    });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Delegation unavailable");
    return d;
  }
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await work();
      setData((await command({ operation: "LIST" })).result);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section style={{ overflowWrap: "anywhere", minWidth: 0 }}>
      <h1>Local task delegation</h1>
      <p>
        Grant this task access to one synthetic connector account. A separate
        human approval is required for each exact write. Device work expires
        after 30 seconds; expired work must be reviewed again.
      </p>
      <p role="status">{notice}</p>
      <button
        disabled={busy}
        onClick={() =>
          void act(async () => {
            const r = await fetch("/api/customer-connectors/github", {
              cache: "no-store",
            });
            const d = await r.json();
            if (!r.ok) throw Error("Connections unavailable");
            setConnections(d.connections);
          })
        }
      >
        Load local accounts
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          void act(async () => {
            const d = await command({
              operation: "DELEGATE",
              connection_id: form.get("connection"),
              allow_proposal: form.get("propose") === "on",
            });
            setToken(d.delegation_token);
          });
        }}
      >
        <label>
          Connector account
          <select name="connection" required>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.binding.owner}/{c.binding.repo} issue{" "}
                {c.binding.issue_number} · {c.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" name="propose" />
          Allow comment and app-schema proposals
        </label>
        <button disabled={busy || !connections.length}>
          Delegate scoped access
        </button>
      </form>
      {token && (
        <div>
          <p>
            Copy the delegation token to the local fixture device once. It is
            held in this page’s memory only.
          </p>
          <output style={{ overflowWrap: "anywhere" }}>{token}</output>
          <button onClick={() => setToken("")}>Clear token</button>
        </div>
      )}
      <button disabled={busy} onClick={() => void act(async () => {})}>
        Refresh proposals
      </button>
      {data.delegations.map((d) => (
        <article key={d.id}>
          <p>
            {d.connection_id} ·{" "}
            {d.revoked ? "Revoked" : `Expires ${d.expires_at}`}
          </p>
          <button
            disabled={busy || d.revoked}
            onClick={() =>
              void act(async () => {
                await command({ operation: "REVOKE", delegation_id: d.id });
                setToken("");
              })
            }
          >
            Revoke delegation
          </button>
        </article>
      ))}
      {data.app_proposals.map((p) => (
        <article key={p.id}>
          <h2>Proposed app schema</h2>
          <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {JSON.stringify(p.schema, null, 2)}
          </pre>
          <p>Fingerprint {p.digest}</p>
          <button
            disabled={busy}
            onClick={() =>
              void act(async () => {
                const d = await command({
                  operation: "IMPORT_APP",
                  delegation_id: p.delegation_id,
                  proposal_id: p.id,
                  digest: p.digest,
                  app_id: p.id,
                  expected_revision: 0,
                });
                setAppLink(`/os/custom-apps/${d.result.room_id}`);
              })
            }
          >
            Accept schema into human review
          </button>
        </article>
      ))}
      {appLink && (
        <Link href={appLink}>Preview and review app publication</Link>
      )}
      <p>
        <Link href="/os/connections/github">
          Review exact connector writes and receipts
        </Link>
      </p>
    </section>
  );
}
