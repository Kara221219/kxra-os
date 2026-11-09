import assert from "node:assert/strict";
// Process titles and groups may change during exec/setsid; PID + birth is the
// stable identity. Commands/groups are retained as evidence, never kill targets.
export const processBirth = (process) =>
  process ? { pid: process.pid, birth: process.birth } : null;
export function observeOwnedProcesses(record, all) {
  if (!record.pid) return [];
  const current = new Map(all.map((process) => [process.pid, process]));
  const leader = current.get(record.pid);
  if (leader)
    assert.deepEqual(
      processBirth(leader),
      record.identity,
      "CHILD_BIRTH_IDENTITY_CHANGED",
    );
  // Once proven by ancestry, detached or reparented descendants remain ours.
  for (const [pid, previous] of record.seen) {
    const process = current.get(pid);
    if (process)
      assert.deepEqual(
        processBirth(process),
        processBirth(previous),
        "DESCENDANT_BIRTH_CHANGED",
      );
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const process of all) {
      if (record.seen.has(process.pid)) continue;
      const parent = current.get(process.ppid);
      const parentProven = parent && record.seen.has(parent.pid);
      const ownGroup = process.pgid === record.pid;
      if (parentProven || (leader && ownGroup)) {
        record.seen.set(process.pid, { ...process });
        changed = true;
      }
    }
  }
  // Do not infer ownership of an unseen survivor after its root has exited.
  for (const process of all)
    if (process.pgid === record.pid && !record.seen.has(process.pid))
      throw Error("UNOWNED_DESCENDANT_AFTER_LEADER_EXIT");
  return all.filter((process) => record.seen.has(process.pid));
}
