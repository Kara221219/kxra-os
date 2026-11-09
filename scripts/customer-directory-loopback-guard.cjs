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
function deny() {
  fs.appendFileSync(
    runtime + "/network-denials.log",
    "BLOCKED_NON_OWNED_TARGET\n",
    { mode: 0o600 },
  );
  throw Error("JOINED_PROOF_NON_OWNED_NETWORK_TARGET");
}
function noConnectionHooks(options) {
  if (!options || typeof options !== "object") return;
  for (const key of ["lookup", "createConnection", "dispatcher", "fd"])
    if (options[key] !== undefined) deny();
  if (options.agent !== undefined && options.agent !== false) deny();
}
function endpoint(host, port, socket) {
  if (socket) {
    if (socket !== marker.socket + "/.s.PGSQL." + marker.databasePort) deny();
    return;
  }
  // Servers bind this literal IPv4 address. No DNS alias or caller lookup.
  if (host !== "127.0.0.1" || !ports.has(String(port))) deny();
}
function urlTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return deny();
  }
  if (url.protocol !== "http:" || url.username || url.password) deny();
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
          if (options[key] !== undefined) deny();
      }
    } else {
      if (!first || typeof first !== "object") deny();
      noConnectionHooks(first);
      if (first.protocol && first.protocol !== "http:") deny();
      if (first.socketPath !== undefined) deny();
      if (
        first.hostname !== undefined &&
        first.host !== undefined &&
        first.hostname !== first.host
      )
        deny();
      endpoint(first.hostname || first.host, first.port || 80);
    }
    return original.call(this, first, ...rest);
  };
}
http.request = wrapRequest(http.request);
http.get = wrapRequest(http.get);
https.request = https.get = deny;
