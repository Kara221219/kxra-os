import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  PRIVATE_FIXTURE_JSON_MAX_BYTES,
  readPrivateFixtureJson,
} from "./support/private-fixture-json";

function fixture(run: (directory: string) => void) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-json-"));
  fs.chmodSync(directory, 0o700);
  try {
    run(directory);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
test("reads bounded owner-controlled fixture JSON", () =>
  fixture((directory) => {
    const file = path.join(directory, "metadata.json");
    fs.writeFileSync(file, '{"synthetic":true}', { mode: 0o600 });
    assert.deepEqual(readPrivateFixtureJson(file), { synthetic: true });
  }));
test("rejects a final symlink rather than following it", () =>
  fixture((directory) => {
    const target = path.join(directory, "target.json"),
      file = path.join(directory, "link.json");
    fs.writeFileSync(target, '{"synthetic":true}', { mode: 0o600 });
    fs.symlinkSync(target, file);
    assert.throws(() => readPrivateFixtureJson(file));
  }));
test("rejects externally writable metadata", () =>
  fixture((directory) => {
    const file = path.join(directory, "writable.json");
    fs.writeFileSync(file, "{}", { mode: 0o600 });
    fs.chmodSync(file, 0o622);
    assert.throws(() => readPrivateFixtureJson(file), /externally writable/);
  }));
test("rejects directories and nonblocking FIFOs without reading them", () =>
  fixture((directory) => {
    assert.throws(() => readPrivateFixtureJson(directory), /regular file/);
    const fifo = path.join(directory, "metadata.fifo");
    const created = spawnSync("mkfifo", [fifo], {
      encoding: "utf8",
      timeout: 2000,
    });
    assert.equal(created.status, 0);
    fs.chmodSync(fifo, 0o600);
    assert.throws(() => readPrivateFixtureJson(fifo), /regular file/);
  }));
test("rejects oversized, malformed, non-object and invalid UTF8 input", () =>
  fixture((directory) => {
    const file = path.join(directory, "input.json");
    for (const value of [
      Buffer.alloc(PRIVATE_FIXTURE_JSON_MAX_BYTES + 1, 32),
      Buffer.from("{"),
      Buffer.from("[]"),
      Buffer.from("null"),
      Buffer.from([0xff]),
    ]) {
      fs.writeFileSync(file, value, { mode: 0o600 });
      assert.throws(() => readPrivateFixtureJson(file));
    }
  }));
