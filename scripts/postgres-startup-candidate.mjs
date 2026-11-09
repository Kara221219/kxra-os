// Pure fixture startup classification, not permission to signal any process.
import assert from "node:assert/strict";
import {
  capturePostgresOwnership,
  assertPostgresOwnership,
} from "./customer-directory-joined-ownership.mjs";
export function postgresStartupObservation(text) {
  const lines = text?.split("\n") || [];
  const raw = lines[0] || "";
  const value = /^-?[0-9]+$/.test(raw) ? Number(raw) : null;
  return {
    pid: Number.isSafeInteger(value) ? value : null,
    state: ["starting", "ready", "stopping", "standby"].includes(
      lines[7]?.trim(),
    )
      ? lines[7].trim()
      : null,
  };
}
export function classifyPostgresStartup(text, expected) {
  const observation = postgresStartupObservation(text);
  const pending = (reason) => ({ ...observation, kind: "NOT_READY", reason });
  if (text === null) return pending("PID_FILE_ABSENT");
  if (text === "") return pending("PID_FILE_INCOMPLETE");
  const lines = text.split("\n");
  // PostgreSQL standalone/bootstrap lock files are not server PID records.
  if (/^-[1-9][0-9]*$/.test(lines[0]) && Number.isSafeInteger(Number(lines[0])))
    return pending("STANDALONE_PID");
  if (lines.length < 8 || !lines[7]?.trim())
    return pending("PID_FILE_INCOMPLETE");
  assert.ok(
    /^[1-9][0-9]*$/.test(lines[0]) &&
      Number.isSafeInteger(Number(lines[0])) &&
      Number(lines[0]) > 1,
    "POSTGRES_PID_INVALID",
  );
  assert.equal(lines[1], expected.dir, "POSTGRES_DATA_DIRECTORY_MISMATCH");
  assert.ok(
    /^[1-9][0-9]*$/.test(lines[2]) && Number.isSafeInteger(Number(lines[2])),
    "POSTGRES_START_EPOCH_INVALID",
  );
  const starting = lines[7].trim() === "starting";
  // pidfile.h documents that lines 4 onward are populated out of order.
  // Empty startup fields confer no ownership; populated fields still must match.
  if (!starting || lines[3] !== "") {
    assert.ok(/^[1-9][0-9]*$/.test(lines[3]), "POSTGRES_PORT_INVALID");
    assert.equal(Number(lines[3]), expected.port, "POSTGRES_PORT_MISMATCH");
  }
  if (!starting || lines[4] !== "")
    assert.equal(lines[4], expected.socket, "POSTGRES_SOCKET_MISMATCH");
  assert.equal(lines[5], "", "POSTGRES_UNEXPECTED_TCP_LISTENER");
  if (starting)
    return pending(
      lines[3] === "" || lines[4] === ""
        ? "SERVER_STARTING_INCOMPLETE"
        : "SERVER_STARTING",
    );
  assert.equal(lines[7].trim(), "ready", "POSTGRES_UNEXPECTED_STARTUP_STATE");
  return {
    ...observation,
    kind: "SERVER_CANDIDATE",
    reason: "READY_SERVER_CANDIDATE",
  };
}
export function captureCoherentPostgresStartup(
  first,
  second,
  firstProcess,
  secondProcess,
  expected,
) {
  assert.equal(
    classifyPostgresStartup(first, expected).kind,
    "SERVER_CANDIDATE",
    "POSTGRES_SERVER_CANDIDATE_REQUIRED",
  );
  assert.equal(
    classifyPostgresStartup(second, expected).kind,
    "SERVER_CANDIDATE",
    "POSTGRES_READY_CANDIDATE_DISAPPEARED",
  );
  assert.equal(second, first, "POSTGRES_READY_CANDIDATE_CHANGED");
  const record = capturePostgresOwnership(
    first.split("\n"),
    firstProcess,
    expected,
  );
  assertPostgresOwnership(record, second.split("\n"), secondProcess);
  return record;
}
