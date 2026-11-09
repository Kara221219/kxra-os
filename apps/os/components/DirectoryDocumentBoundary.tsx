"use client";

import React, { useEffect, useRef, type ReactNode } from "react";

/** Only fresh server-rendered documents may reveal metadata. This does not
 * decide authority; restoration triggers the unchanged server checks again.
 */
export function installDirectoryDocumentLifecycle(
  browser: Window,
  content: HTMLElement,
  status: HTMLElement,
) {
  let reloading = false;
  const documentPath = browser.location.pathname + browser.location.search;
  let lastHash = browser.location.hash;
  function conceal() {
    content.style.visibility = "hidden";
    content.replaceChildren();
    status.hidden = false;
  }
  function freshDocument() {
    conceal();
    if (!reloading) {
      reloading = true;
      browser.location.reload();
    }
  }
  function historyChange() {
    if (
      browser.location.pathname + browser.location.search === documentPath &&
      browser.location.hash !== lastHash
    ) {
      lastHash = browser.location.hash;
      return; // Preserve ordinary skip-link / fragment navigation.
    }
    freshDocument();
  }
  function restore(event: PageTransitionEvent) {
    if (event.persisted) freshDocument();
  }
  browser.addEventListener("pagehide", conceal, true);
  browser.addEventListener("pageshow", restore, true);
  browser.addEventListener("popstate", historyChange, true);
  const navigation = browser.performance.getEntriesByType("navigation")[0] as
    PerformanceNavigationTiming | undefined;
  if (navigation?.type === "back_forward") freshDocument();
  else {
    content.style.visibility = "visible";
    status.hidden = true;
  }
  return () => {
    browser.removeEventListener("pagehide", conceal, true);
    browser.removeEventListener("pageshow", restore, true);
    browser.removeEventListener("popstate", historyChange, true);
  };
}

export default function DirectoryDocumentBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const content = useRef<HTMLDivElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (content.current && status.current)
      return installDirectoryDocumentLifecycle(
        window,
        content.current,
        status.current,
      );
  }, []);
  return (
    <>
      <p ref={status} role="status">
        Checking current directory access. If this message remains, reload the
        page.
      </p>
      <noscript>
        <p>JavaScript is required to display this private directory safely.</p>
      </noscript>
      <div
        ref={content}
        data-directory-document
        style={{ visibility: "hidden" }}
      >
        {children}
      </div>
    </>
  );
}
