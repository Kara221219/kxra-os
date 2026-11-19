import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  openPrivateFile,
  privateDirectory,
  writePrivateOutput,
} from "../scripts/private-operator-files.mjs";
import { readPublicationFile } from "../scripts/publication-file.mjs";
import { downloadOperatorVideo } from "../scripts/higgsfield-download";

function workspace() {
  const directory = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), "kxra-tool-security-"),
  );
  return {
    directory,
    cleanup: () => fs.rmSync(directory, { recursive: true, force: true }),
  };
}

test("private ledger creation is exclusive and resumed writes truncate through the retained descriptor", () => {
  const { directory, cleanup } = workspace();
  try {
    const filename = path.join(directory, "ledger.json");
    const file = openPrivateFile(filename, true);
    try {
      file.write("a longer synthetic record");
      assert.throws(() => openPrivateFile(filename, true), { code: "EEXIST" });
      file.write("short");
      assert.equal(file.read(), "short");
      assert.equal(fs.statSync(filename).mode & 0o777, 0o600);
    } finally {
      file.close();
    }
    const resumed = openPrivateFile(filename);
    try {
      assert.equal(resumed.created, false);
      assert.equal(resumed.read(), "short");
    } finally {
      resumed.close();
    }
  } finally {
    cleanup();
  }
});

test("replacing a ledger pathname during provider polling cannot overwrite its symlink target", () => {
  const { directory, cleanup } = workspace();
  try {
    const filename = path.join(directory, "ledger.json");
    const target = path.join(directory, "unrelated.txt");
    fs.writeFileSync(target, "preserve", { mode: 0o600 });
    const file = openPrivateFile(filename, true);
    try {
      fs.renameSync(filename, filename + ".original");
      fs.symlinkSync(target, filename);
      file.write("updated ledger");
      assert.equal(fs.readFileSync(target, "utf8"), "preserve");
      assert.equal(
        fs.readFileSync(filename + ".original", "utf8"),
        "updated ledger",
      );
      assert.throws(() => openPrivateFile(filename));
      assert.throws(() =>
        writePrivateOutput(filename, Buffer.from("replacement")),
      );
    } finally {
      file.close();
    }
  } finally {
    cleanup();
  }
});

test("operator files reject public modes, hardlinks and symlink directories", () => {
  const { directory, cleanup } = workspace();
  try {
    const filename = path.join(directory, "record");
    fs.writeFileSync(filename, "synthetic", { mode: 0o644 });
    assert.throws(() => openPrivateFile(filename), /PRIVATE_FILE_REQUIRED/);
    fs.chmodSync(filename, 0o600);
    fs.linkSync(filename, filename + ".link");
    assert.throws(() => openPrivateFile(filename), /PRIVATE_FILE_REQUIRED/);
    fs.symlinkSync(directory, path.join(directory, "linked-directory"));
    assert.throws(
      () => privateDirectory(path.join(directory, "linked-directory")),
      /PRIVATE_DIRECTORY_REQUIRED/,
    );
    const publicDirectory = path.join(directory, "public");
    fs.mkdirSync(publicDirectory, { mode: 0o755 });
    assert.throws(
      () => privateDirectory(publicDirectory),
      /PRIVATE_DIRECTORY_REQUIRED/,
    );
    const writableParent = path.join(directory, "writable-parent");
    fs.mkdirSync(writableParent, { mode: 0o700 });
    fs.chmodSync(writableParent, 0o777);
    assert.throws(
      () => privateDirectory(path.join(writableParent, "child")),
      /PRIVATE_DIRECTORY_REQUIRED/,
    );
  } finally {
    cleanup();
  }
});

test("publication scanner reads regular files, tolerates tracked deletions and rejects symlink escapes", () => {
  const { directory, cleanup } = workspace();
  try {
    fs.writeFileSync(path.join(directory, "source"), "synthetic source");
    assert.equal(
      readPublicationFile(directory, "source")?.toString(),
      "synthetic source",
    );
    assert.equal(readPublicationFile(directory, "deleted"), null);
    assert.equal(
      readPublicationFile(directory, "deleted-directory/deleted"),
      null,
    );
    fs.symlinkSync(
      path.join(directory, "source"),
      path.join(directory, "link"),
    );
    assert.throws(() => readPublicationFile(directory, "link"));
    fs.symlinkSync(directory, path.join(directory, "ancestor"));
    assert.throws(
      () => readPublicationFile(directory, "ancestor/source"),
      /PUBLICATION_SYMLINK_REJECTED/,
    );
    assert.throws(
      () => readPublicationFile(directory, "../outside"),
      /PUBLICATION_PATH_REJECTED/,
    );
    fs.chmodSync(path.join(directory, "source"), 0o666);
    assert.throws(
      () => readPublicationFile(directory, "source"),
      /PUBLICATION_WORKSPACE_CUSTODY_REQUIRED/,
    );
  } finally {
    cleanup();
  }
});

test("video download pins approved DNS answers and preserves bounded video bytes", async () => {
  const bytes = Buffer.alloc(1200, 1);
  const result = await downloadOperatorVideo(
    "https://video.example/clip.mp4?signature=synthetic",
    async () => ["8.8.8.8"],
    async (url, addresses, signal) => {
      assert.equal(url.hostname, "video.example");
      assert.deepEqual(addresses, ["8.8.8.8"]);
      assert.equal(signal.aborted, false);
      return new Response(bytes, { headers: { "content-type": "video/mp4" } });
    },
  );
  assert.deepEqual(result, bytes);
});

test("video download rejects unsafe schemes, credentials, ports and private or mixed DNS before transport", async () => {
  let transports = 0;
  const transport = async () => {
    transports++;
    throw Error("MUST_NOT_CONNECT");
  };
  for (const input of [
    "http://video.example/clip",
    "https://user:pass@video.example/clip",
    "https://video.example:8443/clip",
    "https://video.example/clip#fragment",
  ])
    await assert.rejects(
      downloadOperatorVideo(input, async () => ["8.8.8.8"], transport),
      /OUTPUT_URL_INVALID/,
    );
  for (const addresses of [
    [],
    ["127.0.0.1"],
    ["10.1.2.3"],
    ["169.254.169.254"],
    ["::1"],
    ["::ffff:127.0.0.1"],
    ["8.8.8.8", "192.168.1.1"],
  ])
    await assert.rejects(
      downloadOperatorVideo(
        "https://video.example/clip",
        async () => addresses,
        transport,
      ),
    );
  assert.equal(transports, 0);
});

test("video download rejects redirects, non-video, declared oversize and streaming oversize with cancellation", async () => {
  for (const response of [
    new Response(null, {
      status: 302,
      headers: { location: "https://private.example" },
    }),
    new Response("html", { headers: { "content-type": "text/html" } }),
    new Response("oversize", {
      headers: { "content-type": "video/mp4", "content-length": "40000001" },
    }),
  ])
    await assert.rejects(
      downloadOperatorVideo(
        "https://video.example/clip",
        async () => ["8.8.8.8"],
        async () => response,
      ),
    );
  let cancelled = false;
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(800));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    downloadOperatorVideo(
      "https://video.example/clip",
      async () => ["8.8.8.8"],
      async () =>
        new Response(body, { headers: { "content-type": "video/mp4" } }),
      1200,
    ),
    /OUTPUT_SIZE_INVALID/,
  );
  assert.equal(cancelled, true);
  await assert.rejects(
    downloadOperatorVideo(
      "https://video.example/clip",
      async () => ["8.8.8.8"],
      async () =>
        new Response(new Uint8Array(999), {
          headers: { "content-type": "video/mp4" },
        }),
    ),
    /OUTPUT_SIZE_INVALID/,
  );
});

test("video download bounds cumulative empty reads and preserves bytes at the supported boundary", async () => {
  const bytes = Buffer.alloc(1200, 7);
  let empty = 0;
  const valid = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (empty++ < 64) controller.enqueue(new Uint8Array());
      else {
        controller.enqueue(bytes);
        controller.close();
      }
    },
  });
  assert.deepEqual(
    await downloadOperatorVideo(
      "https://video.example/clip",
      async () => ["8.8.8.8"],
      async () =>
        new Response(valid, { headers: { "content-type": "video/mp4" } }),
    ),
    bytes,
  );
  let pulls = 0,
    cancelled = false;
  const flood = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array());
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    downloadOperatorVideo(
      "https://video.example/clip",
      async () => ["8.8.8.8"],
      async () =>
        new Response(flood, { headers: { "content-type": "video/mp4" } }),
    ),
    /OUTPUT_STREAM_READ_LIMIT/,
  );
  assert.ok(pulls <= 66);
  assert.equal(cancelled, true);
});

test("video download retains each emitted byte view when the source reuses its buffer", async () => {
  const backing = Buffer.alloc(4096);
  let part = 0;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (++part <= 2) {
          backing.fill(part);
          controller.enqueue(backing.subarray(0, 600));
        } else controller.close();
      },
    },
    { highWaterMark: 0 },
  );
  const result = await downloadOperatorVideo(
    "https://video.example/clip",
    async () => ["8.8.8.8"],
    async () =>
      new Response(body, { headers: { "content-type": "video/mp4" } }),
  );
  assert.deepEqual(
    result,
    Buffer.concat([Buffer.alloc(600, 1), Buffer.alloc(600, 2)]),
  );
});

test("video download caps tiny-chunk metadata and retains the supported read boundary", async () => {
  const url = "https://video.example/clip";
  let chunks = 0;
  const valid = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (++chunks <= 65_535) controller.enqueue(new Uint8Array([5]));
      else controller.close();
    },
  });
  const result = await downloadOperatorVideo(
    url,
    async () => ["8.8.8.8"],
    async () =>
      new Response(valid, { headers: { "content-type": "video/mp4" } }),
  );
  assert.equal(result.length, 65_535);
  assert.ok(result.every((byte) => byte === 5));
  let pulls = 0,
    cancelled = false;
  const flood = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(
    downloadOperatorVideo(
      url,
      async () => ["8.8.8.8"],
      async () =>
        new Response(flood, { headers: { "content-type": "video/mp4" } }),
    ),
    /OUTPUT_STREAM_READ_LIMIT/,
  );
  assert.ok(pulls <= 65_538);
  assert.equal(cancelled, true);
});

test("video download deadline bounds stalled DNS, transport and reader without awaiting stuck cancellation", async (t) => {
  // Keep a referenced synthetic timer so Node's test process can observe the
  // timeout; the production contract still requests exactly sixty seconds.
  const timers: ReturnType<typeof setTimeout>[] = [];
  t.mock.method(AbortSignal, "timeout", (duration: number) => {
    assert.equal(duration, 60_000);
    const controller = new AbortController();
    timers.push(setTimeout(() => controller.abort(), 10));
    return controller.signal;
  });
  t.after(() => timers.forEach(clearTimeout));
  const never = () => new Promise<never>(() => {});
  await assert.rejects(
    downloadOperatorVideo("https://video.example/clip", never),
    /OUTPUT_DOWNLOAD_TIMEOUT/,
  );
  await assert.rejects(
    downloadOperatorVideo(
      "https://video.example/clip",
      async () => ["8.8.8.8"],
      never,
    ),
    /OUTPUT_DOWNLOAD_TIMEOUT/,
  );
  let cancelled = false;
  const stalled = new ReadableStream<Uint8Array>({
    pull: never,
    cancel() {
      cancelled = true;
      return never();
    },
  });
  await assert.rejects(
    downloadOperatorVideo(
      "https://video.example/clip",
      async () => ["8.8.8.8"],
      async () =>
        new Response(stalled, { headers: { "content-type": "video/mp4" } }),
    ),
    /OUTPUT_DOWNLOAD_TIMEOUT/,
  );
  assert.equal(cancelled, true);
  let floodedReads = 0,
    floodCancelled = false;
  const synchronousFlood = new ReadableStream<Uint8Array>({
    pull(controller) {
      floodedReads++;
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() {
      floodCancelled = true;
    },
  });
  await assert.rejects(
    downloadOperatorVideo(
      "https://video.example/clip",
      async () => ["8.8.8.8"],
      async () =>
        new Response(synchronousFlood, {
          headers: { "content-type": "video/mp4" },
        }),
    ),
    /OUTPUT_DOWNLOAD_TIMEOUT/,
  );
  assert.equal(floodCancelled, true);
  assert.ok(floodedReads < 65_536);
});
