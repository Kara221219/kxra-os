import crypto from "node:crypto";
import dns from "node:dns/promises";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import { assertPublicWebsiteUrl } from "../brand-studio";

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const allowedContentTypes = new Set([
  "text/html",
  "text/plain",
  "application/xhtml+xml",
]);

export type PublicAddressResolver = (hostname: string) => Promise<string[]>;
export type PinnedPublicTransport = (
  url: URL,
  approvedAddresses: readonly string[],
  signal: AbortSignal,
) => Promise<Response>;

export type PublicSnapshot = {
  final_url: string;
  content_type: string;
  body: Buffer;
  sha256: string;
  redirects: number;
};

function globalIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => part < 0 || part > 255))
    return false;
  const [a, b, c] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function globalIpv6(address: string) {
  const value = address.toLowerCase().split("%")[0];
  if (value.startsWith("::ffff:")) return globalIpv4(value.slice(7));
  return !(
    value === "::" ||
    value === "::1" ||
    /^f[cd]/.test(value) ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("ff") ||
    value.startsWith("2001:db8:")
  );
}

export function assertGlobalAddress(address: string) {
  const family = net.isIP(address);
  if (
    (family === 4 && globalIpv4(address)) ||
    (family === 6 && globalIpv6(address))
  )
    return address;
  throw Error("PUBLIC_WEB_ADDRESS_NOT_GLOBAL");
}

export async function systemPublicAddressResolver(hostname: string) {
  const answers = await dns.lookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => answer.address);
}

export async function nodePinnedPublicTransport(
  url: URL,
  approvedAddresses: readonly string[],
  signal: AbortSignal,
) {
  const address = approvedAddresses[0];
  const family = net.isIP(address);
  if (!address || !family) throw Error("PUBLIC_WEB_ADDRESS_INVALID");
  return new Promise<Response>((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        signal,
        servername: url.hostname,
        headers: {
          accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "accept-encoding": "identity",
          "user-agent": "KXRA-Brand-Source/1.0",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, address, family),
      },
      (response) => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value))
            for (const item of value) headers.append(name, item);
          else if (value !== undefined) headers.set(name, String(value));
        }
        const body = Readable.toWeb(response) as ReadableStream<Uint8Array>;
        resolve(
          new Response(body, {
            status: response.statusCode || 502,
            statusText: response.statusMessage,
            headers,
          }),
        );
      },
    );
    request.once("error", reject);
    request.end();
  });
}

async function readBoundedBody(response: Response, maximumBytes: number) {
  if (!response.body) throw Error("PUBLIC_WEB_BODY_EMPTY");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw Error("PUBLIC_WEB_CONTENT_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw Error("PUBLIC_WEB_BODY_EMPTY");
  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk)),
    size,
  );
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(?:#(\d{1,7})|#x([a-f0-9]{1,6})|([a-z]{2,8}));/gi,
    (match, decimal: string, hexadecimal: string, name: string) => {
      const code = decimal
        ? Number(decimal)
        : hexadecimal
          ? Number.parseInt(hexadecimal, 16)
          : null;
      if (code !== null)
        return code > 0 &&
          code <= 0x10ffff &&
          !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : " ";
      return named[name.toLowerCase()] ?? match;
    },
  );
}

export function extractPublicSourceText(
  body: Buffer,
  contentType: string,
  maximumCharacters = 50_000,
) {
  if (!Number.isInteger(maximumCharacters) || maximumCharacters < 1)
    throw Error("PUBLIC_WEB_TEXT_LIMIT_INVALID");
  let value = body.toString("utf8");
  if (contentType !== "text/plain")
    value = value
      .replace(/<!--[^]*?-->/g, " ")
      .replace(
        /<(script|style|noscript|svg|template|iframe|object)\b[^>]*>[^]*?<\/\1\s*>/gi,
        " ",
      )
      .replace(/<[^>]+>/g, " ");
  value = decodeHtmlEntities(value).replace(/\s+/g, " ").trim();
  if (!value) throw Error("PUBLIC_WEB_TEXT_EMPTY");
  if (value.length > maximumCharacters)
    throw Error("PUBLIC_WEB_TEXT_TOO_LARGE");
  return value;
}

export async function fetchPublicSnapshot({
  inputUrl,
  resolve = systemPublicAddressResolver,
  transport,
  maximumBytes = 1_000_000,
  maximumRedirects = 3,
  timeoutMs = 10_000,
}: {
  inputUrl: string;
  resolve?: PublicAddressResolver;
  transport: PinnedPublicTransport;
  maximumBytes?: number;
  maximumRedirects?: number;
  timeoutMs?: number;
}): Promise<PublicSnapshot> {
  if (
    !Number.isInteger(maximumBytes) ||
    maximumBytes < 1 ||
    maximumBytes > 5_000_000 ||
    !Number.isInteger(maximumRedirects) ||
    maximumRedirects < 0 ||
    maximumRedirects > 5 ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 30_000
  )
    throw Error("PUBLIC_WEB_LIMIT_INVALID");

  let current = new URL(assertPublicWebsiteUrl(inputUrl));
  current.hash = "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let redirects = 0; ; redirects += 1) {
      const addresses = [...new Set(await resolve(current.hostname))].map(
        assertGlobalAddress,
      );
      if (!addresses.length) throw Error("PUBLIC_WEB_DNS_EMPTY");
      const response = await transport(current, addresses, controller.signal);
      if (redirectStatuses.has(response.status)) {
        if (redirects >= maximumRedirects)
          throw Error("PUBLIC_WEB_REDIRECT_LIMIT");
        const location = response.headers.get("location");
        if (!location) throw Error("PUBLIC_WEB_REDIRECT_INVALID");
        current = new URL(
          assertPublicWebsiteUrl(new URL(location, current).toString()),
        );
        current.hash = "";
        continue;
      }
      if (!response.ok) throw Error("PUBLIC_WEB_UPSTREAM_UNAVAILABLE");
      const contentType = (response.headers.get("content-type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (!allowedContentTypes.has(contentType))
        throw Error("PUBLIC_WEB_CONTENT_TYPE_REJECTED");
      const declared = Number(response.headers.get("content-length") || "0");
      if (declared && (!Number.isFinite(declared) || declared > maximumBytes))
        throw Error("PUBLIC_WEB_CONTENT_TOO_LARGE");
      const encoding = (response.headers.get("content-encoding") || "identity")
        .trim()
        .toLowerCase();
      if (encoding !== "identity")
        throw Error("PUBLIC_WEB_CONTENT_ENCODING_REJECTED");
      const body = await readBoundedBody(response, maximumBytes);
      return {
        final_url: current.toString(),
        content_type: contentType,
        body,
        sha256: crypto.createHash("sha256").update(body).digest("hex"),
        redirects,
      };
    }
  } finally {
    clearTimeout(timer);
  }
}
