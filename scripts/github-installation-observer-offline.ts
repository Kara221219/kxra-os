// Owned loopback TLS only. Synthetic certificate and fake tokens are never provider credentials.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import net from "node:net";
import type { Duplex } from "node:stream";
import { execFileSync } from "node:child_process";
import {
  GithubInstallationObserver,
  type GithubInstallationObservationPorts,
} from "../packages/connectors/github-installation-observer";
import {
  githubProductionBinding,
  githubBindingDigest,
} from "../packages/connectors/github-production-contracts";

async function main() {
  const root = fs.realpathSync(process.cwd());
  assert.match(root, /^\/(?:private\/)?tmp\/kxra-ghio-[A-Za-z0-9]+$/);
  const runtime = path.join(root, ".runtime/github-installation-observer");
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
    serverClosed = false;
  const sockets = new Set<Duplex>();
  const phases: string[] = [];
  let mode = "normal",
    authorityValid = true,
    reads = 0,
    externalAttempts = 0,
    trust = true;
  const now = Math.floor(Date.now() / 1000) * 1000;
  const binding = githubProductionBinding.parse({
    provider: "github",
    api_version: "2026-03-10",
    org_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    connection_id: crypto.randomUUID(),
    session_version: 1,
    grant_version: 1,
    credential_ref: "vault:github:offline-observer",
    credential_version: 1,
    app_id: 8001,
    installation_id: 8002,
    account_id: 8003,
    repository_id: 8004,
    issue_id: 8005,
    issue_number: 6,
    author_id: 8006,
    owner: "Offline-Org",
    repo: "observer-proof",
    expires_at: new Date(now + 600000).toISOString(),
  });
  const client = "Iv1.offlineObserver";
  const jwt = `${Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")}.${Buffer.from(JSON.stringify({ iss: client, iat: now / 1000 - 60, exp: now / 1000 + 300 })).toString("base64url")}.${crypto.randomBytes(32).toString("base64url")}`;
  const token = "offline_observer_" + crypto.randomBytes(24).toString("hex");
  const permissions = { metadata: "read", issues: "write" };
  const account = {
    id: binding.account_id,
    login: binding.owner,
    type: "Organization",
  };
  const app = {
    id: binding.app_id,
    client_id: client,
    slug: "kxra-offline",
    permissions,
  };
  const installation = {
    id: binding.installation_id,
    app_id: binding.app_id,
    app_slug: app.slug,
    account,
    target_id: binding.account_id,
    target_type: account.type,
    repository_selection: "selected",
    permissions,
    suspended_at: null,
    suspended_by: null,
  };
  const repoPath = `/repos/${binding.owner}/${binding.repo}`;
  const botPath = `/users/${encodeURIComponent(app.slug + "[bot]")}`;
  const routes: Record<string, unknown> = {
    "/app": app,
    [`/app/installations/${binding.installation_id}`]: installation,
    [`${repoPath}/installation`]: installation,
    [repoPath]: {
      id: binding.repository_id,
      name: binding.repo,
      full_name: `${binding.owner}/${binding.repo}`,
      owner: account,
      archived: false,
      disabled: false,
      temp_clone_token: token,
    },
    [botPath]: {
      id: binding.author_id,
      login: app.slug + "[bot]",
      type: "Bot",
    },
  };
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
      (req, res) => {
        reads++;
        assert.equal(req.method, "GET");
        assert.equal(req.headers["x-github-api-version"], "2026-03-10");
        assert.equal(req.headers["accept-encoding"], "identity");
        assert.equal(
          req.headers.authorization,
          req.url === botPath
            ? undefined
            : `Bearer ${req.url === repoPath ? token : jwt}`,
        );
        const data = routes[req.url ?? ""];
        assert.ok(data);
        if (mode === "hang") return;
        if (mode === "drop") {
          req.socket.destroy();
          return;
        }
        if (mode === "withdraw") authorityValid = false;
        if (mode === "redirect") {
          res.writeHead(302, {
            location: "https://attacker.invalid",
            "content-type": "application/json",
          });
          res.end("{}");
          return;
        }
        if (mode === "rate") {
          res.writeHead(429, {
            "retry-after": "60",
            "content-type": "application/json",
          });
          res.end("{");
          return;
        }
        if (mode === "header") {
          res.writeHead(200, {
            "content-type": "application/json",
            "x-oversized": "x".repeat(17000),
          });
          res.end("{}");
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        if (mode === "huge") res.end(Buffer.alloc(262145));
        else if (mode === "utf8") res.end(Buffer.from([255]));
        else res.end(JSON.stringify(data));
      },
    );
    server.on("connection", (socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
    });
    server.on("tlsClientError", () => {});
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
    port = (server.address() as net.AddressInfo).port;
    const realRequest = https.request;
    const request = ((target: any, options: any, callback: any) => {
      const url = new URL(target);
      if (
        url.origin !== "https://api.github.com" ||
        !Object.hasOwn(routes, url.pathname) ||
        url.search
      ) {
        externalAttempts++;
        throw Error("EXTERNAL_TARGET_REFUSED");
      }
      assert.equal(options.method, "GET");
      assert.equal(options.port, 443);
      assert.equal(options.servername, "api.github.com");
      assert.equal(options.rejectUnauthorized, true);
      assert.equal(options.minVersion, "TLSv1.2");
      assert.equal(options.agent, false);
      assert.equal(options.autoSelectFamily, false);
      assert.equal(options.maxHeaderSize, 16384);
      return realRequest(
        target,
        {
          ...options,
          port,
          ...(trust ? { ca: fs.readFileSync(cert) } : {}),
          lookup: (host: string, opts: any, cb: any) => {
            options.lookup(
              host,
              opts,
              (error: unknown, address: string, family: number) => {
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
    const ports: GithubInstallationObservationPorts = {
      request,
      enabled: () => true,
      deadlineMs: 1500,
      lookup: async (host) => {
        assert.equal(host, "api.github.com");
        return [{ address: "8.8.8.8" }];
      },
      authority: {
        current: async (s) => {
          if (!authorityValid) throw Error("withdrawn");
          return {
            purpose: s.purpose,
            active: true,
            binding_sha256: s.binding_sha256,
          };
        },
      },
      appBroker: {
        resolve: async (s) => ({
          mode: "GITHUB_APP_JWT",
          binding_sha256: s.binding_sha256,
          app_id: binding.app_id,
          client_id: client,
          expires_at: new Date(now + 300000).toISOString(),
          jwt,
        }),
      },
      installationBroker: {
        resolve: async () => ({
          mode: "GITHUB_APP_INSTALLATION",
          binding_sha256: githubBindingDigest(binding),
          credential_ref: binding.credential_ref,
          credential_version: 1,
          app_id: binding.app_id,
          installation_id: binding.installation_id,
          repository_ids: [binding.repository_id],
          permissions: { metadata: "read", issues: "read" },
          expires_at: new Date(now + 300000).toISOString(),
          token,
        }),
      },
    };
    const make = () => new GithubInstallationObserver(binding, ports);
    const observer = make(),
      observed = await observer.observe();
    assert.equal(observed.outcome, "OBSERVED");
    assert.equal(reads, 5);
    assert.ok(!JSON.stringify(observed).includes(jwt));
    assert.ok(!JSON.stringify(observed).includes(token));
    assert.equal((await observer.observe()).outcome, "UNAVAILABLE");
    assert.equal(reads, 5);
    phases.push(
      "five-fixed-gets-with-bot-no-auth-and-redacted-identity",
      "one-shot-no-repeat",
    );
    for (const negative of [
      "withdraw",
      "redirect",
      "rate",
      "huge",
      "utf8",
      "drop",
      "hang",
      "header",
    ]) {
      mode = negative;
      const before: number = reads;
      assert.equal((await make().observe()).outcome, "UNAVAILABLE");
      assert.equal(reads, before + 1);
      phases.push(`native-${negative}-stops-without-followup`);
      authorityValid = true;
    }
    mode = "normal";
    trust = false;
    const before: number = reads;
    assert.equal((await make().observe()).outcome, "UNAVAILABLE");
    assert.equal(reads, before);
    phases.push("untrusted-certificate-rejected-before-http");
    assert.equal(externalAttempts, 0);
    write("acceptance.json", {
      status: "PASS_OFFLINE_GITHUB_IDENTITY_OBSERVER",
      sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim(),
      phases,
      nativeTls: true,
      onlyOwnedLoopbackSockets: true,
      externalProviderCalls: 0,
      realCredentialsUsed: false,
      productionRoutesEnabled: false,
      realDnsOrProviderIdentityAcceptance: false,
      tokenProvenanceVerified: false,
    });
    console.log("GITHUB_IDENTITY_OBSERVER_OFFLINE_PASS " + runtime);
  } finally {
    let clean = true;
    const closed = Promise.all(
      [...sockets].map(
        (socket) =>
          new Promise<void>((resolve) => {
            if (socket.closed) {
              sockets.delete(socket);
              resolve();
            } else socket.once("close", resolve);
            socket.destroy();
          }),
      ),
    );
    if (server) {
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () => reject(Error("server close timeout")),
            3000,
          );
          server!.close((e) => {
            clearTimeout(timer);
            if (e) reject(e);
            else {
              serverClosed = true;
              resolve();
            }
          });
        });
      } catch {
        clean = false;
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        closed,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(Error("socket close timeout")), 3000);
        }),
      ]);
    } catch {
      clean = false;
    } finally {
      clearTimeout(timer);
    }
    for (const file of [key, cert]) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch {
        clean = false;
      }
    }
    let portClosed = port === 0;
    if (port)
      portClosed = await new Promise<boolean>((resolve) => {
        const socket = net.connect({ host: "127.0.0.1", port });
        socket.once("connect", () => {
          socket.destroy();
          resolve(false);
        });
        socket.once("error", (error: NodeJS.ErrnoException) =>
          resolve(error.code === "ECONNREFUSED"),
        );
        socket.setTimeout(1000, () => {
          socket.destroy();
          resolve(false);
        });
      });
    clean =
      clean &&
      (!server || serverClosed) &&
      sockets.size === 0 &&
      portClosed &&
      !fs.existsSync(key) &&
      !fs.existsSync(cert);
    write("cleanup.json", {
      clean,
      serverClosed,
      sockets: sockets.size,
      portClosed,
      syntheticMaterialRemoved: !fs.existsSync(key) && !fs.existsSync(cert),
    });
    assert.equal(clean, true, "OWNED_CLEANUP_UNCERTAIN");
  }
}
main().catch(() => {
  console.error("GITHUB_IDENTITY_OBSERVER_OFFLINE_FAILED");
  process.exitCode = 1;
});
