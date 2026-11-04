// Disposable IPC-owned fake custody process. No key persistence, real credentials or outbound IO.
import crypto from "node:crypto";
import http from "node:http";
import {
  fixtureGithubToken,
  requireGithubFixture,
} from "../packages/connectors/github";
import {
  custodyRequest,
  checkedCustodyContext,
  custodyContextDigest,
} from "../packages/connectors/github-custody-synthetic";
import {
  syntheticLeaseAAD,
  envelopeSchema,
} from "../packages/connectors/github-vault-synthetic";
requireGithubFixture();
if (!process.send) throw Error("IPC_FIXTURE_REQUIRED");
const authorization = crypto.randomBytes(32).toString("base64url");
let expires = Date.now() + 600000;
const keys = new Map<number, Buffer>();
let version = 1,
  delay = 0,
  requests = 0;
keys.set(version, crypto.randomBytes(32));
const counts = { seal: 0, open: 0 };
const server = http.createServer(async (req, res) => {
  res.on("error", () => {});
  const reject = () => {
    if (res.destroyed || res.writableEnded) return;
    if (!res.headersSent)
      res.writeHead(403, { "content-type": "application/json" });
    res.end('{"error":"SYNTHETIC_CUSTODY_UNAVAILABLE"}');
  };
  const expected = Buffer.from(`Bearer ${authorization}`),
    received = Buffer.from(req.headers.authorization || "");
  if (
    Date.now() >= expires ||
    ++requests > 1024 ||
    req.socket.remoteAddress !== "127.0.0.1" ||
    req.headers.origin ||
    req.method !== "POST" ||
    req.headers["content-type"] !== "application/json" ||
    received.length !== expected.length ||
    !crypto.timingSafeEqual(received, expected)
  ) {
    req.resume();
    reject();
    return;
  }
  const action =
    req.url === "/v1/synthetic/leases/seal"
      ? "seal"
      : req.url === "/v1/synthetic/leases/open"
        ? "open"
        : null;
  if (!action) {
    req.resume();
    reject();
    return;
  }
  const timer = setTimeout(() => {
    reject();
    req.destroy();
  }, 1500);
  try {
    let length = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 8192) throw Error();
      chunks.push(Buffer.from(chunk));
    }
    const value = custodyRequest.parse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      ),
      c = value.context;
    checkedCustodyContext(c.connection, c.scope, c.expires_at);
    if (
      (action === "seal" && value.envelope) ||
      (action === "open" && !value.envelope)
    )
      throw Error();
    const response = {
      mode: "synthetic",
      request_id: value.request_id,
      context_sha256: custodyContextDigest(c.connection, c.scope, c.expires_at),
    };
    if (action === "seal") {
      const key = keys.get(version);
      if (!key) throw Error();
      const key_id = `synthetic-custody-key-v${version}`,
        iv = crypto.randomBytes(12),
        cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(
        Buffer.concat([
          syntheticLeaseAAD(c.connection, c.scope, c.expires_at),
          Buffer.from(key_id),
        ]),
      );
      const ciphertext = Buffer.concat([
        cipher.update(fixtureGithubToken, "utf8"),
        cipher.final(),
      ]);
      counts.seal++;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ...response,
          envelope: {
            key_id,
            iv: iv.toString("base64url"),
            tag: cipher.getAuthTag().toString("base64url"),
            ciphertext: ciphertext.toString("base64url"),
          },
        }),
      );
    } else {
      const e = envelopeSchema.parse(value.envelope),
        match = /^synthetic-custody-key-v([1-9][0-9]{0,5})$/.exec(e.key_id),
        key = match && keys.get(Number(match[1]));
      if (!key) throw Error();
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(e.iv, "base64url"),
      );
      decipher.setAAD(
        Buffer.concat([
          syntheticLeaseAAD(c.connection, c.scope, c.expires_at),
          Buffer.from(e.key_id),
        ]),
      );
      decipher.setAuthTag(Buffer.from(e.tag, "base64url"));
      const token = Buffer.concat([
        decipher.update(Buffer.from(e.ciphertext, "base64url")),
        decipher.final(),
      ]);
      try {
        if (token.toString("utf8") !== fixtureGithubToken) throw Error();
        counts.open++;
        if (delay) {
          const wait = delay;
          delay = 0;
          process.send!({ type: "open_waiting" });
          await new Promise((r) => setTimeout(r, wait));
        }
        checkedCustodyContext(c.connection, c.scope, c.expires_at);
        if (
          res.destroyed ||
          res.writableEnded ||
          Date.now() >= expires ||
          keys.get(Number(match![1])) !== key
        )
          throw Error();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ...response, token: fixtureGithubToken }));
      } finally {
        token.fill(0);
      }
    }
  } catch {
    reject();
  } finally {
    clearTimeout(timer);
  }
});
server.headersTimeout = 2000;
server.requestTimeout = 2000;
server.maxConnections = 16;
process.on("message", (raw: any) => {
  if (!raw || typeof raw !== "object" || typeof raw.request_id !== "string")
    return;
  try {
    let result: unknown;
    if (raw.action === "rotate") {
      if (keys.size >= 8 || version >= 999999) throw Error();
      version++;
      keys.set(version, crypto.randomBytes(32));
      result = { key_id: `synthetic-custody-key-v${version}` };
    } else if (raw.action === "retire") {
      if (
        !Number.isInteger(raw.version) ||
        raw.version === version ||
        !keys.has(raw.version)
      )
        throw Error();
      keys.get(raw.version)!.fill(0);
      keys.delete(raw.version);
      result = { retired: true };
    } else if (raw.action === "delay_open") {
      if (!Number.isInteger(raw.delay) || raw.delay < 0 || raw.delay > 1000)
        throw Error();
      delay = raw.delay;
      result = { set: true };
    } else if (raw.action === "revoke_client") {
      expires = 0;
      result = { revoked: true };
    } else if (raw.action === "stats")
      result = { ...counts, versions: [...keys.keys()] };
    else throw Error();
    process.send!({ type: "control", request_id: raw.request_id, result });
  } catch {
    process.send!({
      type: "control",
      request_id: raw.request_id,
      error: "SYNTHETIC_CUSTODY_UNAVAILABLE",
    });
  }
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw Error();
  process.send!({
    type: "ready",
    origin: `http://127.0.0.1:${address.port}`,
    authorization,
  });
});
function stop() {
  for (const key of keys.values()) key.fill(0);
  keys.clear();
  server.closeAllConnections();
  server.close(() => process.exit(0));
}
process.on("SIGTERM", stop);
process.on("disconnect", stop);
