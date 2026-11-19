import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyPostgresStartup,
  postgresStartupObservation,
  captureCoherentPostgresStartup,
} from "../scripts/postgres-startup-candidate.mjs";
const expected = {
  dir: "/tmp/owned/postgres",
  socket: "/tmp/owned/socket",
  port: 55001,
};
const process = {
  birth: "Mon Nov 9 12:00:00 2026",
  command: "postgres -D /tmp/owned/postgres -k /tmp/owned/socket -p 55001",
};
const ready =
  "12345\n/tmp/owned/postgres\n1794225600\n55001\n/tmp/owned/socket\n\n123 456\nready   \n";
test("absent, standalone and partial initialization records never grant ownership; eventual ready record does", () => {
  for (const text of [
    null,
    "",
    "-12345\n/tmp/owned/postgres\n1794225600\n",
    "12345\n",
    "12345\n/tmp/owned/postgres\n1794225600\n",
    ready.replace("ready   ", "starting"),
  ]) {
    assert.equal(classifyPostgresStartup(text, expected).kind, "NOT_READY");
    assert.throws(
      () =>
        captureCoherentPostgresStartup(text, text, process, process, expected),
      /POSTGRES_SERVER_CANDIDATE_REQUIRED/,
    );
  }
  assert.equal(
    classifyPostgresStartup(ready, expected).kind,
    "SERVER_CANDIDATE",
  );
  assert.equal(
    captureCoherentPostgresStartup(ready, ready, process, process, expected)
      .pid,
    12345,
  );
  assert.equal(postgresStartupObservation("-12345\n").pid, -12345);
});
test("complete positive candidate rejects wrong dir, epoch, port, socket, TCP or state", () => {
  for (const [from, to] of [
    ["/tmp/owned/postgres", "/tmp/other/postgres"],
    ["1794225600", "not-an-epoch"],
    ["55001", "5432"],
    ["/tmp/owned/socket", "/tmp/other/socket"],
    ["\n\n123 456", "\n127.0.0.1\n123 456"],
    ["ready   ", "stopping"],
    ["ready   ", "standby"],
    ["12345\n", "0\n"],
  ])
    assert.throws(() =>
      classifyPostgresStartup(ready.replace(from, to), expected),
    );
});
test("ready candidate disappearance, partial reread, changed PID/start and replaced process fail closed", () => {
  for (const second of [
    null,
    "",
    "12345\n",
    ready.replace("12345", "23456"),
    ready.replace("1794225600", "1794225601"),
  ])
    assert.throws(() =>
      captureCoherentPostgresStartup(ready, second, process, process, expected),
    );
  assert.throws(
    () =>
      captureCoherentPostgresStartup(
        ready,
        ready,
        { birth: "", command: "" },
        process,
        expected,
      ),
    /POSTGRES_INITIAL_PROCESS_IDENTITY_UNCERTAIN/,
  );
  assert.throws(
    () =>
      captureCoherentPostgresStartup(
        ready,
        ready,
        process,
        { ...process, birth: "replacement" },
        expected,
      ),
    /POSTGRES_PROCESS_IDENTITY_CHANGED/,
  );
  assert.throws(() =>
    captureCoherentPostgresStartup(
      ready,
      ready,
      process,
      { ...process, command: "postgres -D /tmp/other" },
      expected,
    ),
  );
});
test("safe diagnostic tuple contains only bounded parsed PID and known state", () => {
  assert.deepEqual(postgresStartupObservation("secret arbitrary contents\n"), {
    pid: null,
    state: null,
  });
  assert.deepEqual(postgresStartupObservation(ready), {
    pid: 12345,
    state: "ready",
  });
  assert.equal(
    postgresStartupObservation("999999999999999999999999\n").pid,
    null,
  );
});

test("out-of-order starting record may have empty port/socket but populated mismatches still fail", () => {
  const starting = ready.replace("ready   ", "starting");
  for (const partial of [
    starting.replace("55001", ""),
    starting.replace("/tmp/owned/socket", ""),
    starting.replace("55001", "").replace("/tmp/owned/socket", ""),
  ]) {
    assert.equal(
      classifyPostgresStartup(partial, expected).reason,
      "SERVER_STARTING_INCOMPLETE",
    );
    assert.throws(
      () =>
        captureCoherentPostgresStartup(
          partial,
          partial,
          process,
          process,
          expected,
        ),
      /POSTGRES_SERVER_CANDIDATE_REQUIRED/,
    );
    assert.throws(() =>
      classifyPostgresStartup(partial.replace("starting", "ready"), expected),
    );
  }
  assert.throws(
    () =>
      classifyPostgresStartup(
        starting.replace("55001", "5432").replace("/tmp/owned/socket", ""),
        expected,
      ),
    /POSTGRES_PORT_MISMATCH/,
  );
  assert.throws(
    () =>
      classifyPostgresStartup(
        starting
          .replace("55001", "")
          .replace("/tmp/owned/socket", "/tmp/other/socket"),
        expected,
      ),
    /POSTGRES_SOCKET_MISMATCH/,
  );
});
