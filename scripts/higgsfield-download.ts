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
          response.resume();
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
  const addresses = await Promise.race([
    resolve(url.hostname),
    new Promise<never>((_, reject) =>
      signal.addEventListener(
        "abort",
        () => reject(Error("OUTPUT_DOWNLOAD_TIMEOUT")),
        { once: true },
      ),
    ),
  ]);
  if (!addresses.length) throw Error("OUTPUT_ADDRESS_INVALID");
  addresses.forEach((address) => {
    if (!net.isIPv4(address)) throw Error("OUTPUT_ADDRESS_INVALID");
    assertGlobalAddress(address);
  });
  const response = await transport(url, addresses, signal);
  if (
    !response.ok ||
    !response.headers.get("content-type")?.toLowerCase().startsWith("video/") ||
    (response.headers.has("content-encoding") &&
      response.headers.get("content-encoding") !== "identity") ||
    !response.body
  ) {
    await response.body?.cancel();
    throw Error("OUTPUT_DOWNLOAD_FAILED");
  }
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maximumBytes)) {
    await response.body.cancel();
    throw Error("OUTPUT_SIZE_INVALID");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw Error("OUTPUT_SIZE_INVALID");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size < 1000) throw Error("OUTPUT_SIZE_INVALID");
  return Buffer.concat(chunks, size);
}
