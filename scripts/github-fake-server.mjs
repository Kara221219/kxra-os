// This local fixture implements the documented GitHub wire contract. No proxying.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const runtime = process.env.KXRA_RUNTIME;
if (
  !runtime?.startsWith("/tmp/kxra-") &&
  !runtime?.startsWith("/private/tmp/kxra-")
)
  throw Error("Private local fixture runtime required");
const store = path.join(runtime, "github-provider-store.json"),
  modeFile = path.join(runtime, "github-provider-mode");
try {
  const created = fs.openSync(
    store,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    fs.writeFileSync(
      created,
      JSON.stringify({ comments: [], posts: 0, nextId: 1 }),
    );
  } finally {
    fs.closeSync(created);
  }
} catch (error) {
  if (error?.code !== "EEXIST") throw error;
}
function save(value) {
  const temp = store + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temp, store);
}
const server = http.createServer(async (request, response) => {
  const mode = fs.existsSync(modeFile)
    ? fs.readFileSync(modeFile, "utf8").trim()
    : "normal";
  const send = (status, data, headers = {}) => {
    response.writeHead(status, {
      "content-type": "application/json",
      ...headers,
    });
    response.end(JSON.stringify(data));
  };
  if (
    request.headers.authorization !== "Bearer kxra-local-github-fixture-only" ||
    request.headers["x-github-api-version"] !== "2026-03-10"
  )
    return send(401, { message: "Fixture authorization required" });
  const url = new URL(request.url, "http://127.0.0.1");
  if (
    url.pathname === "/repos/fixture-org/fixture-repo" &&
    request.method === "GET"
  )
    return send(
      mode === "preflight-reject" ? 403 : 200,
      mode === "preflight-reject"
        ? { message: "Forbidden" }
        : {
            id: 404,
            owner: { id: 101 },
            full_name: "fixture-org/fixture-repo",
          },
    );
  if (url.pathname !== "/repos/fixture-org/fixture-repo/issues/1/comments")
    return send(404, { message: "Not Found" });
  const data = JSON.parse(fs.readFileSync(store, "utf8"));
  if (request.method === "GET") {
    if (mode === "read-malformed") return send(200, { comments: [] });
    const page = Number(url.searchParams.get("page") || 1),
      start = (page - 1) * 100;
    const values = data.comments.slice(start, start + 100);
    return send(
      200,
      values,
      start + 100 < data.comments.length
        ? { link: '<http://untrusted.invalid/ignored>; rel="next"' }
        : {},
    );
  }
  if (request.method !== "POST")
    return send(405, { message: "Method not allowed" });
  data.posts++;
  if (mode === "post-redirect") {
    save(data);
    return send(
      302,
      { message: "Redirect refused" },
      { location: "https://example.invalid/not-contacted" },
    );
  }
  if (mode === "post-reject") {
    save(data);
    return send(422, { message: "Validation Failed" });
  }
  if (mode === "post-500") {
    save(data);
    return send(500, { message: "Unknown outcome" });
  }
  let text = "";
  for await (const chunk of request) {
    text += chunk;
    if (text.length > 6000) return send(413, { message: "Too large" });
  }
  let body;
  try {
    body = JSON.parse(text).body;
  } catch {
    return send(400, { message: "Invalid JSON" });
  }
  if (typeof body !== "string") return send(422, { message: "Body required" });
  const comment = {
    id: data.nextId++,
    body,
    user: { id: 202 },
    issue_url: "https://api.github.com/repos/fixture-org/fixture-repo/issues/1",
    created_at: new Date().toISOString(),
  };
  data.comments.push(comment);
  if (mode === "duplicate-commit")
    data.comments.push({ ...comment, id: data.nextId++ });
  save(data);
  if (mode === "drop-after-commit") return response.destroy();
  if (mode === "hang-after-commit") return;
  if (mode === "oversized-ack") {
    response.writeHead(201, { "content-type": "application/json" });
    return response.end(
      JSON.stringify({ ...comment, padding: "x".repeat(270000) }),
    );
  }
  if (mode === "wrong-author-ack")
    return send(201, { ...comment, user: { id: 999 } });
  if (mode === "malformed-ack") {
    response.writeHead(201, { "content-type": "application/json" });
    return response.end("not-json");
  }
  return send(201, comment);
});
server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  fs.writeFileSync(
    path.join(runtime, "github-fake-origin"),
    `http://127.0.0.1:${address.port}`,
    { mode: 0o600 },
  );
  console.log("Local fake GitHub ready");
});
process.on("SIGTERM", () => {
  server.close();
  server.closeAllConnections();
});
