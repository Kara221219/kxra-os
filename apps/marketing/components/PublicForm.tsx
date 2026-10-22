"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { sprintPackages, sprintPackage } from "../lib/business-sprints";
import { appExamples, type AppKey } from "../lib/app-examples";

type Kind = "ENQUIRY" | "CUSTOM_PROJECT" | "CONTACT";

export function PublicForm({
  kind,
  sprintIntake = false,
}: {
  kind: Kind;
  sprintIntake?: boolean;
}) {
  const [packageKey, setPackageKey] = useState("improvement-sprint");
  const messageField = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<{ body: string; key: string } | null>(null);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "package",
    );
    if (requested && sprintPackage(requested)) setPackageKey(requested);
    const workflow = new URLSearchParams(window.location.search).get(
      "workflow",
    );
    if (
      kind === "CONTACT" &&
      workflow &&
      Object.hasOwn(appExamples, workflow) &&
      messageField.current &&
      !messageField.current.value
    ) {
      messageField.current.value = `I would like to discuss the ${appExamples[workflow as AppKey].name} workflow.\n\nThe outcome I need is: `;
    }
  }, [kind]);
  const sourcePath = {
    ENQUIRY: "/partner",
    CUSTOM_PROJECT: "/submit-opportunity",
    CONTACT: "/contact",
  }[kind];
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
    const body = JSON.stringify({
      ...payload,
      kind,
      sourcePath:
        window.location.pathname === "/"
          ? sourcePath
          : window.location.pathname === "/business-sprints"
            ? "/submit-opportunity"
            : window.location.pathname,
    });
    if (!pending.current || pending.current.body !== body)
      pending.current = { body, key: crypto.randomUUID() };
    try {
      const response = await fetch("/api/enquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": pending.current.key,
        },
        body,
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok)
        throw new Error(result.message || "Submission unavailable");
      setState("success");
      setMessage(
        "Thank you. Your request is in the private KXRA review inbox.",
      );
      target.reset();
      pending.current = null;
    } catch {
      setState("error");
      setMessage(
        "We could not store your request. Please try again or email info@kxra-group.com.",
      );
    }
  }

  return (
    <form
      action="/api/enquiries"
      method="post"
      onSubmit={submit}
      aria-describedby="form-status"
    >
      <input name="kind" type="hidden" value={kind} />
      <input name="sourcePath" type="hidden" value={sourcePath} />
      {sprintIntake && (
        <div className="field">
          <label htmlFor="sprint-package">Starting package</label>
          <select
            id="sprint-package"
            name="sprintPackage"
            value={packageKey}
            onChange={(event) => setPackageKey(event.target.value)}
          >
            {sprintPackages.map((item) => (
              <option key={item.key} value={item.key}>
                {item.name}
              </option>
            ))}
          </select>
        </div>
      )}
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
          ref={messageField}
          id={`${kind}-message`}
          name="message"
          required
          minLength={20}
          maxLength={sprintIntake ? 1800 : 4000}
        />
      </div>
      {sprintIntake && (
        <>
          <div className="field">
            <label htmlFor="sprint-outcome">
              What would a useful outcome look like?
            </label>
            <textarea
              id="sprint-outcome"
              name="desiredOutcome"
              required
              minLength={10}
              maxLength={700}
            />
          </div>
          <div className="field">
            <label htmlFor="sprint-constraints">
              Current systems, previous attempts and constraints
            </label>
            <textarea
              id="sprint-constraints"
              name="constraints"
              maxLength={700}
            />
          </div>
          <div className="field">
            <label htmlFor="sprint-budget">Indicative project budget</label>
            <select id="sprint-budget" name="budget">
              <option value="UNSURE">Not sure yet</option>
              <option value="UNDER_500">Under £500</option>
              <option value="500_1500">£500–£1,500</option>
              <option value="1500_PLUS">Over £1,500</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="sprint-deadline">Desired deadline</label>
            <input
              id="sprint-deadline"
              name="deadline"
              maxLength={100}
              placeholder="For example, within the next month"
            />
          </div>
        </>
      )}
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
