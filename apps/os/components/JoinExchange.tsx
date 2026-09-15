"use client";

import { useEffect, useState } from "react";

export default function JoinExchange() {
  const [message, setMessage] = useState("Validating secure link…");

  useEffect(() => {
    let active = true;
    const parameters = new URLSearchParams(window.location.hash.slice(1));
    const token = parameters.get("token");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}`,
    );

    if (!token) {
      window.location.replace("/join/account");
      return () => {
        active = false;
      };
    }

    void fetch("/api/join/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error("INVITATION_UNAVAILABLE");
        if (active) window.location.replace(result.next || "/join/account");
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
