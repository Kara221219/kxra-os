import { syntheticRollbackFence } from "../tests/support/github-production-fake";
// Native TLS proof uses generated fake certificates/tokens and only an owned loopback server.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import net from "node:net";
import type { Duplex } from "node:stream";
import { execFileSync } from "node:child_process";
import {
  GithubProductionExecutor,
  type GithubExecutionPorts,
} from "../packages/connectors/github-production-transport";
import {
  githubProductionBinding,
  githubBindingDigest,
  githubCommentApprovalDigest,
} from "../packages/connectors/github-production-contracts";
async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-ghe-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/github-production-http");
  fs.mkdirSync(runtime, { recursive: true, mode: 0o700 });
  const key = path.join(runtime, "ephemeral.key"),
    cert = path.join(runtime, "ephemeral.crt");
  const write = (name: string, value: unknown) =>
    fs.writeFileSync(
      path.join(runtime, name),
      JSON.stringify(value, null, 2) + "\n",
      { mode: 0o600 },
    );
  let server: https.Server | undefined,
    port = 0,
    closed = false;
  const sockets = new Set<Duplex>();
  const phases: string[] = [];
  let reads = 0,
    posts = 0,
    externalAttempts = 0,
    mode = "normal",
    authorityValid = true;
  const token = "offline_generated_" + crypto.randomBytes(24).toString("hex"),
    now = Date.now();
  const binding = githubProductionBinding.parse({
    provider: "github",
    api_version: "2026-03-10",
    org_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    connection_id: crypto.randomUUID(),
    session_version: 1,
    grant_version: 1,
    credential_ref: "vault:github:offline-protocol-reference",
    credential_version: 1,
    app_id: 3001,
    installation_id: 3002,
    account_id: 3003,
    repository_id: 3004,
    issue_id: 3005,
    issue_number: 6,
    author_id: 3006,
    owner: "Offline-Org",
    repo: "transport-proof",
    expires_at: new Date(now + 600000).toISOString(),
  });
  const repoPath = `/repos/${binding.owner}/${binding.repo}`,
    issuePath = `${repoPath}/issues/${binding.issue_number}`,
    commentsPath = issuePath + "/comments",
    repoUrl = "https://api.github.com" + repoPath,
    issueUrl = "https://api.github.com" + issuePath;
  const used = new Set<string>();
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-subj",
        "/CN=api.github.com",
        "-addext",
        "subjectAltName=DNS:api.github.com",
        "-days",
        "1",
        "-keyout",
        key,
        "-out",
        cert,
      ],
      { stdio: "ignore", timeout: 20000 },
    );
    fs.chmodSync(key, 0o600);
    fs.chmodSync(cert, 0o600);
    server = https.createServer(
      { key: fs.readFileSync(key), cert: fs.readFileSync(cert) },
      async (req, res) => {
        if (
          req.headers.origin ||
          req.headers.authorization !== `Bearer ${token}` ||
          req.headers["x-github-api-version"] !== "2026-03-10"
        ) {
          res.writeHead(403, { "content-type": "application/json" });
          res.end('{"message":"unavailable"}');
          return;
        }
        const send = (
          data: unknown,
          status = 200,
          headers: Record<string, string> = {},
        ) => {
          res.writeHead(status, {
            "content-type": "application/json",
            ...headers,
          });
          res.end(JSON.stringify(data));
        };
        if (req.method === "GET") {
          reads++;
          if (mode === "rate") {
            res.writeHead(429, {
              "content-type": "application/json",
              "retry-after": "60",
            });
            res.end("{");
            return;
          }
          let data: unknown =
            req.url === repoPath
              ? {
                  id: binding.repository_id,
                  owner: { id: binding.account_id, login: binding.owner },
                  full_name: `${binding.owner}/${binding.repo}`,
                  temp_clone_token: token,
                }
              : req.url === issuePath
                ? {
                    id: binding.issue_id,
                    number: binding.issue_number,
                    url: issueUrl,
                    repository_url: repoUrl,
                  }
                : req.url === commentsPath + "?per_page=100&page=1"
                  ? [
                      {
                        id: 4001,
                        body: "Synthetic private comment",
                        user: { id: 4002, type: "User" },
                        issue_url: issueUrl,
                        created_at: new Date().toISOString(),
                      },
                    ]
                  : null;
          if (data === null) {
            send({ message: "not found" }, 404);
            return;
          }
          if (mode === "withdraw-read") {
            authorityValid = false;
            setTimeout(() => send(data), 15);
          } else send(data);
          return;
        }
        if (req.method !== "POST" || req.url !== commentsPath) {
          send({ message: "not found" }, 404);
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const part of req) {
          const chunk = Buffer.from(part);
          size += chunk.length;
          if (size > 16384) {
            req.destroy();
            return;
          }
          chunks.push(chunk);
        }
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        posts++;
        if (mode === "drop") {
          req.socket.destroy();
          return;
        }
        if (mode === "hang") return;
        if (mode === "huge") {
          res.writeHead(201, { "content-type": "application/json" });
          res.end(Buffer.alloc(262145));
          return;
        }
        send(
          {
            id: 5000 + posts,
            body: data.body,
            user: { id: binding.author_id, type: "Bot" },
            issue_url: issueUrl,
            created_at: new Date().toISOString(),
          },
          201,
        );
      },
    );
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    server.on("tlsClientError", () => {});
    await new Promise<void>((r, j) => {
      server!.once("error", j);
      server!.listen(0, "127.0.0.1", r);
    });
    port = (server.address() as net.AddressInfo).port;
    const actualRequest = https.request;
    const request: typeof https.request = ((
      target: any,
      options: any,
      callback: any,
    ) => {
      const u = new URL(target);
      if (u.origin !== "https://api.github.com") {
        externalAttempts++;
        throw Error("external target rejected");
      }
      assert.equal(options.port, 443);
      assert.equal(options.servername, "api.github.com");
      assert.equal(options.rejectUnauthorized, true);
      assert.equal(options.agent, false);
      assert.equal(options.family, 4);
      assert.equal(options.autoSelectFamily, false);
      assert.equal(options.maxHeaderSize, 16384);
      let address: any;
      options.lookup("api.github.com", {}, (...v: any[]) => {
        address = v;
      });
      assert.deepEqual(address, [null, "8.8.8.8", 4]);
      // Test seam changes ONLY routing/trust to the owned TLS fixture. Production never permits this URL/config.
      return actualRequest(
        target,
        {
          ...options,
          port,
          ca: fs.readFileSync(cert),
          lookup: (host: any, opts: any, cb: any) => {
            options.lookup(
              host,
              opts,
              (error: any, address: any, family: any) => {
                assert.equal(error, null);
                assert.equal(address, "8.8.8.8");
                assert.equal(family, 4);
                cb(null, "127.0.0.1", 4);
              },
            );
          },
        },
        callback,
      );
    }) as typeof https.request;
    const ports: GithubExecutionPorts = {
      rollbackFence: syntheticRollbackFence(),
      enabled: () => true,
      request,
      lookup: async (host) => {
        assert.equal(host, "api.github.com");
        return [{ address: "8.8.8.8" }];
      },
      deadlineMs: 1000,
      authority: {
        current: async (i) => {
          if (!authorityValid) throw Error("withdrawn");
          return {
            state: i.operation.kind === "COMMENT" ? "DISPATCHING" : "ACTIVE",
            binding_sha256: i.binding_sha256,
            operation_sha256: i.operation_sha256,
            ...(i.operation.kind === "COMMENT"
              ? {
                  write_id: i.operation.write_id,
                  attempt_id: i.operation.attempt_id,
                }
              : {}),
          };
        },
        consume: async (i) => {
          const o = i.operation;
          if (!authorityValid || o.kind !== "COMMENT" || used.has(o.attempt_id))
            throw Error("consumed or denied");
          used.add(o.attempt_id);
          return {
            consumed: true,
            binding_sha256: i.binding_sha256,
            operation_sha256: i.operation_sha256,
            write_id: o.write_id,
            attempt_id: o.attempt_id,
          };
        },
      },
      broker: {
        resolve: async ({ scope }) => ({
          mode: "GITHUB_APP_INSTALLATION",
          binding_sha256: githubBindingDigest(binding),
          credential_ref: binding.credential_ref,
          credential_version: binding.credential_version,
          app_id: binding.app_id,
          installation_id: binding.installation_id,
          repository_ids: [binding.repository_id],
          permissions: {
            metadata: "read",
            issues: scope === "issues:write" ? "write" : "read",
          },
          expires_at: new Date(now + 300000).toISOString(),
          token,
        }),
      },
    };
    const make = () => new GithubProductionExecutor(binding, ports);
    const preflight = async (e: GithubProductionExecutor) => {
      assert.equal((await e.execute({ kind: "REPOSITORY" })).outcome, "READ");
      assert.equal((await e.execute({ kind: "ISSUE" })).outcome, "READ");
    };
    const operation = () => {
      const f = {
        write_id: crypto.randomUUID(),
        body: "Offline TLS acceptance only",
        approved_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60000).toISOString(),
      };
      return {
        kind: "COMMENT",
        ...f,
        attempt_id: crypto.randomUUID(),
        approval_digest: githubCommentApprovalDigest(binding, f),
      };
    };
    const e = make();
    await preflight(e);
    const read = await e.execute({ kind: "COMMENTS", page: 1 });
    assert.equal(read.outcome, "READ");
    assert.ok(!JSON.stringify(read).includes(token));
    phases.push("native-tls-scoped-metadata-and-comments");
    const approved = operation(),
      accepted = await e.execute(approved);
    assert.equal(accepted.outcome, "ACCEPTED");
    assert.ok(!JSON.stringify(accepted).includes(token));
    assert.equal((await e.execute(approved)).outcome, "REFUSED");
    assert.equal(posts, 1);
    phases.push("exact-one-comment-and-same-window-no-replay");
    const lost = make();
    await preflight(lost);
    const lostOp = operation();
    mode = "drop";
    assert.equal((await lost.execute(lostOp)).outcome, "UNCERTAIN");
    assert.equal(posts, 2);
    mode = "normal";
    const rebuilt = make();
    await preflight(rebuilt);
    assert.equal((await rebuilt.execute(lostOp)).outcome, "REFUSED");
    assert.equal(posts, 2);
    phases.push("committed-response-loss-and-reconstructed-consumption-fence");
    mode = "withdraw-read";
    const withheld = await make().execute({ kind: "COMMENTS", page: 1 });
    assert.equal(withheld.outcome, "UNAVAILABLE");
    assert.equal(withheld.data, undefined);
    mode = "normal";
    authorityValid = true;
    phases.push("authority-withdrawal-withholds-private-read");
    const stalled = make();
    await preflight(stalled);
    mode = "hang";
    assert.equal((await stalled.execute(operation())).outcome, "UNCERTAIN");
    assert.equal(posts, 3);
    mode = "normal";
    phases.push("native-post-body-deadline");
    const huge = make();
    await preflight(huge);
    mode = "huge";
    assert.equal((await huge.execute(operation())).outcome, "UNCERTAIN");
    assert.equal(posts, 4);
    mode = "normal";
    phases.push("native-response-byte-cap");
    const quota = make();
    mode = "rate";
    const before = reads;
    const limited = await quota.execute({ kind: "REPOSITORY" });
    assert.equal(limited.rate.stop, true);
    assert.equal(
      (await quota.execute({ kind: "REPOSITORY" })).outcome,
      "NOT_EXECUTED",
    );
    assert.equal(reads, before + 1);
    mode = "normal";
    phases.push("malformed-rate-response-stops-window");
    const badTrust: typeof https.request = ((
      target: any,
      options: any,
      callback: any,
    ) =>
      actualRequest(
        target,
        {
          ...options,
          port,
          lookup: (_h: any, _o: any, cb: any) => cb(null, "127.0.0.1", 4),
        },
        callback,
      )) as typeof https.request;
    const beforeTls = reads;
    assert.equal(
      (
        await new GithubProductionExecutor(binding, {
          ...ports,
          request: badTrust,
        }).execute({ kind: "REPOSITORY" })
      ).outcome,
      "UNAVAILABLE",
    );
    assert.equal(reads, beforeTls);
    phases.push("native-certificate-verification-rejects-untrusted-peer");
    assert.equal(externalAttempts, 0);
    write("acceptance.json", {
      status: "PASS_OFFLINE_GITHUB_HTTPS_BOUNDARY",
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      phases,
      nativeTls: true,
      onlyOwnedLoopbackSockets: true,
      externalProviderCalls: 0,
      realCredentialsUsed: false,
      syntheticCertificateAndTokenOnly: true,
      actualFakePosts: posts,
      productionRoutesEnabled: false,
      realDnsOrProviderCertificateAcceptance: false,
      productionDurableSqlConsumptionImplemented: false,
    });
    console.log("GITHUB_PRODUCTION_TRANSPORT_OFFLINE_PASS " + runtime);
  } finally {
    let clean = true;
    const socketCloseWait = Promise.all(
      [...sockets].map(
        (socket) =>
          new Promise<void>((resolve) => {
            if (socket.closed) {
              sockets.delete(socket);
              resolve();
            } else socket.once("close", () => resolve());
            socket.destroy();
          }),
      ),
    );
    if (server) {
      try {
        await new Promise<void>((r, j) => {
          const t = setTimeout(() => j(Error("close timeout")), 3000);
          server!.close((e) => {
            clearTimeout(t);
            if (e) j(e);
            else {
              closed = true;
              r();
            }
          });
        });
      } catch {
        clean = false;
      }
    }
    let socketTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        socketCloseWait,
        new Promise<never>((_r, j) => {
          socketTimer = setTimeout(
            () => j(Error("socket close timeout")),
            3000,
          );
        }),
      ]);
    } catch {
      clean = false;
    } finally {
      clearTimeout(socketTimer);
    }
    for (const file of [key, cert]) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {
        clean = false;
      }
    }
    let portFree = port === 0;
    const probe = net.createServer();
    if (port) {
      try {
        await new Promise<void>((r, j) => {
          probe.once("error", j);
          probe.listen(port, "127.0.0.1", r);
        });
        portFree = true;
      } catch {
        clean = false;
      } finally {
        if (probe.listening)
          await new Promise<void>((r) => probe.close(() => r()));
      }
    }
    clean =
      clean &&
      sockets.size === 0 &&
      (!server || closed) &&
      portFree &&
      !fs.existsSync(key) &&
      !fs.existsSync(cert);
    write("cleanup.json", {
      clean,
      serverClosed: !server || closed,
      portFree,
      generatedKeyAbsent: !fs.existsSync(key),
      generatedCertificateAbsent: !fs.existsSync(cert),
      liveOwnedSockets: sockets.size,
    });
    assert.ok(clean, "OWNED_TLS_CLEANUP_UNCERTAIN");
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "OFFLINE_GITHUB_PROOF_FAILED");
  process.exitCode = 1;
});
