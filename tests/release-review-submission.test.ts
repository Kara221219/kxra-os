import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import {
  releaseReviewPackets,
  type ReleaseReviewType,
} from "../apps/os/lib/release-review-packets";

// Execute the shipped form handler with synthetic ports; server/database/MFA
// review authority is still exercised by the existing HTTP and native suites.
const source = fs.readFileSync(
  "apps/os/components/ReleaseReviewSubmission.tsx",
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
function harness(ok: boolean) {
  let cursor = 0,
    refreshes = 0;
  const state: unknown[] = [];
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const jsx = (type: string, props: Record<string, any>) => ({ type, props });
  const scope = vm.createContext(
    {
      exports: {},
      FormData: class {
        constructor(private values: Map<string, string>) {}
        get(key: string) {
          return this.values.get(key) ?? null;
        }
      },
      fetch: async (url: string, options: { body: string }) => {
        requests.push({ url, body: JSON.parse(options.body) });
        return {
          ok,
          json: async () => (ok ? {} : { error: "Review unavailable" }),
        };
      },
      require: (name: string) => {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "react")
          return {
            useState: (initial: unknown) => {
              const i = cursor++;
              if (!(i in state)) state[i] = initial;
              return [
                state[i],
                (value: unknown) => {
                  state[i] = value;
                },
              ];
            },
          };
        if (name === "next/navigation")
          return {
            useRouter: () => ({
              refresh: () => {
                refreshes++;
              },
            }),
          };
        throw Error("UNEXPECTED_CLIENT_DEPENDENCY");
      },
    },
    { codeGeneration: { strings: false, wasm: false } },
  );
  new vm.Script(compiled).runInContext(scope);
  const props = {
    kind: "ACCESSIBILITY",
    manifestId: "synthetic-manifest",
    candidateSha256: "a".repeat(64),
    evidenceSha256: "b".repeat(64),
    checkKeys: ["keyboard", "contrast"],
    children: "server-rendered reviewed checklist",
  };
  const render = () => {
    cursor = 0;
    return (scope.exports as any).default(props);
  };
  return { render, requests, state, props, refreshes: () => refreshes };
}
test("release review client submits exact server-selected checklist/digests without changing authority", async () => {
  const h = harness(true),
    form = h.render();
  let prevented = false;
  await form.props.onSubmit({
    preventDefault: () => {
      prevented = true;
    },
    currentTarget: new Map([
      ["keyboard", "on"],
      ["notes", "Synthetic completed review notes"],
      ["actor_id", "untrusted ignored"],
    ]),
  });
  assert.equal(prevented, true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, "/api/release-reviews");
  assert.deepEqual(h.requests[0].body, {
    manifest_id: h.props.manifestId,
    review_type: "ACCESSIBILITY",
    candidate_sha256: h.props.candidateSha256,
    evidence_sha256: h.props.evidenceSha256,
    checklist: { keyboard: true, contrast: false },
    notes: "Synthetic completed review notes",
  });
  assert.equal(h.refreshes(), 1);
  assert.equal(h.state[0], false);
  assert.equal(h.state[1], "Review recorded.");
});
test("rejected review does not claim recording or refresh and releases busy state", async () => {
  const h = harness(false);
  await h.render().props.onSubmit({
    preventDefault() {},
    currentTarget: new Map([["notes", "Synthetic rejected review notes"]]),
  });
  assert.equal(h.refreshes(), 0);
  assert.equal(h.state[0], false);
  assert.equal(h.state[1], "Review unavailable");
});

test("server review wrapper preserves required checklists and recorded receipts without client packet data", () => {
  const server = ts.transpileModule(
    fs.readFileSync("apps/os/components/ReleaseReviewForm.tsx", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText;
  const client = function SyntheticSubmission() {};
  const jsx = (type: unknown, props: Record<string, any>) => ({ type, props });
  const scope = vm.createContext(
    {
      exports: {},
      require: (name: string) => {
        if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
        if (name === "./ReleaseReviewSubmission")
          return { __esModule: true, default: client };
        if (name === "../lib/release-review-packets")
          return { releaseReviewPackets };
        throw Error("UNEXPECTED_SERVER_REVIEW_DEPENDENCY");
      },
    },
    { codeGeneration: { strings: false, wasm: false } },
  );
  new vm.Script(server).runInContext(scope);
  const render = (scope.exports as any).default;
  function elements(node: any): any[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!node || typeof node !== "object") return [];
    return [node, ...elements(node.props?.children)];
  }
  for (const kind of Object.keys(releaseReviewPackets) as ReleaseReviewType[]) {
    const packet = releaseReviewPackets[kind];
    const props = {
      kind,
      manifestId: "synthetic-manifest",
      candidateSha256: "a".repeat(64),
      evidenceSha256: "b".repeat(64),
      finalized: false,
    };
    const view = render(props);
    assert.equal(view.type, client);
    assert.deepEqual(
      Array.from(view.props.checkKeys),
      packet.checks.map(([key]) => key),
    );
    const checks = elements(view).filter((e) => e.type === "input");
    assert.deepEqual(
      checks.map((e) => e.props.name),
      packet.checks.map(([key]) => key),
    );
    assert.ok(
      checks.every(
        (e) => e.props.required === true && e.props.type === "checkbox",
      ),
    );
    assert.ok(JSON.stringify(view).includes(props.candidateSha256));
    assert.ok(JSON.stringify(view).includes(props.evidenceSha256));
    const recorded = render({
      ...props,
      recorded: {
        reviewer_name: "Synthetic reviewer",
        attested_at: "2026-10-31T00:00:00Z",
      },
    });
    assert.equal(recorded.type, "section");
    assert.ok(
      !elements(recorded).some(
        (e) => e.type === client || e.type === "input" || e.type === "button",
      ),
    );
    assert.ok(JSON.stringify(recorded).includes("Synthetic reviewer"));
  }
  assert.doesNotMatch(compiled, /require\([^)]*release-review-packets/);
});
