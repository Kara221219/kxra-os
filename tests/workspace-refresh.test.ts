import test from "node:test";
import assert from "node:assert/strict";
import type { Page, Request, Response } from "@playwright/test";
import { workspaceRefreshAfter } from "./support/workspace-refresh";

const origin = "http://127.0.0.1:3210";
const room = "10000000-0000-4000-8000-000000000001";
function harness(acknowledgement: Promise<Response>) {
  const listeners = new Set<(r: Request) => void>();
  const frame = {};
  let accepts!: (r: Response) => boolean;
  let resolve!: (r: Response) => void, reject!: (e: Error) => void;
  const result = new Promise<Response>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const page = {
    mainFrame: () => frame,
    on: (_: string, fn: (r: Request) => void) => {
      listeners.add(fn);
    },
    off: (_: string, fn: (r: Request) => void) => {
      listeners.delete(fn);
    },
    waitForResponse: (fn: typeof accepts) => {
      accepts = fn;
      return result;
    },
  } as unknown as Page;
  const selected = workspaceRefreshAfter(page, origin, room, acknowledgement);
  return {
    selected,
    listenerCount: () => listeners.size,
    fail: () => reject(new Error("Synthetic response timeout")),
    issue: ({
      url = `${origin}/os/workspace/${room}?view=knowledge&_rsc=synthetic`,
      method = "GET",
      rsc = "1",
      otherFrame = false,
    } = {}) => {
      const request = {
        url: () => url,
        method: () => method,
        headers: () => ({ rsc }),
        frame: () => (otherFrame ? {} : frame),
      } as unknown as Request;
      for (const fn of listeners) fn(request);
      return request;
    },
    deliver: (request: Request) => {
      const response = { request: () => request } as Response;
      const accepted = accepts(response);
      if (accepted) resolve(response);
      return accepted;
    },
  };
}
function acknowledgement() {
  let resolve!: (r: Response) => void, reject!: (e: Error) => void;
  const promise = new Promise<Response>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {
    promise,
    commit: () => resolve({} as Response),
    fail: () => reject(new Error("Synthetic failed acknowledgement")),
  };
}

test("a pre-acknowledgement request delivered later cannot satisfy the render gate", async () => {
  const ack = acknowledgement(),
    h = harness(ack.promise);
  const stale = h.issue();
  ack.commit();
  await Promise.resolve();
  assert.equal(h.deliver(stale), false);
  const fresh = h.issue();
  assert.equal(h.deliver(fresh), true);
  await h.selected;
  assert.equal(h.listenerCount(), 0);
});

test("post-acknowledgement origin, room, method, RSC and main frame are required", async () => {
  const ack = acknowledgement(),
    h = harness(ack.promise);
  ack.commit();
  await Promise.resolve();
  for (const input of [
    { url: `http://127.0.0.1:3211/os/workspace/${room}` },
    { url: `${origin}/os/workspace/20000000-0000-4000-8000-000000000002` },
    { method: "POST" },
    { rsc: "" },
    { otherFrame: true },
  ])
    assert.equal(h.deliver(h.issue(input)), false);
  assert.equal(h.deliver(h.issue()), true);
  await h.selected;
});

test("request issuance alone cannot satisfy the render gate; no transfer timing is required", async () => {
  const ack = acknowledgement(),
    h = harness(ack.promise);
  ack.commit();
  await Promise.resolve();
  const request = h.issue();
  let complete = false;
  void h.selected.then(() => {
    complete = true;
  });
  await Promise.resolve();
  assert.equal(complete, false);
  assert.equal(h.deliver(request), true);
  await h.selected;
  assert.equal(complete, true);
});

test("failed acknowledgement never arms capture and response failure removes the listener", async () => {
  const ack = acknowledgement(),
    h = harness(ack.promise);
  ack.fail();
  await Promise.resolve();
  assert.equal(h.deliver(h.issue()), false);
  const rejected = assert.rejects(h.selected, /Synthetic response timeout/);
  h.fail();
  await rejected;
  assert.equal(h.listenerCount(), 0);
});
