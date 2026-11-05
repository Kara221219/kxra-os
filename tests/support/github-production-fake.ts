// In-memory request port only. Never creates a socket, resolves DNS or calls a provider.
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import type https from "node:https";
import type { GithubProductionBinding } from "../../packages/connectors/github-production-contracts";
export function githubFake(
  binding: GithubProductionBinding,
  effects: any[] = [],
) {
  let posts = 0,
    mode = "normal";
  const issue = `https://api.github.com/repos/${binding.owner}/${binding.repo}/issues/${binding.issue_number}`;
  const request = ((url: any, options: any, cb: any) => {
    const u = new URL(url);
    if (u.origin !== "https://api.github.com") throw Error("Unexpected target");
    const req = new EventEmitter() as any;
    req.destroy = () => req;
    req.end = (body?: string) => {
      let data: unknown,
        status = 200;
      if (options.method === "POST") {
        posts++;
        const value = {
          id: 9000 + effects.length,
          body: JSON.parse(body!).body,
          user: { id: binding.author_id, type: "Bot" },
          issue_url: issue,
          created_at: new Date().toISOString(),
        };
        effects.push(value);
        data = value;
        status = 201;
      } else if (u.pathname.endsWith("/comments")) data = effects;
      else if (u.pathname.includes("/issues/"))
        data = {
          id: binding.issue_id,
          number: binding.issue_number,
          url: issue,
          repository_url: issue.slice(0, issue.indexOf("/issues/")),
        };
      else
        data = {
          id: binding.repository_id,
          owner: { id: binding.account_id, login: binding.owner },
          full_name: `${binding.owner}/${binding.repo}`,
        };
      queueMicrotask(() => {
        if (options.method === "POST" && mode === "drop") {
          req.emit("error", Error("synthetic lost acknowledgement"));
          return;
        }
        const r = Readable.from([Buffer.from(JSON.stringify(data))]) as any;
        r.statusCode = status;
        r.headers = { "content-type": "application/json" };
        cb(r);
      });
      return req;
    };
    return req;
  }) as typeof https.request;
  return {
    request,
    effects,
    posts: () => posts,
    setMode: (v: string) => {
      mode = v;
    },
    broker: {
      resolve: async ({ scope }: any) => ({
        mode: "GITHUB_APP_INSTALLATION",
        binding_sha256: (
          await import("../../packages/connectors/github-production-contracts")
        ).githubBindingDigest(binding),
        credential_ref: binding.credential_ref,
        credential_version: binding.credential_version,
        app_id: binding.app_id,
        installation_id: binding.installation_id,
        repository_ids: [binding.repository_id],
        permissions: {
          metadata: "read",
          issues: scope === "issues:write" ? "write" : "read",
        },
        expires_at: new Date(Date.parse(binding.expires_at) - 1).toISOString(),
        token: "offline_generated_provider_not_a_real_credential",
      }),
    },
  };
}
