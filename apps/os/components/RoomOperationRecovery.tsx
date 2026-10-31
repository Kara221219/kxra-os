import { ActionButton } from "./ActionButton";
import type { roomOperationRecovery } from "../lib/room-operation-recovery";
type Data = Awaited<ReturnType<typeof roomOperationRecovery>>;
export function RoomOperationRecovery({
  room,
  data,
}: {
  room: string;
  data: Data;
}) {
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
      {data.rollout ? (
        <p>
          Room rollout starts {new Date(data.rollout.starts_at).toISOString()}{" "}
          and expires {new Date(data.rollout.expires_at).toISOString()}. Its
          automatic dispatch limit is {data.rollout.max_daily_dispatches} per
          rolling 24 hours. Revoked: {data.rollout.revoked_at ? "yes" : "no"}.
        </p>
      ) : (
        <p>Automatic execution is held: this room has no approved rollout.</p>
      )}
      {data.connection && data.can_review && (
        <div>
          <h2>Customer-owned provider connection</h2>
          <p>
            {data.connection.name} · {data.connection.model}. Consent active:{" "}
            {data.connection.allowed ? "yes" : "no"}.
          </p>
          <ActionButton
            url={`/api/room-operations/${room}`}
            payload={{
              action: "APPROVE_CUSTOMER_BYOK",
              connection_id: data.connection.id,
              customer_owned: true,
            }}
            label="Approve this customer-owned connection"
            disabled={!data.rollout?.active}
            confirmation="I supplied and own this provider connection, accept its provider charges, and consent to this room’s reviewed automatic work within the approved limits and expiry."
            secondary={{
              payload: {
                action: "REVOKE_CUSTOMER_BYOK",
                connection_id: data.connection.id,
              },
              label: "Revoke connection consent",
            }}
          />
        </div>
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
            <ActionButton
              url={`/api/room-operations/${room}`}
              payload={{
                action: "ACKNOWLEDGE_NO_RETRY",
                case_id: item.id,
                version: item.version,
                reviewed: true,
              }}
              label="Record review without retry"
              confirmation="I reviewed this uncertainty and understand that this acknowledgment does not retry the call or establish successful completion."
            />
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
