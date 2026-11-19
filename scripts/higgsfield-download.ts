import {
  assertGlobalAddress,
  type PublicAddressResolver,
  type PinnedPublicTransport,
} from "../packages/integrations/public-web";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import dns from "node:dns/promises";

const videoAddressResolver: PublicAddressResolver = async (hostname) =>
  (await dns.lookup(hostname, { all: true, family: 4 })).map(
    (answer) => answer.address,
  );

const pinnedVideoTransport: PinnedPublicTransport = (url, addresses, signal) =>
  new Promise((resolve, reject) => {
    const address = addresses[0];
    const request = https.request(
      url,
      {
        method: "GET",
        signal,
        servername: url.hostname,
        headers: { accept: "video/*", "accept-encoding": "identity" },
        lookup: (_host, _options, callback) =>
          callback(null, address, net.isIP(address)),
      },
      (response) => {
        if (
          !response.statusCode ||
          response.statusCode < 200 ||
          response.statusCode >= 300 ||
          [204, 205].includes(response.statusCode)
        ) {
          response.destroy();
          reject(Error("OUTPUT_DOWNLOAD_FAILED"));
          return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value))
            value.forEach((item) => headers.append(name, item));
          else if (value !== undefined) headers.set(name, value);
        }
        // Raw HTTPS makes one request only; a redirect is returned for rejection.
        resolve(
          new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, {
            status: response.statusCode || 502,
            headers,
          }),
        );
      },
    );
    request.once("error", reject);
    request.end();
  });

// No credentials, cookies or redirects. Resolve once and pin that public
// address to the TLS connection to prevent private-network DNS rebinding.
export async function downloadOperatorVideo(
  input: string,
  resolve: PublicAddressResolver = videoAddressResolver,
  transport: PinnedPublicTransport = pinnedVideoTransport,
  maximumBytes = 40_000_000,
) {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1000 ||
    maximumBytes > 40_000_000
  )
    throw Error("OUTPUT_SIZE_LIMIT_INVALID");
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== "443")
  )
    throw Error("OUTPUT_URL_INVALID");
  const signal = AbortSignal.timeout(60_000);
  function beforeDeadline<T>(work: Promise<T>): Promise<T> {
    if (signal.aborted) return Promise.reject(Error("OUTPUT_DOWNLOAD_TIMEOUT"));
    return new Promise((resolve, reject) => {
      const stop = () => reject(Error("OUTPUT_DOWNLOAD_TIMEOUT"));
      signal.addEventListener("abort", stop, { once: true });
      work.then(
        (value) => {
          signal.removeEventListener("abort", stop);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", stop);
          reject(error);
        },
      );
    });
  }
  const addresses = await beforeDeadline(resolve(url.hostname));
  if (!addresses.length) throw Error("OUTPUT_ADDRESS_INVALID");
  addresses.forEach((address) => {
    if (!net.isIPv4(address)) throw Error("OUTPUT_ADDRESS_INVALID");
    assertGlobalAddress(address);
  });
  const response = await beforeDeadline(transport(url, addresses, signal));
  if (
    !response.ok ||
    !response.headers.get("content-type")?.toLowerCase().startsWith("video/") ||
    (response.headers.has("content-encoding") &&
      response.headers.get("content-encoding") !== "identity") ||
    !response.body
  ) {
    void response.body?.cancel().catch(() => {});
    throw Error("OUTPUT_DOWNLOAD_FAILED");
  }
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) {
    void response.body.cancel().catch(() => {});
    throw Error("OUTPUT_SIZE_INVALID");
  }
  const chunks: Uint8Array[] = [];
  let size = 0,
    reads = 0,
    emptyReads = 0,
    complete = false;
  const reader = response.body.getReader();
  try {
    for (;;) {
      // Byte limits alone do not bound chunk metadata or synchronous empty-read
      // floods. These are cumulative limits, including non-consecutive empties.
      if (++reads > 65_536) throw Error("OUTPUT_STREAM_READ_LIMIT");
      const { done, value } = await beforeDeadline(reader.read());
      if (done) {
        complete = true;
        break;
      }
      if (value.byteLength === 0) {
        if (++emptyReads > 64) throw Error("OUTPUT_STREAM_READ_LIMIT");
        continue;
      }
      size += value.byteLength;
      if (size > maximumBytes) {
        throw Error("OUTPUT_SIZE_INVALID");
      }
      // Copy only the counted view, rather than retaining an arbitrarily larger
      // backing buffer behind a short chunk.
      chunks.push(Buffer.from(value));
      // Let the whole-download timer run even if an adversarial stream resolves
      // every read synchronously. The chunk limit separately bounds memory.
      if (reads % 128 === 0)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
  } finally {
    // Cancellation is requested but cannot be allowed to block the deadline.
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (size < 1000) throw Error("OUTPUT_SIZE_INVALID");
  return Buffer.concat(chunks, size);
}
