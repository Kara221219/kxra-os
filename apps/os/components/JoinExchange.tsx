"use client";

import { useEffect, useRef, useState } from "react";
import { invitationTokenFromUrl } from "../../../packages/authz/invitation-link";

export default function JoinExchange() {
  const [message, setMessage] = useState("Validating secure link…");
  const exchange = useRef<Promise<string> | null>(null);

  useEffect(() => {
    let active = true;
    // Preserve the request across StrictMode effect replay. Path/query links are
    // first normalized server-side, so scrubbing a fragment keeps this route.
    if (!exchange.current) {
      const token = invitationTokenFromUrl(window.location.href);
      exchange.current = token
        ? fetch("/api/join/exchange", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
            credentials: "same-origin",
            cache: "no-store",
            referrerPolicy: "no-referrer",
            signal: AbortSignal.timeout(10_000),
          }).then(async (response) => {
            const result = await response.json();
            if (!response.ok || result.next !== "/join/account")
              throw new Error("INVITATION_UNAVAILABLE");
            return "/join/account";
          })
        : Promise.resolve("/join/account");
    }
    const safeSearch = new URLSearchParams(window.location.search);
    safeSearch.delete("token");
    const remainingSearch = safeSearch.toString();
    const safePath = /^\/join\/[A-Za-z0-9_-]{32,100}\/?$/.test(
      window.location.pathname,
    )
      ? "/join"
      : window.location.pathname;
    window.history.replaceState(
      null,
      "",
      `${safePath}${remainingSearch ? `?${remainingSearch}` : ""}`,
    );

    void exchange.current
      .then((next) => {
        if (active) window.location.replace(next);
      })
      .catch(() => {
        if (!active) return;
        setMessage("This invitation is unavailable. Redirecting safely…");
        window.location.replace("/join/account?state=invalid");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <p className="notice" role="status" aria-live="polite">
      {message}
    </p>
  );
}
