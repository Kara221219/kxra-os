import assert from "node:assert/strict";
import path from "node:path";
export function operationsRecoveryPhaseAllowed(runtime, phase) {
  return (
    typeof runtime === "string" &&
    path.isAbsolute(runtime) &&
    ["ci-room-delivery", "ci-room-maintenance"].includes(phase) &&
    path.basename(runtime) === phase
  );
}
export function operationsRecoveryConfigurationAllowed(config, runtime) {
  return (
    config &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    JSON.stringify(Object.keys(config).sort()) ===
      JSON.stringify(["database", "host", "port", "user"]) &&
    config.host === path.join(runtime, "socket") &&
    config.user === "kxra_app" &&
    config.database === "postgres" &&
    Number.isInteger(config.port) &&
    config.port >= 1024 &&
    config.port <= 65535
  );
}
// Explicit noncredential state only; no keys, fencing tokens, messages or output.
const manifests = Object.freeze({
  grants:
    "select id,target_id,org_id,room_id,requested_by,connection_id,session_version,membership_version,auth_time,expires_at,revoked_at,last_delivered_at,last_maintained_at,created_at from kxra.team_execution_grants",
  deliveries: "select id,grant_id,created_at from kxra.team_worker_deliveries",
  rollouts:
    "select room_id as id,org_id,connection_id,starts_at,expires_at,max_daily_dispatches,revoked_at,created_at from kxra.team_room_rollouts",
  consents:
    "select room_id as id,org_id,connection_id,granted_by,expires_at,revoked_at,created_at from kxra.team_byok_consents",
  uncertainty:
    "select id,job_id,org_id,room_id,requested_by,cause,state,version,created_at,acknowledged_at,acknowledged_by from kxra.team_uncertainty_cases",
  maintenance:
    "select id,created_at,jsonb_build_object('cancelled',result->'cancelled','quarantined',result->'quarantined','reconciled',result->'reconciled','paused',result->'paused','opened_cases',result->'opened_cases') as counts from kxra.team_maintenance_receipts",
  jobs: "select id,org_id,room_id,requested_by,request_session_version,state,attempt_count,active_attempt,lease_expires_at,last_error,version,created_at,updated_at,finished_at from kxra.team_jobs",
  attempts:
    "select id,job_id,number,phase,error_code,started_at,finished_at from kxra.team_job_attempts",
  schedules:
    "select id,org_id,room_id,created_by,state,version,last_local_day,last_error,reviewed_at,created_at,expires_at,max_occurrences from kxra.team_schedules",
  runs: "select id,room_id,status,error_code,created_at,finished_at from kxra.team_runs",
});
export async function operationsRecoveryEvidence(client) {
  const result = {};
  for (const [name, rows] of Object.entries(manifests)) {
    let response;
    try {
      response = await client.query(
        `with proof as (${rows}) select count(*)::integer as count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(proof) order by proof.id)::text,'[]'),'UTF8')),'hex') as sha256 from proof`,
      );
    } catch {
      throw Error("OPERATIONS_RECOVERY_QUERY_FAILED");
    }
    const value = response.rows[0];
    assert.ok(
      value && typeof value === "object" && !Array.isArray(value),
      "OPERATIONS_RECOVERY_RESULT_INVALID",
    );
    assert.ok(
      JSON.stringify(Object.keys(value).sort()) ===
        JSON.stringify(["count", "sha256"]),
      "OPERATIONS_RECOVERY_FIELDS_INVALID",
    );
    assert.ok(
      Number.isSafeInteger(value.count) &&
        value.count >= 0 &&
        value.count <= 1000000,
    );
    assert.ok(
      typeof value.sha256 === "string" && /^[a-f0-9]{64}$/.test(value.sha256),
      "OPERATIONS_RECOVERY_DIGEST_INVALID",
    );
    result[name] = { count: value.count, sha256: value.sha256 };
  }
  for (const required of ["grants", "deliveries", "maintenance", "jobs"])
    assert.ok(
      result[required].count > 0,
      `Missing operations recovery dataset: ${required}`,
    );
  return result;
}
