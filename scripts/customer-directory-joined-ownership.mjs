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

export function assertGeneratedNextEnv(file, original, actual, nextVersion) {
  assert.equal(file, "apps/os/next-env.d.ts", "UNREVIEWED_GENERATED_PATH");
  assert.equal(nextVersion, "16.4.3", "UNREVIEWED_GENERATOR_VERSION");
  const accepted = `/// <reference types="next" />
/// <reference types="next/image-types/global" />
import "./.next/types/routes.d.ts";
import "./.next/types/root-params.d.ts";

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
`;
  assert.equal(original, accepted, "UNREVIEWED_GENERATED_SOURCE");
  assert.equal(
    actual,
    accepted.replaceAll('"./.next/types/', '"./.next-dev/dev/types/'),
    "UNREVIEWED_GENERATED_MUTATION",
  );
}

export function safeFailure(error) {
  const stack = [];
  for (const match of String(error.stack || "").matchAll(
    /(verify-customer-directory-joined\.mjs|customer-directory-joined-ownership\.mjs):(\d+):(\d+)/g,
  ))
    stack.push({
      file: "scripts/" + match[1],
      line: Number(match[2]),
      column: Number(match[3]),
    });
  const message = String(error.message || "");
  const numeric = (value) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  return {
    name: ["AssertionError", "TimeoutError", "Error"].includes(error.name)
      ? error.name
      : "Error",
    code: /^[A-Z][A-Z0-9_]{0,119}$/.test(message) ? message : "CHECK_FAILED",
    actual: numeric(error.actual),
    expected: numeric(error.expected),
    stack: stack.slice(0, 12),
  };
}

export function directoryNavigationKind(value) {
  const url = new URL(value);
  return {
    directory: url.pathname === "/os/customer-directory",
    cursor: url.searchParams.has("cursor"),
    filtered: url.searchParams.has("organisation_state"),
    fragment: Boolean(url.hash),
  };
}
