"use client";

import { FormEvent, useState } from "react";

type Kind = "ENQUIRY" | "CUSTOM_PROJECT" | "CONTACT";

export function PublicForm({ kind }: { kind: Kind }) {
  const [state, setState] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    setState("submitting");
    setMessage("Sending securely…");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          ...payload,
          kind,
          sourcePath: window.location.pathname,
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message || "Submission unavailable");
      setState("success");
      setMessage(
        "Thank you. Your request is in the private KXRA review inbox.",
      );
      target.reset();
    } catch {
      setState("error");
      setMessage(
        "We could not store your request. Please try again or email info@kxra-group.com.",
      );
    }
  }

  return (
    <form onSubmit={submit} aria-describedby="form-status">
      <div className="field">
        <label htmlFor={`${kind}-name`}>Name</label>
        <input
          id={`${kind}-name`}
          name="name"
          autoComplete="name"
          required
          minLength={2}
          maxLength={120}
        />
      </div>
      <div className="field">
        <label htmlFor={`${kind}-email`}>Work email</label>
        <input
          id={`${kind}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </div>
      <div className="field">
        <label htmlFor={`${kind}-company`}>Business or organisation</label>
        <input
          id={`${kind}-company`}
          name="company"
          autoComplete="organization"
          maxLength={160}
        />
      </div>
      <div className="field">
        <label htmlFor={`${kind}-message`}>
          {kind === "CUSTOM_PROJECT"
            ? "What should the project solve?"
            : "How can KXRA help?"}
        </label>
        <textarea
          id={`${kind}-message`}
          name="message"
          required
          minLength={20}
          maxLength={4000}
        />
      </div>
      <div className="trap" aria-hidden="true">
        <label htmlFor={`${kind}-website`}>Website</label>
        <input
          id={`${kind}-website`}
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      <label className="check">
        <input name="consent" type="checkbox" value="true" required />
        <span>
          I agree that KXRA may use this information to review and respond to my
          request.
        </span>
      </label>
      <button
        className="button"
        type="submit"
        disabled={state === "submitting"}
      >
        {state === "submitting" ? "Sending…" : "Send to KXRA"}
      </button>
      <p
        id="form-status"
        className="form-status"
        role="status"
        aria-live="polite"
        data-state={state}
      >
        {message}
      </p>
    </form>
  );
}
