// Preload only for the disposable joined-proof Next process. Never application code.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const http = require("node:http");
const https = require("node:https");
const runtime = fs.realpathSync(process.env.KXRA_JOINED_RUNTIME || "");
assert.match(runtime, /^\/private\/tmp\/kxra-directory-joined-[A-Za-z0-9]+$/);
const marker = JSON.parse(fs.readFileSync(runtime + "/ownership.json", "utf8"));
assert.equal(marker.nonce, process.env.KXRA_CI_RUN_ID);
const ports = new Set(marker.httpPorts.map(String));
function originClass(host, port, socket) {
  if (socket)
    return socket === marker.socket + "/.s.PGSQL." + marker.databasePort
      ? "OWNED_SOCKET"
      : "OTHER_SOCKET";
  if (host === "127.0.0.1")
    return ports.has(String(port)) ? "OWNED_LOOPBACK" : "OTHER_LOOPBACK_PORT";
  if (["localhost", "::1", "[::1]"].includes(host)) return "LOOPBACK_ALIAS";
  if (!host) return "MISSING_HOST";
  return net.isIP(host) ? "NON_LOOPBACK_IP" : "NON_LOOPBACK_NAME";
}
function deny(reason = "UNCLASSIFIED", targetClass = "UNKNOWN") {
  // Only fixed dependency classifications, never arbitrary stack text or URLs.
  const stack = new Error().stack || "";
  const caller = stack.includes(
    "next/dist/server/dev/hot-reloader-shared-utils.js:",
  )
    ? "NEXT_DEV_VERSION_INFO"
    : stack.includes("next/dist/lib/patch-incorrect-lockfile.js:")
      ? "NEXT_LOCKFILE_CHECK"
      : "OTHER";
  fs.appendFileSync(
    runtime + "/network-denials.log",
    JSON.stringify({ reason, targetClass, caller }) + "\n",
    { mode: 0o600 },
  );
  throw Error("JOINED_PROOF_NON_OWNED_NETWORK_TARGET");
}
function noConnectionHooks(options) {
  if (!options || typeof options !== "object") return;
  for (const key of ["lookup", "createConnection", "dispatcher", "fd"])
    if (options[key] !== undefined)
      deny(
        "TRANSPORT_HOOK_" + key.toUpperCase(),
        originClass(
          options.hostname || options.host,
          options.port,
          options.socketPath,
        ),
      );
  if (options.agent !== undefined && options.agent !== false)
    deny(
      "CUSTOM_AGENT",
      originClass(options.hostname || options.host, options.port),
    );
}
function endpoint(host, port, socket) {
  if (socket) {
    if (socket !== marker.socket + "/.s.PGSQL." + marker.databasePort)
      deny("SOCKET_TARGET", originClass(host, port, socket));
    return;
  }
  // Servers bind this literal IPv4 address. No DNS alias or caller lookup.
  if (host !== "127.0.0.1" || !ports.has(String(port)))
    deny("TCP_TARGET", originClass(host, port));
}
function urlTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return deny("INVALID_URL");
  }
  if (url.protocol !== "http:")
    deny("PROTOCOL", originClass(url.hostname, url.port));
  if (url.username || url.password)
    deny("URL_CREDENTIALS", originClass(url.hostname, url.port));
  endpoint(url.hostname, url.port);
}
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, ...rest) {
  noConnectionHooks(rest[0]);
  urlTarget(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  return originalFetch.call(this, input, ...rest);
};
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  // Node's net.connect may forward normalized [options, callback] internally.
  const values = Array.isArray(args[0]) ? args[0] : args;
  const first = values[0];
  if (first && typeof first === "object") {
    noConnectionHooks(first);
    endpoint(first.host, first.port, first.path);
  } else if (typeof first === "string" && !/^\d+$/.test(first))
    endpoint(null, null, first);
  else endpoint(typeof values[1] === "string" ? values[1] : undefined, first);
  return connect.apply(this, args);
};
function wrapRequest(original) {
  return function (first, ...rest) {
    if (typeof first === "string" || first instanceof URL) {
      urlTarget(first);
      const options = rest[0];
      if (options && typeof options === "object") {
        noConnectionHooks(options);
        // Node lets options override URL addressing. Do not guess effective precedence.
        for (const key of [
          "host",
          "hostname",
          "port",
          "protocol",
          "socketPath",
        ])
          if (options[key] !== undefined)
            deny(
              "URL_OPTION_" + key.toUpperCase(),
              originClass(
                options.hostname || options.host,
                options.port,
                options.socketPath,
              ),
            );
      }
    } else {
      if (!first || typeof first !== "object") deny("INVALID_OPTIONS");
      noConnectionHooks(first);
      if (first.protocol && first.protocol !== "http:")
        deny("PROTOCOL", originClass(first.hostname || first.host, first.port));
      if (first.socketPath !== undefined)
        deny(
          "HTTP_SOCKET_OVERRIDE",
          originClass(undefined, undefined, first.socketPath),
        );
      if (
        first.hostname !== undefined &&
        first.host !== undefined &&
        first.hostname !== first.host
      )
        deny("CONFLICTING_HOST_OPTIONS", "UNKNOWN");
      endpoint(first.hostname || first.host, first.port || 80);
    }
    return original.call(this, first, ...rest);
  };
}
http.request = wrapRequest(http.request);
http.get = wrapRequest(http.get);
https.request = https.get = () => deny("HTTPS_TRANSPORT", "UNKNOWN");
