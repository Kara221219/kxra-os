"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { roomOperationRecovery } from "../lib/room-operation-recovery";
type Data = Awaited<ReturnType<typeof roomOperationRecovery>>;
export function RoomOperationRecovery({
  room,
  data,
}: {
  room: string;
  data: Data;
}) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function send(value: unknown) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch(`/api/room-operations/${room}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(value),
        }),
        body = await response.json();
      if (!response.ok) throw Error(body.error || "Review unavailable");
      setNotice("Review recorded.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Review unavailable");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Room execution recovery" className="panel">
      <h1>Room execution and recovery</h1>
      <p>
        Uncertain work may already have reached your provider. It is never
        retried automatically. Review the provider account before deciding
        whether to request any new work.
      </p>
      <p>
        Reviewing an outcome here acknowledges it without confirming success,
        refunding provider usage, retrying it or reactivating a paused schedule.
        Recent MFA verification is required.
      </p>
      <p role="status">{notice}</p>
      {data.rollout ? (
        <p>
          Room rollout expires {new Date(data.rollout.expires_at).toISOString()}
          . Its automatic dispatch limit is {data.rollout.max_daily_dispatches}{" "}
          per rolling 24 hours. Revoked:{" "}
          {data.rollout.revoked_at ? "yes" : "no"}.
        </p>
      ) : (
        <p>Automatic execution is held: this room has no approved rollout.</p>
      )}
      {data.connection && data.can_review && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send({
              action: "APPROVE_CUSTOMER_BYOK",
              connection_id: data.connection!.id,
              customer_owned: true,
            });
          }}
        >
          <h2>Customer-owned provider connection</h2>
          <p>
            {data.connection.name} · {data.connection.model}. Consent active:{" "}
            {data.connection.allowed ? "yes" : "no"}.
          </p>
          <fieldset disabled={busy}>
            <label>
              <input type="checkbox" required /> I supplied and own this
              provider connection, accept its provider charges, and consent to
              this room&apos;s reviewed automatic work within the approved
              limits and expiry.
            </label>
            <button type="submit">
              Approve this customer-owned connection
            </button>
            <button
              type="button"
              onClick={() =>
                void send({
                  action: "REVOKE_CUSTOMER_BYOK",
                  connection_id: data.connection!.id,
                })
              }
            >
              Revoke connection consent
            </button>
          </fieldset>
        </form>
      )}
      <h2>Uncertain outcomes</h2>
      {!data.cases.length && (
        <p>No open or recently reviewed recovery cases are visible to you.</p>
      )}
      {data.cases.map((item) => (
        <article key={item.id}>
          <h3>Draft {item.job_id}</h3>
          <p>
            {item.state}: {item.cause}. Recorded{" "}
            {new Date(item.created_at).toISOString()}.
          </p>
          {item.state === "OPEN" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send({
                  action: "ACKNOWLEDGE_NO_RETRY",
                  case_id: item.id,
                  version: item.version,
                  reviewed: true,
                });
              }}
            >
              <fieldset disabled={busy}>
                <label>
                  <input type="checkbox" required /> I reviewed this uncertainty
                  and understand that this acknowledgment does not retry the
                  call or establish successful completion.
                </label>
                <button type="submit">Record review without retry</button>
              </fieldset>
            </form>
          )}
        </article>
      ))}
      {!!data.reviewed.length && (
        <>
          <h2>Recorded review history</h2>
          <ul>
            {data.reviewed.map((item) => (
              <li key={item.id}>
                Draft {item.id}: reviewed{" "}
                {new Date(item.uncertainty_acknowledged_at).toISOString()};
                provider outcome remains uncertain.
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
