import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import vm from "node:vm";

// Regression for GHSA-mrwp-f3q8-3g9p. All credentials are synthetic markers;
// both listeners bind only to loopback, and no provider is contacted.
const require = createRequire(import.meta.url);
const redirects = require("follow-redirects");
async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}
for (const crossRealm of [false, true]) {
  for (const arrayHeaders of [false, true]) {
    for (const crossOrigin of [false, true]) {
      test(
        `redirect credential stripping: cross-realm=${crossRealm}, header-array=${arrayHeaders}, cross-origin=${crossOrigin}`,
        { timeout: 6000 },
        async () => {
          const receive = createServer((request, response) => {
            response.setHeader("Content-Type", "application/json");
            response.end(JSON.stringify(request.headers));
          });
          const target = await listen(receive);
          const source = createServer((request, response) => {
            if (request.url === "/redirect") {
              response.writeHead(302, {
                Location: crossOrigin ? `${target}/target` : "/target",
              });
              response.end();
            } else {
              response.setHeader("Content-Type", "application/json");
              response.end(JSON.stringify(request.headers));
            }
          });
          try {
            const origin = await listen(source);
            const sensitiveHeaders = crossRealm
              ? vm.runInNewContext('["X-Kxra-Probe"]')
              : ["X-Kxra-Probe"];
            assert.equal(Array.isArray(sensitiveHeaders), true);
            assert.equal(sensitiveHeaders instanceof Array, !crossRealm);
            const objectHeaders = {
              "X-Kxra-Probe": "SYNTHETIC-CUSTOM",
              "X-Public-Probe": "SYNTHETIC-PUBLIC",
              Authorization: "SYNTHETIC-AUTH",
              Cookie: "synthetic=value",
            };
            const headers = arrayHeaders
              ? Object.entries(objectHeaders).flat()
              : objectHeaders;
            const observed = await new Promise<Record<string, string>>(
              (resolve, reject) => {
                const request = redirects.http.get(
                  `${origin}/redirect`,
                  { headers, sensitiveHeaders, maxRedirects: 2 },
                  (response: import("node:http").IncomingMessage) => {
                    let body = "";
                    response.setEncoding("utf8");
                    response.on("data", (chunk: string) => {
                      body += chunk;
                      if (body.length > 4096)
                        request.destroy(Error("TEST_BOUND"));
                    });
                    response.on("error", reject);
                    response.on("end", () => {
                      try {
                        resolve(JSON.parse(body));
                      } catch (error) {
                        reject(error);
                      }
                    });
                  },
                );
                request.on("error", reject);
                request.setTimeout(2000, () =>
                  request.destroy(Error("TEST_TIMEOUT")),
                );
              },
            );
            assert.equal(observed["x-public-probe"], "SYNTHETIC-PUBLIC");
            for (const [name, value] of [
              ["x-kxra-probe", "SYNTHETIC-CUSTOM"],
              ["authorization", "SYNTHETIC-AUTH"],
              ["cookie", "synthetic=value"],
            ]) {
              assert.equal(observed[name], crossOrigin ? undefined : value);
            }
          } finally {
            if (source.listening) await close(source);
            await close(receive);
          }
        },
      );
    }
  }
}
