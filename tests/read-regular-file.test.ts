import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readCanonicalRegularFileSync } from "../scripts/read-regular-file.mjs";

test("regular file bytes come from the opened descriptor", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kxra-regular-file-"),
  );
  try {
    const file = path.join(directory, "note.txt");
    fs.writeFileSync(file, "kept");
    const opened = readCanonicalRegularFileSync(file);
    assert.equal(opened.bytes.toString(), "kept");
    assert.equal(opened.stat.isFile(), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a final symlink is not followed", () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kxra-regular-link-"),
  );
  try {
    const file = path.join(directory, "note.txt");
    const link = path.join(directory, "link.txt");
    fs.writeFileSync(file, "secret");
    fs.symlinkSync(file, link);
    assert.throws(
      () => readCanonicalRegularFileSync(link),
      (error: NodeJS.ErrnoException) => error.code === "ELOOP",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a directory is not a regular file", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-regular-dir-"));
  try {
    assert.throws(
      () => readCanonicalRegularFileSync(directory),
      (error: NodeJS.ErrnoException) => error.code === "EISDIR",
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
