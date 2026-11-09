// Pure test-harness helpers. No process control, database or network IO here.
import assert from "node:assert/strict";
export function capturePostgresOwnership(lines, process, expected) {
  assert.equal(lines[1], expected.dir, "POSTGRES_DATA_DIRECTORY_MISMATCH");
  assert.equal(Number(lines[3]), expected.port, "POSTGRES_PORT_MISMATCH");
  assert.equal(lines[4], expected.socket, "POSTGRES_SOCKET_MISMATCH");
  const pid = Number(lines[0]);
  assert.ok(Number.isSafeInteger(pid) && pid > 1, "POSTGRES_PID_INVALID");
  assert.ok(
    process.birth &&
      process.command.includes("postgres") &&
      process.command.includes(expected.dir),
    "POSTGRES_INITIAL_PROCESS_IDENTITY_UNCERTAIN",
  );
  assert.ok(/^\d+$/.test(lines[2]), "POSTGRES_START_EPOCH_INVALID");
  return Object.freeze({
    ...expected,
    pid,
    startEpoch: lines[2],
    birth: process.birth,
    command: process.command,
  });
}
export function assertPostgresOwnership(record, lines, process) {
  assert.ok(record, "POSTGRES_BIRTH_IDENTITY_MISSING_LEASE_RETAINED");
  const current = capturePostgresOwnership(lines, process, record);
  for (const key of ["pid", "startEpoch", "birth", "command"])
    assert.equal(
      current[key],
      record[key],
      "POSTGRES_PROCESS_IDENTITY_CHANGED",
    );
}
export function captureDatabaseClientFailure(client, record) {
  // pg emits idle socket/backend failures on the client. Never throw from the
  // event callback: the harness checks its controlled failure flag and cleans up.
  client.on("error", () => record("ASYNC_DATABASE_CLIENT_FAILURE"));
}
export function ownedWebSocketUrl(value, allowed) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "ws:" &&
      !url.username &&
      !url.password &&
      allowed.includes(url.origin)
    );
  } catch {
    return false;
  }
}
