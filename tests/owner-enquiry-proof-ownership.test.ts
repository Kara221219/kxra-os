import { test } from "node:test";
import assert from "node:assert/strict";
import {
  observeOwnedProcesses,
  processBirth,
} from "../scripts/owner-enquiry-proof-ownership.mjs";
const root = {
  pid: 100,
  ppid: 1,
  pgid: 100,
  birth: "root birth",
  command: "node test",
};
const worker = {
  pid: 101,
  ppid: 100,
  pgid: 100,
  birth: "worker birth",
  command: "node worker",
};
const chrome = {
  pid: 102,
  ppid: 101,
  pgid: 102,
  birth: "chrome birth",
  command: "chromium --user-data-dir=/tmp/owned",
};
const renderer = {
  pid: 103,
  ppid: 102,
  pgid: 102,
  birth: "renderer birth",
  command: "chromium renderer",
};
function record() {
  return {
    pid: root.pid,
    identity: processBirth(root),
    seen: new Map([[root.pid, { ...root }]]),
  };
}
test("ancestry tracks Chromium detached into another group and keeps reparented survivors", () => {
  const r = record();
  assert.equal(
    observeOwnedProcesses(r, [renderer, chrome, worker, root]).length,
    4,
  );
  assert.equal(
    observeOwnedProcesses(r, [
      { ...chrome, ppid: 1 },
      { ...renderer, ppid: 102 },
    ]).length,
    2,
  );
  assert.equal(observeOwnedProcesses(r, []).length, 0);
});
test("unrelated detached process is never adopted from its command or process group", () => {
  const r = record();
  assert.equal(
    observeOwnedProcesses(r, [root, { ...chrome, ppid: 1 }]).length,
    1,
  );
  assert.equal(r.seen.has(chrome.pid), false);
});
test("PID reuse and unseen group survivor without live parent fail closed", () => {
  const r = record();
  observeOwnedProcesses(r, [root, worker, chrome]);
  assert.throws(
    () => observeOwnedProcesses(r, [{ ...chrome, birth: "reused" }]),
    /DESCENDANT_BIRTH_CHANGED/,
  );
  assert.throws(
    () => observeOwnedProcesses(record(), [worker]),
    /UNOWNED_DESCENDANT_AFTER_LEADER_EXIT/,
  );
  assert.throws(
    () => observeOwnedProcesses(record(), [{ ...root, birth: "replacement" }]),
    /CHILD_BIRTH_IDENTITY_CHANGED/,
  );
});
test("normal process title and setsid changes do not erase proven birth identity", () => {
  const r = record();
  observeOwnedProcesses(r, [root, worker]);
  assert.equal(
    observeOwnedProcesses(r, [
      root,
      { ...worker, pgid: 101, command: "renamed node" },
    ]).length,
    2,
  );
});
