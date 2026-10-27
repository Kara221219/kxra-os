import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applicationNext } from "../scripts/application-next.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kxra-next-resolution-"));
  const write = (file: string, value: object | string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(
      file,
      typeof value === "string" ? value : JSON.stringify(value),
    );
  };
  const next = (directory: string, version: string) => {
    write(path.join(directory, "node_modules/next/package.json"), {
      name: "next",
      version,
    });
    write(
      path.join(directory, "node_modules/next/dist/bin/next"),
      "SYNTHETIC_NOT_EXECUTED",
    );
  };
  next(root, "16.4.3");
  for (const app of ["os", "marketing", "email-worker"]) {
    write(path.join(root, "apps", app, "package.json"), {
      dependencies: { next: app === "os" ? "16.4.3" : "15.5.28" },
    });
    if (app !== "os") next(path.join(root, "apps", app), "15.5.28");
  }
  return { root, write, close: () => fs.rmSync(root, { recursive: true }) };
}

test("each application resolves its approved binary rather than the root version", () => {
  const f = fixture();
  try {
    const osNext = applicationNext("os", f.root),
      marketing = applicationNext("marketing", f.root),
      worker = applicationNext("email-worker", f.root);
    assert.equal(osNext.version, "16.4.3");
    assert.deepEqual(osNext.webpackArguments, ["--webpack"]);
    for (const entry of [marketing, worker]) {
      assert.equal(entry.version, "15.5.28");
      assert.deepEqual(entry.webpackArguments, []);
      assert.notEqual(entry.binary, osNext.binary);
    }
  } finally {
    f.close();
  }
});

test("missing scoped version cannot silently use an incompatible root Next", () => {
  const f = fixture();
  try {
    fs.rmSync(path.join(f.root, "apps/marketing/node_modules"), {
      recursive: true,
    });
    assert.throws(
      () => applicationNext("marketing", f.root),
      /INSTALLED_VERSION_MISMATCH/,
    );
  } finally {
    f.close();
  }
});

test("unreviewed application, declared range and installed patch fail closed", () => {
  const f = fixture();
  try {
    assert.throws(
      () => applicationNext("../os", f.root),
      /APPLICATION_UNREVIEWED/,
    );
    f.write(path.join(f.root, "apps/os/package.json"), {
      dependencies: { next: "^16.4.3" },
    });
    assert.throws(
      () => applicationNext("os", f.root),
      /DECLARED_VERSION_UNREVIEWED/,
    );
    f.write(path.join(f.root, "apps/os/package.json"), {
      dependencies: { next: "16.4.3" },
    });
    f.write(path.join(f.root, "node_modules/next/package.json"), {
      name: "next",
      version: "16.4.1",
    });
    assert.throws(
      () => applicationNext("os", f.root),
      /INSTALLED_VERSION_MISMATCH/,
    );
  } finally {
    f.close();
  }
});
