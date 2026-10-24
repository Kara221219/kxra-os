import type { Page, Request, Response } from "@playwright/test";

// The endpoint commits before acknowledging. A separately issued RSC request
// is required: an older interval refresh can be delivered after that ACK.
export function workspaceRefreshAfter(
  page: Page,
  origin: string,
  room: string,
  acknowledgement: Promise<Response>,
) {
  let acknowledged = false;
  const requests = new WeakSet<Request>();
  void acknowledgement.then(
    () => {
      acknowledged = true;
    },
    () => undefined,
  );
  const remember = (request: Request) => {
    if (
      !acknowledged ||
      request.method() !== "GET" ||
      request.headers().rsc !== "1"
    )
      return;
    try {
      if (request.frame() !== page.mainFrame()) return;
    } catch {
      return;
    }
    const url = new URL(request.url());
    if (
      url.origin === new URL(origin).origin &&
      url.pathname === `/os/workspace/${room}`
    )
      requests.add(request);
  };
  page.on("request", remember);
  const refreshed = page.waitForResponse((response) =>
    requests.has(response.request()),
  );
  const cleanup = () => {
    page.off("request", remember);
  };
  void refreshed.then(cleanup, cleanup);
  return refreshed;
}
