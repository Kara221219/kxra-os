import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import DirectoryDocumentBoundary, {
  installDirectoryDocumentLifecycle,
} from "../apps/os/components/DirectoryDocumentBoundary";

function fixture(type = "navigate") {
  const listeners = new Map<string, (event: unknown) => void>();
  let reloads = 0,
    clears = 0;
  const status = { hidden: false };
  const content = {
    style: { visibility: "hidden" },
    replaceChildren() {
      clears++;
    },
  };
  const location = {
    pathname: "/os/customer-directory",
    search: "",
    hash: "",
    reload() {
      reloads++;
    },
  };
  const browser = {
    location,
    performance: { getEntriesByType: () => [{ type }] },
    addEventListener(
      name: string,
      fn: (event: unknown) => void,
      capture: boolean,
    ) {
      assert.equal(capture, true);
      listeners.set(name, fn);
    },
    removeEventListener(
      name: string,
      fn: (event: unknown) => void,
      capture: boolean,
    ) {
      assert.equal(capture, true);
      assert.equal(listeners.get(name), fn);
      listeners.delete(name);
    },
  };
  const stop = installDirectoryDocumentLifecycle(
    browser as unknown as Window,
    content as unknown as HTMLElement,
    status as unknown as HTMLElement,
  );
  return {
    content,
    status,
    listeners,
    location,
    stop,
    reloads: () => reloads,
    clears: () => clears,
  };
}
test("metadata is hidden in SSR until lifecycle protection is installed; failed hydration stays closed", () => {
  const html = renderToStaticMarkup(
    createElement(DirectoryDocumentBoundary, {
      children: createElement("table", null),
    }),
  );
  assert.ok(html.includes("visibility:hidden"));
  assert.ok(html.includes("JavaScript may be disabled or failed to load"));
  assert.ok(html.includes("JavaScript is required"));
  assert.ok(!html.includes("<noscript"));
});
test("leaving scrubs metadata before a snapshot; persisted restoration requests one fresh document", () => {
  const f = fixture();
  assert.equal(f.content.style.visibility, "visible");
  assert.equal(f.status.hidden, true);
  f.listeners.get("pagehide")!({ persisted: true });
  assert.equal(f.content.style.visibility, "hidden");
  assert.equal(f.clears(), 1);
  assert.equal(f.status.hidden, false);
  assert.equal(f.reloads(), 0);
  f.listeners.get("pageshow")!({ persisted: true });
  assert.equal(f.reloads(), 1);
  assert.equal(f.content.style.visibility, "hidden");
  f.listeners.get("popstate")!({});
  assert.equal(f.reloads(), 1);
  f.stop();
  assert.equal(f.listeners.size, 0);
});
test("normal pageshow does not reload, document history does, and fragment keyboard navigation remains native", () => {
  const f = fixture();
  f.listeners.get("pageshow")!({ persisted: false });
  assert.equal(f.reloads(), 0);
  f.location.hash = "#content";
  f.listeners.get("popstate")!({});
  assert.equal(f.reloads(), 0);
  f.location.hash = "";
  f.listeners.get("popstate")!({});
  assert.equal(f.reloads(), 0);
  f.location.search = "?cursor=synthetic";
  f.listeners.get("popstate")!({});
  assert.equal(f.reloads(), 1);
  assert.equal(f.content.style.visibility, "hidden");
  f.stop();
  const restored = fixture("back_forward");
  assert.equal(restored.reloads(), 1);
  assert.equal(restored.content.style.visibility, "hidden");
  restored.stop();
});
test("directory entry, page links and Shell exits use native anchors without changing other routes", () => {
  const shell = fs.readFileSync("apps/os/components/Shell.tsx", "utf8");
  assert.ok(shell.includes('documentNavigation ? "a" : Link'));
  const nav = fs.readFileSync("apps/os/components/OwnerNavigation.tsx", "utf8");
  assert.ok(
    nav.includes('documentNavigation || path === "customer-directory"'),
  );
  const page = fs.readFileSync(
    "apps/os/app/os/customer-directory/page.tsx",
    "utf8",
  );
  assert.ok(page.includes("documentNavigation"));
  assert.ok(page.includes("DirectoryDocumentBoundary"));
  const directory = fs.readFileSync(
    "apps/os/components/CustomerDirectory.tsx",
    "utf8",
  );
  assert.ok(!directory.includes("next/link"));
  assert.ok(directory.includes("<a "));
  const css = fs.readFileSync(
    "apps/os/components/CustomerDirectory.module.css",
    "utf8",
  );
  assert.match(
    css,
    /@media[\s\S]*caption[\s\S]*display: block;[\s\S]*width: 100%/,
  );
});
